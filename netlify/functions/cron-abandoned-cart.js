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
      .not('email', 'is', null)
      .gte('created_at', todayStart)  // apenas leads de HOJE
      .lt('created_at', oneHourAgo)   // há mais de 1h
      .order('created_at', { ascending: true })
      .limit(15); // Processa no máx 15 por execução

    if (leadsError) {
      console.error('[cron-abandoned-cart] Erro ao buscar leads:', leadsError);
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
        // 2. Verifica se já pagou (cross-ref com orders)
        const { data: order } = await supabase
          .from('orders')
          .select('order_id')
          .eq('email', lead.email)
          .eq('slug', lead.slug)
          .eq('status', 'paid')
          .maybeSingle();

        if (order) {
          // Já pagou - marca lead como convertido
          await supabase
            .from('leads')
            .update({ status: 'converted', converted_at: new Date().toISOString() })
            .eq('id', lead.id);
          continue;
        }

        // 3. Chama mp-checkout internamente com o cupom (com retry para rate limit)
        let checkoutData = null;
        let checkoutAttempts = 0;
        const maxCheckoutAttempts = 3;
        
        while (checkoutAttempts < maxCheckoutAttempts && !checkoutData) {
          checkoutAttempts++;
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
              })
            });
            
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
              console.error(`[cron-abandoned-cart] Resposta não-JSON do MP para lead ${lead.id}:`, responseText);
              if (checkoutAttempts < maxCheckoutAttempts) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
              }
              throw new Error('Resposta inválida do Mercado Pago');
            }
            
            checkoutData = JSON.parse(responseText);
            
          } catch (e) {
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
                checkout_url: checkoutUrl
              })
            });
            
            if (!emailResp.ok) {
              if (emailResp.status === 429 && emailAttempts < maxEmailAttempts) {
                await new Promise(r => setTimeout(r, 2000 * emailAttempts));
                continue;
              }
              throw new Error(`Email falhou: ${emailResp.status}`);
            }
            emailSent = true;
          } catch (e) {
            if (emailAttempts >= maxEmailAttempts) throw e;
            await new Promise(r => setTimeout(r, 2000 * emailAttempts));
          }
        }

        // 5. Atualiza lead como recovery_sent
        await supabase
          .from('leads')
          .update({ 
            status: 'recovery_sent',
            recovery_sent_at: new Date().toISOString(),
            recovery_coupon: RECOVERY_COUPON,
            recovery_order_id: newOrderId,
            recovery_checkout_url: checkoutUrl
          })
          .eq('id', lead.id);

        processed++;
        console.log(`[cron-abandoned-cart] Recuperação enviada para lead ${lead.id} (email: ${lead.email})`);

      } catch (e) {
        console.error(`[cron-abandoned-cart] Erro processando lead ${lead.id}:`, e);
        errors++;
      }
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
    console.error('[cron-abandoned-cart] Erro fatal:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};