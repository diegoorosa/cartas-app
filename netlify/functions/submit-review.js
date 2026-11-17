const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = JSON.parse(event.body || '{}');
    const { order_id, slug, nome, email, estrelas, comentario } = body;

    if (!order_id || !nome || !email || !estrelas) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Campos obrigatórios faltando' }) };
    }

    const estrelasNum = parseInt(estrelas, 10);
    if (isNaN(estrelasNum) || estrelasNum < 1 || estrelasNum > 5) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Estrelas inválidas' }) };
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert([
        {
          order_id: String(order_id),
          slug: slug || null,
          nome: String(nome).trim(),
          email: String(email).trim().toLowerCase(),
          estrelas: estrelasNum,
          comentario: comentario ? String(comentario).trim() : null,
          aprovada: false
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('[submit-review] Erro Supabase:', error.message);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    console.log('[submit-review] Avaliação salva:', data.id);
    return { statusCode: 200, body: JSON.stringify({ message: 'Avaliação enviada com sucesso', id: data.id }) };
  } catch (e) {
    console.error('[submit-review] Erro:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
