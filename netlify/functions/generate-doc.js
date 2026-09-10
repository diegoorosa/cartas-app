const { createClient } = require('@supabase/supabase-js');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify')(new JSDOM('').window);
const { GoogleGenerativeAI } = require('@google/generative-ai');

console.log('[generate-doc] FUNCAO CARREGADA as ' + new Date().toISOString());

// --- CONFIGURACOES ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const GEMINI_MODELS = (process.env.GEMINI_MODELS || 'gemini-2.5-flash-lite,gemini-flash-lite-latest,gemini-flash-latest,gemini-2.5-flash')
    .split(',').map(s => s.trim()).filter(Boolean);

// --- IA: GERAÇÃO DO PARÁGRAFO DE ARGUMENTAÇÃO (com fallback rápido) ---
function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function gerarTextoIA(systemPrompt, userPrompt, fallback) {
    if (!genAI) return { text: fallback, ok: false };
    const inicio = Date.now();
    const deadline = inicio + 3000; // 3s timeout total (era 6s)
    for (const modelName of GEMINI_MODELS) {
        const remaining = deadline - Date.now();
        if (remaining < 500) break;
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const resp = await withTimeout(model.generateContent([systemPrompt, userPrompt].join('\n\n')), remaining);
            const text = (await resp.response.text() || '').trim();
            if (text) {
                console.log(`Gemini (${modelName}) OK em ${Date.now() - inicio}ms`);
                return { text, ok: true };
            }
        } catch (e) {
            console.error(`Gemini (${modelName}) falhou em ${Date.now() - inicio}ms:`, e.message);
        }
    }
    return { text: fallback, ok: false };
}

// --- HELPERS ---
function getTodaySimple() {
    const date = new Date();
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

function getTodayFormatted() {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function sanitize(str) {
    if (!str || typeof str !== 'string') return str;
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

// Formata CPF/CNPJ com máscara (compartilhada entre template e assinatura)
function formatarDoc(doc) {
    if (!doc || doc.trim() === '') return '';
    const limpo = doc.replace(/\D/g, '');
    if (limpo.length === 11) {
        return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (limpo.length === 14) {
        return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return doc;
}

function gerarNotificacaoExtrajudicial(p) {

    // Formatação de valor monetário (aceita "R$ 1.000,00", "1000", "1000,50", "1000.50", "1.000")
    function formatarValor(valor) {
        if (!valor) return '0,00';
        let limpo = valor.toString().replace(/[^\d.,-]/g, '');
        const temVirgula = limpo.includes(',');
        const temPonto = limpo.includes('.');
        if (temVirgula) {
            // BR: vírgula é decimal; pontos (se houver) são milhar → "1.000,00" vira "1000.00"
            limpo = limpo.replace(/\./g, '').replace(',', '.');
        } else if (temPonto) {
            // Só ponto: "1.000"/"1.000.000" = milhar; "1000.50" = decimal
            const partes = limpo.split('.');
            if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) {
                limpo = limpo.replace(/\./g, '');
            }
        }
        const num = parseFloat(limpo);
        if (isNaN(num)) return '0,00';
        return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Formatação de data para DD/MM/AAAA
    function formatarDataDDMMYYYY(dataStr) {
        if (!dataStr) return '___/___/_____';
        try {
            const partes = dataStr.split('-');
            const data = new Date(partes[0], partes[1] - 1, partes[2]);
            const dia = String(data.getDate()).padStart(2, '0');
            const mes = String(data.getMonth() + 1).padStart(2, '0');
            const ano = data.getFullYear();
            return `${dia}/${mes}/${ano}`;
        } catch (e) {
            return '___/___/_____';
        }
    }

    // Converte prazo bruto para texto legível
    function formatarPrazo(prazo) {
        if (!prazo) return '____________________';
        if (prazo === '5d') return '5 dias úteis';
        if (prazo === '48h') return '48 horas';
        if (prazo === '24h') return '24 horas';
        return prazo; // fallback
    }

    const nomeCredor = p.nome_credor || '____________________';
    const documentoCredor = formatarDoc(p.documento_credor);
    const chavePix = p.chave_pix || '____________________';
    const cidadeCredor = p.cidade_credor || '____________________';
    const nomeDevedor = p.nome_devedor || '____________________';
    const documentoDevedor = formatarDoc(p.documento_devedor);
    const tipoDivida = p.tipo_divida || '____________________';
    const descricaoDivida = p.descricao_divida || '____________________';
    const valorDivida = formatarValor(p.valor_divida);
    const dataVencimento = formatarDataDDMMYYYY(p.data_vencimento);
    const prazoQuitacao = formatarPrazo(p.prazo_quitacao);
    const dataAtualDDMMYYYY = getTodayFormatted();

    return {
        saudacao: "NOTIFICAÇÃO EXTRAJUDICIAL PARA CONSTITUIÇÃO EM MORA",
        corpo_paragrafos: [
            `Conforme Artigos 389, 395 e 406 do Código Civil Brasileiro`,
            `Pelo presente instrumento, <strong>${nomeCredor}</strong>${documentoCredor ? ', inscrito(a) sob o CPF/CNPJ nº ' + documentoCredor : ''}, com domicílio na cidade de <strong>${cidadeCredor}</strong>, vem, respeitosamente, <strong>NOTIFICAR EXTRAJUDICIALMENTE</strong> <strong>${nomeDevedor}</strong>${documentoDevedor ? ', inscrito(a) sob o CPF/CNPJ nº ' + documentoDevedor : ''}, a respeito da dívida pendente referente a: <em>${descricaoDivida}</em>.`,
            `O valor da dívida é de <strong>R$ ${valorDivida}</strong>, com vencimento originário em <strong>${dataVencimento}</strong>. Concede-se o prazo de <strong>${prazoQuitacao}</strong> para quitação integral do débito, contado a partir do efetivo recebimento desta notificação.`,
            `Para quitação, o devedor poderá realizar o pagamento via <strong>Transferência Pix</strong> utilizando a chave: <strong>${chavePix}</strong>. O descumprimento do prazo estipulado ensejará a imediata adoção de todas as medidas legais cabíveis, incluindo: protesto da dívida em Cartório de Títulos e Documentos, inscrição do débito nos órgãos de proteção ao crédito (SPC/Serasa) e ajuizamento de Ação de Cobrança perante o Juizado Especial Cível.`,
            `Fundamentação legal: a presente notificação tem fulcro nos <strong>Artigos 389, 395 e 406 do Código Civil Brasileiro (Lei nº 10.406/2002)</strong>, que estabelecem que o inadimplemento da obrigação constitui o devedor em mora, respondendo este por perdas e danos, juros moratórios e correção monetária.`
        ]
    };
}

function gerarViagem(p) {
    let paragrafos = [];

    let docResp1 = formatarDocumento(p.resp1_cpf, p.resp1_doc);
    let textoQualificacao = `Eu, ${p.resp1_nome || '____________________'}, ${docResp1}`;

    if (p.dois_resps && p.resp2_nome) {
        let docResp2 = formatarDocumento(p.resp2_cpf, p.resp2_doc);
        textoQualificacao += `, e eu, ${p.resp2_nome || '____________________'}, ${docResp2}`;
    }

    let docMenor = p.menor_doc ? `portador(a) do documento nº ${p.menor_doc}` : `portador(a) do documento nº ____________________`;
    let tipoViagem = (p.viagem_tipo && p.viagem_tipo.toLowerCase() === 'internacional') ? 'internacional' : 'nacional';

    textoQualificacao += `, na qualidade de pais/responsáveis legais do(a) menor ${p.menor_nome || '____________________'}, nascido(a) em ${p.menor_nascimento || '___/___/____'}, ${docMenor}, AUTORIZO(AMOS) EXPRESSAMENTE a referida criança/adolescente a realizar viagem ${tipoViagem}, conforme as especificações descritas nesta autorização.`;

    paragrafos.push(textoQualificacao);

    let destino = p.destino || '____________________';
    let dataIda = p.data_ida || '___/___/____';
    let dataVolta = p.data_volta || '___/___/____';
    paragrafos.push(`A presente autorização é válida exclusivamente para a viagem com destino a ${destino}, com partida em ${dataIda} e retorno previsto para ${dataVolta}. Qualquer alteração nas datas ou destino requer uma nova autorização formal.`);

    if (p.acompanhante_tipo === 'desacompanhado') {
        paragrafos.push(`O(A) menor viajará desacompanhado(a), sob os cuidados e responsabilidade da companhia de transporte, conforme as normas vigentes.        `);
    } else {
        let docAcomp = formatarDocumento(p.acompanhante_cpf, p.acompanhante_doc);
        let nomeAcomp = p.acompanhante_nome || '____________________';
        let parentescoAcomp = p.acompanhante_parentesco || '____________________';
        paragrafos.push(`O(A) menor viajará acompanhado(a) por ${nomeAcomp}, ${docAcomp}, que possui parentesco/vínculo de ${parentescoAcomp} com o(a) menor, sendo este(a) responsável por sua segurança, saúde e bem-estar durante toda a viagem.
            `);
    }

    paragrafos.push(`Ressalto que esta autorização é concedida em caráter específico para o trajeto e período supramencionados, não conferindo poderes gerais ou irrestritos, devendo ser apresentada às autoridades competentes sempre que solicitada.`);

    return { saudacao: "", corpo_paragrafos: paragrafos };
}

async function gerarMulta(p) {
    const motivoBruto = (p.motivo || '').trim();
    const fallbackParagrafo = `No entanto, a referida autuação não merece prosperar pelos seguintes motivos: ${motivoBruto || '________________________________________'}. Diante dos fatos narrados, restam evidentes as falhas e inconsistências que justificam a anulação da penalidade, em respeito aos princípios constitucionais da ampla defesa e do contraditório, bem como às normas do Código de Trânsito Brasileiro.`;

    let argumentoParagrafo = fallbackParagrafo;
    let aiOk = !motivoBruto;
    if (motivoBruto) {
        const systemPrompt = `Você é especialista em defesa de autuações de trânsito no Brasil (Código de Trânsito Brasileiro - CTB). Escreva APENAS UM parágrafo de argumentação jurídica formal em português para um recurso/defesa prévia de multa de trânsito.
INTERPRETE o relato do condutor (que pode ter erros de português ou linguagem informal) e redija DO ZERO com as SUAS palavras, corrigindo a linguagem e organizando os fatos.
REGRAS OBRIGATÓRIAS: (1) Use exclusivamente os fatos descritos pelo condutor; NÃO invente fatos, datas, valores, locais ou circunstâncias que não foram informados. (2) Só cite número de artigo do CTB se tiver certeza de que ele existe e se aplica ao caso; na dúvida, refira-se de forma genérica ("conforme o Código de Trânsito Brasileiro", "princípios do devido processo legal, do contraditório e da ampla defesa") SEM inventar número. (3) NÃO prometa nem garanta resultado (cancelamento certo, absolvição); use linguagem de pedido e argumentação. (4) Se os fatos relatados forem vagos ou insuficientes, argumente de forma conservadora com base em vícios formais genéricos do auto de infração, sem fabricar detalhes. Não use saudação nem frases de abertura/encerramento — devolva só o parágrafo. Tom formal, técnico, objetivo.`;
        const userPrompt = `Situação relatada pelo condutor: "${motivoBruto}"\nAuto de Infração: ${p.auto_infracao || 'não informado'}\nData da autuação: ${p.data_multa || 'não informada'}\nVeículo: ${p.modelo || 'não informado'}, placa ${p.placa || 'não informada'}`;
        const r = await gerarTextoIA(systemPrompt, userPrompt, fallbackParagrafo);
        argumentoParagrafo = r.text;
        aiOk = r.ok;
    }

    return {
        aiOk: aiOk,
        doc: {
            saudacao: `Ao Ilmo. Sr. Diretor do ${p.orgao || 'Órgão de Trânsito'} ou Presidente da JARI`,
            corpo_paragrafos: [
                `Eu, ${p.nome || '____________________'}, inscrito(a) no CPF sob o nº ${p.cpf || '___________'}, portador(a) da CNH nº ${p.cnh || '___________'}, residente e domiciliado(a) em ${p.endereco || '____________________'}, ${p.cidade_uf || ''}, na qualidade de proprietário/condutor do veículo modelo ${p.modelo || '___________'}, Placa ${p.placa || '___________'}, venho, respeitosamente, à presença de Vossa Senhoria, interpor RECURSO / DEFESA PRÉVIA contra a autuação de trânsito em epígrafe.`,
                `O requerente foi notificado da suposta infração registrada no Auto de Infração nº ${p.auto_infracao || '___________'}, que teria ocorrido na data de ${p.data_multa || '___/___/____'}.                    `,
                argumentoParagrafo,
                `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.                `
            ]
        }
    };
}

function gerarReembolsoPassagem(p) {
    return {
        saudacao: `À Companhia Aérea ${p.cia || '____________________'} - A/C Departamento Jurídico e Atendimento ao Cliente`,
        corpo_paragrafos: [
            `Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio desta Notificação Extrajudicial solicitar o reembolso de passagem aérea cancelada, conforme os dados abaixo.`,
            `Reserva: ${p.reserva || '___________'} | Voo: ${p.voo || '___'} | Data do voo: ${p.data_voo || '___/___/____'}`,
            `Valor pago: ${p.valor_pago || 'R$ ______,__'} | Companhia: ${p.cia || '____________________'} | Motivo: ${p.motivo || '____________________'}`,
            `O art. 740 do Código Civil prevê que o passageiro tem direito a rescindir o contrato de transporte antes de iniciada a viagem, sendo-lhe devida a restituição do valor da passagem, podendo a transportadora reter até 5% a título de multa compensatória.`,
            `Diante do exposto, exijo o reembolso do valor pago, com a dedução máxima de 5% a título de multa compensatória (Art. 740, § 3º, CC), no prazo de 7 (sete) dias úteis, sob pena de adoção das medidas judiciais cabíveis.`
        ]
    };
}

async function gerarConsumoGenerico(p, tipo, slug) {
    // Prioridade: entidade (vem do frontend via slugs.js brand) > empresa > loja > slug
    let empresa = (p.entidade || p.empresa || p.loja || '').trim();
    if (!empresa) {
        const raw = '-' + String(slug || '').toLowerCase() + '-';
        const BRANDS = [
            ['smart-fit', 'SMART FIT'], ['bluefit', 'BLUEFIT'], ['selfit', 'SELFIT'], ['bodytech', 'BODYTECH'],
            ['bio-ritmo', 'BIO RITMO'], ['just-fit', 'JUST FIT'], ['vivo', 'VIVO'], ['claro', 'CLARO'],
            ['tim', 'TIM'], ['oi', 'OI'], ['sky', 'SKY'], ['algar', 'ALGAR'], ['nubank', 'NUBANK'],
            ['itau', 'ITAÚ'], ['santander', 'SANTANDER'], ['bradesco', 'BRADESCO'], ['caixa', 'CAIXA'],
            ['banco-do-brasil', 'BANCO DO BRASIL'], ['enel', 'ENEL'], ['light', 'LIGHT'], ['cemig', 'CEMIG'],
            ['cpfl', 'CPFL'], ['coelba', 'COELBA'], ['sabesp', 'SABESP'], ['copasa', 'COPASA']
        ];
        for (const [k, v] of BRANDS) { if (raw.includes('-' + k + '-')) { empresa = v; break; } }
    }
    const temEmpresa = !!empresa;

    const MOTIVO_LABEL = {
        nao_entregue: 'produto/serviço não entregue', produto_nao_entregue: 'produto/serviço não entregue',
        atraso: 'atraso na entrega', produto_errado: 'produto errado', produto_defeituoso: 'produto ou serviço com defeito',
        arrependimento: 'direito de arrependimento', cobranca_indevida: 'cobrança indevida',
        negativacao: 'negativação indevida', descumprimento: 'descumprimento de acordo/contrato', outro: 'reclamação de consumo'
    };
    const categoria = MOTIVO_LABEL[(p.motivo || '').trim()] || (p.motivo || '').trim();
    const relato = [p.itens, p.descricao, p.observacoes].map(x => (x || '').trim()).filter(Boolean).join(' ') || categoria;
    const fallbackMotivo = `O motivo desta notificação se dá pela seguinte situação: ${relato || '________________________________________'}.`;

    let paragrafoMotivo = fallbackMotivo;
    let aiOk = !relato;
    if (relato) {
        const systemPrompt = `Você é advogado especialista em direito do consumidor brasileiro (Código de Defesa do Consumidor - CDC). O consumidor descreve um problema com as próprias palavras, podendo conter erros de português ou linguagem informal.
Sua tarefa: INTERPRETAR o relato e REDIGIR DO ZERO um único parágrafo formal em português jurídico, com as SUAS palavras — NÃO copie nem parafraseie o texto do consumidor literalmente; corrija a linguagem e organize os fatos.
REGRAS OBRIGATÓRIAS: (1) Baseie-se EXCLUSIVAMENTE nos fatos relatados; NÃO invente fatos, datas, valores, produtos, números ou circunstâncias que não foram informados. (2) Só cite número de artigo do CDC se tiver certeza de que existe e se aplica; na dúvida, refira-se de forma genérica ("conforme o Código de Defesa do Consumidor", "boa-fé objetiva e direito à informação") SEM inventar número. (3) Se o relato pedir cancelamento/rescisão/estorno/correção, DECLARE esse pedido de forma clara e direta (ex.: "solicito o cancelamento/rescisão imediata do contrato e a cessação de cobranças futuras") — isso é diferente de "prometer resultado": você NÃO deve afirmar que a empresa vai aceitar ou que o resultado é garantido, só formalizar a exigência do consumidor com clareza, sem linguagem vaga como "requer-se a análise/avaliação de condições". (4) Se o relato for vago, fundamente de forma conservadora sem fabricar detalhes. (5) Refira-se ao fornecedor pelo nome APENAS se informado; se constar "não informado", use termos genéricos ("o fornecedor", "a empresa") e NÃO invente nem repita um nome. Devolva só o parágrafo, sem saudação nem frases de abertura/encerramento. Tom formal, técnico, jurídico.`;
        const userPrompt = `Empresa/fornecedor: ${temEmpresa ? empresa : 'não informado'}\nCategoria da reclamação: ${categoria || 'reclamação de consumo'}\nRelato do consumidor (interprete e reescreva formalmente, NÃO copie): "${relato}"\nContrato/pedido: ${p.contrato || p.pedido || 'não informado'}`;
        const r = await gerarTextoIA(systemPrompt, userPrompt, fallbackMotivo);
        paragrafoMotivo = r.text;
        aiOk = r.ok;
    }

    let paragrafos = [];

    // Parágrafo 1: Qualificação + direcionamento à empresa específica
    const destinatario = temEmpresa ? empresa : 'esta empresa';
    paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face de ${destinatario}.`);

    // Parágrafo 2: Vinculação contratual (mais direto, sem "contrato/pedido/instalação")
    // Só mostra se tiver contrato/pedido real (não só cidade/UF)
    const identificador = p.contrato || p.pedido;
    const pareceCidade = identificador && /^[A-ZÀ-Ú][a-zà-ú]+(\s+[A-ZÀ-Ú][a-zà-ú]+)*\s*\/\s*[A-Z]{2}$/.test(identificador.trim());
    if (identificador && !pareceCidade) {
        paragrafos.push(`Sou titular do vínculo identificado como "${identificador}", firmado com ${destinatario}.`);
    }

    // Parágrafo 3: Motivo (argumentação)
    paragrafos.push(paragrafoMotivo);

    // Parágrafo 4: Pedido final mais direto e assertivo
    paragrafos.push(`Com base no exposto e amparado pelo Código de Defesa do Consumidor (Lei 8.078/1990), exijo a resolução imediata desta solicitação. Caso não haja solução pacífica no prazo razoável, adotarei as medidas cabíveis, incluindo reclamação junto aos órgãos de defesa do consumidor (PROCON, Consumidor.gov) e o ajuizamento de ação judicial para reparação de danos.`);

    return {
        aiOk: aiOk,
        doc: {
            saudacao: `${temEmpresa ? `À empresa ${empresa}` : 'Ao Fornecedor'} - A/C Setor de Atendimento ao Cliente e Jurídico`,
            corpo_paragrafos: paragrafos
        }
    };
}

// --- HANDLER PRINCIPAL ---
exports.handler = async function(event) {
    try {
        const { payload, preview, slug, order_id } = JSON.parse(event.body || '{}');
        const p = sanitizePayload(payload);

        const ordId = order_id || p.order_id || p.orderId || null;

        // --- CACHE LOOKUP: busca doc já gerado pelo webhook ---
        if (ordId && !preview) {
            const { data: cached } = await supabase
                .from('generations')
                .select('output_json, input_json')
                .eq('order_id', ordId)
                .limit(1);
            if (cached && cached.length) {
                return { statusCode: 200, body: JSON.stringify({ output: cached[0].output_json, input_json: cached[0].input_json, cached: true }) };
            }

            // BLOQUEIO: geração final (preview=false) só com ghost fields + lookup checkout_intents
            // NÃO deve gerar doc - o checkout_intents tem o payload ANTES do pagamento.
            // O success.html envia payload completo do localStorage; o docReady() do polling manda só order_id.
            const FIELDS_FANTASMA = ['order_id', 'orderId', 'ultima_tentativa', 'slug'];
            const temFieldsReais = p && Object.keys(p).some(k => !FIELDS_FANTASMA.includes(k) && p[k]);
            if (!temFieldsReais && !preview) {
                // Geração final sem dados reais = polling ou acesso direto sem pagar
                // NÃO busca em checkout_intents (payload pré-pagamento)
                return { statusCode: 200, body: JSON.stringify({
                    output: null,
                    ai_pendente: true,
                    motivo: 'pagamento_nao_confirmado'
                }) };
            }
            // Preview (preview=true) ou payload completo: pode tentar lookup em checkout_intents para recovery
            if (!temFieldsReais && preview) {
                try {
                    const { data: intent } = await supabase
                        .from('checkout_intents')
                        .select('payload')
                        .eq('order_id', ordId)
                        .maybeSingle();
                    if (intent && intent.payload && Object.keys(intent.payload).some(k => !FIELDS_FANTASMA.includes(k))) {
                        Object.assign(p, intent.payload);
                        p.order_id = ordId;
                    } else {
                        return { statusCode: 200, body: JSON.stringify({
                            output: null,
                            ai_pendente: true,
                            motivo: 'payload_incompleto'
                        }) };
                    }
                } catch (e) {
                    console.warn('[generate-doc] lookup checkout_intents falhou:', e.message);
                    return { statusCode: 200, body: JSON.stringify({
                        output: null,
                        ai_pendente: true,
                        motivo: 'lookup_falhou'
                    }) };
                }
            }
        }

        // Detecta tipo pelo slug / payload — lógica do generate-doc original
        const payloadStr = JSON.stringify(p || {}).toLowerCase();
        const effectiveSlug = String(slug || p.slug || '').toLowerCase();
        let tipo = 'consumo_generico';
        if (effectiveSlug.includes('viagem') || payloadStr.includes('menor_nome') || p.menor_nome) {
            tipo = 'autorizacao_viagem';
        } else if (effectiveSlug.includes('multa') || p.placa || p.cnh || p.auto_infracao) {
            tipo = 'multa';
        } else if (effectiveSlug.includes('reembolso-cancelamento-passagem') || effectiveSlug.includes('voo')) {
            tipo = 'reembolso_passagem';
        } else if (effectiveSlug.includes('notificacao-extrajudicial') || effectiveSlug.includes('cobranca') || p.nome_credor || p.chave_pix) {
            tipo = 'notificacao_extrajudicial';
        } else {
            tipo = 'consumo_generico';
        }

        // --- GERAÇÃO DO TEXTO ---
        let output = { saudacao: "", corpo_paragrafos: [] };
        let aiOk = true; // viagem, reembolso e notificação extrajudicial não usam IA, sempre "ok"

        if (tipo === 'autorizacao_viagem') {
            output = gerarViagem(p);
        } else if (tipo === 'multa') {
            const r = await gerarMulta(p);
            output = r.doc;
            aiOk = r.aiOk;
        } else if (tipo === 'reembolso_passagem') {
            output = gerarReembolsoPassagem(p);
        } else if (tipo === 'notificacao_extrajudicial') {
            output = gerarNotificacaoExtrajudicial(p);
        } else {
            const r = await gerarConsumoGenerico(p, tipo, slug);
            output = r.doc;
            aiOk = r.aiOk;
        }

        // --- FECHAMENTO E ASSINATURAS ---
        if (tipo === 'autorizacao_viagem') {
            const espacoForcado = '\n \n \n \n';
            const cidadeData = `${espacoForcado}${p.cidade_uf_emissao || 'Local'}, ${getTodaySimple()}.`;

            let assinaturas = `\n\n\n\n\n__________________________________________________\n${p.resp1_nome || 'Responsável'}`;
            if (p.resp1_cpf) assinaturas += `\nCPF: ${p.resp1_cpf}`;
            assinaturas += `\n(Assinatura com Firma Reconhecida)`;

            if (p.dois_resps && p.resp2_nome) {
                assinaturas += `\n\n\n\n\n__________________________________________________\n${p.resp2_nome || 'Segundo Responsável'}`;
                if (p.resp2_cpf) assinaturas += `\nCPF: ${p.resp2_cpf}`;
                assinaturas += `\n(Assinatura com Firma Reconhecida)`;
            }
            output.fechamento = `${cidadeData}${assinaturas}`;

        } else if (tipo === 'notificacao_extrajudicial') {
            // Fechamento específico: cidade do credor + data atual + assinatura do notificante (centralizada)
            const espacoForcado = '\n \n \n \n';
            const dataFormatada = getTodayFormatted();
            const cidadeData = `${espacoForcado}Feito em ${p.cidade_credor || 'Local'}, ${dataFormatada}.`;
            const docCredor = formatarDoc(p.documento_credor);
            const assinatura = `\n\n\n\n\n______________________________\n${p.nome_credor || 'Assinatura'}${docCredor ? '\nCPF/CNPJ: ' + docCredor : ''}\nNotificante`;
            output.fechamento = `${cidadeData}${assinatura}`;

        } else {
            const cidade = p.cidade_uf || p.cidade || 'Local';
            const espacoForcado = '\n \n \n \n';
            const cidadeData = `${espacoForcado}${cidade}, ${getTodaySimple()}.`;
            const assinatura = `\n\n\n\n\n__________________________________________________\n${p.nome || 'Assinatura'}\nCPF: ${p.cpf || '___________'}`;
            output.fechamento = `${cidadeData}${assinatura}`;
        }

        // --- SALVAR NO SUPABASE ---
        const ultimaTentativa = !!p.ultima_tentativa;
        const podeCachear = ordId && (!preview) && (aiOk || ultimaTentativa);

        if (podeCachear) {
            await supabase.from('generations').upsert({
                order_id: ordId,
                slug: p.slug || slug || '',
                input_json: p,
                output_json: output
            }, { onConflict: 'order_id' });
        }

        // Retorna a estrutura exata que o frontend espera!
        return { statusCode: 200, body: JSON.stringify({ output, input_json: p, cached: false, ai_pendente: !aiOk && !ultimaTentativa }) };

    } catch (e) {
        console.error('Erro Função:', e.message);
        return { statusCode: 500, body: 'Erro interno ao gerar documento.' };
    }
};