const { createClient } = require('@supabase/supabase-js');

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
                const { data } = await supabase.from('generations').select('id').eq('order_id', orderId).maybeSingle();
                if (data) return { statusCode: 200, body: JSON.stringify({ status: 'paid', source: 'supabase' }) };
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
                        if (p.status === 'approved') return { statusCode: 200, body: JSON.stringify({ status: 'paid', source: 'mp-direct' }) };
                    }
                }
            } catch (e) { }
        }

        // 3) Fallback: search por external_reference (mais lento)
        if (MP_TOKEN) {
            try {
                const url = 'https://api.mercadopago.com/v1/payments/search?external_reference=' + encodeURIComponent(orderId) + '&limit=5';
                const r = await fetch(url, { headers: { Authorization: 'Bearer ' + MP_TOKEN } });
                if (r.ok) {
                    const j = await r.json();
                    const results = Array.isArray(j.results) ? j.results : [];
                    for (const it of results) { if (it && it.status === 'approved') { paid = true; break; } }
                }
            } catch (e) { }
        }

        return { statusCode: 200, body: JSON.stringify({ status: paid ? 'paid' : 'pending' }) };
    } catch (e) {
        return { statusCode: 200, body: JSON.stringify({ status: 'pending' }) };
    }
};