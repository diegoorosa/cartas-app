const { createClient } = require('@supabase/supabase-js');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify')(new JSDOM('').window);
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- CONFIGURAÇÕES ---
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
                `O requerente foi notificado da suposta infração registrada no Auto de Infração nº ${p.auto_infracao || '___________'}, que teria ocorrido na data de ${p.data_multa || '___/___/____'}.`,
                argumentoParagrafo,
                `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.                `
            ]
        };
    }
    };

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
        let empresa = (p.empresa || p.loja || '').trim();
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
        paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face desta empresa.`);

        if (p.contrato || p.pedido) {
            paragrafos.push(`Sou titular do contrato / pedido / instalação identificado como "${p.contrato || p.pedido}", firmado com esta prestadora.`);
        }

        paragrafos.push(paragrafoMotivo);

        paragrafos.push(`Diante do exposto, e amparado pelas normas do Código de Defesa do Consumidor (Lei 8.078/1990), exijo o atendimento e a resolução imediata desta solicitação. A ausência de solução pacífica no prazo razoável ensejará a abertura de reclamações junto aos órgãos de proteção ao crédito (PROCON, Consumidor.gov) e o ajuizamento de ação competente para reparação de danos.`);

        return {
            aiOk: aiOk,
            doc: {
                saudacao: `${temEmpresa ? `À empresa ${empresa}` : 'Ao Fornecedor'} - A/C Setor de Atendimento ao Cliente e Jurídico`,
                corpo_paragrafos: paragrafos
            }
        };
    }

    // --- MOTORES DE GERAÇÃO DE TEXTO (TEMPLATES) ---

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
                    `O requerente foi notificado da suposta infração registrada no Auto de Infração nº ${p.auto_infracao || '___________'}, que teria ocorrido na data de ${p.data_multa || '___/___/____'}.`,
                    argumentoParagrafo,
                    `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.                `
            ]
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
        let empresa = (p.empresa || p.loja || '').trim();
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
        paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face desta empresa.`);

        if (p.contrato || p.pedido) {
            paragrafos.push(`Sou titular do contrato / pedido / instalação identificado como "${p.contrato || p.pedido}", firmado com esta prestadora.`);
        }

        paragrafos.push(paragrafoMotivo);

        paragrafos.push(`Diante do exposto, e amparado pelas normas do Código de Defesa do Consumidor (Lei 8.078/1990), exijo o atendimento e a resolução imediata desta solicitação. A ausência de solução pacífica no prazo razoável ensejará a abertura de reclamações junto aos órgãos de proteção ao crédito (PROCON, Consumidor.gov) e o ajuizamento de ação competente para reparação de danos.`);

        return {
            aiOk: aiOk,
            doc: {
                saudacao: `${temEmpresa ? `À empresa ${empresa}` : 'Ao Fornecedor'} - A/C Setor de Atendimento ao Cliente e Jurídico`,
                corpo_paragrafos: paragrafos
            }
        };
    }

    // --- MOTORES DE GERAÇÃO DE TEXTO (TEMPLATES) ---

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
                    `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.
                `
            ]
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
        let empresa = (p.empresa || p.loja || '').trim();
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
        paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face desta empresa.`);

        if (p.contrato || p.pedido) {
            paragrafos.push(`Sou titular do contrato / pedido / instalação identificado como "${p.contrato || p.pedido}", firmado com esta prestadora.`);
        }

        paragrafos.push(paragrafoMotivo);

        paragrafos.push(`Diante do exposto, e amparado pelas normas do Código de Defesa do Consumidor (Lei 8.078/1990), exijo o atendimento e a resolução imediata desta solicitação. A ausência de solução pacífica no prazo razoável ensejará a abertura de reclamações junto aos órgãos de proteção ao crédito (PROCON, Consumidor.gov) e o ajuizamento de ação competente para reparação de danos.`);

        return {
            aiOk: aiOk,
            doc: {
                saudacao: `${temEmpresa ? `À empresa ${empresa}` : 'Ao Fornecedor'} - A/C Setor de Atendimento ao Cliente e Jurídico`,
                corpo_paragrafos: paragrafos
            }
        };
    }

    // --- MOTORES DE GERAÇÃO DE TEXTO (TEMPLATES) ---

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
                    `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.
                `
            ]
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
        let empresa = (p.empresa || p.loja || '').trim();
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
        paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face desta empresa.`);

        if (p.contrato || p.pedido) {
            paragrafos.push(`Sou titular do contrato / pedido / instalação identificado como "${p.contrato || p.pedido}", firmado com esta prestadora.`);
        }

        paragrafos.push(paragrafoMotivo);

        paragrafos.push(`Diante do exposto, e amparado pelas normas do Código de Defesa do Consumidor (Lei 8.078/1990), exijo o atendimento e a resolução imediata desta solicitação. A ausência de solução pacífica no prazo razoável ensejará a abertura de reclamações junto aos órgãos de proteção ao crédito (PROCON, Consumidor.gov) e o ajuizamento de ação competente para reparação de danos.`);

        return {
            aiOk: aiOk,
            doc: {
                saudacao: `${temEmpresa ? `À empresa ${empresa}` : 'Ao Fornecedor'} - A/C Setor de Atendimento ao Cliente e Jurídico`,
                corpo_paragrafos: paragrafos
            }
        };
    }

    // --- MOTORES DE GERAÇÃO DE TEXTO (TEMPLATES) ---

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
                    `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.
                `
            ]
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
        let empresa = (p.empresa || p.loja || '').trim();
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
        paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face desta empresa.`);

        if (p.contrato || p.pedido) {
            paragrafos.push(`Sou titular do contrato / pedido / instalação identificado como "${p.contrato || p.pedido}", firmado com esta prestadora.`);
        }

        paragrafos.push(paragrafoMotivo);

        paragrafos.push(`Diante do exposto, e amparado pelas normas do Código de Defesa do Consumidor (Lei 8.078/1990), exijo o atendimento e a resolução imediata desta solicitação. A ausência de solução pacífica no prazo razoável ensejará a abertura de reclamações junto aos órgãos de proteção ao crédito (PROCON, Consumidor.gov) e o ajuizamento de ação competente para reparação de danos.`);

        return {
            aiOk: aiOk,
            doc: {
                saudacao: `${temEmpresa ? `À empresa ${empresa}` : 'Ao Fornecedor'} - A/C Setor de Atendimento ao Cliente e Jurídico`,
                corpo_paragrafos: paragrafos
            }
        };
    }

    // --- MOTORES DE GERAÇÃO DE TEXTO (TEMPLATES) ---

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
            paragrafos.push(`O(A) menor viajará desacompanhado(a), sob os cuidados e responsabilidade da companhia de transporte, conforme as normas vigentes.
        `);
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
                    `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.
                `
            ]
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
        let empresa = (p.empresa || p.loja || '').trim();
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
        paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face desta empresa.`);

        if (p.contrato || p.pedido) {
            paragrafos.push(`Sou titular do contrato / pedido / instalação identificado como "${p.contrato || p.pedido}", firmado com esta prestadora.`);
        }

        paragrafos.push(paragrafoMotivo);

        paragrafos.push(`Diante do exposto, e amparado pelas normas do Código de Defesa do Consumidor (Lei 8.078/1990), exijo o atendimento e a resolução imediata desta solicitação. A ausência de solução pacífica no prazo razoável ensejará a abertura de reclamações junto aos órgãos de proteção ao crédito (PROCON, Consumidor.gov) e o ajuizamento de ação competente para reparação de danos.`);

        return {
            aiOk: aiOk,
            doc: {
                saudacao: `${temEmpresa ? `À empresa ${empresa}` : 'Ao Fornecedor'} - A/C Setor de Atendimento ao Cliente e Jurídico`,
                corpo_paragrafos: paragrafos
            }
        };
    }

    // --- MOTORES DE GERAÇÃO DE TEXTO (TEMPLATES) ---

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
            paragrafos.push(`O(A) menor viajará desacompanhado(a), sob os cuidados e responsabilidade da companhia de transporte, conforme as normas vigentes.
        `);
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
                    `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.
                `
            ]
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
        let empresa = (p.empresa || p.loja || '').trim();
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
        paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face desta empresa.`);

        if (p.contrato || p.pedido) {
            paragrafos.push(`Sou titular do contrato / pedido / instalação identificado como "${p.contrato || p.pedido}", firmado com esta prestadora.`);
        }

        paragrafos.push(paragrafoMotivo);

        paragrafos.push(`Diante do exposto, e amparado pelas normas do Código de Defesa do Consumidor (Lei 8.078/1990), exijo o atendimento e a resolução imediata desta solicitação. A ausência de solução pacífica no prazo razoável ensejará a abertura de reclamações junto aos órgãos de proteção ao crédito (PROCON, Consumidor.gov) e o ajuizamento de ação competente para reparação de danos.`);

        return {
            aiOk: aiOk,
            doc: {
                saudacao: `${temEmpresa ? `À empresa ${empresa}` : 'Ao Fornecedor'} - A/C Setor de Atendimento ao Cliente e Jurídico`,
                corpo_paragrafos: paragrafos
            }
        };
    }

    // --- MOTORES DE GERAÇÃO DE TEXTO (TEMPLATES) ---

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
            paragrafos.push(`O(A) menor viajará desacompanhado(a), sob os cuidados e responsabilidade da companhia de transporte, conforme as normas vigentes.
        `);
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
                    `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.
                `
            ]
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
        let empresa = (p.empresa || p.loja || '').trim();
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
        paragrafos.push(`Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio deste documento formalizar notificação e requerimento extrajudicial em face desta empresa.`);

        if (p.contrato || p.pedido) {
            paragrafos.push(`Sou titular do contrato / pedido / instalação identificado como "${p.contrato || p.pedido}", firmado com esta prestadora.`);
        }

        paragrafos.push(paragrafoMotivo);

        paragrafos.push(`Diante do exposto, e amparado pelas normas do Código de Defesa do Consumidor (Lei 8.078/1990), exijo o atendimento e a resolução imediata desta solicitação. A ausência de solução pacífica no prazo razoável ensejará a abertura de reclamações junto aos órgãos de proteção ao crédito (PROCON, Consumidor.gov) e o ajuizamento de ação competente para reparação de danos.`);

        return {
            aiOk: aiOk,
            doc: {
                saudacao: `${temEmpresa ? `À empresa ${empresa}` : 'Ao Fornecedor'} - A/C Setor de Atendimento ao Cliente e Jurídico`,
                corpo_paragrafos: paragrafos
            }
        };
    }

    // --- MOTORES DE GERAÇÃO DE TEXTO (TEMPLATES) ---

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
            paragrafos.push(`O(A) menor viajará desacompanhado(a), sob os cuidados e responsabilidade da companhia de transporte, conforme as normas vigentes.
        `);
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
                    `Diante do exposto, REQUER-SE o recebimento desta defesa, com o consequente DEFERIMENTO do pedido, determinando-se o cancelamento do Auto de Infração e a anulação de qualquer pontuação imposta ao prontuário do condutor.
                `
            ]
        };
    }

    function gerarReembolsoPassagem(p) {
        return {
            saudacao: `À Companhia Aérea ${p.cia || '____________________'} - A/C Departamento Jurídico e Atendimento ao Cliente`,
            corpo_paragrafos: [
                `Eu, ${p.nome || '____________________'}, portador(a) do CPF nº ${p.cpf || '___________'}, venho por meio desta Notificação Extrajudicial solicitar o reembolso de passagem aérea cancelada, conforme os dados abaixo.`,
                `Reserva: ${p.reserva || '___________'} | Voo: ${p.voo || '___'} | Data do voo: ${p.data_voo || '___/___/____'}`,
                `Valor pago: ${p.valor_pago || 'R$ ______,__'} | Companhia: ${p.cia || '____________________'} | Motivo: ${p.motivo || '____________________'}`,
                `O art. 740