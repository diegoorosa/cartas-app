// ARQUIVO: netlify/functions/mp-checkout.js

const { createClient } = require('@supabase/supabase-js');

// Simple in-memory rate limiter (10 req/min/IP)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 min
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  const requests = (rateLimitStore.get(ip) || []).filter(t => t > windowStart);
  if (requests.length >= RATE_LIMIT_MAX) return false;
  requests.push(now);
  rateLimitStore.set(ip, requests);
  return true;
}

// Mapeamento de preços completo — extraído para price-map.js (fonte única,
// compartilhada com order-status.js pro valor real da conversão do Ads)
const { PRICE_MAP } = require('./price-map');

// Cupons válidos — % de desconto (0.10 = 10%)
const COUPONS = {
    'VOLTA10': 0.10,      // 10% OFF - recuperação de abandono
    'BEMVINDO15': 0.15,   // 15% OFF - primeira compra (exemplo futuro)
    'INDICA20': 0.20,     // 20% OFF - indicação (exemplo futuro)
};

// Títulos amigáveis para o item exibido no checkout do Mercado Pago
const TITLE_MAP = {
    'autorizacao-viagem-menor': 'Autorização de Viagem para Menor'
};

function tituloAmigavel(slug) {
    if (TITLE_MAP[slug]) return TITLE_MAP[slug];
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Grava log de aceite de termos/aviso no Supabase.
 * Não bloqueia o fluxo de pagamento em caso de erro.
 */
async function logConsent(supabase, orderId, payload, event, slug) {
    try {
        if (!payload || !payload.accepted_terms) {
            // Se o front não enviou aceite, não grava nada
            return;
        }

        const headers = event.headers || {};

        const ip =
            headers['x-nf-client-connection-ip'] ||
            (headers['x-forwarded-for'] || '').split(',')[0] ||
            null;

        const userAgent = headers['user-agent'] || null;

        const { error } = await supabase.from('consent_logs').insert({
            order_id: orderId,
            slug: slug || (payload.slug || 'documento'),
            accepted_terms: true,
            terms_version: payload.terms_version || null,
            accepted_at: payload.accepted_at || new Date().toISOString(),
            ip,
            user_agent: userAgent,
            email: payload.email || null,
            telefone: payload.telefone || null
        });

        if (error) {
            console.error('Erro ao salvar consentimento:', error);
        }
    } catch (err) {
        console.error('Exceção ao salvar consentimento:', err);
    }
}

exports.handler = async (event) => {
  console.log("[mp-checkout] INVOCADO - Method: " + event.httpMethod + " | Time: " + new Date().toISOString());
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

        // Rate limiting: 10 req/min/IP
        const clientIp = event.headers['x-nf-client-connection-ip'] || 'unknown';
        if (!checkRateLimit(clientIp)) {
          return { statusCode: 429, body: 'Too many requests' };
        }

        // CORREÇÃO: Removido captchaToken da extração e da validação
        const { slug, payload, utm, coupon, lead_created_at } = JSON.parse(event.body || '{}');

        // Recupera o preço base ou usa o default
        let price = PRICE_MAP[slug] || PRICE_MAP[slug.split('?')[0]] || PRICE_MAP['default'];

        // Aplica cupom se válido
        let appliedCoupon = null;
        let discount = 0;
        if (coupon && COUPONS[coupon]) {
            // Expiração real de 24h para cupom VOLTA10 (recuperação abandono)
            if (coupon === 'VOLTA10' && lead_created_at) {
                const leadCreated = new Date(lead_created_at);
                const hoursDiff = (Date.now() - leadCreated.getTime()) / (1000 * 60 * 60);
                if (hoursDiff > 24) {
                    console.log(`[mp-checkout] Cupom VOLTA10 expirado (${hoursDiff.toFixed(1)}h > 24h), ignorando desconto`);
                    // Ignora cupom, preço normal
                } else {
                    discount = COUPONS[coupon];
                    price = Math.round(price * (1 - discount) * 100) / 100;
                    appliedCoupon = coupon;
                }
            } else {
                discount = COUPONS[coupon];
                price = Math.round(price * (1 - discount) * 100) / 100;
                appliedCoupon = coupon;
            }
        }

        if (!slug) return { statusCode: 400, body: 'Missing slug' };

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
        const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
        const orderId = crypto.randomUUID();
        console.log('[mp-checkout] order_id gerado:', orderId);

        // Salva a intenção de compra + payload no Supabase para uso posterior no webhook
        try {
            await supabase.from('checkout_intents').insert({
                order_id: orderId,
                slug,
                payload: payload || null,
                utm: utm || null
            });
            console.log('[mp-checkout] checkout_intents salvo com sucesso para order_id:', orderId);
        } catch (e) {
            console.error('[mp-checkout] ERRO ao salvar intent no Supabase:', e);
            // Não bloqueia o fluxo se o log falhar, mas é ideal que funcione
        }

        // NOVO: grava log de consentimento (se houver) – não bloqueia fluxo
        await logConsent(supabase, orderId, payload || {}, event, slug);

        const pref = {
            items: [
                {
                    title: `Documento: ${tituloAmigavel(slug)}`,
                    quantity: 1,
                    currency_id: 'BRL',
                    unit_price: Number(price)
                }
            ],
            // --- BLOQUEIO DE BOLETO COMEÇA AQUI ---
            payment_methods: {
                excluded_payment_types: [
                    { id: "ticket" } // Isso remove Boleto, Lotérica e PEC (pagamentos demorados)
                ],
                installments: 1 // (Opcional) Como é R$ 39,90, força à vista para não parcelarem
            },
            back_urls: {
                success: `${BASE_URL}/success.html?o=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}&s=success`,
                pending: `${BASE_URL}/success.html?o=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}&s=pending`,
                failure: `${BASE_URL}/success.html?o=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}&s=failure`
            },
            auto_return: 'approved',
            external_reference: orderId,
            notification_url: `${BASE_URL}/.netlify/functions/mp-webhook`,
            metadata: { order_id: orderId, slug, utm: utm || {} }
        };

        const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MP_TOKEN}` },
            body: JSON.stringify(pref)
        });

        const data = await r.json();

        if (!r.ok || !data.init_point) {
            console.error('Erro ao criar preferência MP:', data);
            return { statusCode: 400, body: JSON.stringify({ error: 'Falha ao criar pagamento no Mercado Pago', details: data }) };
        }

        return { statusCode: 200, body: JSON.stringify({ init_point: data.init_point, order_id: orderId, applied_coupon: appliedCoupon, final_price: price, discount: discount }) };

    } catch (e) {
        console.error('Erro fatal no checkout:', e);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno no processamento do checkout' }) };
    }
};