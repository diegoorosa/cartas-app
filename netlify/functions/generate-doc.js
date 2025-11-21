const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURAÇÕES ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// MODELO
const MODEL_NAME = 'gemini-2.0-flash-lite';

// --- HELPERS ---
function getTodaySimple() {
    const date = new Date();
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
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

// PROMPT VIAGEM PERFEITO
const SYSTEM_VIAGEM_PERFEITO = `
${SYSTEM_BASE}
Gere uma AUTORIZAÇÃO DE VIAGEM.
REGRAS CRÍTICAS:
1. O campo "titulo" deve ser APENAS: "AUTORIZAÇÃO DE VIAGEM".
2. O campo "saudacao" deve ser EXATAMENTE UMA STRING VAZIA: "". NUNCA coloque o nome ou "Eu, [Nome]" neste campo. Deixe vazio.
3. Não invente dados. Se faltar documento, use "portador(a) do documento nº ____________________".

ESTRUTURA OBRIGATÓRIA DO TEXTO (corpo_paragrafos):
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

        const orderId = payload.order_id || payload.orderId || null;

        // --- 1. CHECK DE CACHE (Recuperação) ---
        if (orderId && !preview) {
            const { data: rows } = await supabase.from('generations').select('output_json').eq('order_id', orderId).limit(1);
            if (rows && rows.length) {
                return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
            }
        }

        // --- 2. VERIFICAÇÃO DE "SÓ RECUPERAÇÃO" (A CORREÇÃO) ---
        // Se chegamos aqui, não estava no banco.
        // Se o payload NÃO tem dados para gerar (sem slug, sem nome), então é uma tentativa falha de recuperação.
        // Retorna 404 em vez de tentar gerar e dar erro.
        if (!payload.slug && !payload.menor_nome && !payload.nome) {
            return { statusCode: 404, body: 'Documento ainda não gerado ou não encontrado.' };
        }

        // --- 3. ROTEAMENTO (Se tem dados, vamos gerar) ---
        let tipo = 'indefinido';
        const payloadStr = JSON.stringify(payload).toLowerCase();
        const slug = String(payload.slug || '').toLowerCase();

        if (slug.includes('viagem') || payloadStr.includes('menor_nome') || payload.menor_nome) {
            tipo = 'autorizacao_viagem';
        }
        else if (slug.includes('bagagem') || payloadStr.includes('voo') || payloadStr.includes('pir')) {
            tipo = 'bagagem';
        }
        else if (payloadStr.includes('loja') || payloadStr.includes('pedido')) {
            tipo = 'consumo';
        } else {
            return { statusCode: 400, body: 'Erro: Tipo de documento não identificado.' };
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
                acompTexto = `${nomeAcomp}, CPF ${payload.acompanhante_cpf || LINE}, ${docAcomp} (Parentesco: ${payload.acompanhante_parentesco || LINE})`;
            }

            up = `PREENCHER MODELO VIAGEM: Resps: ${qualifResp1}${qualifResp2}. Menor: ${payload.menor_nome}, Nasc: ${payload.menor_nascimento}, Doc: ${docMenor}. Viagem p/ ${payload.destino}. Datas: ${payload.data_ida} a ${payload.data_volta}. Acomp: ${acompTexto}. Cidade: ${payload.cidade_uf_emissao || 'Local'}.`;
            system = SYSTEM_VIAGEM_PERFEITO;

        } else if (tipo === 'bagagem') {
            up = `BAGAGEM: Passageiro: ${payload.nome}, CPF ${payload.cpf}. Voo: ${payload.cia} ${payload.voo}, Data Voo: ${payload.data_voo}. PIR: ${payload.pir || 'N/A'}. Ocorrência: ${payload.status}. Descrição: ${payload.descricao}. Pedido/Despesas: ${payload.despesas}. Cidade: ${payload.cidade_uf}.`;
            system = SYSTEM_BAGAGEM;

        } else {
            up = `CONSUMO: Consumidor: ${payload.nome}, CPF ${payload.cpf}. Loja: ${payload.loja} Pedido: ${payload.pedido} Data: ${payload.data_compra}. Problema: ${payload.motivo}. Detalhes: ${payload.itens}. Local: ${payload.cidade_uf}.`;
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

        // Injeção de Assinatura
        if (tipo === 'autorizacao_viagem') {
            const espacoForcado = '\n\u00A0\n\u00A0\n\u00A0\n';
            const cidadeData = `${espacoForcado}${payload.cidade_uf_emissao || 'Local'}, ${getTodaySimple()}.`;
            let assinaturas = `\n\n\n\n\n__________________________________________________\n${payload.resp1_nome}\nCPF: ${payload.resp1_cpf}\n(Assinatura com Firma Reconhecida)`;
            if (payload.dois_resps) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${payload.resp2_nome}\nCPF: ${payload.resp2_cpf}\n(Assinatura com Firma Reconhecida)`;
            }
            output.fechamento = `${cidadeData}${assinaturas}`;
        } else {
            const cidadeData = `\n\n\n\n${payload.cidade_uf || 'Local'}, ${getTodaySimple()}.`;
            const assinatura = `\n\n\n\n\n__________________________________________________\n${payload.nome}\nCPF: ${payload.cpf}`;
            output.fechamento = `${cidadeData}${assinatura}`;
        }

        // Salvar
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