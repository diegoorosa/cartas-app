const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// --- HELPER DE DATA ---
function getTodaySimple() {
    const date = new Date();
    return date.toLocaleDateString('pt-BR');
}

// --- HELPER DE SANITIZAÇÃO ---
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

// Lista de modelos otimizada
const MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash'];

function parseJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); }
    catch (e) {
        const clean = String(text).replace(/```json|```/g, '').trim();
        try { return JSON.parse(clean); } catch (e2) { return null; }
    }
}

// --- PROMPTS DE ELITE (SEM PLACEHOLDERS FEIOS) ---
const SYSTEM_BASE = 'Você é um assistente jurídico. Responda APENAS JSON válido. Formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}.';

const SYSTEM_VIAGEM = `
${SYSTEM_BASE}
Gere uma AUTORIZAÇÃO DE VIAGEM PARA MENOR (Resolução CNJ).
REGRAS:
1. Texto corrido, formal, SEM numeração.
2. NÃO invente dados.
3. Se faltar documento, escreva "portador(a) do documento nº ____________________".
ESTRUTURA:
- P1: Eu, [Nome Resp], CPF [x], Doc [y], [pai/mãe], AUTORIZO a viagem de [Nome Menor], nascido em [data], doc [y].
- P2: Viagem para [Destino], período [Datas].
- P3: O menor viajará [acompanhado de X / desacompanhado].
- P4: Validade e Local.
`;

// Prompt Consumo/Ecommerce Corrigido
const SYSTEM_CONSUMO = `
${SYSTEM_BASE}
Gere uma carta de RECLAMAÇÃO DE CONSUMO (CDC).
REGRAS:
1. NÃO coloque textos entre colchetes como [INSERIR DATA]. Se o dado não foi fornecido no input, escreva apenas a frase genérica ou deixe uma linha "____________________".
2. Use os dados fornecidos no JSON de input.
3. Tom firme e formal, citando o Código de Defesa do Consumidor.
ESTRUTURA:
- P1: Identificação do consumidor e da compra (Loja, Pedido, Data, Valor).
- P2: Descrição do problema relatado (Motivo).
- P3: Solicitação imediata de solução (entrega, estorno ou troca) sob pena de medidas judiciais e PROCON.
`;

// Prompt Bagagem Corrigido
const SYSTEM_BAGAGEM = `
${SYSTEM_BASE}
Gere uma carta para COMPANHIA AÉREA (Bagagem).
REGRAS:
1. NÃO use placeholders [XXX]. Use os dados do input. Se faltar, use linha "____________________".
2. Cite a Resolução 400 da ANAC.
ESTRUTURA:
- P1: Relato do voo (Cia, Número, Data, Origem/Destino) e do passageiro.
- P2: Descrição do extravio ou dano e número do PIR (se houver).
- P3: Exigência de indenização ou localização imediata.
`;

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

        if (orderId) {
            const { data: rows } = await supabase.from('generations').select('output_json').eq('order_id', orderId).limit(1);
            if (rows && rows.length) return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
        }

        // Montagem dos Dados (Input para a IA)
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
            up = `DADOS VIAGEM: Resps: ${qualifResp1}${qualifResp2}. Menor: ${payload.menor_nome}, Nasc: ${payload.menor_nascimento}, Doc: ${docMenor}. Viagem: ${payload.viagem_tipo} p/ ${payload.destino}. Datas: ${payload.data_ida} a ${payload.data_volta}. Acomp: ${acompTexto}. Cidade: ${payload.cidade_uf_emissao || 'Local'}.`;
            system = SYSTEM_VIAGEM;

        } else if (tipo === 'bagagem') {
            up = `DADOS BAGAGEM: Passageiro: ${payload.nome}, CPF ${payload.cpf}. Voo: ${payload.cia} ${payload.voo}, Data: ${payload.data_voo}. PIR: ${payload.pir || 'Não informado'}. Ocorrência: ${payload.status}. Descrição: ${payload.descricao}. Despesas: ${payload.despesas}.`;
            system = SYSTEM_BAGAGEM;

        } else if (tipo === 'consumo') {
            // Monta string específica para consumo evitar placeholders
            up = `DADOS CONSUMO: Consumidor: ${payload.nome}, CPF ${payload.cpf}. Loja: ${payload.loja}. Pedido: ${payload.pedido}. Data Compra: ${payload.data_compra}. Valor: ${payload.valor || 'Não informado'}. Motivo: ${payload.motivo}. Itens: ${payload.itens}. Cidade: ${payload.cidade_uf}.`;
            system = SYSTEM_CONSUMO;

        } else {
            up = JSON.stringify(payload);
            system = SYSTEM_CONSUMO; // Fallback para genérico
        }

        // Loop de Modelos
        let output = null;
        for (const modelName of MODELS) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(system + '\n\nINPUT DO USUÁRIO:\n' + up);
                const text = result.response.text();
                output = parseJson(text);
                if (output) {
                    console.log(`Sucesso com modelo: ${modelName}`);
                    break;
                }
            } catch (err) {
                console.log(`Falha no modelo ${modelName}: ${err.message}`);
                continue;
            }
        }

        if (!output) return { statusCode: 503, body: 'Erro na IA. Tente novamente.' };

        // Injeção de Assinatura Viagem
        if (tipo === 'autorizacao_viagem') {
            const cidadeData = `${payload.cidade_uf_emissao || 'Local'}, ${getTodaySimple()}.`;
            let assinaturas = `\n\n\n\n\n__________________________________________________\n${payload.resp1_nome}\n(Assinatura com Firma Reconhecida)`;
            if (payload.dois_resps) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${payload.resp2_nome}\n(Assinatura com Firma Reconhecida)`;
            }
            output.fechamento = `${cidadeData}${assinaturas}`;
        }
        // Injeção de Assinatura Genérica (Consumo/Bagagem)
        else {
            const cidadeData = `${payload.cidade_uf || 'Local'}, ${getTodaySimple()}.`;
            output.fechamento = `${cidadeData}\n\n\n\n\n__________________________________________________\n${payload.nome}\nCPF ${payload.cpf}`;
        }

        if (!preview && orderId) {
            supabase.from('generations').upsert({ order_id: orderId, slug: payload.slug || '', input_json: payload, output_json: output }, { onConflict: 'order_id' }).then(() => { });
        }

        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };

    } catch (e) {
        console.error('Erro Fatal:', e);
        return { statusCode: 500, body: 'Erro interno.' };
    }
};