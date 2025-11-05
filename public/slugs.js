// public/slugs.js
window.SLUGS = [
    // Academias — marcas
    { slug: "carta-cancelamento-smart-fit", title: "Carta de Cancelamento — Smart Fit", brand: "Smart Fit", tipo: "cancelamento" },
    { slug: "carta-reclamacao-smart-fit-cobranca-indevida", title: "Reclamação por Cobrança Indevida — Smart Fit", brand: "Smart Fit", tipo: "reclamacao" },

    { slug: "carta-cancelamento-bluefit", title: "Carta de Cancelamento — Bluefit", brand: "Bluefit", tipo: "cancelamento" },
    { slug: "carta-reclamacao-bluefit-cobranca-indevida", title: "Reclamação por Cobrança Indevida — Bluefit", brand: "Bluefit", tipo: "reclamacao" },

    { slug: "carta-cancelamento-selfit", title: "Carta de Cancelamento — Selfit", brand: "Selfit", tipo: "cancelamento" },
    { slug: "carta-reclamacao-selfit-cobranca-indevida", title: "Reclamação por Cobrança Indevida — Selfit", brand: "Selfit", tipo: "reclamacao" },

    { slug: "carta-cancelamento-bodytech", title: "Carta de Cancelamento — Bodytech", brand: "Bodytech", tipo: "cancelamento" },
    { slug: "carta-reclamacao-bodytech-cobranca-indevida", title: "Reclamação por Cobrança Indevida — Bodytech", brand: "Bodytech", tipo: "reclamacao" },

    // Academias — situações comuns
    { slug: "carta-cancelamento-academia-por-mudanca-de-cidade", title: "Carta de Cancelamento de Academia por Mudança de Cidade", brand: "Academia", tipo: "cancelamento" },
    { slug: "carta-cancelamento-academia-por-motivo-de-saude", title: "Carta de Cancelamento por Motivo de Saúde — Academia", brand: "Academia", tipo: "cancelamento" },
    { slug: "carta-cancelamento-academia-fim-de-fidelidade", title: "Carta de Cancelamento — Fim de Fidelidade (Academia)", brand: "Academia", tipo: "cancelamento" },
    { slug: "carta-cancelamento-academia-fechamento-da-unidade", title: "Carta de Cancelamento por Fechamento da Unidade — Academia", brand: "Academia", tipo: "cancelamento" },
    { slug: "carta-reclamacao-academia-servico-nao-prestado", title: "Reclamação por Serviço Não Prestado — Academia", brand: "Academia", tipo: "reclamacao" },
    { slug: "carta-reclamacao-academia-problema-na-cobranca", title: "Reclamação por Problema na Cobrança — Academia", brand: "Academia", tipo: "reclamacao" },

    // Operadoras — Vivo, Claro, TIM, Oi, SKY
    { slug: "carta-cancelamento-vivo-fibra", title: "Carta de Cancelamento — Vivo Fibra", brand: "Vivo", tipo: "cancelamento" },
    { slug: "carta-cancelamento-vivo-movel", title: "Carta de Cancelamento — Vivo Móvel", brand: "Vivo", tipo: "cancelamento" },
    { slug: "carta-reclamacao-vivo-cobranca-indevida", title: "Reclamação por Cobrança Indevida — Vivo", brand: "Vivo", tipo: "reclamacao" },

    { slug: "carta-cancelamento-claro-net", title: "Carta de Cancelamento — Claro NET", brand: "Claro", tipo: "cancelamento" },
    { slug: "carta-cancelamento-claro-movel", title: "Carta de Cancelamento — Claro Móvel", brand: "Claro", tipo: "cancelamento" },
    { slug: "carta-reclamacao-claro-cobranca-indevida", title: "Reclamação por Cobrança Indevida — Claro", brand: "Claro", tipo: "reclamacao" },

    { slug: "carta-cancelamento-tim", title: "Carta de Cancelamento — TIM", brand: "TIM", tipo: "cancelamento" },
    { slug: "carta-reclamacao-tim-cobranca-indevida", title: "Reclamação por Cobrança Indevida — TIM", brand: "TIM", tipo: "reclamacao" },

    { slug: "carta-cancelamento-oi", title: "Carta de Cancelamento — Oi", brand: "Oi", tipo: "cancelamento" },
    { slug: "carta-reclamacao-oi-cobranca-indevida", title: "Reclamação por Cobrança Indevida — Oi", brand: "Oi", tipo: "reclamacao" },
    { slug: "carta-cancelamento-sky-tv", title: "Carta de Cancelamento — SKY TV", brand: "SKY", tipo: "cancelamento" },
    { slug: "carta-reclamacao-sky-cobranca-indevida", title: "Reclamação por Cobrança Indevida — SKY", brand: "SKY", tipo: "reclamacao" },

    // Planos de saúde
    { slug: "carta-cancelamento-plano-de-saude", title: "Carta de Cancelamento — Plano de Saúde", brand: "Plano de Saúde", tipo: "cancelamento" },
    { slug: "carta-reclamacao-plano-de-saude-negativa-de-atendimento", title: "Reclamação — Negativa de Atendimento (Plano de Saúde)", brand: "Plano de Saúde", tipo: "reclamacao" },

    // Operadoras — genéricos
    { slug: "carta-cancelamento-internet", title: "Carta de Cancelamento — Internet (genérico)", brand: "Operadora", tipo: "cancelamento" },
    { slug: "carta-cancelamento-tv-por-assinatura", title: "Carta de Cancelamento — TV por Assinatura", brand: "Operadora", tipo: "cancelamento" },
    { slug: "carta-cancelamento-telefonia-movel", title: "Carta de Cancelamento — Telefonia Móvel", brand: "Operadora", tipo: "cancelamento" },
    { slug: "carta-reclamacao-cobranca-indevida-internet", title: "Reclamação — Cobrança Indevida (Internet)", brand: "Operadora", tipo: "reclamacao" },
    { slug: "carta-reclamacao-cobranca-indevida-tv", title: "Reclamação — Cobrança Indevida (TV)", brand: "Operadora", tipo: "reclamacao" },

    // Consumo (pacote A)
    { slug: "carta-direito-arrependimento-ecommerce", title: "Carta — Direito de Arrependimento (7 dias, e‑commerce)", brand: "Consumo", tipo: "cancelamento" },
    { slug: "carta-troca-ou-devolucao-produto", title: "Carta — Troca/Devolução de Produto", brand: "Consumo", tipo: "reclamacao" },

    // Bagagem (produto em bagagem.html, mas doc para /doc também)
    { slug: "carta-bagagem-extraviada", title: "Carta — Bagagem Extraviada (companhia aérea)", brand: "Bagagem", tipo: "reclamacao" },
    { slug: "carta-bagagem-danificada", title: "Carta — Bagagem Danificada (companhia aérea)", brand: "Bagagem", tipo: "reclamacao" },

    // Academias — variações com unidade
    { slug: "carta-cancelamento-smart-fit-unidade", title: "Carta de Cancelamento — Smart Fit (informar unidade)", brand: "Smart Fit", tipo: "cancelamento" },
    { slug: "carta-cancelamento-bluefit-unidade", title: "Carta de Cancelamento — Bluefit (informar unidade)", brand: "Bluefit", tipo: "cancelamento" },
    { slug: "carta-cancelamento-selfit-unidade", title: "Carta de Cancelamento — Selfit (informar unidade)", brand: "Selfit", tipo: "cancelamento" },
    { slug: "carta-cancelamento-bodytech-unidade", title: "Carta de Cancelamento — Bodytech (informar unidade)", brand: "Bodytech", tipo: "cancelamento" },

    // Pacote B — Consumo/E‑commerce
    { slug: "carta-produto-nao-entregue-ecommerce", title: "Carta — Produto não entregue (e‑commerce)", brand: "Consumo", tipo: "reclamacao" },
    { slug: "carta-produto-diferente-do-anunciado", title: "Carta — Produto diferente do anunciado", brand: "Consumo", tipo: "reclamacao" },
    { slug: "carta-produto-com-defeito-garantia", title: "Carta — Produto com defeito (garantia legal)", brand: "Consumo", tipo: "reclamacao" },
    { slug: "carta-solicitacao-reembolso-compra-online", title: "Carta — Solicitação de reembolso (compra online)", brand: "Consumo", tipo: "reclamacao" },
    { slug: "carta-reclamacao-entrega-atrasada", title: "Carta — Atraso na entrega (e‑commerce)", brand: "Consumo", tipo: "reclamacao" },

    // Pacote B — Cartão/Bancos
    { slug: "carta-contestacao-lancamento-cartao-de-credito", title: "Carta — Contestação de lançamento (cartão de crédito)", brand: "Cartão de Crédito", tipo: "reclamacao" },
    { slug: "carta-reclamacao-anuidade-cartao", title: "Carta — Reclamação de anuidade (cartão)", brand: "Cartão de Crédito", tipo: "reclamacao" },
    { slug: "carta-reclamacao-cobranca-indevida-cartao", title: "Carta — Cobrança indevida (cartão)", brand: "Cartão de Crédito", tipo: "reclamacao" },
    { slug: "carta-encerramento-conta-corrente", title: "Carta — Encerramento de conta corrente", brand: "Banco", tipo: "cancelamento" },
    { slug: "carta-reclamacao-tarifa-bancaria", title: "Carta — Cobrança de tarifa bancária", brand: "Banco", tipo: "reclamacao" },

    // Pacote B — Streaming/assinaturas/serviços
    { slug: "carta-cancelamento-assinatura-servico-online", title: "Carta — Cancelamento de assinatura (serviço online)", brand: "Assinatura", tipo: "cancelamento" },
    { slug: "carta-cancelamento-servico-streaming", title: "Carta — Cancelamento de serviço de streaming", brand: "Streaming", tipo: "cancelamento" },
    { slug: "carta-cancelamento-clube-de-assinatura", title: "Carta — Cancelamento de clube de assinatura", brand: "Assinatura", tipo: "cancelamento" },

    // Pacote B — Educação
    { slug: "carta-cancelamento-curso-online", title: "Carta — Cancelamento de curso online", brand: "Educação", tipo: "cancelamento" },
    { slug: "carta-cancelamento-curso-idiomas", title: "Carta — Cancelamento de curso de idiomas", brand: "Educação", tipo: "cancelamento" },
    { slug: "carta-reclamacao-curso-nao-prestado", title: "Carta — Reclamação de curso não prestado", brand: "Educação", tipo: "reclamacao" },

    // Pacote B — Saúde
    { slug: "carta-reclamacao-negativa-procedimento-plano", title: "Carta — Negativa de procedimento (plano de saúde)", brand: "Plano de Saúde", tipo: "reclamacao" },
    { slug: "carta-reclamacao-reembolso-plano-de-saude", title: "Carta — Solicitação de reembolso (plano de saúde)", brand: "Plano de Saúde", tipo: "reclamacao" },

    // Pacote B — Aéreas/voos
    { slug: "carta-reembolso-voo-cancelado", title: "Carta — Reembolso por voo cancelado", brand: "Companhia Aérea", tipo: "reclamacao" },
    { slug: "carta-reembolso-voo-atraso", title: "Carta — Reembolso por atraso de voo", brand: "Companhia Aérea", tipo: "reclamacao" },
    { slug: "carta-reclamacao-atraso-voo", title: "Carta — Reclamação por atraso de voo", brand: "Companhia Aérea", tipo: "reclamacao" },

    // Pacote B — Utilidades (energia/água)
    { slug: "carta-reclamacao-cobranca-indevida-energia", title: "Carta — Cobrança indevida (energia)", brand: "Energia", tipo: "reclamacao" },
    { slug: "carta-reclamacao-cobranca-indevida-agua", title: "Carta — Cobrança indevida (água)", brand: "Água", tipo: "reclamacao" },
    { slug: "carta-reclamacao-queda-energia-danos-aparelhos", title: "Carta — Queda de energia com danos em aparelhos", brand: "Energia", tipo: "reclamacao" },

    // Pacote B — Internet
    { slug: "carta-reclamacao-internet-lenta", title: "Carta — Internet lenta", brand: "Operadora", tipo: "reclamacao" },
    { slug: "carta-reclamacao-queda-frequente-internet", title: "Carta — Queda frequente de internet", brand: "Operadora", tipo: "reclamacao" },

    // Pacote B — Academia adicionais
    { slug: "carta-solicitacao-congelamento-plano-academia", title: "Carta — Solicitação de congelamento de plano (academia)", brand: "Academia", tipo: "reclamacao" },
    { slug: "carta-solicitacao-estorno-academia", title: "Carta — Solicitação de estorno (academia)", brand: "Academia", tipo: "reclamacao" },

    // Pacote B — Aluguel/Condomínio/Seguros
    { slug: "carta-rescisao-contrato-aluguel-residencial", title: "Carta — Rescisão de contrato de aluguel (residencial)", brand: "Aluguel", tipo: "cancelamento" },
    { slug: "carta-notificacao-atraso-aluguel", title: "Carta — Notificação por atraso de aluguel", brand: "Aluguel", tipo: "reclamacao" },
    { slug: "carta-reclamacao-barulho-condominio", title: "Carta — Reclamação por barulho (condomínio)", brand: "Condomínio", tipo: "reclamacao" },
    { slug: "carta-solicitacao-segunda-via-boleto-condominio", title: "Carta — Solicitação de 2ª via de boleto (condomínio)", brand: "Condomínio", tipo: "reclamacao" },
    { slug: "carta-cancelamento-seguro", title: "Carta — Cancelamento de seguro", brand: "Seguro", tipo: "cancelamento" },

    // Pacote B — Entregas/transportadoras
    { slug: "carta-reclamacao-falha-entrega-transportadora", title: "Carta — Reclamação por falha de entrega (transportadora)", brand: "Consumo", tipo: "reclamacao" },
    { slug: "carta-reclamacao-servico-tecnico-nao-executado", title: "Carta — Reclamação por serviço técnico não executado", brand: "Consumo", tipo: "reclamacao" },
    { slug: "carta-reclamacao-cobranca-servico-nao-contratado", title: "Carta — Cobrança por serviço não contratado", brand: "Consumo", tipo: "reclamacao" },
    { slug: "carta-solicitacao-limpeza-nome-apos-pagamento", title: "Carta — Solicitação de limpeza de nome após pagamento", brand: "Consumo", tipo: "reclamacao" }
];