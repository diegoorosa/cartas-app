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

    // --- VALIDAÇÃO DO PAGAMENTO ---
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

    // Verifica se JÁ foi gerado antes
    const g = await supabase.from('generations').select('id').eq('order_id', orderId).maybeSingle();
    if (g.data) return { statusCode: 200, body: 'already generated' };

    // Recupera payload
    const ci = await supabase.from('checkout_intents').select('payload, slug').eq('order_id', orderId).maybeSingle();
    const payload = ci.data?.payload || null;

    if (!payload) return { statusCode: 200, body: 'no payload found' };

    payload.order_id = orderId;

    // --- TENTATIVA DE GERAÇÃO (LOOP INTELIGENTE) ---
    let gerouSucesso = false;

    for (let i = 1; i <= 3; i++) {
      const elapsed = Date.now() - startTime;
      // Se já passou de 8s, PARE de tentar gerar doc para sobrar tempo pro retorno
      if (elapsed > 8000) break;

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
          await new Promise(res => setTimeout(res, 1000));
        }
      } catch (e) {
        console.error(`Erro tentativa ${i}:`, e);
      }
    }

    if (!gerouSucesso) {
      console.error(`FALHA CRÍTICA: Não foi possível gerar o doc para ${orderId}.`);
      return { statusCode: 500, body: 'Failed to generate doc. Retry later.' };
    }

    // --- ENVIO DE E-MAIL (AGORA COM AWAIT) ---
    // Só envia se sobrou tempo no cronômetro (para não dar timeout no webhook)
    const tempoGasto = Date.now() - startTime;

    if (payload.email && payload.email.includes('@')) {
      if (tempoGasto < 9000) { // Se gastou menos de 9s, tenta enviar o e-mail
        try {
          console.log('Enviando e-mail (com await)...');
          // AQUI ESTÁ A CORREÇÃO: Adicionei o 'await'
          await fetch(`${BASE_URL}/.netlify/functions/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, email_to: payload.email })
          });
        } catch (e) {
          console.error('Erro ao enviar e-mail:', e);
          // Não faz nada, pois o principal (gerar doc) já foi feito.
        }
      } else {
        console.warn('Sem tempo para enviar e-mail automático. Webhook encerrando.');
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (e) {
    console.error('Webhook Fatal:', e);
    return { statusCode: 500, body: 'Internal Error' };
  }
};