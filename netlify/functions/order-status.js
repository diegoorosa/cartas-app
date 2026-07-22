const { createClient } = require('@supabase/supabase-js');
const { PRICE_MAP } = require('./price-map');

exports.handler = async (event) => {
    try {
        const orderId = (event.queryStringParameters && event.queryStringParameters.o) || '';
        if (!orderId) return { statusCode: 400, body: JSON.stringify({ status: 'invalid' }) };

        const MP_TOKEN = process.env.MP_ACCESS_TOKEN || '';
        let paid = false;
        let price = null;

        // 1) FAST PATH: Verifica Supabase primeiro (cache hit = pago confirmado)
        if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
            try {
                const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
                const supabase = createClient(process.env.SUPABASE_URL, key);
                const { data } = await supabase.from('generations').select('id, slug').eq('order_id', orderId).maybeSingle();
                if (data) {
                    price = PRICE_MAP[data.slug] || PRICE_MAP['default'];
                    return { statusCode: 200, body: JSON.stringify({ status: 'paid', source: 'supabase', price }) };
                }
            } catch (e) { console.warn('[order-status] Supabase fast path error:', e.message); }
        }

        // 2) Verifica checkout_intents para pegar payment_id (mais direto que search)
        if (MP_TOKEN && process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
            try {
                const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
                const supabase = createClient(process.env.SUPABASE_URL, key);
                const { data: intent } = await supabase.from('checkout_intents').select('payload').eq('order_id', orderId).maybeSingle();
                const pid = intent?.payload?._payment_id;
                if (pid) {
                    const r = await fetch(`https://api.mercadopago.com/v1/payments/${pid}`, {
                        headers: { Authorization: `Bearer ${MP_TOKEN}` }
                    });
                    if (r.ok) {
                        const p = await r.json();
                        if (p.status === 'approved') {
                            price = typeof p.transaction_amount === 'number' ? p.transaction_amount : null;
                            return { statusCode: 200, body: JSON.stringify({ status: 'paid', source: 'mp-direct', price }) };
                        }
                        // 3DS pendente: considera como pago se já passou pela autenticação
                        if (p.status === 'pending' && p.status_detail && (p.status_detail.includes('pending_challenge') || p.status_detail.includes('pending_contingency') || p.status_detail === 'pending_waiting_payment')) {
                            price = typeof p.transaction_amount === 'number' ? p.transaction_amount : null;
                            return { statusCode: 200, body: JSON.stringify({ status: 'paid', source: 'mp-direct-3ds', price }) };
                        }
                        if (p.status === 'pending' || p.status === 'in_process') {
                            return { statusCode: 200, body: JSON.stringify({ status: 'pending', source: 'mp-direct', price: null }) };
                        }
                    }
                    }
                }
                } catch (e) { console.warn('[order-status] MP direct check error:', e.message); }
            }

        // 3) Fallback: search por external_reference (mais lento, pega últimos 5)
        if (MP_TOKEN) {
            try {
                const url = 'https://api.mercadopago.com/v1/payments/search?external_reference=' + encodeURIComponent(orderId) + '&limit=5&sort=date_created&criteria=desc';
                const r = await fetch(url, { headers: { Authorization: 'Bearer ' + MP_TOKEN } });
                if (r.ok) {
                    const j = await r.json();
                    const results = Array.isArray(j.results) ? j.results : [];
                    for (const it of results) {
                        if (it && it.status === 'approved') {
                            price = typeof it.transaction_amount === 'number' ? it.transaction_amount : null;
                            paid = true;
                            break;
                        }
                        // 3DS pendente nos resultados de busca
                        if (it.status === 'pending' && it.status_detail && (it.status_detail.includes('pending_challenge') || it.status_detail.includes('pending_contingency') || it.status_detail === 'pending_waiting_payment')) {
                            paid = true;
                            price = typeof it.transaction_amount === 'number' ? it.transaction_amount : null;
                            break;
                        }
                    }
                }
            } catch (e) { console.warn('[order-status] MP search error:', e.message); }
        }

        return { statusCode: 200, body: JSON.stringify({ status: paid ? 'paid' : 'pending', price }) };
    } catch (e) {
        console.error('[order-status] Fatal error:', e.message);
        return { statusCode: 200, body: JSON.stringify({ status: 'pending' }) };
    }
};