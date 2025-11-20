const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// --- FUNÇÃO HELPER (reCAPTCHA) ---
async function verifyCaptcha(token) {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        return data.success === true;
    } catch (e) {
        console.error('Erro ao verificar reCAPTCHA:', e);
        return false;
    }
}

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
const MODELS = (process.env.GEMINI_MODELS || 'gemini-2.0-flash-exp,gemini-1.5-flash').split(',').map(s => s.trim()).filter(Boolean);

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
function todayBR() { return new Date().toLocaleDateString('pt-BR'); }

// --- PROMPTS OTIMIZADOS ---
const SYSTEM_CARTA = 'Você gera cartas formais no padrão brasileiro. Responda SOMENTE em JSON válido no formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal e claro. Produza 3 a 4 parágrafos (60–90 palavras cada); 1) identificação e pedido, 2) cessação de cobranças, 3) confirmação por escrito, 4) estorno se houver cobrança posterior. Observacoes_legais: referência genérica ao CDC (Lei 8.078/90), sem aconselhamento jurídico.';

// Atualizei o prompt de viagem para lidar melhor com documentos
const SYSTEM_VIAGEM = 'Você gera AUTORIZAÇÃO DE VIAGEM PARA MENOR no padrão brasileiro (Resolução CNJ). Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal jurídico. O documento deve identificar plenamente as partes. Se algum número de documento vier como "____", mantenha a linha no texto final para preenchimento manual. Estrutura: 1) Qualificação do Menor (Nome, nasc, documento). 2) Qualificação dos Responsáveis (Nome, CPF, documento). 3) Autorização de viagem (Destino e Datas) e dados do Acompanhante (se houver). 4) Validade e Local/Data. Checklist: Documentos originais de todos e vias assinadas.';

const SYSTEM_BAGAGEM = 'Você gera carta à companhia aérea por bagagem extraviada/danificada. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal. 4–6 parágrafos: passageiro/voo (cia, nº, data, origem/destino, PIR), ocorrido, despesas emergenciais, pedido de providências e prazos, anexos.';
const SYSTEM_CONSUMO = 'Você gera carta de consumo para e-commerce. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal. 3–5 parágrafos: identificação + dados do pedido (loja, nº, data, itens/valor), descrição do problema, solicitação objetiva e prazo, anexos. Observacoes_legais: referência genérica ao CDC.';

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

        const body = JSON.parse(event.body || '{}');
        let payload = body.payload || null;
        const preview = !!body.preview;
        const captchaToken = body.captchaToken;

        const internalSecret = event.headers['x-internal-secret'] || event.headers['X-Internal-Secret'];
        const isTrustedSource = internalSecret === process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!payload) return { statusCode: 400, body: 'Payload inválido' };
        const isPoll = payload.order_id && !payload.nome && !payload.menor_nome;

        if (!isPoll && !isTrustedSource && !preview) {
            if (!captchaToken) return { statusCode: 403, body: 'reCAPTCHA token ausente' };
            const isHuman = await verifyCaptcha(captchaToken);
            if (!isHuman) return { statusCode: 403, body: 'Falha no reCAPTCHA.' };
        }

        if (!isPoll) payload = sanitizePayload(payload);

        const tipo = String(payload.tipo || '').toLowerCase();
        const orderId = payload.order_id || payload.orderId || null;

        if (orderId) {
            const { data: rows } = await supabase.from('generations').select('output_json').eq('order_id', orderId).limit(1);
            if (rows && rows.length) return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
        }

        if (isPoll) return { statusCode: 404, body: 'Aguardando geração.' };

        // --- PREPARAÇÃO DOS DADOS (Lógica do "Espaço em Branco") ---
        let system = SYSTEM_CARTA, up = '';
        const LINE = '__________________________'; // Linha para preenchimento manual

        if (tipo === 'autorizacao_viagem') {
            const localData = (payload.cidade_uf_emissao || 'Local') + ', ' + todayBR();

            // Tratamento inteligente dos documentos (Se vazio, usa a linha)
            const docMenor = payload.menor_doc || `(Certidão/RG: ${LINE})`;
            const docResp1 = payload.resp1_doc || `(RG/Doc: ${LINE})`;
            const docResp2 = payload.resp2_doc || `(RG/Doc: ${LINE})`;
            const docAcomp = payload.acompanhante_doc || `(RG/Doc: ${LINE})`;

            let acompInfo = 'desacompanhado';
            if (payload.acompanhante_tipo !== 'desacompanhado') {
                acompInfo = `Tipo: ${payload.acompanhante_tipo} | Nome: ${payload.acompanhante_nome || LINE} (CPF ${payload.acompanhante_cpf || LINE}, Doc ${docAcomp}, Parentesco: ${payload.acompanhante_parentesco || LINE})`;
            }

            up =
                `Menor: ${payload.menor_nome}, nasc. ${payload.menor_nascimento}, documento ${docMenor}\n` +
                `Responsável 1: ${payload.resp1_nome}, CPF ${payload.resp1_cpf}, documento ${docResp1}, parentesco ${payload.resp1_parentesco}\n` +
                `Responsável 2: ${payload.dois_resps ? (payload.resp2_nome + ', CPF ' + payload.resp2_cpf + ', doc ' + docResp2) : 'não participa'}\n` +
                `Viagem: ${payload.viagem_tipo} para ${payload.destino} de ${payload.data_ida} a ${payload.data_volta}\n` +
                `Acompanhamento: ${acompInfo}\n` +
                `Local e data de emissão: ${localData}`;

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

        let text = null;
        for (const m of MODELS) { try { text = await callWithRetry(m, system + '\n\nDados:\n' + up, 2); if (text) break; } catch (e) { } }
        if (!text) return { statusCode: 503, body: 'IA indisponível.' };
        const output = parseJson(text);

        if (!preview && orderId) {
            await supabase.from('generations').upsert({ order_id: orderId, slug: payload.slug || '', input_json: payload, output_json: output }, { onConflict: 'order_id' });
        }

        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };
    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno' }) };
    }
};