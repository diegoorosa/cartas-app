const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// Helper simples de data (funciona em qualquer servidor)
function getTodaySimple() {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function sanitize(str) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/<[^>]*>/g, '').trim();
}
function sanitizePayload(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    for (const key in obj) {
        const value = obj[key];
        if (typeof value === 'string') obj[key] = sanitize(value);
    }
    return obj;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const MODELS = ['gemini-2.0-flash-exp', 'gemini-1.5-flash'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callWithRetry(modelName, prompt, tries) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let i = 0; i < tries; i++) {
        try {
            const resp = await model.generateContent(prompt);
            return resp.response.text();
        } catch (err) {
            console.log(`Erro tentativa ${i} modelo ${modelName}:`, err.message);
            if (i < tries - 1) { await sleep(1000); continue; }
            return null; // Retorna null se falhar todas
        }
    }
    return null;
}

function parseJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); }
    catch (e) {
        // Tenta limpar markdown ```json
        const clean = String(text).replace(/```json|```/g, '').trim();
        try { return JSON.parse(clean); } catch (e2) { return null; }
    }
}

// --- PROMPTS ---
const SYSTEM_BASE = 'Você é um assistente jurídico. Responda APENAS JSON válido. Formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}.';

const SYSTEM_VIAGEM = `
${SYSTEM_BASE}
Gere uma AUTORIZAÇÃO DE VIAGEM PARA MENOR (Resolução CNJ).
REGRAS:
1. NÃO use numeração nos parágrafos.
2. NÃO invente dados (sem [estado civil], [profissão]).
3. Se faltar documento, escreva "portador(a) do documento nº ____________________".
ESTRUTURA:
- P1: Eu, [Nome Resp], CPF [x], Doc [y], [pai/mãe], AUTORIZO a viagem de [Nome Menor], nascido em [data], doc [y].
- P2: Viagem para [Destino], período [Datas].
- P3: Viajará [acompanhado de X / desacompanhado].
- P4: Validade e Local.
`;

const SYSTEM_BAGAGEM = `${SYSTEM_BASE} Carta bagagem extraviada/danificada. 4 parágrafos: Voo, Ocorrido, Despesas, Pedido.`;
const SYSTEM_CONSUMO = `${SYSTEM_BASE} Carta consumidor. 3 parágrafos: Compra, Problema, Pedido CDC.`;

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

        const body = JSON.parse(event.body || '{}');
        let payload = body.payload || null;
        const preview = !!body.preview;

        if (!payload) return { statusCode: 400, body: 'Payload inválido' };
        if (!payload.order_id) payload = sanitizePayload(payload);

        const tipo = String(payload.tipo || '').toLowerCase();
        const orderId = payload.order_id || payload.orderId || null;

        // Cache check
        if (orderId) {
            const { data: rows } = await supabase.from('generations').select('output_json').eq('order_id', orderId).limit(1);
            if (rows && rows.length) return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
        }

        // Preparação do Prompt
        let system = SYSTEM_BASE, up = '';
        const LINE = '__________________________';

        if (tipo === 'autorizacao_viagem') {
            const docMenor = payload.menor_doc || `(preencher: ${LINE})`;
            const docResp1 = payload.resp1_doc || `Doc: ${LINE}`;
            const qualifResp1 = `${payload.resp1_nome}, CPF ${payload.resp1_cpf}, ${docResp1}`;
            const docResp2 = payload.resp2_doc || `Doc: ${LINE}`;
            const qualifResp2 = payload.dois_resps ? ` e ${payload.resp2_nome}, CPF ${payload.resp2_cpf}, ${docResp2}` : '';

            let acompTexto = 'desacompanhado(a)';
            if (payload.acompanhante_tipo !== 'desacompanhado') {
                const docAcomp = payload.acompanhante_doc || `Doc: ${LINE}`;
                const nomeAcomp = payload.acompanhante_nome || LINE;
                acompTexto = `acompanhado(a) por ${nomeAcomp}, CPF ${payload.acompanhante_cpf || LINE}, ${docAcomp}`;
            }

            up = `DADOS: Resps: ${qualifResp1}${qualifResp2}. Menor: ${payload.menor_nome}, Nasc: ${payload.menor_nascimento}, Doc: ${docMenor}. Viagem: ${payload.viagem_tipo} p/ ${payload.destino}. Datas: ${payload.data_ida} a ${payload.data_volta}. Acomp: ${acompTexto}. Cidade: ${payload.cidade_uf_emissao || 'Local'}. Data: ${getTodaySimple()}.`;
            system = SYSTEM_VIAGEM;

        } else if (tipo === 'bagagem') {
            up = `Passageiro: ${payload.nome}, CPF ${payload.cpf}\nVoo: ${payload.cia} ${payload.voo}\nOcorrência: ${payload.status}: ${payload.descricao}\nDespesas: ${payload.despesas}\nLocal: ${payload.cidade_uf}`;
            system = SYSTEM_BAGAGEM;
        } else {
            up = JSON.stringify(payload);
            system = SYSTEM_CONSUMO;
        }

        // Geração IA com Fallback seguro
        let output = null;
        for (const m of MODELS) {
            const text = await callWithRetry(m, system + '\n\n' + up, 2);
            if (text) {
                output = parseJson(text);
                if (output && output.corpo_paragrafos) break; // Sucesso
            }
        }

        // Se a IA falhar totalmente, retorna erro amigável em vez de crashar
        if (!output) {
            console.error('IA falhou em gerar JSON válido');
            return { statusCode: 503, body: 'Erro na inteligência artificial. Tente novamente em instantes.' };
        }

        // Injeção de Assinatura (Segura)
        if (tipo === 'autorizacao_viagem') {
            const cidadeData = `${payload.cidade_uf_emissao || 'Local'}, ${getTodaySimple()}.`;
            let assinaturas = `\n\n\n\n\n__________________________________________________\n${payload.resp1_nome}\n(Assinatura com Firma Reconhecida)`;

            if (payload.dois_resps) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${payload.resp2_nome}\n(Assinatura com Firma Reconhecida)`;
            }
            output.fechamento = `${cidadeData}${assinaturas}`;
        }

        // Salvar no banco
        if (!preview && orderId) {
            await supabase.from('generations').upsert({ order_id: orderId, slug: payload.slug || '', input_json: payload, output_json: output }, { onConflict: 'order_id' });
        }

        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };

    } catch (e) {
        console.error('Erro Fatal:', e);
        return { statusCode: 500, body: 'Erro interno no servidor.' };
    }
};