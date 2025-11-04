const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
    try {
        const o = event.queryStringParameters?.o;
        if (!o) return { statusCode: 400, body: 'missing' };
        const { data, error } = await supabase.from('orders').select('status, slug').eq('id', o).single();
        if (error) throw error;
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (e) {
        return { statusCode: 500, body: 'err' };
    }
};