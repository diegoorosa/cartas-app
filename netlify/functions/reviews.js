const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('slug, nome, estrelas, comentario, created_at')
      .eq('aprovada', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[reviews] Erro Supabase:', error.message);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviews: data || [] })
    };
  } catch (e) {
    console.error('[reviews] Erro:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
