// ARQUIVO: netlify/functions/mp-webhook.js

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

exports.handler = async (event) => {
  // Cronômetro global para monitorar timeout do Netlify
  const startTime = Date.now();

  try {
    // 1. Apenas aceita POST
    if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

    // Verificação de assinatura do Mercado Pago (HMAC-SHA256)
    const mpSignature = event.headers['x-signature'] || event.headers['X-Signature'];
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;
    if (webhookSecret && mpSignature) {
      const expectedSig = crypto.createHmac('sha256', webhookSecret).update(event.body || '').digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(mpSignature), Buffer.from(expectedSig))) {
        console.warn('MP Webhook: assinatura inválida');
        return { statusCode: 401, body: 'Invalid signature' };
      }
    }

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
    const body = JSON.parse(event.body || '{}');

    // --- FUNÇÃO AUXILIAR PARA BUSCAR PAGAMENTO NO MERCADO PAGO ---
    async function getPayment(paymentId) {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_TOKEN}` }
      });
      return r.ok ? r.json() : null;
    }

    // 2. Identifica o ID do pagamento no webhook
    let payment = null;
    if (body?.data?.id) payment = await getPayment(body.data.id);
    else if (body?.id) payment = await getPayment(body.id);

    if (!payment) return { statusCode: 200, body: 'no payment found' };

    const status = payment.status;
    const orderId = payment.external_reference || (payment.metadata && payment.metadata.order_id);
    const paymentId = payment.id; // MP payment ID para consultas diretas

    if (!orderId) return { statusCode: 200, body: 'no order_id' };

    // INICIALIZA SUPABASE (Movido para cima para usar tanto no Rejected quanto no Approved)
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Idempotência: verifica se já processamos este payment_id
    const { data: processed } = await supabase
      .from('webhook_processed')
      .select('id')
      .eq('payment_id', paymentId)
      .maybeSingle();
    if (processed) {
      console.log(`Webhook duplicado ignorado: payment_id ${paymentId}`);
      return { statusCode: 200, body: 'already processed' };
    }

    // Salva payment_id no checkout_intents para consultas diretas futuras (order-status)
    try {
        await supabase.from('checkout_intents').update({ payment_id: paymentId }).eq('order_id', orderId);
    } catch (e) { console.warn('Falha ao salvar payment_id:', e); }

    // Registra processamento para idempotência
    try {
      await supabase.from('webhook_processed').insert({ payment_id: paymentId, order_id: orderId, status });
    } catch (e) { console.warn('Falha ao registrar webhook_processed:', e); }

    // =================================================================
    // NOVO BLOCO: TRATAMENTO DE PAGAMENTO RECUSADO (ALERTA PARA O DIEGO)
    // =================================================================
    if (status === 'rejected' || status === 'cancelled') {
      console.log(`Pagamento RECUSADO/CANCELADO para Order ID: ${orderId}. Iniciando alerta...`);

      // Busca dados do cliente no checkout_intents para compor o alerta
      const ciRejected = await supabase.from('checkout_intents').select('payload').eq('order_id', orderId).maybeSingle();
      const payloadRejected = ciRejected.data?.payload || {};
      
      const nomeCliente = payloadRejected.nome || 'Cliente Desconhecido';
      const foneCliente = payloadRejected.telefone || 'Sem telefone';
      const emailCliente = payloadRejected.email || 'Sem e-mail';

      // Tenta enviar o e-mail de alerta para você
      try {
        await fetch(`${BASE_URL}/.netlify/functions/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Parâmetros especiais para o seu alerta
            email_to: 'diegosch.rosa@gmail.com',
            subject: `🚨 Venda RECUSADA: ${nomeCliente}`,
            // Se o seu send-email.js suportar 'message' ou 'text', ele vai usar isso.
            // Caso ele espere apenas 'order_id', ele pode enviar um e-mail padrão, 
            // mas o Assunto acima ajudará você a identificar.
            message: `ATENÇÃO: Pagamento recusado.\n\nCliente: ${nomeCliente}\nTelefone: ${foneCliente}\nEmail: ${emailCliente}\n\nEntre em contato via WhatsApp para recuperar a venda com Pix Manual.`
          })
        });
        console.log('Alerta de recusa enviado com sucesso para diegosch.rosa@gmail.com');
      } catch (errAlert) {
        console.error('Erro ao enviar alerta de recusa:', errAlert);
      }

      // Retorna 200 para o Mercado Pago não ficar reenviando o webhook de recusa
      return { statusCode: 200, body: 'rejected alert sent' };
    }
    // =================================================================
    // FIM DO NOVO BLOCO
    // =================================================================


    // Se não for aprovado (e não for rejected que já tratamos acima), ignora.
    if (status !== 'approved') return { statusCode: 200, body: 'not approved' };


    // =================================================================
    // BLOCO OTIMIZADO: PAGAMENTO APROVADO (GERAÇÃO DE DOCUMENTO)
    // =================================================================

    // Recupera payload para geração
    const ci = await supabase.from('checkout_intents').select('payload, slug').eq('order_id', orderId).maybeSingle();
    const payload = ci.data?.payload || null;

    if (!payload) return { statusCode: 200, body: 'no payload found' };

    payload.order_id = orderId;

    // --- TENTATIVA DE GERAÇÃO (LOOP INTELIGENTE) ---
    // Idempotência é tratada DENTRO do generate-doc (cache hit retorna cached: true)
    let gerouSucesso = false;
    let docOutput = null;

    for (let i = 1; i <= 3; i++) {
      const elapsed = Date.now() - startTime;
      // Timeout reduzido para 6s total (deixa 4s de margem pro retorno 10s Netlify)
      if (elapsed > 6000) break;

      try {
        console.log(`Tentativa ${i} de gerar documento...`);
        const ehUltimaDoWebhook = i === 3;
        const rGen = await fetch(`${BASE_URL}/.netlify/functions/generate-doc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
          },
          // ultima_tentativa so na 3a do webhook -- antes disso, se a IA nao respondeu,
          // generate-doc NAO cacheia o texto cru, e o polling do success.html tenta de novo.
          body: JSON.stringify({ payload: Object.assign({}, payload, { ultima_tentativa: ehUltimaDoWebhook }), preview: false })
        });

        if (rGen.ok) {
          const result = await rGen.json();
          if (result.output && (!result.ai_pendente || ehUltimaDoWebhook)) {
            gerouSucesso = true;
            docOutput = result.output;
            break;
          }
          console.log(`Tentativa ${i}: IA ainda nao respondeu a tempo, tentando de novo...`);
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

    // --- ENVIO DE E-MAIL PARA O CLIENTE (Fire-and-forget, NÃO await) ---
    // Dispara em background, não bloqueia retorno 200 pro Mercado Pago
    if (payload.email && payload.email.includes('@')) {
      fetch(`${BASE_URL}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, email_to: payload.email })
      }).catch(e => console.error('Erro async ao enviar e-mail:', e));
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, cached: false }) };

  } catch (e) {
    console.error('Webhook Fatal:', e);
    return { statusCode: 500, body: 'Internal Error' };
  }
};