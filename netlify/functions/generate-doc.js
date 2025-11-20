const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// --- HELPERS ---
function getTodaySimple() {
    const date = new Date();
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
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

// --- CONFIGURAÇÕES ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Prioridade: Lite (30 RPM) -> Flash 2.0 (15 RPM) -> Flash 2.5 (10 RPM)
const MODELS = [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-flash'
];

function parseJson(text) {
    if (!text) return null;
    try { return JSON.parse(text); }
    catch (e) {
        const clean = String(text).replace(/```json|```/g, '').trim();
        try { return JSON.parse(clean); } catch (e2) { return null; }
    }
}

// --- PROMPT BLINDADO E RICO (VIAGEM) ---
const SYSTEM_BASE = 'Você é um assistente jurídico. Responda APENAS JSON válido. Formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}.';

const SYSTEM_VIAGEM = `
${SYSTEM_BASE}
Gere uma AUTORIZAÇÃO DE VIAGEM PARA MENOR (Resolução CNJ) completa e formal.
Use linguagem jurídica culta ("autorizo expressamente", "zelar pelo bem-estar", "caráter específico"), mas SEM inventar dados pessoais que não foram fornecidos.

REGRAS CRÍTICAS:
1. NÃO use numeração (1., 2.) no início dos parágrafos. Use texto corrido.
2. NÃO invente [Profissão], [Estado Civil] ou [Endereço]. Use apenas a qualificação "brasileiro(a), residente no Brasil".
3. Se faltar número de documento, escreva "portador(a) do documento nº ____________________".

ESTRUTURA OBRIGATÓRIA (Baseada no modelo ideal):
- P1 (Qualificação): "Eu, [Nome Resp], CPF [x], [Doc y], na qualidade de [pai/mãe/responsável] do(a) menor [Nome Menor], nascido(a) em [data], [Doc y], AUTORIZO EXPRESSAMENTE a referida criança/adolescente a realizar viagem [nacional/internacional], conforme as especificações abaixo."
- P2 (Destino/Validade): "A presente autorização é válida para a viagem com destino a [Destino], com ida em [Data Ida] e retorno previsto para [Data Volta]. Qualquer alteração requer nova autorização."
- P3 (Acompanhante): "O(A) menor viajará [acompanhado de X / desacompanhado]. (Se acompanhado: Sendo o(a) Sr(a) [Nome Acomp] responsável por sua segurança e bem-estar durante todo o deslocamento)."
- P4 (Restrições): "Ressalto que esta autorização é concedida em caráter específico para o trajeto e período supramencionados, não conferindo poderes gerais ou irrestritos."
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
            // Trocamos "Doc" por "portador do documento" no texto gerado pela IA para ficar mais fluido
            const qualifResp1 = `${payload.resp1_nome}, CPF ${payload.resp1_cpf}, portador(a) do Doc ${docResp1}`;
            const docResp2 = payload.resp2_doc || `Doc: ${LINE}`;
            const qualifResp2 = payload.dois_resps ? ` e ${payload.resp2_nome}, CPF ${payload.resp2_cpf}, portador(a) do Doc ${docResp2}` : '';

            let acompTexto = 'desacompanhado(a) (sob responsabilidade da companhia aérea)';
            if (payload.acompanhante_tipo !== 'desacompanhado') {
                const docAcomp = payload.acompanhante_doc || `Doc: ${LINE}`;
                const nomeAcomp = payload.acompanhante_nome || LINE;
                const parentesco = payload.acompanhante_parentesco ? `(${payload.acompanhante_parentesco})` : '';
                acompTexto = `acompanhado(a) por ${nomeAcomp} ${parentesco}, CPF ${payload.acompanhante_cpf || LINE}, portador(a) do Doc ${docAcomp}`;
            }

            up = `DADOS PARA PREENCHIMENTO:
            Responsável(is): ${qualifResp1}${qualifResp2}.
            Menor: ${payload.menor_nome}, Nascido(a) em: ${payload.menor_nascimento}, Documento: ${docMenor}.
            Viagem: ${payload.viagem_tipo} com destino a ${payload.destino}.
            Período: Ida ${payload.data_ida} e Volta ${payload.data_volta}.
            Condição de Viagem: ${acompTexto}.
            Cidade de Emissão: ${payload.cidade_uf_emissao || 'Local'}.`;

            system = SYSTEM_VIAGEM;

        } else if (tipo === 'bagagem') {
            up = `Passageiro: ${payload.nome}, CPF ${payload.cpf}\nVoo: ${payload.cia} ${payload.voo}\nOcorrência: ${payload.status}: ${payload.descricao}\nDespesas: ${payload.despesas}\nLocal: ${payload.cidade_uf}`;
            system = SYSTEM_BAGAGEM;
        } else {
            up = JSON.stringify(payload);
            system = SYSTEM_CONSUMO;
        }

        // Loop de Modelos
        let output = null;
        let lastError = '';

        for (const modelName of MODELS) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(system + '\n\n' + up);
                const text = result.response.text();

                output = parseJson(text);
                if (output) {
                    console.log(`Sucesso com modelo: ${modelName}`);
                    break;
                }
            } catch (err) {
                console.log(`Falha no modelo ${modelName}: ${err.message}`);
                lastError = err.message;
                continue;
            }
        }

        if (!output) return { statusCode: 503, body: 'Sistema de IA instável. Tente novamente.' };

        // Injeção de Assinatura e Data (Manual para garantir formatação)
        if (tipo === 'autorizacao_viagem') {
            const cidadeData = `${payload.cidade_uf_emissao || 'Local'}, ${getTodaySimple()}.`;

            // 5 Quebras de linha para garantir espaço da caneta
            let assinaturas = `\n\n\n\n\n__________________________________________________\n${payload.resp1_nome}\n(Assinatura com Firma Reconhecida)`;

            if (payload.dois_resps) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${payload.resp2_nome}\n(Assinatura com Firma Reconhecida)`;
            }
            output.fechamento = `${cidadeData}${assinaturas}`;
        }
        else {
            // Assinatura genérica para outras cartas
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