// ARQUIVO: netlify/functions/cron-abandoned-cart2.js
// TESTE: chama mp-checkout2 em vez de mp-checkout

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
const INTERNAL_SECRET = process.env.INTERNAL_FUNCTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

const RECOVERY_COUPON = 'VOLTA10';

exports.handler = async (event) => {
  const authHeader = event.headers['x-internal-secret'] || event.headers['authorization'];
  const isManualCall = authHeader === INTERNAL_SECRET || authHeader === `Bearer ${INTERNAL_SECRET}`;
  const isScheduledRun = !event.headers['x-internal-secret'] && !event.headers['authorization'];

  if (!isManualCall && !isScheduledRun) {
    console.warn('[cron-abandoned-cart2] Acesso nao autorizado');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  console.log('[cron-abandoned-cart2] Iniciando verificacao de carrinhos abandonados...');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'pending')
      .is('recovery_sent_at', null)
      .not('email', 'is', null)
      .gte('created_at', todayStart)
      .lt('created_at', oneHourAgo)
      .order('created_at', { ascending: true })
      .limit(3);

    if (leadsError) {
      console.error('[cron-abandoned-cart2] Erro ao buscar leads:', leadsError);
      if (leadsError.message && leadsError.message.includes('recovery_sent_at')) {
        console.warn('[cron-abandoned-cart2] Coluna recovery_sent_at nao existe, tentando sem esse filtro...');
        const { data: leads2, error: leadsError2 } = await supabase
          .from('leads')
          .select('*')
          .eq('status', 'pending')
          .not('email', 'is', null)
          .gte('created_at', todayStart)
          .lt('created_at', oneHourAgo)
          .order('created_at', { ascending: true })
          .limit(3);
        if (leadsError2) {
          console.error('[cron-abandoned-cart2] Erro ao buscar leads (fallback):', leadsError2);
          return { statusCode: 500, body: 'Erro ao buscar leads' };
        }
        return { data: leads2, error: null };
      }
      return { statusCode: 500, body: 'Erro ao buscar leads' };
    }

    if (!leads || leads.length === 0) {
      console.log('[cron-abandoned-cart2] Nenhum carrinho abandonado encontrado');
      return { statusCode: 200, body: JSON.stringify({ processed: 0, message: 'Nenhum abandono' }) };
    }

    console.log(`[cron-abandoned-cart2] Encontrados ${leads.length} leads abandonados`);

    let processed = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        const { data: generation } = await supabase
          .from('generations')
          .select('order_id')
          .eq('slug', lead.slug)
          .filter('input_json->>email', 'eq', lead.email)
          .maybeSingle();

        if (generation) {
          await supabase
            .from('leads')
            .update({ status: 'converted', converted_at: new Date().toISOString() })
            .eq('id', lead.id);
          console.log(`[cron-abandoned-cart2] Lead ${lead.id} ja converteu, pulando`);
          continue;
        }

        // Chama mp-checkout2 com o cupom
        let checkoutData = null;
        let checkoutAttempts = 0;
        const maxCheckoutAttempts = 3;

        while (checkoutAttempts < maxCheckoutAttempts && !checkoutData) {
          checkoutAttempts++;
          const checkoutController = new AbortController();
          let checkoutTimeout = setTimeout(() => checkoutController.abort(), 10000);

          try {
            const checkoutResp = await fetch(`${SITE_URL}/.netlify/functions/mp-checkout2`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': INTERNAL_SECRET
              },
              body: JSON.stringify({
                slug: lead.slug,
                payload: lead.payload,
                utm: { source: 'email', medium: 'recovery', campaign: 'abandoned_cart' },
                coupon: RECOVERY_COUPON,
                lead_created_at: lead.created_at
              }),
              signal: checkoutController.signal
            });

            clearTimeout(checkoutTimeout);

            let responseText = await checkoutResp.text();

            if (!checkoutResp.ok) {
              if (checkoutResp.status === 429) {
                const waitMs = Math.min(1000 * Math.pow(2, checkoutAttempts), 10000);
                console.warn(`[cron-abandoned-cart2] Rate limit (tentativa ${checkoutAttempts}/${maxCheckoutAttempts}), aguardando ${waitMs}ms`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
              }
              console.error(`[cron-abandoned-cart2] Erro HTTP ${checkoutResp.status} no checkout para lead ${lead.id}:`, responseText);
              throw new Error(`HTTP ${checkoutResp.status}: ${responseText}`);
            }

            try {
              checkoutData = JSON.parse(responseText);
            } catch (e) {
              console.error(`[cron-abandoned-cart2] Falha ao parsear JSON para lead ${lead.id}:`, e);
              throw new Error('Resposta invalida do Mercado Pago');
            }

          } catch (e) {
            if (checkoutTimeout) clearTimeout(checkoutTimeout);
            if (checkoutAttempts >= maxCheckoutAttempts) {
              throw e;
            }
            await new Promise(r => setTimeout(r, 1000 * checkoutAttempts));
          }
        }

        if (!checkoutData || !checkoutData.init_point) {
          throw new Error('Falha ao criar checkout no Mercado Pago apos tentativas');
        }

        const { init_point: checkoutUrl, order_id: newOrderId, final_price } = checkoutData;

        // Envia email de recuperacao
        let emailSent = false;
        let emailAttempts = 0;
        const maxEmailAttempts = 3;

        while (emailAttempts < maxEmailAttempts && !emailSent) {
          emailAttempts++;
          const emailController = new AbortController();
          let emailTimeout = setTimeout(() => emailController.abort(), 8000);

          try {
            const emailResp = await fetch(`${SITE_URL}/.netlify/functions/send-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': INTERNAL_SECRET
              },
              body: JSON.stringify({
                order_id: newOrderId,
                email_to: lead.email,
                recovery_mode: true,
                coupon: RECOVERY_COUPON,
                final_price,
                checkout_url: checkoutUrl,
                slug: lead.slug
              }),
              signal: emailController.signal
            });

            clearTimeout(emailTimeout);

            if (!emailResp.ok) {
              if (emailResp.status === 429 && emailAttempts < maxEmailAttempts) {
                await new Promise(r => setTimeout(r, 2000 * emailAttempts));
                continue;
              }
              throw new Error(`Email falhou: ${emailResp.status}`);
            }
            emailSent = true;
          } catch (e) {
            if (emailTimeout) clearTimeout(emailTimeout);
            if (emailAttempts >= maxEmailAttempts) throw e;
            await new Promise(r => setTimeout(r, 2000 * emailAttempts));
          }
        }

        // Atualiza lead
        const { error: updateError } = await supabase
          .from('leads')
          .update({
            status: 'recovery_sent',
            recovery_sent_at: new Date().toISOString(),
            recovery_coupon: RECOVERY_COUPON,
            recovery_order_id: newOrderId,
            recovery_checkout_url: checkoutUrl
          })
          .eq('id', lead.id);

        if (updateError) {
          console.error(`[cron-abandoned-cart2] ERRO ao atualizar lead ${lead.id}:`, updateError);
          throw new Error(`Falha ao marcar lead como recovery_sent: ${updateError.message}`);
        }

        const { data: verifyLead } = await supabase
          .from('leads')
          .select('status, recovery_sent_at')
          .eq('id', lead.id)
          .maybeSingle();

        if (verifyLead && verifyLead.status === 'recovery_sent' && verifyLead.recovery_sent_at) {
          processed++;
          console.log(`[cron-abandoned-cart2] Recuperacao enviada para lead ${lead.id} (email: ${lead.email})`);
        } else {
          console.error(`[cron-abandoned-cart2] Atualizacao do lead ${lead.id} nao persistiu`);
          throw new Error('Atualizacao do lead nao confirmada no banco');
        }

      } catch (e) {
        console.error(`[cron-abandoned-cart2] Erro processando lead ${lead.id}:`, e);
        errors++;
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        processed,
        errors,
        total_found: leads.length,
        timestamp: new Date().toISOString()
      })
    };

  } catch (e) {
    console.error('[cron-abandoned-cart2] Erro fatal:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};