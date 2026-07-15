// ARQUIVO: netlify/functions/mp-webhook2.js
// TESTE: usa checkout_intents2 + webhook_processed (idempotencia)

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

exports.handler = async (event) => {
  console.log(`[mp-webhook2] INVOCADO - Method: ${event.httpMethod} | Time: ${new Date().toISOString()}`);
  const startTime = Date.now();

  try {
    if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

    // Verificacao de assinatura do Mercado Pago (HMAC-SHA256)
    const mpSignature = event.headers['x-signature'] || event.headers['X-Signature'];
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;
    if (webhookSecret && mpSignature) {
      const expectedSig = crypto.createHmac('sha256', webhookSecret).update(event.body || '').digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(mpSignature), Buffer.from(expectedSig))) {
        console.warn('[mp-webhook2] assinatura invalida');
        return { statusCode: 401, body: 'Invalid signature' };
      }
    }

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
    const body = JSON.parse(event.body || '{}');
    console.log(`[mp-webhook2] Body recebido:`, JSON.stringify(body).substring(0, 500));

    async function getPayment(paymentId) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` }
      });
      return r.ok ? r.json() : null;
    }

    let payment = null;

    if (body?.data?.id) {
      payment = await getPayment(body.data.id);

    } else if (body?.topic === 'merchant_order' && body?.resource) {
      const moMatch = body.resource.match(/\/(\d+)$/);
      if (moMatch) {
        const moId = moMatch[1];
        console.log(`[mp-webhook2] Merchant Order recebido: ${moId}`);

        let mo = null;
        try {
          const moR = await fetch(`https://api.mercadopago.com/v1/merchant_orders/${moId}`, {
            headers: { Authorization: `Bearer ${MP_TOKEN}` }
          });
          console.log(`[mp-webhook2] merchant_order fetch status: ${moR.status}`);
          if (moR.ok) {
            mo = await moR.json();
          } else {
            const errBody = await moR.text();
            console.log(`[mp-webhook2] merchant_order erro body: ${errBody.substring(0, 300)}`);
          }
        } catch (e) { console.log(`[mp-webhook2] merchant_order fetch erro: ${e.message}`); }

        if (mo) {
          const payments = mo.payments || [];
          console.log(`[mp-webhook2] merchant_order id=${mo.id}, status=${mo.status}, payments=${payments.length}, external_reference=${mo.external_reference}`);

          if (payments.length > 0) {
            const approved = payments.find(p => p.status === 'approved');
            const pay = approved || payments[0];
            payment = {
              id: pay.id,
              status: pay.status,
              transaction_amount: pay.transaction_amount,
              external_reference: mo.external_reference || pay.external_reference,
              metadata: pay.metadata || {}
            };
            console.log(`[mp-webhook2] Payment extraido: id=${payment.id}, status=${payment.status}, ext_ref=${payment.external_reference}`);
          } else {
            console.log(`[mp-webhook2] merchant_order sem payments.`);
          }
        }
      }
    } else if (body?.id) {
      payment = await getPayment(body.id);
    }

    if (!payment) { console.log('[mp-webhook2] Nenhum pagamento encontrado. Body:', JSON.stringify(body).substring(0, 300)); return { statusCode: 200, body: 'no payment found' }; }

    const status = payment.status;
    const orderId = payment.external_reference || (payment.metadata && payment.metadata.order_id);
    const paymentId = payment.id;

    if (!orderId) { console.log(`[mp-webhook2] Pagamento ${paymentId} sem order_id. Status: ${status}`); return { statusCode: 200, body: 'no order_id' }; }

    console.log(`[mp-webhook2] Pagamento ${paymentId} | Status: ${status} | OrderID: ${orderId}`);

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // IDEMPOTENCIA: verifica webhook_processed
    const { data: processed } = await supabase
      .from('webhook_processed')
      .select('id')
      .eq('payment_id', paymentId)
      .maybeSingle();
    if (processed) {
      console.log(`[mp-webhook2] Webhook duplicado ignorado: payment_id ${paymentId}`);
      return { statusCode: 200, body: 'already processed' };
    }

    // Salva payment_id na coluna payment_id da checkout_intents2
    try {
      await supabase.from('checkout_intents2').update({ payment_id: paymentId }).eq('order_id', orderId);
    } catch (e) { console.warn('[mp-webhook2] Falha ao salvar payment_id:', e); }

    // TRATAMENTO DE PAGAMENTO RECUSADO
    if (status === 'rejected' || status === 'cancelled') {
      console.log(`[mp-webhook2] Pagamento RECUSADO/CANCELADO para Order ID: ${orderId}`);

      // Registra idempotencia
      try {
        await supabase.from('webhook_processed').insert({ payment_id: paymentId, order_id: orderId, status });
      } catch (e) { console.warn('[mp-webhook2] Falha ao registrar webhook_processed:', e); }

      // Busca dados do cliente
      const ciRejected = await supabase.from('checkout_intents2').select('payload').eq('order_id', orderId).maybeSingle();
      const payloadRejected = ciRejected.data?.payload || {};

      const nomeCliente = payloadRejected.nome || 'Cliente Desconhecido';
      const foneCliente = payloadRejected.telefone || 'Sem telefone';
      const emailCliente = payloadRejected.email || 'Sem e-mail';

      try {
        await fetch(`${BASE_URL}/.netlify/functions/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email_to: 'diegosch.rosa@gmail.com',
            subject: `VENDA RECUSADA: ${nomeCliente}`,
            message: `ATENCAO: Pagamento recusado.\n\nCliente: ${nomeCliente}\nTelefone: ${foneCliente}\nEmail: ${emailCliente}\n\nEntre em contato via WhatsApp para recuperar a venda com Pix Manual.`
          })
        });
        console.log('[mp-webhook2] Alerta de recusa enviado');
      } catch (errAlert) {
        console.error('[mp-webhook2] Erro ao enviar alerta de recusa:', errAlert);
      }

      return { statusCode: 200, body: 'rejected alert sent' };
    }

    if (status !== 'approved') return { statusCode: 200, body: 'not approved' };

    // Registra idempotencia APOS processar approved
    try {
      await supabase.from('webhook_processed').insert({ payment_id: paymentId, order_id: orderId, status });
    } catch (e) { console.warn('[mp-webhook2] Falha ao registrar webhook_processed:', e); }

    // PAGAMENTO APROVADO - GERACAO DE DOCUMENTO
    console.log('[mp-webhook2] Buscando checkout_intents2 para order_id:', orderId);
    const ci = await supabase.from('checkout_intents2').select('payload, slug').eq('order_id', orderId).maybeSingle();
    console.log('[mp-webhook2] checkout_intents2 encontrado:', !!ci.data, 'slug:', (ci.data?.slug) || 'null');
    const payload = ci.data?.payload || null;

    if (!payload) {
      console.log('[mp-webhook2] PAYLOAD NAO ENCONTRADO para order_id:', orderId);
      return { statusCode: 200, body: 'no payload found' };
    }
    console.log('[mp-webhook2] Payload carregado, menor_nome:', payload.menor_nome || 'AUSENTE');

    payload.order_id = orderId;

    let gerouSucesso = false;
    for (let i = 1; i <= 3; i++) {
      const elapsed = Date.now() - startTime;
      if (elapsed > 6000) break;

      try {
        console.log(`[mp-webhook2] Tentativa ${i} de gerar documento...`);
        const ehUltimaDoWebhook = i === 3;
        const rGen = await fetch(`${BASE_URL}/.netlify/functions/generate-doc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
          },
          body: JSON.stringify({ payload: Object.assign({}, payload, { ultima_tentativa: ehUltimaDoWebhook }), preview: false })
        });

        if (rGen.ok) {
          const result = await rGen.json();
          if (result.output && (!result.ai_pendente || ehUltimaDoWebhook)) {
            gerouSucesso = true;
            break;
          }
          console.log(`[mp-webhook2] Tentativa ${i}: IA ainda nao respondeu`);
        } else {
          await new Promise(res => setTimeout(res, 1000));
        }
      } catch (e) {
        console.error(`[mp-webhook2] Erro tentativa ${i}:`, e);
      }
    }

    if (!gerouSucesso) {
      console.error(`[mp-webhook2] FALHA: Nao foi possivel gerar o doc para ${orderId}.`);
      return { statusCode: 500, body: 'Failed to generate doc. Retry later.' };
    }

    // Envio de email (fire-and-forget)
    if (payload.email && payload.email.includes('@')) {
      fetch(`${BASE_URL}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': process.env.INTERNAL_FUNCTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
        },
        body: JSON.stringify({ order_id: orderId, email_to: payload.email, slug: payload.slug || ci.data?.slug })
      }).catch(e => console.error('[mp-webhook2] Erro async ao enviar e-mail:', e));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, cached: false }) };

  } catch (e) {
    console.error('[mp-webhook2] Webhook Fatal:', e);
    return { statusCode: 500, body: 'Internal Error' };
  }
};