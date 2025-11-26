// ARQUIVO: netlify/functions/mp-webhook.js

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // Início da execução para controle de tempo (Netlify limite ~10s ou 26s)
  const startTime = Date.now();

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

    // --- 1. GERA O DOCUMENTO COM RETENTATIVA (RETRY) ---
    let gerouSucesso = false;

    // Tenta até 3 vezes se houver tempo
    for (let i = 1; i <= 3; i++) {
      const elapsed = Date.now() - startTime;
      // Se já passou de 8 segundos totais, não arrisca outra tentativa (evita timeout do webhook)
      if (elapsed > 8000) break;

      try {
        if (i > 1) console.log(`Tentativa ${i} de gerar documento no webhook...`);

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
          console.log(`Erro na tentativa ${i}: ${rGen.status}`);
          // Se falhou, espera 1s antes de tentar de novo (se tiver tempo)
          await new Promise(res => setTimeout(res, 1000));
        }
      } catch (errGen) {
        console.error(`Exception na tentativa ${i}:`, errGen);
      }
    }

    if (!gerouSucesso) console.error('FALHA FINAL: Não foi possível gerar o documento após tentativas no webhook.');

    // 2. ENVIA O E-MAIL AUTOMATICAMENTE (Se gerou sucesso)
    if (gerouSucesso && payload.email && payload.email.includes('@')) {
      try {
        // Dispara e esquece (não espera o await pra não travar o retorno do webhook)
        fetch(`${BASE_URL}/.netlify/functions/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId, email_to: payload.email })
        }).catch(e => console.error('Erro envio email bg:', e));
      } catch (errEmail) {
        console.error('Erro ao chamar envio de email:', errEmail);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (e) {
    console.error('Webhook Error:', e);
    return { statusCode: 200, body: 'error handled' };
  }
};