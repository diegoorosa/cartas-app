const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
        const { slug, price, payload, utm } = JSON.parse(event.body || '{}');
        if (!slug || !price) return { statusCode: 400, body: 'Missing slug or price' };
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
        const BASE_URL = process.env.SITE_URL || 'https://cartasapp.netlify.app';

        const orderId = crypto.randomUUID();

        try {
            await supabase.from('checkout_intents').insert({
                order_id: orderId,
                slug,
                payload: payload || null,
                utm: utm || null
            });
        } catch (e) { }

        const pref = {
            items: [
                { title: `Documento: ${slug}`, quantity: 1, currency_id: 'BRL', unit_price: Number(price) }
            ],
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
        if (!r.ok || !data.init_point) return { statusCode: 400, body: JSON.stringify({ error: 'mp failed', data }) };

        return { statusCode: 200, body: JSON.stringify({ init_point: data.init_point, order_id: orderId }) };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'mp-checkout error' }) };
    }
};