const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Prompt do sistema
const SYSTEM = `Você gera cartas e requerimentos formais no padrão brasileiro.
Regras:
- Responda SOMENTE em JSON válido no formato:
  {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}
- Tom: formal, claro e objetivo; português do Brasil.
- Não forneça aconselhamento jurídico. Não inclua comentários fora do JSON.`;

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method not allowed' };
    }
    const { payload, preview } = JSON.parse(event.body || '{}');
    if (!payload || !payload.nome || !payload.cpf || !payload.cidade_uf) {
      return { statusCode: 400, body: 'Payload inválido' };
    }

    const user = {
      tipo: payload.tipo || 'cancelamento',
      entidade: payload.entidade || 'Academia',
      nome: payload.nome, cpf: payload.cpf, cidade_uf: payload.cidade_uf,
      contrato: payload.contrato || '', motivo: payload.motivo || '',
      slug: payload.slug || ''
    };

    const userPrompt = `Dados do documento:
Tipo: ${user.tipo}
Entidade/Empresa: ${user.entidade}
Pessoa: ${user.nome} (CPF ${user.cpf}), residente em ${user.cidade_uf}
Contrato/Unidade: ${user.contrato || 'não informado'}
Motivo/Resumo: ${user.motivo || 'não informado'}

Instruções de conteúdo:
- Se for cancelamento: peça cancelamento do contrato/serviço a partir da data do envio, mencione ausência de cobrança futura e protocolo de encerramento.
- Se for reclamação: descreva o problema de forma objetiva, solicite estorno/regularização e resposta por escrito.
- Inclua uma saudação inicial adequada e um fechamento educado.
- Inclua checklist de anexos relevantes (documento, comprovantes, etc.).`;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const resp = await model.generateContent([SYSTEM, userPrompt].join('\n\n'));
    const text = await resp.response.text();

    let output;
    try { output = JSON.parse(text); }
    catch { 
      // tentativa de reparar JSON simples
      const clean = text.replace(/```json|```/g, '').trim();
      output = JSON.parse(clean);
    }

    // log no Supabase (não bloqueia caso falhe)
    try {
      await supabase.from('generations').insert({
        order_id: null, slug: user.slug, input_json: user, output_json: output
      });
    } catch (e) { /* ignora erros de log */ }

    // Se preview: nada a mudar aqui; ocultação acontece no front
    return { statusCode: 200, body: JSON.stringify({ output }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Falha na geração' }) };
  }
};