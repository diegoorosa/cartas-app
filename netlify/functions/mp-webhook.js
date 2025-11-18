// ARQUIVO: netlify/functions/mp-webhook.js

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    // Ajuste para garantir que a URL base esteja correta
    const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
    const body = JSON.parse(event.body || '{}');

    async function getPayment(paymentId) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` }
      });
      return r.ok ? r.json() : null;
    }

    // ... (Lógica de identificar ID do pagamento igual ao original) ...
    let payment = null;
    if (body?.data?.id) payment = await getPayment(body.data.id);
    else if (body?.id) payment = await getPayment(body.id);

    if (!payment) return { statusCode: 200, body: 'no payment found' };

    const status = payment.status;
    const orderId = payment.external_reference || (payment.metadata && payment.metadata.order_id);

    if (!orderId) return { statusCode: 200, body: 'no order_id' };
    if (status !== 'approved') return { statusCode: 200, body: 'not approved' };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Verifica se já foi gerado para economizar processamento
    const g = await supabase.from('generations').select('id').eq('order_id', orderId).maybeSingle();
    if (g.data) return { statusCode: 200, body: 'already generated' };

    // Recupera o payload salvo no momento do checkout
    const ci = await supabase.from('checkout_intents').select('payload, slug').eq('order_id', orderId).maybeSingle();
    const payload = ci.data?.payload || null;

    if (!payload) return { statusCode: 200, body: 'no payload found' };

    payload.order_id = orderId; // Garante o ID no payload

    // --- AQUI ESTÁ A CORREÇÃO: CHAMADA "VIP" ---
    // Chamamos a função de geração passando o header secreto para pular o captcha
    const r = await fetch(`${BASE_URL}/.netlify/functions/generate-doc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY // Usando a chave do Supabase como segredo
      },
      body: JSON.stringify({ payload, preview: false })
    });

    const data = await r.json();
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (e) {
    console.error('Webhook Error:', e);
    return { statusCode: 200, body: 'error handled' }; // Retorna 200 pro MP não ficar tentando de novo em loop eterno
  }
};