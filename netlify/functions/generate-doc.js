const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELS = (process.env.GEMINI_MODELS || 'gemini-2.0-flash-exp,gemini-2.0-flash').split(',').map(s => s.trim()).filter(Boolean);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callWithRetry(modelName, prompt, tries) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let i = 0; i < tries; i++) {
        try {
            const resp = await model.generateContent(prompt);
            return resp.response.text();
        } catch (err) {
            const msg = String(err && err.message || '');
            const status = err && err.status;
            const retryable = status === 429 || status === 503 || msg.includes('Too Many Requests') || msg.includes('Resource exhausted');
            if (retryable && i < tries - 1) {
                const wait = 500 * Math.pow(2, i) + Math.floor(Math.random() * 300);
                await sleep(wait);
                continue;
            }
            throw err;
        }
    }
}

function parseJson(text) {
    try { return JSON.parse(text); }
    catch (e) {
        const clean = String(text || '').replace(/```json|```/g, '').trim();
        return JSON.parse(clean);
    }
}

const SYSTEM = 'Você gera cartas e requerimentos formais no padrão brasileiro. Responda SOMENTE em JSON válido no formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal e objetivo, português do Brasil, sem jargão excessivo. Gere corpo_paragrafos com 4 a 6 parágrafos claros e completos (70 a 120 palavras cada). Estruture: 1) identificação do remetente e do contrato/unidade, 2) pedido expresso de cancelamento a partir da data do envio, 3) solicitação de cessação de cobranças futuras e exclusão de débito automático, 4) pedido de confirmação por escrito com número de protocolo, 5) se houver valores cobrados indevidamente, solicite estorno em até 7 dias úteis, 6) prazo de resposta de até 10 dias corridos e canais de contato. Inclua check_list_anexos com itens pertinentes (documento, comprovantes, contrato). Em observacoes_legais, mencione de forma genérica o amparo no Código de Defesa do Consumidor (Lei 8.078/90), sem aconselhamento jurídico.';

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
        const { payload, preview } = JSON.parse(event.body || '{}');
        if (!payload || !payload.nome || !payload.cidade_uf || !payload.cpf) return { statusCode: 400, body: 'Payload inválido' };

        const user = {
            tipo: payload.tipo || 'cancelamento',
            entidade: payload.entidade || 'Empresa',
            nome: payload.nome, cpf: payload.cpf, cidade_uf: payload.cidade_uf,
            contrato: payload.contrato || '', motivo: payload.motivo || '', slug: payload.slug || ''
        };

        const userPrompt =
            'Dados do documento:\n' +
            'Tipo: ' + user.tipo + '\n' +
            'Entidade/Empresa: ' + user.entidade + '\n' +
            'Pessoa: ' + user.nome + ' (CPF ' + user.cpf + '), residente em ' + user.cidade_uf + '\n' +
            'Contrato/Unidade: ' + (user.contrato || 'não informado') + '\n' +
            'Motivo/Resumo: ' + (user.motivo || 'não informado') + '\n\n' +
            'Instruções de conteúdo:\n' +
            '- Se for cancelamento: solicitar cancelamento imediato a partir da data do envio, confirmar encerramento e ausência de cobranças futuras.\n' +
            '- Se for reclamação: descrever problema objetivamente, solicitar estorno/regularização e resposta por escrito.\n' +
            '- Incluir saudação e fechamento adequados.\n' +
            '- Incluir checklist de anexos relevantes.';

        let lastErr = null;
        let text = null;
        for (const name of MODELS) {
            try {
                text = await callWithRetry(name, SYSTEM + '\n\n' + userPrompt, 3);
                if (text) break;
            } catch (e) {
                lastErr = e;
                continue;
            }
        }
        if (!text) {
            return { statusCode: 503, body: 'busy' };
        }

        let output = parseJson(text);

        try {
            await supabase.from('generations').insert({
                order_id: null,
                slug: user.slug,
                input_json: { ...user },
                output_json: output
            });
        } catch (e) { }

        return { statusCode: 200, body: JSON.stringify({ output }) };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Falha na geração' }) };
    }
};