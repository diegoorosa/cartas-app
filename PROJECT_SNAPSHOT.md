# PROJECT SNAPSHOT — CartasApp

## Stack
- Front: HTML/CSS/JS estático (Netlify)
- Funções: Netlify Functions (generate-doc, mp-checkout, mp-webhook, order-status)
- Banco: Supabase (orders, generations)
- Pagamento: Mercado Pago Checkout Pro
- IA: Gemini 2.0 flash (GEMINI_MODELS: gemini-2.0-flash-exp,gemini-2.0-flash)
- Analytics/Ads: gtag Google Ads (ID AW-1021062139)

## URLs
- Site: https://cartasapp.netlify.app
- Gerador de cartas: /doc.html?slug=... (também responde a /doc/{slug})
- Autorização viagem: /viagem.html
- Bagagem: /bagagem.html
- Guias SEO: raiz (ex.: /menor-nacional-um-responsavel.html, /bagagem-extraviada.html)
- Redirect Netlify: /doc/* -> /doc.html (200)

## Conversão Google Ads
- Ação: Compra_Paga
- send_to: AW-1021062139/eWBbCPil_7kbEPvX8OYD
- Disparo: somente quando status=paid; transaction_id = orderId

## Campanhas Google Ads
- Campanha: CartasBR_Search_01
- Orçamento: R$ 3,00/dia
- Lances: Cliques com CPC máx (definir em Configurações > Lances)
- Regra pausa: “Pausar CartasBR se custo Hoje > R$3” (a cada hora, só na campanha CartasBR)
- Regra reativação: “Ativar CartasBR 00:05” diariamente

## Produtos ativos
- Cartas: cancelamento/reclamação (academias, operadoras, plano de saúde)
- Autorização de Viagem para Menor (viagem.html)
- Bagagem Extraviada/Danificada (bagagem.html)

## Preço
- R$ 6,90 (MP taxa ~R$0,35; IA ~R$0,01)

## Estado atual
- Anúncios: SmartFit/Bluefit/Vivo em análise/rodando; Viagem e Bagagem criados.
- SEO: Guias de viagem no ar; guias de bagagem no ar; sitemap atualizado.
- Pendências: acompanhar Impressões/KWs; subir CPC máx p/ 1,20 por 24h se não imprimir.

## “Restart prompt” (para nova conversa em outra IA)
Contexto: site Netlify com HTML/JS, funções Netlify (generate-doc, mp-checkout, mp-webhook, order-status), Supabase (orders/generations), Mercado Pago Checkout Pro, Gemini 2.0 flash. URLs: https://cartasapp.netlify.app. Conversão Google Ads: Compra_Paga (AW-1021062139/eWBbCPil_7kbEPvX8OYD), transaction_id = orderId. Produtos: Cartas (academias/operadoras), Autorização de viagem (viagem.html), Bagagem (bagagem.html). Preço R$ 6,90. Entregue arquivos inteiros “prontos para colar”, sem comentários. Onde paramos: ajustar doc.html para aceitar /doc/{slug}; substituir slugs.js completo; sitemap com URLs /doc/{slug}. Em sequência, Ads de Bagagem (R$3/dia) e pacote de 120 slugs programáticos.
