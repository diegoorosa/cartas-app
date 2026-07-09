const { createClient } = require('@supabase/supabase-js');
const { PRICE_MAP } = require('./price-map');

exports.handler = async (event) => {
    try {
        const orderId = (event.queryStringParameters && event.queryStringParameters.o) || '';
        if (!orderId) return { statusCode: 400, body: JSON.stringify({ status: 'invalid' }) };

        const MP_TOKEN = process.env.MP_ACCESS_TOKEN || '';
        let paid = false;

        // 1) FAST PATH: Verifica Supabase primeiro (cache hit = pago confirmado)
        if (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
            try {
                const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
                const supabase = createClient(process.env.SUPABASE_URL, key);
                const { data } = await supabase.from('generations').select('id, slug').eq('order_id', orderId).maybeSingle();
                if (data) {
                    const price = PRICE_MAP[data.slug] || PRICE_MAP['default'];
                    return { statusCode: 200, body: JSON.stringify({ status: 'paid', source: 'supabase', price }) };
                }
            } catch (e) { }
        }

        // 2) Verifica checkout_intents para pegar payment_id se houver (mais direto que search)
        if (MP_TOKEN && process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
            try {
                const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
                const supabase = createClient(process.env.SUPABASE_URL, key);
                const { data: intent } = await supabase.from('checkout_intents').select('payment_id').eq('order_id', orderId).maybeSingle();
                if (intent?.payment_id) {
                    const r = await fetch(`https://api.mercadopago.com/v1/payments/${intent.payment_id}`, {
                        headers: { Authorization: `Bearer ${MP_TOKEN}` }
                    });
                    if (r.ok) {
                        const p = await r.json();
                        if (p.status === 'approved') {
                            const price = typeof p.transaction_amount === 'number' ? p.transaction_amount : null;
                            return { statusCode: 200, body: JSON.stringify({ status: 'paid', source: 'mp-direct', price }) };
                        }
                    }
                }
            } catch (e) { }
        }

        // 3) Fallback: search por external_reference (mais lento)
        let searchPrice = null;
        if (MP_TOKEN) {
            try {
                const url = 'https://api.mercadopago.com/v1/payments/search?external_reference=' + encodeURIComponent(orderId) + '&limit=5';
                const r = await fetch(url, { headers: { Authorization: 'Bearer ' + MP_TOKEN } });
                if (r.ok) {
                    const j = await r.json();
                    const results = Array.isArray(j.results) ? j.results : [];
                    for (const it of results) {
                        if (it && it.status === 'approved') {
                            paid = true;
                            searchPrice = typeof it.transaction_amount === 'number' ? it.transaction_amount : null;
                            break;
                        }
                    }
                }
            } catch (e) { }
        }

        return { statusCode: 200, body: JSON.stringify({ status: paid ? 'paid' : 'pending', price: searchPrice }) };
    } catch (e) {
        return { statusCode: 200, body: JSON.stringify({ status: 'pending' }) };
    }
};