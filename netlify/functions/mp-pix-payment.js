// ARQUIVO: netlify/functions/mp-pix-payment.js
// Cria um pagamento Pix via POST /v1/payments (fluxo manual).
// O Brick de Payment exige formulario de email para Pix (comportamento
// arquitetural do SDK v3.16, nao configuravel); por isso fazemos o fluxo
// manual aqui: recebemos o order_id+já-salvo no Supabase checkout_intents
// via mp-checkout-bricks.js, criamos o payment Pix aqui, devolvemos o
// qr_code (copia e cola) e qr_code_base64 (PNG pronto) pro front renderizar.

const { createClient } = require('@supabase/supabase-js');
const { PRICE_MAP } = require('./price-map');

exports.handler = async (event) => {
  console.log('[mp-pix-payment] INVOCADO');
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }

    const { order_id, slug, email } = JSON.parse(event.body || '{}');
    if (!order_id || !slug) {
      return { statusCode: 400, body: JSON.stringify({ error: 'order_id e slug obrigatorios' }) };
    }
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'email do cliente obrigatorio para Pix' }) };
    }

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';

    // Recupera o price do checkout_intent ja salvo (fonte authoritativa: PRICE_MAP)
    // Recebemos tambem por parametro pra evitar round-trip no Supabase, mas o valor
    // real e sempre o do PRICE_MAP — nunca confiar no client.
    let price = PRICE_MAP[slug] || PRICE_MAP['default'];
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Confirma que o checkout_intent existe pra esse order_id (sanity check anti-abuso)
    try {
      const { data: intent, error } = await supabase
        .from('checkout_intents')
        .select('order_id, final_price')
        .eq('order_id', order_id)
        .limit(1);
      if (error || !intent || intent.length === 0) {
        console.error('[mp-pix-payment] checkout_intent nao encontrado pra order_id:', order_id);
        return { statusCode: 404, body: JSON.stringify({ error: 'Pedido nao encontrado' }) };
      }
      // Usa o final_price do intent (ja considera cupom, se houver)
      if (intent[0].final_price) price = Number(intent[0].final_price);
    } catch (e) {
      console.error('[mp-pix-payment] Erro Supabase:', e);
      return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao validar pedido' }) };
    }

    const pontos = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const body = {
      transaction_amount: Number(price),
      description: 'Documento: ' + pontos,
      payment_method_id: 'pix',
      payer: {
        email: email,
        entity_type: 'individual',
        first_name: 'Cliente',
        last_name: 'CartasApp'
      },
      external_reference: order_id,
      notification_url: BASE_URL + '/.netlify/functions/mp-webhook',
      metadata: { order_id: order_id, slug: slug, payment_method: 'pix_manual' }
      // date_of_expiration omitido: default 24h do MP — cliente tem tempo pra pagar
    };

    console.log('[mp-pix-payment] POST /v1/payments para order_id:', order_id, 'amount:', price);

    const r = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + MP_TOKEN,
        'X-Idempotency-Key': order_id // evita cobrança dupla se cliente clicar 2x
      },
      body: JSON.stringify(body)
    });

    const data = await r.json();
    if (!r.ok) {
      console.error('[mp-pix-payment] MP rejeitou:', data);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Falha ao criar pagamento Pix', details: data })
      };
    }

    // data.point_of_interaction.transaction_data tem os campos do QR
    const txn = data.point_of_interaction && data.point_of_interaction.transaction_data;
    if (!txn || !txn.qr_code) {
      console.error('[mp-pix-payment] MP nao devolveu qr_code. Resposta:', data);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'MP nao retornou QR Code', details: data })
      };
    }

    console.log('[mp-pix-payment] Payment criado. ID:', data.id, 'status:', data.status);

    // Marca no Supabase que esse pedido tem Pix criado (webhook vai usar external_reference)
    try {
      await supabase.from('orders').upsert({
        order_id: order_id,
        payment_id: data.id,
        slug: slug,
        status: data.status || 'pending',
        amount: price,
        provider_attempts: 1
      }, { onConflict: 'order_id' });
    } catch (e) {
      console.error('[mp-pix-payment] Supabase upsert falhou (nao bloqueante):', e);
      // Nao bloqueia — o webhook mp-webhook.js vai amarrar eventualmente
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        payment_id: data.id,
        status: data.status,
        qr_code: txn.qr_code,           // string copia-e-cola
        qr_code_base64: txn.qr_code_base64, // PNG base64 (pronto)
        ticket_url: txn.ticket_url,      // fallback (link do MP)
        amount: price,
        order_id: order_id
      })
    };
  } catch (e) {
    console.error('[mp-pix-payment] Erro fatal:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno' }) };
  }
};
