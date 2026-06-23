const { createClient } = require('@supabase/supabase-js');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify')(new JSDOM('').window);
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONFIGURAÇÕES ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const GEMINI_MODELS = (process.env.GEMINI_MODELS || 'gemini-2.0-flash,gemini-1.5-flash')
    .split(',').map(s => s.trim()).filter(Boolean);

// --- IA: GERAÇÃO DO PARÁGRAFO DE ARGUMENTAÇÃO (com fallback seguro) ---
function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function gerarTextoIA(systemPrompt, userPrompt, fallback, debug) {
    if (!genAI) return debug ? `${fallback}\n[DEBUG_GEMINI: sem GEMINI_API_KEY configurada]` : fallback;
    const deadline = Date.now() + 4000; // orçamento total de ~4s (cabe no retry do mp-webhook)
    let lastErr = null;
    for (const modelName of GEMINI_MODELS) {
        const remaining = deadline - Date.now();
        if (remaining < 500) break;
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const resp = await withTimeout(model.generateContent([systemPrompt, userPrompt].join('\n\n')), remaining);
            const text = (await resp.response.text() || '').trim();
            if (text) return text;
        } catch (e) {
            lastErr = `${modelName}: ${e.message}`;
            console.error(`Gemini (${modelName}) falhou:`, e.message);
        }
    }
    return debug && lastErr ? `${fallback}\n[DEBUG_GEMINI: ${lastErr}]` : fallback;
}

// --- HELPERS ---
function getTodaySimple() {
    const date = new Date();
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

function sanitize(str) {
    if (!str || typeof str !== 'string') return str;
    // DOMPurify com allowlist vazia = remove tudo que não é texto puro
    return DOMPurify.sanitize(str, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

function sanitizePayload(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    for (const key in obj) {
        const value = obj[key];
        if (typeof value === 'string') obj[key] = sanitize(value);
    }
    return obj;
}

// FORMATADOR INTELIGENTE DE DOCUMENTOS (Evita o bug do CPF vs Passaporte)
function formatarDocumento(cpf, doc) {
    let partes = [];
    if (cpf && cpf.trim() !== '') {
        partes.push(`CPF nº ${cpf}`);
    }
    if (doc && doc.trim() !== '') {
        partes.push(`documento de identificação nº ${doc}`);
    }

    if (partes.length === 0) return `portador(a) do documento nº ____________________`;
    if (partes.length === 1) return `portador(a) do ${partes[0]}`;
    return `portador(a) do ${partes[0]} e do ${partes[1]}`;
}

// --- MOTORES DE GERAÇÃO DE TEXTO (TEMPLATES) ---

function gerarViagem(p) {
    let paragrafos = [];

    // P1: Qualificação dos Responsáveis e do Menor
    let docResp1 = formatarDocumento(p.resp1_cpf, p.resp1_doc);
    let textoQualificacao = `Eu, ${p.resp1_nome || '____________________'}, ${docResp1}`;

    if (p.dois_resps || p.resp2_nome) {
        let docResp2 = formatarDocumento(p.resp2_cpf, p.resp2_doc);
        textoQualificacao += `, e eu, ${p.resp2_nome || '____________________'}, ${docResp2}`;
    }

    let docMenor = p.menor_doc ? `portador(a) do documento nº ${p.menor_doc}` : `portador(a) do documento nº ____________________`;
    let tipoViagem = (p.viagem_tipo && p.viagem_tipo.toLowerCase() === 'internacional') ? 'internacional' : 'nacional';

    textoQualificacao += `, na qualidade de pais/responsáveis legais do(a) menor ${p.menor_nome || '____________________'}, nascido(a) em ${p.menor_nascimento || '___/___/____'}, ${docMenor}, AUTORIZO(AMOS) EXPRESSAMENTE a referida criança/adolescente a realizar viagem ${tipoViagem}, conforme as especificações descritas nesta autorização.`;

    paragrafos.push(textoQualificacao);

    // P2: Destino e Datas
    let destino = p.destino || '____________________';
    let dataIda = p.data_ida || '___/___/____';
    let dataVolta = p.data_volta || '___/___/____';
    paragrafos.push(`A presente autorização é válida exclusivamente para a viagem com destino a ${destino}, com partida em ${dataIda} e retorno previsto para ${dataVolta}. Qualquer alteração nas datas ou destino requer uma nova autorização formal.`);

    // P3: Acompanhante
    if (p.acompanhante_tipo === 'desacompanhado') {
        paragrafos.push(`O(A) menor viajará desacompanhado(a), sob os cuidados e responsabilidade da companhia de transporte, conforme as normas vigentes.`);
    } else {
        let docAcomp = formatarDocumento(p.acompanhante_cpf, p.acompanhante_doc);
        let nomeAcomp = p.acompanhante_nome || '____________________';
        let parentescoAcomp = p.acompanhante_parentesco || '____________________';
        paragrafos.push(`O(A) menor viajará acompanhado(a) por ${nomeAcomp}, ${docAcomp}, que possui parentesco/vínculo de ${parentescoAcomp} com o(a) menor, sendo este(a) responsável por sua segurança, saúde e bem-estar durante toda a viagem.`);
    }

    // P4: Encerramento Legal
    paragrafos.push(`Ressalto que esta autorização é concedida em caráter específico para o trajeto e período supramencionados, não conferindo poderes gerais ou irrestritos, devendo ser apresentada às autoridades competentes sempre que solicitada.`);

    return { saudacao: "", corpo_paragrafos: paragrafos };
}

async function gerarMulta(p) {
    const motivoBruto = (p.motivo || '').trim();
    const fallbackParagrafo = `No entanto, a referida autuação não merece prosperar pelos seguintes motivos: ${motivoBruto || '________________________________________'}. Diante dos fatos narrados, restam evidentes as falhas e inconsistências que justificam a anulação da penalidade, em respeito aos princípios constitucionais da ampla defesa e do contraditório, bem como às normas do Código de Trânsito Brasileiro.`;

    let argumentoParagrafo = fallbackParagrafo;
    if (motivoBruto) {
        const systemPrompt = `Você é especialista em defesa de autuações de trânsito no Brasil (Código de Trânsito Brasileiro - CTB). Escreva APENAS UM parágrafo de argumentação jurídica formal em português para um recurso/defesa prévia de multa de trânsito. Use exatamente os fatos descritos pelo condutor, sem inventar fatos novos. Cite artigos do CTB quando fizer sentido com a situação relatada (ex.: vícios formais do auto de infração, ambiguidade de sinalização, aferição de equipamentos), só se for plausível. Não use saudação nem frases de abertura/encerramento — devolva só o parágrafo. Tom formal, técnico, objetivo.`;
        const userPrompt = `Situação relatada pelo condutor: "${motivoBruto}"\nAuto de Infração: ${p.auto_infracao || 'não informado'}\nData da autuação: ${p.data_multa || 'não informada'}\nVeículo: ${p.modelo || 'não informado'}, placa ${p.placa || 'não informada'}`;
        argumentoParagrafo = await gerarTextoIA(systemPrompt, userPrompt, fallbackParagrafo, p.debug_ia === true);
    }

    return {
        saudacao: `Ao Ilmo. Sr. Diretor do ${p.orgao || 'Órgão de Trânsito'} ou Presidente da JARI`,
        corpo_paragrafos: [
            `Eu, ${p.nome || '____________________'}, inscrito(a) no CPF sob o nº ${p.cpf || '___________'}, portador(a) da CNH nº ${p.cnh || '___________'}, residente e domiciliado(a) em ${p.endereco || '____________________'}, ${p.cidade_uf || ''}, na qualidade de proprietário/condutor do veículo modelo ${p.modelo || '___________'}, Placa ${p.placa || '___________'}, venho, respeitosamente, à presença de Vossa Senhoria, interpor RECURSO / DEFESA PRÉVIA contra a autuação de trânsito em epígrafe.`,
            `O requerente foi notificado da suposta infração registrada no Auto de Infração nº ${p.auto_infracao || '___________'}, que teria ocorrido na data de ${p.data_multa || '___/___/____'}.`,
            argumentoParagrafo,
            `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.`
        ]
    };
}

function gerarReembolsoPassagem(p) {
    return {
        saudacao: `À Companhia Aérea ${p.cia || '____________________'} - A/C Departamento Jurídico e Atendimento ao Cliente`,
        corpo_paragrafos: [
            `Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio desta Notificação Extrajudicial solicitar o reembolso legal referente à reserva de voo sob o código localizador ${p.reserva || '___________'}, adquirida na data de ${p.data_compra || '___/___/____'}, no valor total de ${p.valor_pago || 'R$ ________'}.`,
            `Informa-se que o cancelamento da referida passagem se deu pelo seguinte motivo: ${p.motivo || '____________________'}. O voo estava previsto para ocorrer apenas na data de ${p.data_voo || '___/___/____'}.`,
            `Conforme o Código Civil Brasileiro, em seu Art. 740, § 3º, nas compras de passagens em que o passageiro desiste da viagem em tempo hábil para a renegociação do assento, a transportadora tem o direito de reter o máximo de 5% (cinco por cento) do valor a ser restituído a título de multa compensatória. Além disso, o Código de Defesa do Consumidor (Art. 51) determina que são nulas de pleno direito as cláusulas que subtraiam do consumidor a opção de reembolso da quantia já paga.`,
            `Desta forma, a cobrança de multas abusivas que ultrapassam o limite legal caracteriza enriquecimento ilícito da companhia. Diante do exposto, exijo o reembolso de no mínimo 95% do valor pago, além da devolução integral das taxas de embarque, no prazo máximo de 7 (sete) dias úteis, sob pena de adoção das medidas judiciais cabíveis nos Juizados Especiais Cíveis.`
        ]
    };
}

async function gerarConsumoGenerico(p, tipoFormulario, slug) {
    // Tenta identificar o nome da empresa pelo slug se não vier especificado
    let empresaRaw = slug.replace('carta-', '').replace('cancelamento-', '').replace('reclamacao-', '');
    let empresa = empresaRaw.split('-')[0].toUpperCase();
    if (empresaRaw.includes('smart-fit')) empresa = 'SMART FIT';
    if (empresaRaw.includes('bluefit')) empresa = 'BLUEFIT';
    if (empresaRaw.includes('vivo')) empresa = 'VIVO';
    if (empresaRaw.includes('claro')) empresa = 'CLARO';
    if (!empresa || empresa === 'DOCUMENTO') empresa = p.loja || p.empresa || 'Empresa Fornecedora';

    const motivoBruto = (p.motivo || '').trim();
    const fallbackMotivo = `O motivo desta notificação se dá pela seguinte situação: ${motivoBruto || '________________________________________'}.`;

    let paragrafoMotivo = fallbackMotivo;
    if (motivoBruto) {
        const systemPrompt = `Você é especialista em direito do consumidor brasileiro (Código de Defesa do Consumidor - CDC). Escreva APENAS UM parágrafo formal em português descrevendo o problema relatado e fundamentando o pedido, citando artigos do CDC quando plausível pela situação (ex.: práticas abusivas, cobrança indevida, vícios do produto/serviço). Use exatamente os fatos descritos, sem inventar fatos novos. Não use saudação nem frases de abertura/encerramento — devolva só o parágrafo. Tom formal, objetivo.`;
        const userPrompt = `Empresa/fornecedor: ${empresa}\nSituação relatada pelo consumidor: "${motivoBruto}"\nContrato/pedido: ${p.contrato || p.pedido || 'não informado'}\nTipo de solicitação: ${tipoFormulario || 'reclamação/cancelamento'}`;
        paragrafoMotivo = await gerarTextoIA(systemPrompt, userPrompt, fallbackMotivo, p.debug_ia === true);
    }

    let paragrafos = [];
    paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face desta empresa.`);

    if (p.contrato || p.pedido) {
        paragrafos.push(`Sou titular do contrato / pedido / instalação de nº ${p.contrato || p.pedido}, adquirido/firmado com esta prestadora.`);
    }

    paragrafos.push(paragrafoMotivo);

    if (p.itens || p.descricao) {
        paragrafos.push(`Detalhes complementares da solicitação: ${p.itens || p.descricao}.`);
    }

    paragrafos.push(`Diante do exposto, e amparado pelas normas do Código de Defesa do Consumidor (Lei 8.078/1990), exijo o atendimento e a resolução imediata desta solicitação. A ausência de solução pacífica no prazo razoável ensejará a abertura de reclamações junto aos órgãos de proteção ao crédito (PROCON, Consumidor.gov) e o ajuizamento de ação competente para reparação de danos.`);

    return {
        saudacao: `À empresa ${empresa} - A/C Setor de Atendimento ao Cliente e Jurídico`,
        corpo_paragrafos: paragrafos
    };
}

// --- FUNÇÃO PRINCIPAL (HANDLER) ---

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

        // Validação de chamada interna (webhook -> generate-doc)
        const internalSecret = event.headers?.['x-internal-secret'] || event.headers?.['X-Internal-Secret'];
        const expectedSecret = process.env.INTERNAL_FUNCTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
        const isInternalCall = expectedSecret && internalSecret === expectedSecret;

        const body = JSON.parse(event.body || '{}');
        let payload = body.payload || null;
        const preview = !!body.preview;

        if (!payload) return { statusCode: 400, body: 'Payload inválido' };

        // ADMIN CONFIG
        const SENHA_ADMIN = process.env.ADMIN_KEY || null;
        const isAdmin = SENHA_ADMIN && payload.admin_key === SENHA_ADMIN;
        // Chamadas internas (webhook) têm permissão total via x-internal-secret
        const isTrusted = isAdmin || isInternalCall;
        if (isTrusted && !payload.order_id) {
            payload.order_id = `ADMIN-${Date.now()}`;
        }

        if (!payload.order_id) payload = sanitizePayload(payload);

        const orderId = payload.order_id || payload.orderId || null;

        // VERIFICAÇÃO DE CACHE (Se o documento já foi gerado antes, retorna do banco)
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

        if (!isTrusted) {
            if (!payload.slug && !payload.menor_nome && !payload.nome) {
                return { statusCode: 404, body: 'Documento ainda não gerado ou não encontrado.' };
            }
        }

        // --- ROTEAMENTO INTELIGENTE SEM IA ---
        let tipo = 'indefinido';
        const payloadStr = JSON.stringify(payload).toLowerCase();
        const slug = String(payload.slug || '').toLowerCase();

        if (slug.includes('viagem') || payloadStr.includes('menor_nome') || payload.menor_nome) {
            tipo = 'autorizacao_viagem';
        } else if (slug.includes('multa') || payload.placa || payload.cnh || payload.auto_infracao) {
            tipo = 'multa';
        } else if (slug.includes('reembolso-cancelamento-passagem') || slug.includes('voo')) {
            tipo = 'reembolso_passagem';
        } else {
            // Fallback genérico para cancelamentos de academia, internet, energia, e-commerce, etc.
            tipo = 'consumo_generico';
        }

        // --- GERAÇÃO DO TEXTO ---
        let output = { saudacao: "", corpo_paragrafos: [] };

        if (tipo === 'autorizacao_viagem') {
            output = gerarViagem(payload);
        } else if (tipo === 'multa') {
            output = await gerarMulta(payload);
        } else if (tipo === 'reembolso_passagem') {
            output = gerarReembolsoPassagem(payload);
        } else {
            output = await gerarConsumoGenerico(payload, tipo, slug);
        }

        // --- FECHAMENTO E ASSINATURAS ---
        if (tipo === 'autorizacao_viagem') {
            const espacoForcado = '\n\u00A0\n\u00A0\n\u00A0\n';
            const cidadeData = `${espacoForcado}${payload.cidade_uf_emissao || 'Local'}, ${getTodaySimple()}.`;

            let assinaturas = `\n\n\n\n\n__________________________________________________\n${payload.resp1_nome || 'Responsável'}`;
            if (payload.resp1_cpf) assinaturas += `\nCPF: ${payload.resp1_cpf}`;
            assinaturas += `\n(Assinatura com Firma Reconhecida)`;

            if (payload.dois_resps || payload.resp2_nome) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${payload.resp2_nome || 'Segundo Responsável'}`;
                if (payload.resp2_cpf) assinaturas += `\nCPF: ${payload.resp2_cpf}`;
                assinaturas += `\n(Assinatura com Firma Reconhecida)`;
            }
            output.fechamento = `${cidadeData}${assinaturas}`;

        } else {
            const cidade = payload.cidade_uf || payload.cidade || 'Local';
            const espacoForcado = '\n\u00A0\n\u00A0\n\u00A0\n';
            const cidadeData = `${espacoForcado}${cidade}, ${getTodaySimple()}.`;
            const assinatura = `\n\n\n\n\n__________________________________________________\n${payload.nome || 'Assinatura'}\nCPF: ${payload.cpf || '___________'}`;
            output.fechamento = `${cidadeData}${assinatura}`;
        }

        // --- SALVAR NO SUPABASE (Apenas se não for prévia, ou se for Admin/Internal) ---
        if (orderId && (!preview || isTrusted)) {
            await supabase.from('generations').upsert({
                order_id: orderId,
                slug: payload.slug || '',
                input_json: payload,
                output_json: output
            }, { onConflict: 'order_id' });
        }

        // Retorna a estrutura exata que o frontend espera!
        return { statusCode: 200, body: JSON.stringify({ output, cached: false }) };

    } catch (e) {
        console.error('Erro Função:', e.message);
        return { statusCode: 500, body: 'Erro interno ao gerar documento.' };
    }
};
