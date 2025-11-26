// ARQUIVO: netlify/functions/mp-webhook.js

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
    const body = JSON.parse(event.body || '{}');

    async function getPayment(paymentId) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` }
      });
      return r.ok ? r.json() : null;
    }

    let payment = null;
    if (body?.data?.id) payment = await getPayment(body.data.id);
    else if (body?.id) payment = await getPayment(body.id);

    if (!payment) return { statusCode: 200, body: 'no payment found' };

    const status = payment.status;
    const orderId = payment.external_reference || (payment.metadata && payment.metadata.order_id);

    if (!orderId) return { statusCode: 200, body: 'no order_id' };
    if (status !== 'approved') return { statusCode: 200, body: 'not approved' };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Verifica se já foi gerado
    const g = await supabase.from('generations').select('id').eq('order_id', orderId).maybeSingle();
    if (g.data) return { statusCode: 200, body: 'already generated' };

    // Recupera o payload
    const ci = await supabase.from('checkout_intents').select('payload, slug').eq('order_id', orderId).maybeSingle();
    const payload = ci.data?.payload || null;

    if (!payload) return { statusCode: 200, body: 'no payload found' };

    payload.order_id = orderId;

    // 1. GERA O DOCUMENTO
    const rGen = await fetch(`${BASE_URL}/.netlify/functions/generate-doc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({ payload, preview: false })
    });

    if (!rGen.ok) console.error('Erro ao gerar doc no webhook');

    // 2. ENVIA O E-MAIL AUTOMATICAMENTE (NOVO!)
    // Se o cliente preencheu o e-mail no formulário, já enviamos agora.
    if (payload.email && payload.email.includes('@')) {
      try {
        console.log(`Enviando e-mail automático para: ${payload.email}`);
        await fetch(`${BASE_URL}/.netlify/functions/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: orderId,
            email_to: payload.email
          })
        });
      } catch (errEmail) {
        console.error('Erro ao enviar e-mail automático:', errEmail);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (e) {
    console.error('Webhook Error:', e);
    return { statusCode: 200, body: 'error handled' };
  }
};