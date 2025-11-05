const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODELS = (process.env.GEMINI_MODELS || 'gemini-2.0-flash-exp,gemini-2.0-flash').split(',').map(s => s.trim()).filter(Boolean);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function callWithRetry(modelName, prompt, tries) {
    const model = genAI.getGenerativeModel({ model: modelName });
    for (let i = 0; i < tries; i++) {
        try { const resp = await model.generateContent(prompt); return resp.response.text(); }
        catch (err) { const status = err && err.status; const msg = String(err && err.message || ''); const retryable = status === 429 || status === 503 || msg.includes('Too Many') || msg.includes('Resource'); if (retryable && i < tries - 1) { await sleep(500 * Math.pow(2, i) + Math.floor(Math.random() * 300)); continue; } throw err; }
    }
}
function parseJson(text) { try { return JSON.parse(text); } catch (e) { const clean = String(text || '').replace(/```json|```/g, '').trim(); return JSON.parse(clean); } }

const SYSTEM_CARTA = 'Você gera cartas formais no padrão brasileiro. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal, claro, PT-BR. Produza 3 a 4 parágrafos de 60 a 90 palavras cada; conteúdo: 1) identificação do remetente e pedido de cancelamento, 2) cessação de cobranças e remoção de débitos automáticos, 3) confirmação por escrito com protocolo e data, 4) estorno se houver cobrança posterior indevida e prazo de resposta. Evite linguagem ameaçadora; use formulações como "reservando-me o direito de adotar as providências administrativas cabíveis". Inclua checklist pertinente. Em observacoes_legais, mencione genericamente o CDC (Lei 8.078/90), sem aconselhamento jurídico.';
const SYSTEM_VIAGEM = 'Você gera AUTORIZAÇÃO DE VIAGEM PARA MENOR no padrão brasileiro. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal e claro, PT-BR. Produza 3 a 5 parágrafos contendo: 1) identificação do menor (nome, data de nascimento e documento informado — certidão/RG em nacional; passaporte/RG conforme destino em internacional), 2) identificação do(s) responsável(is) com CPFs, 3) tipo de viagem, destino e período, 4) se houver acompanhante: nome, documento e relação; se sem acompanhante, explicitar, 5) autorização expressa, 6) local e data de assinatura com linhas de assinatura. Checklist: cópias dos documentos do menor e dos responsáveis, comprovante de parentesco quando aplicável, duas vias assinadas; reconhecer firma pode ser exigido. Observacoes_legais: observação genérica sobre exigências de autoridades/companhias; sem aconselhamento jurídico.';
const SYSTEM_BAGAGEM = 'Você gera carta de reclamação à companhia aérea por bagagem extraviada/danificada. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal e objetivo, PT-BR. Estruture em 4 a 6 parágrafos: 1) identificação do passageiro e do voo (companhia, nº, data, origem/destino, PIR), 2) descrição do ocorrido (extravio ou dano) e itens/avarias, 3) despesas emergenciais realizadas e pedido de reembolso quando houver, 4) solicitação de providências, prazos e canal de resposta, 5) indicação de anexos. Checklist: cópia do bilhete/boarding pass, PIR/protocolo, fotos do dano, notas fiscais de despesas, documentos pessoais. Observacoes_legais: referência genérica a normas aplicáveis (ex.: convenções e ANAC), sem aconselhamento jurídico.';

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
        const { payload } = JSON.parse(event.body || '{}');
        if (!payload) return { statusCode: 400, body: 'Payload inválido' };

        const tipo = String(payload.tipo || '').toLowerCase();

        if (tipo === 'autorizacao_viagem') {
            if (!payload.menor_nome || !payload.menor_nasc || !payload.resp1_nome || !payload.resp1_cpf || !payload.destino || !payload.data_ida || !payload.data_volta || !payload.cidade_uf) {
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
            }
        } else if (tipo === 'bagagem') {
            if (!payload.nome || !payload.cpf || !payload.cia || !payload.voo || !payload.data_voo || !payload.origem || !payload.destino || !payload.status || !payload.cidade_uf) {
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
            }
        } else {
            if (!payload.nome || !payload.cidade_uf || !payload.cpf) {
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
            }
        }

        let sys = SYSTEM_CARTA, up = '';
        if (tipo === 'autorizacao_viagem') {
            up =
                'Menor: ' + (payload.menor_nome || '') + ', nasc. ' + (payload.menor_nasc || '') + ', doc ' + (payload.menor_doc || '') + '\n' +
                'Responsável 1: ' + (payload.resp1_nome || '') + ', CPF ' + (payload.resp1_cpf || '') + '\n' +
                'Responsável 2: ' + (payload.resp2_nome || '') + (payload.resp2_cpf ? (', CPF ' + payload.resp2_cpf) : '') + '\n' +
                'Viagem: ' + (payload.viagem_tipo || '') + ' para ' + (payload.destino || '') + ' de ' + (payload.data_ida || '') + ' a ' + (payload.data_volta || '') + '\n' +
                'Acompanhante: ' + (payload.acomp_nome || '') + (payload.acomp_doc ? (', doc ' + payload.acomp_doc) : '') + (payload.acomp_parentesco ? (', relação ' + payload.acomp_parentesco) : '') + '\n' +
                'Local assinatura: ' + (payload.cidade_uf || '') + '\n' +
                'Contatos: ' + (payload.email || '') + ' ' + (payload.telefone || '');
            sys = SYSTEM_VIAGEM;
        } else if (tipo === 'bagagem') {
            up =
                'Passageiro: ' + (payload.nome || '') + ' (CPF ' + (payload.cpf || '') + '), contato ' + (payload.email || '') + ' ' + (payload.telefone || '') + '\n' +
                'Voo: ' + (payload.cia || '') + ' ' + (payload.voo || '') + ', data ' + (payload.data_voo || '') + ', origem ' + (payload.origem || '') + ', destino ' + (payload.destino || '') + ', PIR/protocolo ' + (payload.pir || '') + '\n' +
                'Ocorrência: ' + (payload.status || '') + ' — ' + (payload.descricao || '') + '\n' +
                'Despesas emergenciais: ' + (payload.despesas || '') + '\n' +
                'Local: ' + (payload.cidade_uf || '');
            sys = SYSTEM_BAGAGEM;
        } else {
            up =
                'Tipo: ' + (payload.tipo || 'cancelamento') + '\n' +
                'Entidade: ' + (payload.entidade || 'Empresa') + '\n' +
                'Pessoa: ' + (payload.nome || '') + ' (CPF ' + (payload.cpf || '') + '), residente em ' + (payload.cidade_uf || '') + '\n' +
                'Contrato/Unidade: ' + (payload.contrato || 'não informado') + '\n' +
                'Motivo/Resumo: ' + (payload.motivo || 'não informado');
        }

        let text = null;
        for (const m of MODELS) {
            try { text = await callWithRetry(m, sys + '\n\n' + up, 3); if (text) break; } catch (e) { continue; }
        }
        if (!text) return { statusCode: 503, body: 'busy' };

        const output = parseJson(text);

        try {
            await supabase.from('generations').insert({
                order_id: null,
                slug: payload.slug || '',
                input_json: payload,
                output_json: output
            });
        } catch (e) { }

        return { statusCode: 200, body: JSON.stringify({ output }) };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Falha na geração' }) };
    }
};