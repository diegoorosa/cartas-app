const { createClient } = require('@supabase/supabase-js');

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };
    const body = JSON.parse(event.body || '{}');

    const paymentId = body?.data?.id || body?.id;
    const topic = body?.type || body?.topic || body?.action;

    if (!paymentId || !String(topic).includes('payment')) {
      return { statusCode: 200, body: 'ok' };
    }

    // Busca detalhes do pagamento
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
    });
    const pay = await r.json();

    const status = pay?.status; // 'approved', 'pending', 'rejected'...
    const orderId = pay?.external_reference || pay?.metadata?.order_id;

    if (orderId) {
      await supabase
        .from('orders')
        .update({ status: status === 'approved' ? 'paid' : 'pending' })
        .eq('id', orderId);
    }

    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.error('mp-webhook error', e);
    return { statusCode: 200, body: 'ok' }; // sempre 200 para o MP não re-tentar infinito
  }
};