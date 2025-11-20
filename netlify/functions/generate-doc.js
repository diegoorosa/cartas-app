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

const SYSTEM_CARTA = 'Você gera cartas formais no padrão brasileiro...'; // (Mantido igual, resumido aqui para economizar espaço)
const SYSTEM_VIAGEM = 'Você gera AUTORIZAÇÃO DE VIAGEM PARA MENOR no padrão brasileiro. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal. 1) Menor (nome, nasc, doc). 2) Responsáveis que autorizam (nomes, CPFs). 3) Dados da viagem e acompanhante (se houver). 4) Autorização. 5) Local e data.';
const SYSTEM_BAGAGEM = 'Você gera carta à companhia aérea...';
const SYSTEM_CONSUMO = 'Você gera carta de consumo...';

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

        // --- LÓGICA DE SEGURANÇA ATUALIZADA ---
        // Só exige captcha se NÃO for Poll, NÃO for Preview (quero liberar preview) e NÃO for Trusted.
        // OU SEJA: Se for Preview, passa direto!
        if (!isPoll && !isTrustedSource && !preview) {
            // Aqui cairia apenas gerações "finais" sem pagamento prévio, o que não existe no fluxo atual.
            // Mas se existisse, exigiria captcha.
            if (!captchaToken) return { statusCode: 403, body: 'reCAPTCHA token ausente' };
            const isHuman = await verifyCaptcha(captchaToken);
            if (!isHuman) return { statusCode: 403, body: 'Falha no reCAPTCHA.' };
        }

        if (!isPoll) payload = sanitizePayload(payload);

        const tipo = String(payload.tipo || '').toLowerCase();
        const orderId = payload.order_id || payload.orderId || null;

        // 1) Cache
        if (orderId) {
            const { data: rows } = await supabase.from('generations').select('output_json').eq('order_id', orderId).limit(1);
            if (rows && rows.length) return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
        }

        if (isPoll) return { statusCode: 404, body: 'Aguardando geração.' };

        // 4) Prompt e Geração (Mantido simplificado aqui, mas use a lógica completa dos prompts)
        let system = SYSTEM_CARTA, up = '';
        if (tipo === 'autorizacao_viagem') {
            // ... (Lógica de prompt de viagem igual ao anterior) ...
            up = `Menor: ${payload.menor_nome}, doc ${payload.menor_doc}. Resp: ${payload.resp1_nome}. Acomp: ${payload.acompanhante_tipo}. Destino: ${payload.destino}.`;
            system = SYSTEM_VIAGEM;
        } else {
            up = JSON.stringify(payload);
        }

        let text = null;
        // Tenta modelos
        for (const m of MODELS) { try { text = await callWithRetry(m, system + '\n\n' + up, 2); if (text) break; } catch (e) { } }
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