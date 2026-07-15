// ARQUIVO: netlify/functions/cron-abandoned-cart.js
// Executa a cada hora via Netlify Scheduled Functions
// Recupera carrinhos abandonados (leads pending > 1h sem pagamento)

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
const INTERNAL_SECRET = process.env.INTERNAL_FUNCTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cupom para recuperação de abandono
const RECOVERY_COUPON = 'VOLTA10';

// TRAVA DE SEGURANÇA: leads criados antes desta data NUNCA recebem email de recuperação
// (evita disparar para leads de teste ou período anterior à ativação do sistema)
const MIN_CREATED_AT = '2026-07-15T00:00:00Z';

exports.handler = async (event) => {
  // Permite execução agendada (sem header) OU manual com secret
  const authHeader = event.headers['x-internal-secret'] || event.headers['authorization'];
  const isManualCall = authHeader === INTERNAL_SECRET || authHeader === `Bearer ${INTERNAL_SECRET}`;
  const isScheduledRun = !event.headers['x-internal-secret'] && !event.headers['authorization'];
  
  if (!isManualCall && !isScheduledRun) {
    console.warn('Tentativa de acesso não autorizado ao cron-abandoned-cart');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  console.log('[cron-abandoned-cart] Iniciando verificação de carrinhos abandonados...');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // 1. Busca leads pendentes de HOJE há mais de 1 hora
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'pending')
      .is('recovery_sent_at', null)  // NÃO processar leads que já tiveram email de recuperação
      .not('email', 'is', null)
      .gte('created_at', MIN_CREATED_AT)  // trava de segurança: nunca processar leads antigos
      .gte('created_at', todayStart)       // apenas leads de HOJE
      .lt('created_at', oneHourAgo)        // há mais de 1h
      .order('created_at', { ascending: true })
      .limit(3); // Processa no máx 3 por execução (evita timeout 30s)

    if (leadsError) {
      console.error('[cron-abandoned-cart] Erro ao buscar leads:', leadsError);
      // Se a coluna recovery_sent_at não existir, tenta sem esse filtro
      if (leadsError.message && leadsError.message.includes('recovery_sent_at')) {
        console.warn('[cron-abandoned-cart] Coluna recovery_sent_at não existe, tentando sem esse filtro...');
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
          console.error('[cron-abandoned-cart] Erro ao buscar leads (fallback):', leadsError2);
          return { statusCode: 500, body: 'Erro ao buscar leads' };
        }
        return { data: leads2, error: null };
      }
      return { statusCode: 500, body: 'Erro ao buscar leads' };
    }

    if (!leads || leads.length === 0) {
      console.log('[cron-abandoned-cart] Nenhum carrinho abandonado encontrado');
      return { statusCode: 200, body: JSON.stringify({ processed: 0, message: 'Nenhum abandono' }) };
    }

    console.log(`[cron-abandoned-cart] Encontrados ${leads.length} leads abandonados`);

    let processed = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        // 2. Verifica se já pagou (cross-ref com generations - tabela que é populada quando doc é gerado após pagamento)
        const { data: generation } = await supabase
          .from('generations')
          .select('order_id')
          .eq('slug', lead.slug)
          .filter('input_json->>email', 'eq', lead.email)
          .maybeSingle();

        if (generation) {
          // Já pagou - documento foi gerado - marca lead como convertido
          await supabase
            .from('leads')
            .update({ status: 'converted', converted_at: new Date().toISOString() })
            .eq('id', lead.id);
          console.log(`[cron-abandoned-cart] Lead ${lead.id} já convertiu (doc gerado), pulando`);
          continue;
        }

        // 2b. Dedup: mesmo email já recebeu recovery nas últimas 24h?
        const { data: recentRecovery } = await supabase
          .from('leads')
          .select('id')
          .eq('email', lead.email)
          .eq('status', 'recovery_sent')
          .gte('recovery_sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (recentRecovery && recentRecovery.length > 0) {
          await supabase.from('leads').update({ status: 'recovery_skipped' }).eq('id', lead.id);
          console.log(`[cron-abandoned-cart] Lead ${lead.id} pulado - email ${lead.email} já recebeu recovery nas últimas 24h`);
          continue;
        }

        // 3. Chama mp-checkout internamente com o cupom (com retry para rate limit)
        let checkoutData = null;
        let checkoutAttempts = 0;
        const maxCheckoutAttempts = 3;
        
        while (checkoutAttempts < maxCheckoutAttempts && !checkoutData) {
          checkoutAttempts++;
          // Timeout de 10s para mp-checkout
          const checkoutController = new AbortController();
          let checkoutTimeout = setTimeout(() => checkoutController.abort(), 10000);
          
          try {
            const checkoutResp = await fetch(`${SITE_URL}/.netlify/functions/mp-checkout`, {
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
            
            const contentType = checkoutResp.headers.get('content-type');
            let responseText = await checkoutResp.text();
            
            if (!checkoutResp.ok) {
              // Rate limit do Mercado Pago
              if (checkoutResp.status === 429) {
                const waitMs = Math.min(1000 * Math.pow(2, checkoutAttempts), 10000);
                console.warn(`[cron-abandoned-cart] Rate limit MP (tentativa ${checkoutAttempts}/${maxCheckoutAttempts}), aguardando ${waitMs}ms`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
              }
              console.error(`[cron-abandoned-cart] Erro HTTP ${checkoutResp.status} no checkout para lead ${lead.id}:`, responseText);
              throw new Error(`HTTP ${checkoutResp.status}: ${responseText}`);
            }
            
            if (!contentType?.includes('application/json')) {
              console.warn(`[cron-abandoned-cart] Resposta sem Content-Type JSON do MP para lead ${lead.id}, tentando parse mesmo assim:`, responseText);
            }
            
            try {
              checkoutData = JSON.parse(responseText);
            } catch (e) {
              console.error(`[cron-abandoned-cart] Falha ao parsear JSON do MP para lead ${lead.id}:`, e);
              throw new Error('Resposta inválida do Mercado Pago');
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
          throw new Error('Falha ao criar checkout no Mercado Pago após tentativas');
        }

        const { init_point: checkoutUrl, order_id: newOrderId, final_price } = checkoutData;

        // 4. Envia email de recuperação (com retry)
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

        // 5. Atualiza lead como recovery_sent - COM VERIFICAÇÃO
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
          console.error(`[cron-abandoned-cart] ERRO CRÍTICO ao atualizar lead ${lead.id}:`, updateError);
          // Se falhou em atualizar, NÃO incrementa processed - lead será reprocessado na próxima execução
          throw new Error(`Falha ao marcar lead como recovery_sent: ${updateError.message}`);
        }

        // Verifica se a atualização realmente persistiu
        const { data: verifyLead } = await supabase
          .from('leads')
          .select('status, recovery_sent_at')
          .eq('id', lead.id)
          .maybeSingle();
        
        if (verifyLead && verifyLead.status === 'recovery_sent' && verifyLead.recovery_sent_at) {
          processed++;
          console.log(`[cron-abandoned-cart] ✅ Recuperação enviada e confirmada para lead ${lead.id} (email: ${lead.email})`);
        } else {
          console.error(`[cron-abandoned-cart] ⚠️ Atualização do lead ${lead.id} não persistiu corretamente!`, verifyLead);
          throw new Error('Atualização do lead não confirmada no banco');
        }

      } catch (e) {
        console.error(`[cron-abandoned-cart] Erro processando lead ${lead.id}:`, e);
        errors++;
      }

      // Pequeno delay entre leads para não estourar rate limits
      await new Promise(r => setTimeout(r, 1000));

    }

    // ================================================================
    // STAGE 2: Segundo email de lembrete (12h apos o primeiro recovery)
    // ================================================================
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    let reminded = 0;
    let remindErrors = 0;

    const { data: remindLeads, error: remindError } = await supabase
      .from('leads')
      .select('*')
      .eq('status', 'recovery_sent')
      .is('recovery_reminded_at', null)
      .not('email', 'is', null)
      .lt('recovery_sent_at', twelveHoursAgo)
      .order('recovery_sent_at', { ascending: true })
      .limit(3);

    if (remindError) {
      console.error('[cron-abandoned-cart] Erro ao buscar leads para lembrete:', remindError);
    } else if (remindLeads && remindLeads.length > 0) {
      console.log(`[cron-abandoned-cart] Encontrados ${remindLeads.length} leads para segundo lembrete`);

      for (const lead of remindLeads) {
        try {
          const { data: generation } = await supabase
            .from('generations')
            .select('order_id')
            .eq('slug', lead.slug)
            .filter('input_json->>email', 'eq', lead.email)
            .maybeSingle();

          if (generation) {
            await supabase.from('leads').update({ status: 'converted', converted_at: new Date().toISOString() }).eq('id', lead.id);
            console.log(`[cron-abandoned-cart] Lead ${lead.id} converteu, pulando lembrete`);
            continue;
          }

          const checkoutUrl = lead.recovery_checkout_url;
          if (!checkoutUrl) {
            console.warn(`[cron-abandoned-cart] Lead ${lead.id} sem recovery_checkout_url, pulando`);
            continue;
          }

          let emailSent = false;
          let emailAttempts = 0;
          while (emailAttempts < 3 && !emailSent) {
            emailAttempts++;
            try {
              const emailResp = await fetch(`${SITE_URL}/.netlify/functions/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
                body: JSON.stringify({
                  order_id: lead.recovery_order_id,
                  email_to: lead.email,
                  recovery_mode: true,
                  reminder_mode: true,
                  coupon: lead.recovery_coupon,
                  final_price: null,
                  checkout_url: checkoutUrl,
                  slug: lead.slug
                }),
                signal: AbortSignal.timeout(8000)
              });
              if (emailResp.ok) emailSent = true;
            } catch (e) {
              if (emailAttempts >= 3) throw e;
              await new Promise(r => setTimeout(r, 2000));
            }
          }

          if (!emailSent) throw new Error('Falha ao enviar lembrete');

          await supabase.from('leads').update({
            recovery_reminded_at: new Date().toISOString(),
            status: 'recovery_final'
          }).eq('id', lead.id);

          reminded++;
          console.log(`[cron-abandoned-cart] Lembrete enviado para lead ${lead.id} (${lead.email})`);

        } catch (e) {
          console.error(`[cron-abandoned-cart] Erro no lembrete lead ${lead.id}:`, e);
          remindErrors++;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        first_wave: { processed, errors, total_found: leads.length },
        second_wave: { reminded, remindErrors, total_found: remindLeads?.length || 0 },
        timestamp: new Date().toISOString()
      })
    };

  } catch (e) {
    console.error('[cron-abandoned-cart] Erro fatal:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};