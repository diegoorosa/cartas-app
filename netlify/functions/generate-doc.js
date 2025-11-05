const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELS = (process.env.GEMINI_MODELS || 'gemini-2.0-flash-exp,gemini-2.0-flash').split(',').map(s => s.trim()).filter(Boolean);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function callWithRetry(modelName, prompt, tries) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let i = 0; i < tries; i++) {
        try { const resp = await model.generateContent(prompt); return resp.response.text(); }
        catch (err) { const status = err && err.status; const msg = String(err && err.message || ''); const retryable = status === 429 || status === 503 || msg.includes('Too Many') || msg.includes('Resource'); if (retryable && i < tries - 1) { await sleep(500 * Math.pow(2, i) + Math.floor(Math.random() * 300)); continue; } throw err; }
    }
}

function parseJson(text) { try { return JSON.parse(text); } catch (e) { const clean = String(text || '').replace(/```json|```/g, '').trim(); return JSON.parse(clean); } }

const SYSTEM_CARTA = 'Você gera cartas e requerimentos formais no padrão brasileiro. Responda SOMENTE em JSON válido no formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal, claro e respeitoso, PT-BR. Produza 3 a 4 parágrafos de 60 a 90 palavras cada. Estruture: 1) identificação do remetente e pedido de cancelamento, 2) cessação de cobranças e remoção de débitos automáticos, 3) confirmação por escrito com protocolo e data, 4) estorno se houver cobrança posterior indevida e prazo de resposta. Evite linguagem ameaçadora; use formulações como "reservando-me o direito de adotar as providências administrativas cabíveis". Inclua check_list_anexos pertinente. Em observacoes_legais, mencione genericamente o Código de Defesa do Consumidor (Lei 8.078/90), sem aconselhamento jurídico.';

const SYSTEM_VIAGEM = 'Você gera AUTORIZAÇÃO DE VIAGEM PARA MENOR no padrão brasileiro. Responda SOMENTE em JSON válido no formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal, claro, PT-BR. Produza 3 a 5 parágrafos contendo: 1) identificação do menor (nome, data de nascimento, documento) e dos responsáveis que assinam (nomes, CPFs, documentos e parentesco), 2) tipo de viagem (nacional/internacional), destino, datas de ida e volta, 3) se houver acompanhante, identificar nome, documento e parentesco; se sem acompanhante, explicitar, 4) autorização expressa para deslocamento no período indicado, 5) local de assinatura. Inclua linhas de assinatura na redação final (ex.: "Assinatura do responsável: ______"). Inclua check_list_anexos: cópias dos documentos do menor e dos responsáveis, comprovante de parentesco quando aplicável, e duas vias assinadas. Em observacoes_legais, cite de forma genérica o ECA e normas correlatas, sem aconselhamento jurídico.';

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
        const { payload, preview } = JSON.parse(event.body || '{}');
        if (!payload) return { statusCode: 400, body: 'Payload inválido' };

        const isViagem = payload.tipo === 'autorizacao_viagem';

        if (isViagem) {
            if (!payload.menor_nome || !payload.menor_nascimento || !payload.resp1_nome || !payload.resp1_cpf || !payload.destino || !payload.data_ida || !payload.data_volta || !payload.cidade_uf_emissao) {
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
            }
        } else {
            if (!payload.nome || !payload.cidade_uf || !payload.cpf) {
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
            }
        }

        const userPromptCarta =
            'Dados do documento:\n' +
            'Tipo: ' + (payload.tipo || 'cancelamento') + '\n' +
            'Entidade: ' + (payload.entidade || 'Empresa') + '\n' +
            'Pessoa: ' + (payload.nome || '') + ' (CPF ' + (payload.cpf || '') + '), residente em ' + (payload.cidade_uf || '') + '\n' +
            'Contrato/Unidade: ' + (payload.contrato || 'não informado') + '\n' +
            'Motivo/Resumo: ' + (payload.motivo || 'não informado');

        const userPromptViagem =
            'Menor: ' + (payload.menor_nome || '') + ', nascimento ' + (payload.menor_nascimento || '') + ', doc ' + (payload.menor_doc || '') + '\n' +
            'Responsável 1: ' + (payload.resp1_nome || '') + ', CPF ' + (payload.resp1_cpf || '') + ', doc ' + (payload.resp1_doc || '') + ', parentesco ' + (payload.resp1_parentesco || '') + '\n' +
            'Responsável 2: ' + (payload.dois_resps ? ((payload.resp2_nome || '') + ', CPF ' + (payload.resp2_cpf || '') + ', doc ' + (payload.resp2_doc || '') + ', parentesco ' + (payload.resp2_parentesco || '')) : 'não') + '\n' +
            'Viagem: ' + (payload.viagem_tipo || '') + ' para ' + (payload.destino || '') + ' de ' + (payload.data_ida || '') + ' até ' + (payload.data_volta || '') + '\n' +
            'Acompanhado por: ' + (payload.acompanhado_por || '') + (payload.acompanhado_por === 'terceiro' ? ('; acompanhante: ' + (payload.acomp_nome || '') + ', doc ' + (payload.acomp_doc || '') + ', parentesco ' + (payload.acomp_parentesco || '')) : '') + '\n' +
            'Local de assinatura: ' + (payload.cidade_uf_emissao || '') + '\n' +
            'Contatos: e-mail ' + (payload.email || '') + ', telefone ' + (payload.telefone || '');

        const sys = isViagem ? SYSTEM_VIAGEM : SYSTEM_CARTA;
        const up = isViagem ? userPromptViagem : userPromptCarta;

        let text = null;
        for (const m of MODELS) {
            try { text = await callWithRetry(m, sys + '\n\n' + up, 3); if (text) break; } catch (e) { continue; }
        }
        if (!text) return { statusCode: 503, body: 'busy' };

        const output = parseJson(text);

        try {
            await supabase.from('generations').insert({
                order_id: null,
                slug: payload.slug || '',
                input_json: payload,
                output_json: output
            });
        } catch (e) { }

        return { statusCode: 200, body: JSON.stringify({ output }) };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Falha na geração' }) };
    }
};