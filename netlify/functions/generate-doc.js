// ARQUIVO: generate-doc.js (CORRIGIDO PARA SUCESSO PÓS-PAGAMENTO)

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

// --- NOVAS FUNÇÕES HELPER (Sanitização XSS) ---
function sanitize(str) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/<[^>]*>/g, '').trim();
}

function sanitizePayload(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    for (const key in obj) {
        const value = obj[key];
        if (typeof value === 'string') {
            obj[key] = sanitize(value);
        }
    }
    return obj;
}

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
function todayBR() { return new Date().toLocaleDateString('pt-BR'); }

const SYSTEM_CARTA =
    'Você gera cartas formais no padrão brasileiro. Responda SOMENTE em JSON válido no formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal e claro. Produza 3 a 4 parágrafos (60–90 palavras cada); 1) identificação e pedido, 2) cessação de cobranças, 3) confirmação por escrito, 4) estorno se houver cobrança posterior. Observacoes_legais: referência genérica ao CDC (Lei 8.078/90), sem aconselhamento jurídico.';

const SYSTEM_VIAGEM =
    'Você gera AUTORIZAÇÃO DE VIAGEM PARA MENOR no padrão brasileiro. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal e claro, **sem placeholders (NENHUM texto como "[INSERIR...]")**. Produza 3–5 parágrafos contendo: 1) menor (nome, data de nascimento, documento) e responsáveis que autorizam (nomes e CPFs). **Importante: NÃO inclua o endereço do responsável, apenas nome e documentos.** 2) viagem (nacional/internacional), destino e período (datas). 3) **Informação do Acompanhante:** O *user prompt* informará o tipo de acompanhamento. Se for "desacompanhado", mencione isso claramente. Se for "outro_responsavel" ou "terceiro", inclua os dados completos: "O menor viajará acompanhado por {NOME_ACOMP}, portador(a) do CPF {CPF_ACOMP}, documento {DOC_ACOMP}, {PARENTESCO}." 4) autorização restrita ao período/destino. 5) linha de local e data formatada, e linhas de assinatura. Instruções de formatação: inclua no fechamento "Local e data: {CIDADE/UF}, {DATA}" e, **após duas quebras de linha (\\n\\n)**, as linhas de assinatura com os nomes e CPFs dos responsáveis que autorizam. Checklist: documentos do menor, dos responsáveis (que assinam) e do acompanhante (que viaja), e duas vias assinadas (reconhecimento de firma pode ser exigido). Observacoes_legais: menção genérica a ECA/autoridades/companhias.';

const SYSTEM_BAGAGEM =
    'Você gera carta à companhia aérea por bagagem extraviada/danificada. Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal e objetivo. 4–6 parágrafos: passageiro/voo (cia, nº, data, origem/destino, PIR), ocorrido, despesas emergenciais, pedido de providências e prazos, anexos.';
const SYSTEM_CONSUMO =
    'Você gera carta de consumo para e-commerce (arrependimento, não entregue, atraso, defeito). Responda SOMENTE em JSON: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. Tom formal. 3–5 parágrafos: identificação + dados do pedido (loja, nº, data, itens/valor), descrição do problema, solicitação objetiva e prazo, anexos. Observacoes_legais: referência genérica ao CDC (ex.: art.49 quando aplicável), sem aconselhamento jurídico.';


exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

        const body = JSON.parse(event.body || '{}');
        let payload = body.payload || null;
        const preview = !!body.preview;
        const captchaToken = body.captchaToken;

        if (!payload) return { statusCode: 400, body: 'Payload inválido' };

        // --- LÓGICA CORRIGIDA DE VERIFICAÇÃO ---
        // 1. É um "Poll" (apenas buscando documento já pago no success.html)?
        //    Identificamos isso se o payload tiver APENAS 'order_id' e não tiver dados de geração (nome, etc.)
        const isPoll = payload.order_id && !payload.nome && !payload.menor_nome && !payload.cpf;

        if (!isPoll) {
            // Se NÃO for poll (ou seja, é uma geração de prévia ou criação nova), EXIGE reCAPTCHA
            if (!captchaToken) {
                return { statusCode: 403, body: 'reCAPTCHA token ausente' };
            }
            const isHuman = await verifyCaptcha(captchaToken);
            if (!isHuman) {
                return { statusCode: 403, body: 'Falha na verificação do reCAPTCHA. Você é um robô?' };
            }

            // Sanitização (só precisa sanitizar se estamos recebendo dados novos)
            payload = sanitizePayload(payload);
        }
        // --- FIM DA VERIFICAÇÃO ---

        const tipo = String(payload.tipo || '').toLowerCase();
        const orderId = payload.order_id || payload.orderId || null;

        // 1) Idempotência / Recuperação
        if (orderId) {
            const { data: rows } = await supabase
                .from('generations')
                .select('id, output_json, created_at')
                .eq('order_id', orderId)
                .order('created_at', { ascending: false })
                .limit(1);
            if (rows && rows.length) {
                // Se achou, retorna direto (pula qualquer geração)
                return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
            }
        }

        // 2) Verificação de Poll Vazio
        if (isPoll) {
            // Se era só um poll e não achou nada no banco (passo 1 falhou),
            // retorna 404 para o frontend tentar de novo. Não tentamos gerar nada aqui.
            return { statusCode: 404, body: 'Documento não encontrado no cache. Aguardando geração.' };
        }

        // 3. VALIDAÇÃO (Apenas se formos gerar algo novo)
        if (tipo === 'autorizacao_viagem') {
            if (!payload.menor_nome || !payload.menor_nascimento || !payload.menor_doc || !payload.resp1_nome || !payload.resp1_cpf || !payload.destino || !payload.data_ida || !payload.data_volta || !payload.cidade_uf_emissao || !payload.acompanhante_tipo)
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };

            if (payload.acompanhante_tipo !== 'desacompanhado') {
                if (!payload.acompanhante_nome || !payload.acompanhante_cpf || !payload.acompanhante_doc || !payload.acompanhante_parentesco)
                    return { statusCode: 400, body: 'Campos do acompanhante são obrigatórios' };
            }
        } else if (tipo === 'bagagem') {
            if (!payload.nome || !payload.cpf || !payload.cia || !payload.voo || !payload.data_voo || !payload.origem || !payload.destino || !payload.status || !payload.cidade_uf)
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
        } else if (tipo === 'consumo') {
            if (!payload.nome || !payload.cpf || !payload.loja || !payload.pedido || !payload.data_compra || !payload.motivo)
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
        } else {
            if (!payload.nome || !payload.cidade_uf || !payload.cpf)
                return { statusCode: 400, body: 'Campos obrigatórios ausentes' };
        }

        // 4. MONTAGEM DO PROMPT
        let system = SYSTEM_CARTA, up = '';
        if (tipo === 'autorizacao_viagem') {
            const localData = (payload.cidade_uf_emissao || '') + ', ' + todayBR();
            let acompInfo = 'desacompanhado';
            if (payload.acompanhante_tipo !== 'desacompanhado') {
                acompInfo = `Tipo: ${payload.acompanhante_tipo} | Nome: ${payload.acompanhante_nome || ''} (CPF ${payload.acompanhante_cpf || ''}, Doc ${payload.acompanhante_doc || ''}, Parentesco: ${payload.acompanhante_parentesco || ''})`;
            }
            up =
                'Menor: ' + (payload.menor_nome || '') + ', nasc. ' + (payload.menor_nascimento || '') + ', doc ' + (payload.menor_doc || '') + '\n' +
                'Responsável 1 (Autorizador): ' + (payload.resp1_nome || '') + ', CPF ' + (payload.resp1_cpf || '') + (payload.resp1_doc ? (', doc ' + payload.resp1_doc) : '') + ', parentesco ' + (payload.resp1_parentesco || '') + '\n' +
                'Responsável 2 (Autorizador, se houver): ' + (payload.dois_resps && payload.resp2_nome ? (payload.resp2_nome + ', CPF ' + (payload.resp2_cpf || '')) : 'não') + '\n' +
                'Viagem: ' + (payload.viagem_tipo || '') + ' para ' + (payload.destino || '') + ' de ' + (payload.data_ida || '') + ' a ' + (payload.data_volta || '') + '\n' +
                'Acompanhamento: ' + acompInfo + '\n' +
                'Local e data de emissão (já formatar no fechamento): ' + localData + '\n' +
                'Contatos: ' + (payload.email || '') + ' ' + (payload.telefone || '');
            system = SYSTEM_VIAGEM;
        } else if (tipo === 'bagagem') {
            up =
                'Passageiro: ' + (payload.nome || '') + ' (CPF ' + (payload.cpf || '') + '), ' + (payload.email || '') + ' ' + (payload.telefone || '') + '\n' +
                'Voo: ' + (payload.cia || '') + ' ' + (payload.voo || '') + ', data ' + (payload.data_voo || '') + ', ' + (payload.origem || '') + '→' + (payload.destino || '') + ', PIR ' + (payload.pir || '') + '\n' +
                'Ocorrência: ' + (payload.status || '') + ' — ' + (payload.descricao || '') + '\n' +
                'Despesas emergenciais: ' + (payload.despesas || '') + '\n' +
                'Local: ' + (payload.cidade_uf || '');
            system = SYSTEM_BAGAGEM;
        } else if (tipo === 'consumo') {
            up =
                'Consumidor: ' + (payload.nome || '') + ' (CPF ' + (payload.cpf || '') + '), ' + (payload.email || '') + ' ' + (payload.telefone || '') + '\n' +
                'Loja: ' + (payload.loja || '') + ' | Pedido: ' + (payload.pedido || '') + ' | Data: ' + (payload.data_compra || '') + '\n' +
                'Itens/Valor: ' + (payload.itens || '') + ' | ' + (payload.valor || '') + '\n' +
                'Subtipo: ' + (payload.motivo || '') + ' | Prazo prometido: ' + (payload.previsao_entrega || '') + '\n' +
                'Cidade/UF: ' + (payload.cidade_uf || '') + '\n' +
                'Notas: ' + (payload.observacoes || '');
            system = SYSTEM_CONSUMO;
        } else {
            up =
                'Tipo: ' + (payload.tipo || 'cancelamento') + '\n' +
                'Entidade: ' + (payload.entidade || 'Empresa') + '\n' +
                'Pessoa: ' + (payload.nome || '') + ' (CPF ' + (payload.cpf || '') + '), residente em ' + (payload.cidade_uf || '') + '\n' +
                'Contrato/Unidade: ' + (payload.contrato || 'não informado') + '\n' +
                'Motivo/Resumo: ' + (payload.motivo || 'não informado');
        }

        // 5) Gera com retry
        let text = null;
        for (const m of MODELS) { try { text = await callWithRetry(m, system + '\n\n' + up, 3); if (text) break; } catch (e) { } }
        if (!text) return { statusCode: 503, body: 'busy' };
        const output = parseJson(text);

        // 6) Salva idempotente
        if (!preview && orderId) {
            await supabase
                .from('generations')
                .upsert(
                    {
                        order_id: orderId,
                        slug: payload.slug || '',
                        input_json: payload,
                        output_json: output
                    },
                    { onConflict: 'order_id' }
                );
        }

        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Falha na geração' }) };
    }
};