// ARQUIVO: netlify/functions/capture-lead.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    // Se falhar, não quebra o site, apenas retorna erro silencioso
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' };

        const body = JSON.parse(event.body || '{}');
        const { email, telefone, nome, slug, payload } = body;

        // Se não tiver contato mínimo, ignora
        if (!email && !telefone) return { statusCode: 200, body: 'no contact info' };

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // Salva na tabela 'leads'
        await supabase.from('leads').insert({
            email: email || null,
            telefone: telefone || null,
            nome: nome || null,
            slug: slug || '',
            payload: payload || {},
            status: 'pending' // Pendente porque ainda não pagou
        });

        return { statusCode: 200, body: JSON.stringify({ saved: true }) };
    } catch (e) {
        console.error('Erro ao capturar lead:', e);
        return { statusCode: 200, body: 'error handled' };
    }
};