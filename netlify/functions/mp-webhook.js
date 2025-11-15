const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };
    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    const BASE_URL = process.env.SITE_URL || 'https://cartasapp.netlify.app';
    const body = JSON.parse(event.body || '{}');

    async function getPayment(paymentId) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` }
      });
      return r.ok ? r.json() : null;
    }

    let payment = null;
    if (body?.type === 'payment' && body?.data?.id) {
      payment = await getPayment(body.data.id);
    } else if (body?.action === 'payment.created' && body?.data?.id) {
      payment = await getPayment(body.data.id);
    } else if (body?.topic === 'payment' && body?.id) {
      payment = await getPayment(body.id);
    }

    if (!payment) return { statusCode: 200, body: 'no payment' };

    const status = payment.status;
    const orderId = payment.external_reference || (payment.metadata && payment.metadata.order_id);
    if (!orderId) return { statusCode: 200, body: 'no order_id' };
    if (status !== 'approved') return { statusCode: 200, body: 'not approved' };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // já gerado?
    const g = await supabase.from('generations').select('id').eq('order_id', orderId).maybeSingle();
    if (g.data) return { statusCode: 200, body: 'already generated' };

    // pega payload salvo no checkout
    const ci = await supabase.from('checkout_intents').select('payload, slug').eq('order_id', orderId).maybeSingle();
    const payload = ci.data?.payload || null;
    if (!payload) return { statusCode: 200, body: 'no payload' };

    // garante order_id dentro do payload
    payload.order_id = orderId;

    // chama a mesma função do site para gerar
    const r = await fetch(`${BASE_URL}/.netlify/functions/generate-doc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, preview: false })
    });
    const data = await r.json();

    return { statusCode: 200, body: JSON.stringify({ ok: true, gen: data }) };
  } catch (e) {
    return { statusCode: 200, body: 'err' };
  }
};