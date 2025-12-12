// ARQUIVO: netlify/functions/mp-webhook.js

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Cronômetro global para monitorar timeout do Netlify
  const startTime = Date.now();

  try {
    // 1. Apenas aceita POST
    if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

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

    if (!orderId) return { statusCode: 200, body: 'no order_id' };

    // INICIALIZA SUPABASE (Movido para cima para usar tanto no Rejected quanto no Approved)
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
    // BLOCO ORIGINAL: PAGAMENTO APROVADO (GERAÇÃO DE DOCUMENTO)
    // =================================================================

    // Verifica se JÁ foi gerado antes (Idempotência)
    const g = await supabase.from('generations').select('id').eq('order_id', orderId).maybeSingle();
    if (g.data) return { statusCode: 200, body: 'already generated' };

    // Recupera payload para geração
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

    // --- ENVIO DE E-MAIL PARA O CLIENTE (Sucesso) ---
    // Só envia se sobrou tempo no cronômetro
    const tempoGasto = Date.now() - startTime;

    if (payload.email && payload.email.includes('@')) {
      if (tempoGasto < 9000) { // Se gastou menos de 9s, tenta enviar o e-mail
        try {
          console.log('Enviando e-mail de entrega (com await)...');
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