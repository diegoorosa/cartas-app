const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    try {
        const orderId = (event.queryStringParameters && event.queryStringParameters.o) || '';
        if (!orderId) return { statusCode: 400, body: JSON.stringify({ status: 'invalid' }) };
        const MP_TOKEN = process.env.MP_ACCESS_TOKEN || '';
        let paid = false;

        // 1) Tenta no Mercado Pago por external_reference
        if (MP_TOKEN) {
            try {
                const url = 'https://api.mercadopago.com/v1/payments/search?external_reference=' + encodeURIComponent(orderId);
                const r = await fetch(url, { headers: { Authorization: 'Bearer ' + MP_TOKEN } });
                if (r.ok) {
                    const j = await r.json();
                    const arr = (j && (j.results || j.results === 0 ? j.results : j.results)) || j.results || j;
                    const results = Array.isArray(j.results) ? j.results : (Array.isArray(j?.results) ? j.results : (Array.isArray(j?.results?.results) ? j.results.results : []));
                    const list = Array.isArray(j.results) ? j.results : (Array.isArray(arr) ? arr : []);
                    for (const it of list) { if (it && it.status === 'approved') { paid = true; break; } }
                }
            } catch (e) { }
        }

        // 2) Fallback: se já existe geração no Supabase, consideramos paid
        if (!paid && process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)) {
            try {
                const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
                const supabase = createClient(process.env.SUPABASE_URL, key);
                const { data } = await supabase.from('generations').select('id').eq('order_id', orderId).maybeSingle();
                if (data) paid = true;
            } catch (e) { }
        }

        return { statusCode: 200, body: JSON.stringify({ status: paid ? 'paid' : 'pending' }) };
    } catch (e) {
        return { statusCode: 200, body: JSON.stringify({ status: 'pending' }) };
    }
};