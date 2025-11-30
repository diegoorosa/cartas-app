const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURAÇÕES ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// MODELO
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];

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

function sanitizeOutput(obj) {
    if (typeof obj === 'string') {
        return sanitize(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeOutput(item));
    }
    if (typeof obj === 'object' && obj !== null) {
        const newObj = {};
        for (const key in obj) {
            newObj[key] = sanitizeOutput(obj[key]);
        }
        return newObj;
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

const SYSTEM_BASE = 'Você é um assistente jurídico. Responda APENAS JSON válido. Formato: {"titulo":"","saudacao":"","corpo_paragrafos":["..."],"fechamento":"","check_list_anexos":["..."],"observacoes_legais":""}. NÃO use formatação Markdown (**negrito**) ou HTML (<b>) dentro dos textos JSON. Use apenas texto plano.';

// VIAGEM
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

// MULTA
const SYSTEM_MULTA = `
${SYSTEM_BASE}
Você é um advogado especialista em Direito de Trânsito. Gere um RECURSO DE MULTA (Defesa Prévia ou JARI).
REGRAS:
1. Use linguagem formal (Ilustríssimo Senhor Diretor, requerimento, deferimento).
2. Use a tese de defesa fornecida pelo usuário e expanda com fundamentos do CTB (Código de Trânsito Brasileiro) e princípios constitucionais (Ampla Defesa/Contraditório).
3. Se o usuário alegar erro de sinalização, cite o Art. 90 do CTB.
4. NÃO use títulos em negrito (ex: <b>DOS FATOS</b>). Use apenas texto corrido ou CAIXA ALTA se necessário.
5. PROIBIDO INVENTAR DADOS: Não coloque "CEP XXXXX", "Chassi XXXX", "Renavam XXXX" ou espaços em branco (____). Use APENAS os dados fornecidos no input (Nome, CPF, CNH, Endereço, Placa, Modelo, Auto, Data, Órgão). Se faltar o CEP ou Bairro, coloque apenas a Cidade/UF fornecida.

ESTRUTURA:
- Cabeçalho: "Ao Ilmo. Sr. Diretor do [Órgão Autuador] ou Presidente da JARI".
- P1 (Qualificação): "Eu, [Nome], inscrito no CPF sob nº [CPF], portador da CNH nº [CNH], residente e domiciliado em [Endereço], [Cidade/UF], proprietário/condutor do veículo [Modelo], Placa [Placa], venho respeitosamente à presença de Vossa Senhoria..."
- P2 (Os Fatos): "O requerente foi notificado da infração [Auto nº], supostamente cometida em [Data]...".
- P3 (O Direito/Defesa): Desenvolva o argumento jurídico baseado no relato: "[RELATO DO USUÁRIO]".
- P4 (O Pedido): Requer o cancelamento do AIT e a anulação da pontuação.
`;

// REEMBOLSO PASSAGEM
const SYSTEM_PASSAGEM = `
${SYSTEM_BASE}
ATUAÇÃO: Você é um advogado especialista em Direito do Consumidor e Aéreo.
CONTEXTO: O usuário cancelou uma passagem aérea e a companhia quer cobrar multa abusiva.
TAREFA: Redigir uma NOTIFICAÇÃO EXTRAJUDICIAL exigindo o reembolso de 95% do valor.

ARGUMENTAÇÃO JURÍDICA OBRIGATÓRIA:
1. Cite o Art. 740, § 3º do Código Civil: A retenção máxima permitida em caso de cancelamento é de 5%.
2. Cite o Art. 51, IV do Código de Defesa do Consumidor (CDC): Cláusulas que retiram o direito de reembolso são nulas de pleno direito.
3. Mencione que a prática configura enriquecimento ilícito da companhia.

ESTRUTURA:
- saudacao: "À [Nome da Cia Aérea] - A/C Departamento Jurídico".
- corpo_paragrafos: 4 parágrafos (compra, cancelamento, fundamentação, pedido de reembolso de 95%).
- check_list_anexos: incluir comprovante da compra, protocolo de cancelamento, cópia de documento.
`;

// BAGAGEM
const SYSTEM_BAGAGEM = `${SYSTEM_BASE} Carta para bagagem extraviada/danificada. 4 parágrafos: Voo, Ocorrido, Despesas/Prejuízos, Pedido de indenização/reembolso. Inclua menção à responsabilidade objetiva da companhia aérea (CDC).`;

// CONSUMO GENÉRICO
const SYSTEM_CONSUMO = `${SYSTEM_BASE}
Gere uma carta formal de reclamação/cancelamento (Código de Defesa do Consumidor).
REGRAS CRÍTICAS:
1. NÃO use colchetes com instruções (ex: [inserir motivo]). Use EXATAMENTE o texto fornecido no input.
2. Se o motivo for curto, expanda-o com linguagem formal, mas mantenha o sentido original.
3. O tom deve ser firme, exigindo os direitos do consumidor.

ESTRUTURA:
- P1: "Eu, [Nome], portador(a) do CPF [CPF], venho formalizar reclamação/pedido referente ao contrato/serviço junto à empresa [Empresa]."
- P2: "O motivo desta solicitação é: [Motivo do usuário]."
- P3: "Diante do exposto, solicito o atendimento imediato desta demanda, sob pena de medidas judiciais e reclamação junto aos órgãos de proteção ao consumidor (PROCON)."
`;

// NOVO: NEGATIVAÇÃO INDEVIDA
const SYSTEM_NEGATIVACAO = `
${SYSTEM_BASE}
ATUAÇÃO: Você é um advogado especialista em Direito do Consumidor e proteção ao crédito.
TAREFA: Redigir uma NOTIFICAÇÃO EXTRAJUDICIAL por NEGATIVAÇÃO INDEVIDA em cadastros de inadimplentes (SPC, Serasa etc.).

REGRAS:
1. O campo "titulo" deve ser "NOTIFICAÇÃO POR NEGATIVAÇÃO INDEVIDA".
2. O campo "saudacao" deve ser "À [Nome da empresa credora]" ou variação equivalente.
3. Use linguagem formal, em 3 a 6 parágrafos, descrevendo fatos, fundamentos jurídicos e pedidos.
4. Utilize os dados fornecidos: empresa credora, órgão de cadastro, data da negativação, valor e MOTIVO informado pelo usuário (por que é indevida).
5. Fundamente com o Código de Defesa do Consumidor (arts. 6º, 14 e 43) e responsabilidade objetiva da empresa pelo dano causado.
6. Deixe claro que a negativação indevida pode gerar dano moral.

"check_list_anexos" deve sugerir: comprovante de negativação (SPC/Serasa), comprovante de pagamento (se houver), contrato/fatura relacionada, cópia de RG e CPF.
`;

// NOVO: CONTESTAÇÃO CARTÃO
const SYSTEM_CARTAO = `
${SYSTEM_BASE}
ATUAÇÃO: Você é advogado especialista em Direito do Consumidor e relações bancárias.
TAREFA: Redigir uma NOTIFICAÇÃO DE CONTESTAÇÃO DE LANÇAMENTO EM CARTÃO DE CRÉDITO.

REGRAS:
1. O campo "titulo" deve ser "CONTESTAÇÃO DE LANÇAMENTO EM CARTÃO DE CRÉDITO".
2. O campo "saudacao" deve ser "À [Nome do banco emissor] – A/C Setor de Cartões" ou equivalente.
3. Use linguagem formal e objetiva, em 3 a 6 parágrafos.
4. Utilize os dados fornecidos: banco emissor, bandeira, últimos dígitos do cartão, fatura (mês/ano), data, valor e estabelecimento do lançamento contestado, além do MOTIVO.
5. Fundamente com o Código de Defesa do Consumidor (arts. 6º e 14) e com o dever do fornecedor de serviço financeiro de garantir segurança nas transações.
6. Deixe claro que o consumidor não reconhece a cobrança ou que o serviço/produto não foi prestado/entregue conforme combinado.

"check_list_anexos" deve sugerir: cópia da fatura, comprovantes de contato com o banco, boletim de ocorrência (se houver suspeita de fraude), comprovantes de que o serviço/produto não foi prestado.
`;

// NOVO: PLANO DE SAÚDE – NEGATIVA DE COBERTURA
const SYSTEM_PLANO_SAUDE = `
${SYSTEM_BASE}
ATUAÇÃO: Você é advogado especialista em Direito do Consumidor e Saúde Suplementar.
TAREFA: Redigir uma NOTIFICAÇÃO EXTRAJUDICIAL por NEGATIVA DE COBERTURA de exame, tratamento ou cirurgia por plano de saúde.

REGRAS:
1. O campo "titulo" deve ser "NOTIFICAÇÃO POR NEGATIVA DE COBERTURA DE PLANO DE SAÚDE".
2. O campo "saudacao" deve ser "À [Nome da operadora de plano de saúde]" ou variação equivalente.
3. Use linguagem formal e respeitosa, em 3 a 7 parágrafos.
4. Utilize os dados fornecidos: operadora, número da carteirinha, procedimento negado, data da solicitação, protocolo (se houver) e MOTIVO (por que a negativa é abusiva).
5. Fundamente com:
   - Código de Defesa do Consumidor (arts. 6º, 14, 51),
   - normas da ANS sobre cobertura mínima e continuidade de tratamento,
   - princípios da boa-fé e da dignidade da pessoa humana.
6. Deixe claro que a negativa pode acarretar riscos à saúde/vida do consumidor.

ESTRUTURA SUGERIDA DE "corpo_paragrafos":
- P1: Qualificação do beneficiário e referência ao plano (nº da carteirinha).
- P2: Descrição da solicitação (procedimento, data, protocolo) e da negativa.
- P3: Relato do paciente (urgência, indicação médica, continuidade de tratamento etc.), usando o MOTIVO do usuário.
- P4: Fundamentação jurídica (CDC, ANS, boa-fé, jurisprudência de forma genérica).
- P5: Pedido de revisão imediata da negativa, com autorização/cobertura ou alternativa equivalente, sob pena de medidas administrativas e judiciais.

"check_list_anexos": relatório/solicitação do médico, negativa escrita do plano (se houver), carteirinha, exames e orçamentos.
`;

// NOVO: DIREITO DE ARREPENDIMENTO (COMPRA ONLINE)
const SYSTEM_ARREPENDIMENTO = `
${SYSTEM_BASE}
ATUAÇÃO: Você é advogado especialista em Direito do Consumidor.
TAREFA: Redigir uma NOTIFICAÇÃO DE EXERCÍCIO DE DIREITO DE ARREPENDIMENTO em compra realizada fora do estabelecimento comercial (internet, telefone, catálogo etc.), nos termos do art. 49 do CDC.

REGRAS:
1. O campo "titulo" deve ser "EXERCÍCIO DE DIREITO DE ARREPENDIMENTO (ART. 49 DO CDC)".
2. O campo "saudacao" deve ser "À [Nome da loja/site]" ou variação equivalente.
3. Use linguagem formal e objetiva, em 3 a 6 parágrafos.
4. Utilize os dados fornecidos: loja, produto/serviço, datas de compra e entrega (se houver), valor pago, meio da compra e MOTIVO.
5. Explique que o consumidor está dentro do prazo de 7 dias e, portanto, exerce o direito de arrependimento com devolução integral de valores pagos.

ESTRUTURA SUGERIDA DE "corpo_paragrafos":
- P1: Qualificação do consumidor (nome, CPF, endereço) e referência à loja/site e à compra.
- P2: Descrição da compra (produto/serviço, data, valor, meio de contratação).
- P3: Declaração de exercício do direito de arrependimento (art. 49 do CDC) dentro do prazo legal.
- P4: Pedido de cancelamento da compra, estorno/reembolso integral e instruções para devolução do produto (se aplicável).

"check_list_anexos": comprovante da compra/pagamento, prints do pedido, comprovante de entrega (se houver), prints de conversas ou protocolos com a loja.
`;

// --- FUNÇÃO DE CHAMADA SEGURA ---
async function callAIWithFallback(prompt, maxTotalTime = 9500) {
    const startTime = Date.now();

    for (let i = 0; i < MODELS.length; i++) {
        const modelName = MODELS[i];
        const isLast = i === MODELS.length - 1;

        const elapsedTime = Date.now() - startTime;
        const remainingTime = maxTotalTime - elapsedTime;

        if (remainingTime < 1500) throw new Error('Tempo esgotado para IA');

        const attemptTimeout = isLast ? remainingTime : Math.min(5500, remainingTime);

        try {
            console.log(`Tentando modelo: ${modelName} (Timeout: ${attemptTimeout}ms)`);
            const model = genAI.getGenerativeModel({ model: modelName });

            const generatePromise = model.generateContent(prompt);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT_LOCAL')), attemptTimeout)
            );

            const result = await Promise.race([generatePromise, timeoutPromise]);
            const text = result.response.text();
            const json = parseJson(text);

            if (json) return json;
            console.log(`Modelo ${modelName} retornou JSON inválido.`);

        } catch (e) {
            console.error(`Falha no modelo ${modelName}: ${e.message}`);
            if (isLast) throw new Error('Todos os modelos de IA falharam ou deram timeout.');
        }
    }
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

        const body = JSON.parse(event.body || '{}');
        let payload = body.payload || null;
        const preview = !!body.preview;

        if (!payload) return { statusCode: 400, body: 'Payload inválido' };

        // ADMIN
        const SENHA_ADMIN = process.env.ADMIN_KEY || null;
        const isAdmin = SENHA_ADMIN && payload.admin_key === SENHA_ADMIN;
        if (isAdmin && !payload.order_id) {
            payload.order_id = `ADMIN-${Date.now()}`;
        }

        if (!payload.order_id) payload = sanitizePayload(payload);

        const orderId = payload.order_id || payload.orderId || null;

        // CACHE
        if (orderId && !preview) {
            const { data: rows } = await supabase
                .from('generations')
                .select('output_json')
                .eq('order_id', orderId)
                .limit(1);
            if (rows && rows.length) {
                return { statusCode: 200, body: JSON.stringify({ output: rows[0].output_json, cached: true }) };
            }
        }

        // SÓ RECUPERAÇÃO
        if (!isAdmin) {
            if (!payload.slug && !payload.menor_nome && !payload.nome) {
                return { statusCode: 404, body: 'Documento ainda não gerado ou não encontrado.' };
            }
        }

        // ROTEAMENTO
        let tipo = 'indefinido';
        const payloadStr = JSON.stringify(payload).toLowerCase();
        const slug = String(payload.slug || '').toLowerCase();

        if (slug.includes('viagem') || payloadStr.includes('menor_nome') || payload.menor_nome) {
            tipo = 'autorizacao_viagem';
        }
        else if (slug.includes('multa') || payload.placa || payload.cnh || payload.auto_infracao) {
            tipo = 'multa';
        }
        else if (slug.includes('reembolso')) {
            tipo = 'reembolso_passagem';
        }
        else if (slug.includes('plano-saude') || slug.includes('plano_saude') || slug.includes('negativa-plano-saude')) {
            tipo = 'plano_saude';
        }
        else if (slug.includes('arrependimento')) {
            tipo = 'arrependimento';
        }
        else if (slug.includes('negativacao')) {
            tipo = 'negativacao';
        }
        else if (slug.includes('cartao') && slug.includes('contestacao')) {
            tipo = 'cartao_contestacao';
        }
        else if (slug.includes('bagagem') || payloadStr.includes('voo') || payloadStr.includes('pir')) {
            tipo = 'bagagem';
        }
        else if (payloadStr.includes('loja') || payloadStr.includes('pedido')) {
            tipo = 'consumo';
        }
        else if (slug.includes('cancelamento') || slug.includes('reclamacao') || payload.motivo) {
            tipo = 'consumo_generico';
        }

        if (tipo === 'indefinido') {
            return { statusCode: 400, body: 'Erro: Tipo de documento não identificado.' };
        }

        // MONTAGEM DO PROMPT
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

        } else if (tipo === 'multa') {
            up = `RECURSO MULTA:
            Condutor: ${payload.nome}, CPF ${payload.cpf}, CNH ${payload.cnh || 'N/A'}, Endereço: ${payload.endereco}.
            Veículo: ${payload.modelo}, Placa ${payload.placa}.
            Infração: Auto nº ${payload.auto_infracao}, Data ${payload.data_multa}, Órgão: ${payload.orgao}.
            RELATO DE DEFESA (Argumentos): "${payload.motivo}".
            Cidade: ${payload.cidade_uf}.`;
            system = SYSTEM_MULTA;

        } else if (tipo === 'reembolso_passagem') {
            up = `REEMBOLSO PASSAGEM (ART 740 CC):
            Passageiro: ${payload.nome}, CPF ${payload.cpf}. Cidade: ${payload.cidade_uf}.
            Companhia: ${payload.cia}. Reserva: ${payload.reserva}.
            Data Compra: ${payload.data_compra}. Data Voo: ${payload.data_voo}.
            Valor Pago: ${payload.valor_pago}.
            Motivo Cancelamento: ${payload.motivo}.
            OBJETIVO: Notificação Extrajudicial exigindo 95% de reembolso.`;
            system = SYSTEM_PASSAGEM;

        } else if (tipo === 'plano_saude') {
            up = `NEGATIVA DE COBERTURA PLANO DE SAÚDE:
            Beneficiário: ${payload.nome}, CPF ${payload.cpf}, Endereço: ${payload.endereco || ''}, Cidade: ${payload.cidade_uf || ''}.
            Operadora: ${payload.operadora || ''}. Nº da carteirinha: ${payload.numero_carteira || ''}.
            Procedimento/Exame/Tratamento: ${payload.procedimento || ''}.
            Data da solicitação ao plano: ${payload.data_solicitacao || ''}. Protocolo (se houver): ${payload.protocolo || 'Não informado'}.
            Motivo alegado como abusivo: ${payload.motivo || ''}.`;
            system = SYSTEM_PLANO_SAUDE;

        } else if (tipo === 'arrependimento') {
            up = `DIREITO DE ARREPENDIMENTO COMPRA ONLINE:
            Consumidor: ${payload.nome}, CPF ${payload.cpf}, Endereço: ${payload.endereco || ''}, Cidade: ${payload.cidade_uf || ''}.
            Loja/Site: ${payload.loja || ''}.
            Produto/Serviço: ${payload.produto_servico || ''}.
            Data da compra: ${payload.data_compra || ''}. Data da entrega (se houve): ${payload.data_entrega || 'N/A'}.
            Valor pago: ${payload.valor || ''}.
            Meio da compra: ${payload.meio_compra || ''}. Forma de pagamento: ${payload.forma_pagamento || ''}.
            Contato prévio com a empresa (se houver): ${payload.data_contato || 'Não informado'}.
            Situação/Motivo do arrependimento: ${payload.motivo || ''}.`;
            system = SYSTEM_ARREPENDIMENTO;

        } else if (tipo === 'bagagem') {
            up = `BAGAGEM:
            Passageiro: ${payload.nome}, CPF ${payload.cpf}.
            Voo: ${payload.cia} ${payload.voo}, Data Voo: ${payload.data_voo}.
            PIR: ${payload.pir || 'N/A'}.
            Ocorrência: ${payload.status}.
            Descrição: ${payload.descricao}.
            Pedido/Despesas: ${payload.despesas}.
            Cidade: ${payload.cidade_uf}.`;
            system = SYSTEM_BAGAGEM;

        } else if (tipo === 'consumo') {
            up = `CONSUMO:
            Consumidor: ${payload.nome}, CPF ${payload.cpf}.
            Loja: ${payload.loja} Pedido: ${payload.pedido} Data: ${payload.data_compra}.
            Problema: ${payload.motivo}.
            Detalhes: ${payload.itens}.
            Local: ${payload.cidade_uf}.`;
            system = SYSTEM_CONSUMO;

        } else if (tipo === 'consumo_generico') {
            let empresaRaw = slug.replace('carta-', '').replace('cancelamento-', '').replace('reclamacao-', '');
            let empresa = empresaRaw.split('-')[0].toUpperCase();

            if (empresaRaw.includes('smart-fit')) empresa = 'SMART FIT';
            if (empresaRaw.includes('bluefit')) empresa = 'BLUEFIT';
            if (empresaRaw.includes('bodytech')) empresa = 'BODYTECH';
            if (empresaRaw.includes('bio-ritmo')) empresa = 'BIO RITMO';
            if (empresaRaw.includes('just-fit')) empresa = 'JUST FIT';
            if (empresaRaw.includes('claro')) empresa = 'CLARO';
            if (empresaRaw.includes('vivo')) empresa = 'VIVO';
            if (empresaRaw.includes('tim')) empresa = 'TIM';
            if (empresaRaw.includes('oi')) empresa = 'OI';
            if (empresaRaw.includes('sky')) empresa = 'SKY';

            up = `CARTA FORMAL PARA A EMPRESA ${empresa}:
            Remetente: ${payload.nome}, CPF ${payload.cpf}.
            Destinatário: ${empresa} (Setor de Atendimento/Jurídico).
            Cidade: ${payload.cidade_uf || payload.cidade}.
            Dados do Contrato/Instalação: ${payload.contrato || 'Não informado'}.
            Motivo/Solicitação do Cliente: "${payload.motivo}".
            Objetivo: Reclamação formal ou Cancelamento imediato conforme direitos do consumidor.`;
            system = SYSTEM_CONSUMO;

        } else if (tipo === 'negativacao') {
            up = `NEGATIVAÇÃO INDEVIDA:
            Consumidor: ${payload.nome}, CPF ${payload.cpf}, Endereço: ${payload.endereco || ''}, Cidade: ${payload.cidade_uf || ''}.
            Empresa credora: ${payload.empresa || ''}.
            Órgão de proteção ao crédito: ${payload.orgao_cadastro || ''}.
            Data da negativação: ${payload.data_negativacao || ''}.
            Valor apontado: ${payload.valor_divida || ''}.
            Número de contrato/título (se houver): ${payload.numero_contrato || 'Não informado'}.
            Situação alegada (motivo da indevida): ${payload.motivo || ''}.`;
            system = SYSTEM_NEGATIVACAO;

        } else if (tipo === 'cartao_contestacao') {
            up = `CONTESTAÇÃO DE LANÇAMENTO EM CARTÃO DE CRÉDITO:
            Titular: ${payload.nome}, CPF ${payload.cpf}, Endereço: ${payload.endereco || ''}, Cidade: ${payload.cidade_uf || ''}.
            Banco emissor: ${payload.banco_emissor || ''}. Bandeira: ${payload.bandeira || ''}.
            Últimos dígitos do cartão: ${payload.ultimos_digitos || ''}.
            Fatura (mês/ano): ${payload.mes_ano_fatura || ''}.
            Lançamento contestado: Data ${payload.data_lancamento || ''}, Valor ${payload.valor_lancamento || ''}, Estabelecimento: ${payload.estabelecimento || ''}.
            Motivo da contestação: ${payload.motivo || ''}.`;
            system = SYSTEM_CARTAO;
        }

        const fullPrompt = system + '\n\nDADOS:\n' + up;

        let output = await callAIWithFallback(fullPrompt);
        if (!output) throw new Error('Falha crítica na geração IA');

        output = sanitizeOutput(output);

        // FECHAMENTO / ASSINATURA
        if (tipo === 'autorizacao_viagem') {
            const espacoForcado = '\n\u00A0\n\u00A0\n\u00A0\n';
            const cidadeData = `${espacoForcado}${payload.cidade_uf_emissao || 'Local'}, ${getTodaySimple()}.`;

            let assinaturas = `\n\n\n\n\n__________________________________________________\n${payload.resp1_nome}\nCPF: ${payload.resp1_cpf}\n(Assinatura com Firma Reconhecida)`;
            if (payload.dois_resps) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${payload.resp2_nome}\nCPF: ${payload.resp2_cpf}\n(Assinatura com Firma Reconhecida)`;
            }
            output.fechamento = `${cidadeData}${assinaturas}`;

        } else {
            const cidade = payload.cidade_uf || payload.cidade || 'Local';
            const espacoForcado = '\n\u00A0\n\u00A0\n\u00A0\n';
            const cidadeData = `${espacoForcado}${cidade}, ${getTodaySimple()}.`;
            const assinatura = `\n\n\n\n\n__________________________________________________\n${payload.nome}\nCPF: ${payload.cpf}`;
            output.fechamento = `${cidadeData}${assinatura}`;
        }

        // SALVAR NO SUPABASE
        if (orderId && (!preview || isAdmin)) {
            await supabase.from('generations').upsert({
                order_id: orderId,
                slug: payload.slug || '',
                input_json: payload,
                output_json: output
            }, { onConflict: 'order_id' });
        }

        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };

    } catch (e) {
        console.error('Erro Função:', e.message);
        const msg = (e.message.includes('TIMEOUT') || e.message.includes('IA'))
            ? 'O sistema está sobrecarregado. Por favor, tente novamente em 10 segundos.'
            : 'Erro ao gerar documento.';
        return { statusCode: 503, body: msg };
    }
};