const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// --- HELPER (Sanitização) ---
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
// Usa modelos rápidos
const MODELS = ['gemini-2.0-flash-exp', 'gemini-1.5-flash'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function callWithRetry(modelName, prompt, tries) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let i = 0; i < tries; i++) {
        try {
            const resp = await model.generateContent(prompt);
            return resp.response.text();
        } catch (err) {
            if (i < tries - 1) { await sleep(1000 * Math.pow(2, i)); continue; }
            throw err;
        }
    }
}

function parseJson(text) {
    try { return JSON.parse(text); }
    catch (e) { const clean = String(text || '').replace(/```json|```/g, '').trim(); return JSON.parse(clean); }
}

function todayBR() {
    return new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// --- PROMPTS ---
const SYSTEM_CARTA = 'Você gera cartas formais. Responda SOMENTE JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}.';

// PROMPT VIAGEM (Sem numeração, sem dados falsos)
const SYSTEM_VIAGEM = `
Você é um assistente jurídico. Gere uma AUTORIZAÇÃO DE VIAGEM PARA MENOR (Resolução CNJ) em JSON estrito.
O formato de saída deve ser: {"titulo": "AUTORIZAÇÃO DE VIAGEM NACIONAL/INTERNACIONAL", "saudacao": "", "corpo_paragrafos": ["texto..."], "fechamento": "...", "check_list_anexos": []}.

REGRAS:
1. NÃO use numeração (1. 2. 3.) nos parágrafos. Escreva texto corrido e formal.
2. NÃO invente dados (estado civil, profissão, endereço). Use apenas o que for fornecido.
3. Se faltar documento, escreva: "portador(a) do documento nº ____________________".
4. O tom deve ser jurídico e direto.

ESTRUTURA DOS PARAGRAFOS:
- 1º: Eu, [Nome Resp], CPF [x], Doc [y], na qualidade de [pai/mãe], AUTORIZO a viagem de [Nome Menor], nascido em [data], documento [y].
- 2º: A viagem será para [Destino], no período de [Datas].
- 3º: O menor viajará [acompanhado de X / desacompanhado].
- 4º: Esta autorização é válida pelo prazo da viagem.
`;

const SYSTEM_BAGAGEM = 'Você gera carta para bagagem. JSON. Estrutura: Identificação, Voo/PIR, Ocorrido, Pedido.';
const SYSTEM_CONSUMO = 'Você gera carta de consumidor. JSON. Estrutura: Compra, Problema, Pedido (CDC).';

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

        // Cache
        if (orderId) {
            const { data: rows } = await supabase.from('generations').select('output_json').eq('order_id', orderId).limit(1);
            if (rows && rows.length) return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
        }

        // Preparação
        let system = SYSTEM_CARTA, up = '';
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
                const parentesco = payload.acompanhante_parentesco ? `(${payload.acompanhante_parentesco})` : '';
                acompTexto = `acompanhado(a) por ${nomeAcomp} ${parentesco}, CPF ${payload.acompanhante_cpf || LINE}, ${docAcomp}`;
            }

            up = `DADOS: Responsáveis: ${qualifResp1}${qualifResp2}. Menor: ${payload.menor_nome}, Nasc: ${payload.menor_nascimento}, Doc: ${docMenor}. Viagem: ${payload.viagem_tipo} p/ ${payload.destino}. Datas: ${payload.data_ida} a ${payload.data_volta}. Condição: ${acompTexto}. Cidade: ${payload.cidade_uf_emissao || '________________'}. Data: ${todayBR()}.`;
            system = SYSTEM_VIAGEM;

        } else if (tipo === 'bagagem') {
            up = `Passageiro: ${payload.nome}, CPF ${payload.cpf}\nVoo: ${payload.cia} ${payload.voo} PIR ${payload.pir}\nOcorrência: ${payload.status}: ${payload.descricao}\nDespesas: ${payload.despesas}\nLocal: ${payload.cidade_uf}`;
            system = SYSTEM_BAGAGEM;
        } else if (tipo === 'consumo') {
            up = `Consumidor: ${payload.nome}\nLoja: ${payload.loja} Pedido: ${payload.pedido}\nProblema: ${payload.motivo}\nDetalhes: ${payload.itens}\nLocal: ${payload.cidade_uf}`;
            system = SYSTEM_CONSUMO;
        } else {
            up = JSON.stringify(payload);
        }

        // Geração IA
        let text = null;
        for (const m of MODELS) {
            try { text = await callWithRetry(m, system + '\n\n' + up, 2); if (text) break; } catch (e) { }
        }
        if (!text) return { statusCode: 503, body: 'IA indisponível.' };

        let output = parseJson(text);

        // --- AJUSTE FINO DE ASSINATURA (ESPAÇAMENTO GARANTIDO) ---
        if (tipo === 'autorizacao_viagem') {
            const cidadeData = `${payload.cidade_uf_emissao || 'Local'}, ${todayBR()}.`;

            // Usei \n\n\n\n\n (5 quebras) para dar bastante espaço para assinar
            let assinaturas = `\n\n\n\n\n__________________________________________________\n${payload.resp1_nome}\n(Assinatura com Firma Reconhecida)`;

            if (payload.dois_resps) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${payload.resp2_nome}\n(Assinatura com Firma Reconhecida)`;
            }

            output.fechamento = `${cidadeData}${assinaturas}`;
        }

        // Salvar
        if (!preview && orderId) {
            await supabase.from('generations').upsert({ order_id: orderId, slug: payload.slug || '', input_json: payload, output_json: output }, { onConflict: 'order_id' });
        }

        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };

    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno' }) };
    }
};