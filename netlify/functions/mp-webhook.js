// ARQUIVO: netlify/functions/mp-webhook.js

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Cronômetro global
  const startTime = Date.now();

  try {
    if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
    const body = JSON.parse(event.body || '{}');

    // --- VALIDAÇÃO DO PAGAMENTO (Igual) ---
    async function getPayment(paymentId) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` }
      });
      return r.ok ? r.json() : null;
    }

    let payment = null;
    if (body?.data?.id) payment = await getPayment(body.data.id);
    else if (body?.id) payment = await getPayment(body.id);

    if (!payment) return { statusCode: 200, body: 'no payment found' }; // Ignora se não achar

    const status = payment.status;
    const orderId = payment.external_reference || (payment.metadata && payment.metadata.order_id);

    if (!orderId) return { statusCode: 200, body: 'no order_id' };
    if (status !== 'approved') return { statusCode: 200, body: 'not approved' }; // Só queremos aprovados

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Verifica se JÁ foi gerado antes (Idempotência)
    const g = await supabase.from('generations').select('id').eq('order_id', orderId).maybeSingle();
    if (g.data) return { statusCode: 200, body: 'already generated' }; // Sucesso, já foi feito

    // Recupera payload
    const ci = await supabase.from('checkout_intents').select('payload, slug').eq('order_id', orderId).maybeSingle();
    const payload = ci.data?.payload || null;

    if (!payload) return { statusCode: 200, body: 'no payload found' }; // Erro irrecuperável, retorna 200 pra parar de tentar

    payload.order_id = orderId;

    // --- TENTATIVA DE GERAÇÃO (LOOP INTELIGENTE) ---
    let gerouSucesso = false;

    for (let i = 1; i <= 3; i++) {
      const elapsed = Date.now() - startTime;
      // Se já passou de 8.5s, PARE. Não tente de novo para não estourar o Netlify.
      if (elapsed > 8500) break;

      try {
        console.log(`Tentativa ${i} de gerar documento...`);
        const rGen = await fetch(`${BASE_URL}/.netlify/functions/generate-doc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY
          },
          body: JSON.stringify({ payload, preview: false })
        });

        if (rGen.ok) {
          gerouSucesso = true;
          break; // Sucesso! Sai do loop
        } else {
          // Se falhou, espera um pouco antes de tentar de novo
          await new Promise(res => setTimeout(res, 1000));
        }
      } catch (e) {
        console.error(`Erro tentativa ${i}:`, e);
      }
    }

    // --- MOMENTO DECISIVO ---
    if (!gerouSucesso) {
      console.error(`FALHA CRÍTICA: Não foi possível gerar o doc para ${orderId} em 3 tentativas.`);
      // RETORNA 500! Isso diz para o Mercado Pago: "Tenta de novo daqui a pouco!"
      // Assim ganhamos um NOVO ciclo de 10 segundos no futuro.
      return { statusCode: 500, body: 'Failed to generate doc. Retry later.' };
    }

    // --- ENVIO DE E-MAIL (Só se gerou sucesso) ---
    if (payload.email && payload.email.includes('@')) {
      try {
        // Fire and forget para e-mail
        fetch(`${BASE_URL}/.netlify/functions/send-email`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId, email_to: payload.email })
        }).catch(e => console.error('Email error bg:', e));
      } catch (e) { }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (e) {
    console.error('Webhook Fatal:', e);
    // Se for erro de código nosso, retorna 500 pro MP tentar de novo
    return { statusCode: 500, body: 'Internal Error' };
  }
};