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
        catch (err) {
            const status = err && err.status; const msg = String((err && err.message) || '');
            const retryable = status === 429 || status === 503 || msg.includes('Too Many') || msg.includes('Resource');
            if (retryable && i < tries - 1) { await sleep(500 * Math.pow(2, i) + Math.floor(Math.random() * 300)); continue; }
            throw err;
        }
    }
}
function parseJson(text) { try { return JSON.parse(text); } catch (e) { const clean = String(text || '').replace(/```json|```/g, '').trim(); return JSON.parse(clean); } }

const SYSTEM_CARTA =
    'Você gera cartas formais no padrão brasileiro. Responda SOMENTE em JSON válido no formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal, claro e respeitoso, PT-BR. Produza 3 a 4 parágrafos de 60 a 90 palavras cada; 1) identificação e pedido, 2) cessação de cobranças e remoção de débitos automáticos, 3) confirmação por escrito com protocolo e data, 4) estorno se houver cobrança posterior, prazo de resposta. Evite linguagem ameaçadora; use "reservando-me o direito de adotar providências administrativas cabíveis". Checklist pertinente. Observacoes_legais: referência genérica ao CDC (Lei 8.078/90), sem aconselhamento jurídico.';

const SYSTEM_VIAGEM =
    'Você gera AUTORIZAÇÃO DE VIAGEM PARA MENOR no padrão brasileiro. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal e claro, PT-BR, sem placeholders. Produza 3 a 5 parágrafos: 1) menor (nome, data de nascimento, documento) e responsáveis (nomes, CPFs, documentos e parentesco), 2) viagem (nacional/internacional), destino, datas, 3) acompanhante (nome/doc/relação) ou ausência, 4) autorização restrita ao período/destino, 5) local e data, com linhas de assinatura no fechamento. Checklist: documentos do menor e responsáveis, comprovante de parentesco quando aplicável, duas vias; reconhecer firma pode ser exigido. Observacoes_legais: menção genérica a ECA e exigências de autoridades/companhias.';

const SYSTEM_BAGAGEM =
    'Você gera carta à companhia aérea por bagagem extraviada/danificada. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal, objetivo. Estruture 4 a 6 parágrafos: 1) passageiro e voo (companhia, nº, data, origem/destino, PIR), 2) ocorrido (extravio/dano) e itens/avarias, 3) despesas emergenciais e pedido de reembolso quando houver, 4) solicitação de providências e prazos, 5) anexos. Checklist: bilhete/boarding, PIR, fotos, notas, documentos. Observacoes_legais: referência genérica a normas (ANAC/Convenções), sem aconselhamento jurídico.';

const SYSTEM_CONSUMO =
    'Você gera carta de consumo para e-commerce (arrependimento, produto não entregue, atraso na entrega, produto com defeito). Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal e claro. Produza 3 a 5 parágrafos com: 1) identificação do consumidor e do pedido (loja, nº do pedido, data, itens/valor), 2) descrição do problema/conteúdo (subtipo: arrependimento 7 dias; não entregue; atraso; defeito), 3) pedido objetivo (cancelamento/estorno/devolução/troca, prazo de resposta, canal), 4) indicação de anexos. Checklist: comprovante do pedido, conversas/e-mails, fotos (defeito), notas, documento pessoal. Observacoes_legais: referência genérica ao CDC (direito de arrependimento art.49 quando aplicável), sem aconselhamento jurídico.';

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
        const { payload } = JSON.parse(event.body || '{}');
        if (!payload) return { statusCode: 400, body: 'Payload inválido' };

        const tipo = String(payload.tipo || '').toLowerCase();

        if (tipo === 'autorizacao_viagem') {
            if (!payload.menor_nome || !payload.menor_nascimento || !payload.resp1_nome || !payload.resp1_cpf || !payload.destino || !payload.data_ida || !payload.data_volta || !payload.cidade_uf_emissao) {
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
            }
        } else if (tipo === 'bagagem') {
            if (!payload.nome || !payload.cpf || !payload.cia || !payload.voo || !payload.data_voo || !payload.origem || !payload.destino || !payload.status || !payload.cidade_uf) {
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
            }
        } else if (tipo === 'consumo') {
            if (!payload.nome || !payload.cpf || !payload.loja || !payload.pedido || !payload.data_compra || !payload.subtipo) {
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
            }
        } else {
            if (!payload.nome || !payload.cidade_uf || !payload.cpf) {
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
            }
        }

        let system = SYSTEM_CARTA, up = '';

        if (tipo === 'autorizacao_viagem') {
            up =
                'Menor: ' + (payload.menor_nome || '') + ', nasc. ' + (payload.menor_nascimento || '') + ', doc ' + (payload.menor_doc || '') + '\n' +
                'Responsável 1: ' + (payload.resp1_nome || '') + ', CPF ' + (payload.resp1_cpf || '') + (payload.resp1_doc ? (', doc ' + payload.resp1_doc) : '') + ', parentesco ' + (payload.resp1_parentesco || '') + '\n' +
                'Responsável 2: ' + (payload.dois_resps ? ((payload.resp2_nome || '') + ', CPF ' + (payload.resp2_cpf || '') + (payload.resp2_doc ? (', doc ' + payload.resp2_doc) : '') + ', parentesco ' + (payload.resp2_parentesco || '')) : 'não') + '\n' +
                'Viagem: ' + (payload.viagem_tipo || '') + ' para ' + (payload.destino || '') + ' de ' + (payload.data_ida || '') + ' a ' + (payload.data_volta || '') + '\n' +
                'Acompanhado por: ' + (payload.acompanhado_por || '') + (payload.acompanhado_por === 'terceiro' ? ('; acompanhante: ' + (payload.acomp_nome || '') + ', doc ' + (payload.acomp_doc || '') + ', parentesco ' + (payload.acomp_parentesco || '')) : '') + '\n' +
                'Local de assinatura: ' + (payload.cidade_uf_emissao || '') + ' | Contatos: ' + (payload.email || '') + ' ' + (payload.telefone || '');
            system = SYSTEM_VIAGEM;
        } else if (tipo === 'bagagem') {
            up =
                'Passageiro: ' + (payload.nome || '') + ' (CPF ' + (payload.cpf || '') + '), contato ' + (payload.email || '') + ' ' + (payload.telefone || '') + '\n' +
                'Voo: ' + (payload.cia || '') + ' ' + (payload.voo || '') + ', data ' + (payload.data_voo || '') + ', origem ' + (payload.origem || '') + ', destino ' + (payload.destino || '') + ', PIR/protocolo ' + (payload.pir || '') + '\n' +
                'Ocorrência: ' + (payload.status || '') + ' — ' + (payload.descricao || '') + '\n' +
                'Despesas emergenciais: ' + (payload.despesas || '') + '\n' +
                'Local: ' + (payload.cidade_uf || '');
            system = SYSTEM_BAGAGEM;
        } else if (tipo === 'consumo') {
            up =
                'Consumidor: ' + (payload.nome || '') + ' (CPF ' + (payload.cpf || '') + '), ' + (payload.email || '') + ' ' + (payload.telefone || '') + '\n' +
                'Loja/Marketplace: ' + (payload.loja || '') + ' | Pedido: ' + (payload.pedido || '') + ' | Data da compra: ' + (payload.data_compra || '') + '\n' +
                'Itens/Valor: ' + (payload.itens || '') + ' | Valor total: ' + (payload.valor || '') + '\n' +
                'Subtipo: ' + (payload.subtipo || '') + ' | Prazo prometido: ' + (payload.prazo_prometido || '') + '\n' +
                'Endereço/Entrega: ' + (payload.endereco || '') + ' | Cidade/UF: ' + (payload.cidade_uf || '') + '\n' +
                'Anotações: ' + (payload.observacoes || '');
            system = SYSTEM_CONSUMO;
        } else {
            up =
                'Tipo: ' + (payload.tipo || 'cancelamento') + '\n' +
                'Entidade: ' + (payload.entidade || 'Empresa') + '\n' +
                'Pessoa: ' + (payload.nome || '') + ' (CPF ' + (payload.cpf || '') + '), residente em ' + (payload.cidade_uf || '') + '\n' +
                'Contrato/Unidade: ' + (payload.contrato || 'não informado') + '\n' +
                'Motivo/Resumo: ' + (payload.motivo || 'não informado');
        }

        let text = null;
        for (const m of MODELS) { try { text = await callWithRetry(m, system + '\n\n' + up, 3); if (text) break; } catch (e) { } }
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