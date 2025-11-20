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

// --- CONFIGURAÇÕES ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// LISTA DE MODELOS (PRIORIDADE):
// 1. Tenta o 2.0 (Experimental, seu preferido)
// 2. Se der Cota Excedida (429), tenta o 1.5 Flash Latest (Rápido e Estável)
// 3. Se tudo falhar, tenta o Gemini Pro (Velho de guerra, mas funciona)
const MODELS = [
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash-latest',
    'gemini-pro'
];

function parseJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); }
    catch (e) {
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
1. Texto corrido, formal, SEM numeração (1. 2.).
2. NÃO invente dados (estado civil, profissão).
3. Se faltar documento, escreva "portador(a) do documento nº ____________________".
ESTRUTURA:
- P1: Eu, [Nome Resp], CPF [x], Doc [y], [pai/mãe], AUTORIZO a viagem de [Nome Menor], nascido em [data], doc [y].
- P2: Viagem para [Destino], período [Datas].
- P3: O menor viajará [acompanhado de X / desacompanhado].
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

        // Montagem do Prompt
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

        // --- LÓGICA DE GERAÇÃO ROBUSTA (LOOP DE MODELOS) ---
        let output = null;
        let lastError = '';

        for (const modelName of MODELS) {
            try {
                // Tenta gerar
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(system + '\n\n' + up);
                const text = result.response.text();

                output = parseJson(text);
                if (output) {
                    console.log(`Sucesso com modelo: ${modelName}`);
                    break; // Se funcionou, sai do loop e entrega
                }
            } catch (err) {
                console.log(`Falha no modelo ${modelName}: ${err.message}`);
                lastError = err.message;
                // Se o erro for 429 (Quota) ou 404 (Not Found), o loop continua automaticamente para o próximo modelo da lista
                continue;
            }
        }

        if (!output) {
            console.error('Todos os modelos falharam. Último erro:', lastError);
            // Mensagem amigável pro usuário não ver erro de código
            return { statusCode: 503, body: 'Sistema de IA sobrecarregado. Aguarde 1 minuto e tente novamente.' };
        }

        // Injeção de Assinatura
        if (tipo === 'autorizacao_viagem') {
            const cidadeData = `${payload.cidade_uf_emissao || 'Local'}, ${getTodaySimple()}.`;
            let assinaturas = `\n\n\n\n\n__________________________________________________\n${payload.resp1_nome}\n(Assinatura com Firma Reconhecida)`;
            if (payload.dois_resps) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${payload.resp2_nome}\n(Assinatura com Firma Reconhecida)`;
            }
            output.fechamento = `${cidadeData}${assinaturas}`;
        }

        // Salvar
        if (!preview && orderId) {
            supabase.from('generations').upsert({ order_id: orderId, slug: payload.slug || '', input_json: payload, output_json: output }, { onConflict: 'order_id' }).then(() => { });
        }

        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };

    } catch (e) {
        console.error('Erro Fatal:', e.message);
        return { statusCode: 500, body: 'Erro interno.' };
    }
};