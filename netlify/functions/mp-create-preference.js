// ARQUIVO: netlify/functions/mp-create-preference.js
// Função para criar preferência do Mercado Pago (usada pelo Wallet Brick onSubmit)

const { createClient } = require('@supabase/supabase-js');
const { PRICE_MAP } = require('./price-map');

const COUPONS = {
    'VOLTA10': 0.10,
    'BEMVINDO15': 0.15,
    'INDICA20': 0.20,
};

const TITLE_MAP = {
    'autorizacao-viagem-menor': 'Autorização de Viagem para Menor',
    'notificacao-extrajudicial': 'Notificação Extrajudicial / Cobrança Formal',
    'recurso-multa-transito': 'Recurso de Multa de Trânsito',
    'reembolso-cancelamento-passagem': 'Reembolso de Passagem Aérea',
    'carta-bagagem': 'Reclamação de Bagagem'
};

function tituloAmigavel(slug) {
    if (TITLE_MAP[slug]) return TITLE_MAP[slug];
    return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

exports.handler = async (event) => {
    console.log("[mp-create-preference] INVOCADO - Method:", event.httpMethod, "| Time:", new Date().toISOString());

    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

        const { slug, payload, utm, coupon, lead_created_at } = JSON.parse(event.body || '{}');

        if (!slug) return { statusCode: 400, body: 'Missing slug' };

        let price = PRICE_MAP[slug] || PRICE_MAP[slug.split('?')[0]] || PRICE_MAP['default'];
        let appliedCoupon = null;
        let discount = 0;

        if (coupon && COUPONS[coupon]) {
            if (coupon === 'VOLTA10' && lead_created_at) {
                const leadCreated = new Date(lead_created_at);
                const hoursDiff = (Date.now() - leadCreated.getTime()) / (1000 * 60 * 60);
                if (hoursDiff > 24) {
                    console.log(`[mp-create-preference] Cupom VOLTA10 expirado (${hoursDiff.toFixed(1)}h > 24h)`);
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

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
        const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
        const orderId = crypto.randomUUID();
        console.log('[mp-create-preference] order_id gerado:', orderId);

        // Salva intenção
        try {
            await supabase.from('checkout_intents').insert({
                order_id: orderId,
                slug,
                payload: payload || null,
                utm: utm || null,
                coupon: appliedCoupon,
                discount: discount,
                final_price: price
            });
            console.log('[mp-create-preference] checkout_intents salvo');
        } catch (e) {
            console.error('[mp-create-preference] ERRO ao salvar intent:', e);
        }

        // Cria preferência do Mercado Pago
        const pref = {
            items: [{
                title: `Documento: ${tituloAmigavel(slug)}`,
                quantity: 1,
                currency_id: 'BRL',
                unit_price: Number(price)
            }],
            payment_methods: {
                excluded_payment_types: [{ id: "ticket" }],
                installments: 1
            },
            back_urls: {
                success: `${BASE_URL}/success.html?o=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}&s=success`,
                pending: `${BASE_URL}/success.html?o=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}&s=pending`,
                failure: `${BASE_URL}/success.html?o=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}&s=failure`
            },
            auto_return: 'approved',
            external_reference: orderId,
            notification_url: `${BASE_URL}/.netlify/functions/mp-webhook`,
            metadata: { order_id: orderId, slug, utm: utm || {}, coupon: appliedCoupon },
            purpose: 'wallet_purchase' // Importante para Wallet Brick
        };

        const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MP_TOKEN}` },
            body: JSON.stringify(pref)
        });

        const data = await r.json();

        if (!r.ok || !data.id) {
            console.error('[mp-create-preference] Erro ao criar preferência MP:', data);
            return { statusCode: 400, body: JSON.stringify({ error: 'Falha ao criar preferência', details: data }) };
        }

        console.log('[mp-create-preference] Preferência criada:', data.id);

        return {
            statusCode: 200,
            body: JSON.stringify({
                preference_id: data.id,
                order_id: orderId,
                applied_coupon: appliedCoupon,
                final_price: price,
                discount: discount
            })
        };

    } catch (e) {
        console.error('[mp-create-preference] Erro fatal:', e);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno ao criar preferência' }) };
    }
};