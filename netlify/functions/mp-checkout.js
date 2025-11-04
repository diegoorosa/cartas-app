const { createClient } = require('@supabase/supabase-js');

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const SITE_URL = process.env.SITE_URL; // ex.: https://cartasapp.netlify.app
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Netlify usa Node 18+ (fetch global)
exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
        const { slug, price = 6.9 } = JSON.parse(event.body || '{}');
        if (!slug) return { statusCode: 400, body: 'slug obrigatório' };
        if (!MP_ACCESS_TOKEN || !SITE_URL) return { statusCode: 500, body: 'Config ausente' };

        // cria pedido "pending"
        const { data: order, error: errOrder } = await supabase
            .from('orders')
            .insert({ status: 'pending', slug, price })
            .select()
            .single();
        if (errOrder) throw errOrder;

        const prefBody = {
            items: [{ title: `Documento: ${slug}`, quantity: 1, currency_id: 'BRL', unit_price: Number(price) }],
            auto_return: 'approved',
            binary_mode: true,
            back_urls: {
                success: `${SITE_URL}/checkout/sucesso`,
                failure: `${SITE_URL}/checkout/falha`,
                pending: `${SITE_URL}/checkout/pending`
            },
            metadata: { order_id: order.id, slug }
        };

        const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(prefBody)
        });
        const pref = await r.json();
        if (!pref?.id || !pref?.init_point) {
            console.error('MP error:', pref);
            return { statusCode: 500, body: 'Falha ao criar preferência' };
        }

        // salva pref_id na order
        await supabase.from('orders').update({ pref_id: pref.id }).eq('id', order.id);

        return { statusCode: 200, body: JSON.stringify({ init_point: pref.init_point, pref_id: pref.id }) };
    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: 'Erro no checkout' };
    }
};