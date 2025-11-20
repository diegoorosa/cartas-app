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
// Usa o modelo flash para ser rápido, mas com prompt reforçado
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

// --- PROMPTS OTIMIZADOS E CORRIGIDOS ---

const SYSTEM_CARTA = 'Você gera cartas formais. Responda SOMENTE JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}.';

// PROMPT DE VIAGEM BLINDADO (Correção visual e jurídica)
const SYSTEM_VIAGEM = `
Você é um assistente jurídico. Gere uma AUTORIZAÇÃO DE VIAGEM PARA MENOR (Resolução CNJ) em JSON estrito.
O formato de saída deve ser: {"titulo": "AUTORIZAÇÃO DE VIAGEM NACIONAL/INTERNACIONAL", "saudacao": "", "corpo_paragrafos": ["texto..."], "fechamento": "...", "check_list_anexos": []}.

REGRAS VISUAIS E DE CONTEÚDO:
1. NÃO USE numeração (1., 2., 3.) nos parágrafos. Use parágrafos distintos no array "corpo_paragrafos" para garantir espaçamento.
2. NÃO INVENTE DADOS. Não coloque [estado civil], [profissão] ou [endereço]. Use APENAS Nome, CPF e Documento. Se faltar algo, ignore.
3. SE FALTAR DOCUMENTO: Se o input vier como "____", escreva no texto: "portador(a) do documento nº ____________________".
4. ASSINATURA: O campo "fechamento" DEVE conter a cidade/data e, logo abaixo, a linha de assinatura para os responsáveis citados.
5. TOM: Formal, mas direto. Evite "juridiquês" desnecessário.

ESTRUTURA DO TEXTO:
- Parágrafo 1: Eu, [Nome Resp], portador do CPF [x] e Doc [y], na qualidade de [pai/mãe/tutor], AUTORIZO a viagem de [Nome Menor], nascido em [x], documento [y].
- Parágrafo 2: A viagem será para [Destino], no período de [Datas].
- Parágrafo 3: O menor viajará [acompanhado de X / desacompanhado]. (Se acompanhado, citar nome e doc do acompanhante).
- Parágrafo 4: Esta autorização é válida pelo prazo da viagem.
`;

const SYSTEM_BAGAGEM = 'Você gera carta para bagagem. Responda JSON. Estrutura: 1) Identificação, 2) Voo/PIR, 3) Ocorrido, 4) Pedido de indenização.';
const SYSTEM_CONSUMO = 'Você gera carta de consumidor. Responda JSON. Estrutura: 1) Compra/Pedido, 2) Problema, 3) Pedido de solução (CDC).';

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

        const body = JSON.parse(event.body || '{}');
        let payload = body.payload || null;
        const preview = !!body.preview;
        // Sem captcha check aqui

        if (!payload) return { statusCode: 400, body: 'Payload inválido' };

        // Sanitização leve
        if (!payload.order_id) payload = sanitizePayload(payload);

        const tipo = String(payload.tipo || '').toLowerCase();
        const orderId = payload.order_id || payload.orderId || null;

        // 1) Cache: Se já existe, retorna rápido
        if (orderId) {
            const { data: rows } = await supabase.from('generations').select('output_json').eq('order_id', orderId).limit(1);
            if (rows && rows.length) return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
        }

        // 2) Preparação Inteligente dos Dados
        let system = SYSTEM_CARTA, up = '';
        const LINE = '__________________________'; // Linha visual para preencher a mão

        if (tipo === 'autorizacao_viagem') {
            // Lógica para garantir que a linha apareça se estiver vazio
            const docMenor = payload.menor_doc || `(preencher: ${LINE})`;

            // Responsável 1
            const docResp1 = payload.resp1_doc || `Doc: ${LINE}`;
            const qualifResp1 = `${payload.resp1_nome}, CPF ${payload.resp1_cpf}, ${docResp1}`;

            // Responsável 2 (se houver)
            const docResp2 = payload.resp2_doc || `Doc: ${LINE}`;
            const qualifResp2 = payload.dois_resps ? ` e ${payload.resp2_nome}, CPF ${payload.resp2_cpf}, ${docResp2}` : '';

            // Acompanhante
            let acompTexto = 'desacompanhado(a)';
            if (payload.acompanhante_tipo !== 'desacompanhado') {
                const docAcomp = payload.acompanhante_doc || `Doc: ${LINE}`;
                const nomeAcomp = payload.acompanhante_nome || LINE;
                const parentesco = payload.acompanhante_parentesco ? `(${payload.acompanhante_parentesco})` : '';
                acompTexto = `acompanhado(a) por ${nomeAcomp} ${parentesco}, CPF ${payload.acompanhante_cpf || LINE}, ${docAcomp}`;
            }

            // Monta o "prompt do usuário" de forma que a IA só precise encaixar
            up = `
            GERAR DOCUMENTO COM ESTES DADOS:
            Responsáveis: ${qualifResp1}${qualifResp2}.
            Menor: ${payload.menor_nome}, Nasc: ${payload.menor_nascimento}, Doc: ${docMenor}.
            Viagem: ${payload.viagem_tipo} para ${payload.destino}.
            Ida: ${payload.data_ida}. Volta: ${payload.data_volta}.
            Condição: ${acompTexto}.
            Cidade de Emissão: ${payload.cidade_uf_emissao || '________________'}.
            Data de hoje: ${todayBR()}.
            `;

            // Força a assinatura no prompt do sistema
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

        // 3) Geração com IA
        let text = null;
        for (const m of MODELS) {
            try {
                text = await callWithRetry(m, system + '\n\n' + up, 2);
                if (text) break;
            } catch (e) { console.log('Erro model:', m, e.message); }
        }

        if (!text) return { statusCode: 503, body: 'Serviço indisponível temporariamente.' };

        let output = parseJson(text);

        // 4) Pós-Processamento Garantido (Injeção de Assinatura)
        // Se a IA esquecer a linha de assinatura, nós forçamos aqui no código
        if (tipo === 'autorizacao_viagem') {
            const cidadeData = `${payload.cidade_uf_emissao || 'Local'}, ${todayBR()}.`;

            let assinaturas = `__________________________________________________\n${payload.resp1_nome}\n(Assinatura com Firma Reconhecida)`;

            if (payload.dois_resps) {
                assinaturas += `\n\n\n__________________________________________________\n${payload.resp2_nome}\n(Assinatura com Firma Reconhecida)`;
            }

            output.fechamento = `${cidadeData}\n\n\n${assinaturas}`;
        }

        // 5) Salvar no Banco
        if (!preview && orderId) {
            await supabase.from('generations').upsert({
                order_id: orderId,
                slug: payload.slug || '',
                input_json: payload,
                output_json: output
            }, { onConflict: 'order_id' });
        }

        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };

    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno' }) };
    }
};