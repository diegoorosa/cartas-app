const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURAÇÕES ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// MODELO RÁPIDO
const MODEL_NAME = 'gemini-2.0-flash-lite';

// --- HELPERS ---
function getTodaySimple() {
    const date = new Date();
    // CORREÇÃO: Forçar fuso horário do Brasil para não virar o dia antes da hora
    return date.toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo'
    });
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

function parseJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); }
    catch (e) {
        const clean = String(text).replace(/```json|```/g, '').trim();
        try { return JSON.parse(clean); } catch (e2) { return null; }
    }
}

const SYSTEM_BASE = 'Você é um assistente jurídico. Responda APENAS JSON válido. Formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}.';

const SYSTEM_VIAGEM_PERFEITO = `
${SYSTEM_BASE}
Gere uma AUTORIZAÇÃO DE VIAGEM baseada estritamente neste modelo jurídico culto.
Não invente dados. Se faltar documento, use "portador(a) do documento nº ____________________".

ESTRUTURA OBRIGATÓRIA DO TEXTO:
- P1: "Eu, [Nome Resp 1], portador(a) do CPF nº [CPF 1], [Doc 1], [se houver Resp 2: e eu, [Nome Resp 2], CPF [CPF 2]], na qualidade de [pai/mãe/responsáveis] do(a) menor [Nome Menor], nascido(a) em [Nasc], [Doc Menor], AUTORIZO(AMOS) EXPRESSAMENTE a referida criança/adolescente a realizar viagem [nacional/internacional], conforme as especificações descritas nesta autorização."
- P2: "A presente autorização é válida exclusivamente para a viagem com destino a [Destino], com partida em [Data Ida] e retorno previsto para [Data Volta]. Qualquer alteração nas datas ou destino requer uma nova autorização."
- P3 (Se acompanhado): "O(A) menor viajará acompanhado(a) por [Nome Acomp], portador(a) do CPF [CPF Acomp] e documento [Doc Acomp], que possui parentesco de [Parentesco] com o(a) menor, sendo este(a) responsável por sua segurança e bem-estar durante toda a viagem."
- P3 (Se desacompanhado): "O(A) menor viajará desacompanhado(a), sob os cuidados da companhia de transporte, conforme as regras vigentes."
- P4: "Ressalto que esta autorização é concedida em caráter específico para o trajeto e período supramencionados, não conferindo poderes gerais ou irrestritos."
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

        // Roteamento
        let tipo = String(payload.tipo || '').toLowerCase();
        if (payload.slug === 'autorizacao-viagem-menor' || payload.menor_nome) {
            tipo = 'autorizacao_viagem';
        }

        const orderId = payload.order_id || payload.orderId || null;

        // Cache check
        if (orderId) {
            const { data: rows } = await supabase.from('generations').select('output_json').eq('order_id', orderId).limit(1);
            if (rows && rows.length) return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
        }

        // Preparação
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
                acompTexto = `${nomeAcomp}, CPF ${payload.acompanhante_cpf || LINE}, ${docAcomp} (Parentesco: ${payload.acompanhante_parentesco || LINE})`;
            }

            up = `PREENCHER: Resps: ${qualifResp1}${qualifResp2}. Menor: ${payload.menor_nome}, Nasc: ${payload.menor_nascimento}, Doc: ${docMenor}. Viagem p/ ${payload.destino}. Datas: ${payload.data_ida} a ${payload.data_volta}. Acomp: ${acompTexto}. Cidade: ${payload.cidade_uf_emissao || 'Local'}.`;
            system = SYSTEM_VIAGEM_PERFEITO;

        } else if (tipo === 'bagagem') {
            up = `Passageiro: ${payload.nome}, CPF ${payload.cpf}\nVoo: ${payload.cia} ${payload.voo}\nOcorrência: ${payload.status}: ${payload.descricao}\nDespesas: ${payload.despesas}\nLocal: ${payload.cidade_uf}`;
            system = SYSTEM_BAGAGEM;
        } else {
            up = JSON.stringify(payload);
            system = SYSTEM_CONSUMO;
        }

        // Chamada IA
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout IA')), 9000));
        const generatePromise = model.generateContent(system + '\n\nDADOS:\n' + up);

        const result = await Promise.race([generatePromise, timeoutPromise]);
        const text = result.response.text();
        const output = parseJson(text);

        if (!output) throw new Error('JSON Inválido');

        // --- INJEÇÃO DE ASSINATURA COM DATA BRASIL E ESPAÇO ---
        if (tipo === 'autorizacao_viagem') {
            // CORREÇÃO: Adicionado 4 quebras de linha antes da data para separar do texto
            const cidadeData = `\n\n\n\n${payload.cidade_uf_emissao || 'Local'}, ${getTodaySimple()}.`;

            let assinaturas = `\n\n\n\n\n__________________________________________________\n${payload.resp1_nome}\nCPF: ${payload.resp1_cpf}\n(Assinatura com Firma Reconhecida)`;
            if (payload.dois_resps) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${payload.resp2_nome}\nCPF: ${payload.resp2_cpf}\n(Assinatura com Firma Reconhecida)`;
            }
            output.fechamento = `${cidadeData}${assinaturas}`;
        } else {
            output.fechamento = `\n\n\n${payload.cidade_uf || 'Local'}, ${getTodaySimple()}.\n\n\n\n__________________________________________________\n${payload.nome}\nCPF ${payload.cpf}`;
        }

        if (!preview && orderId) {
            supabase.from('generations').upsert({ order_id: orderId, slug: payload.slug || '', input_json: payload, output_json: output }, { onConflict: 'order_id' }).then(() => { });
        }

        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };

    } catch (e) {
        console.error('Erro Função:', e.message);
        const msg = e.message === 'Timeout IA' ? 'Servidor ocupado. Tente novamente.' : 'Erro ao gerar documento.';
        return { statusCode: 503, body: msg };
    }
};