# PROJECT SNAPSHOT — CartasApp

## Stack
- Front: HTML/CSS/JS estático (Netlify)
- Funções: Netlify Functions (generate-doc, mp-checkout, mp-webhook, order-status)
- Banco: Supabase (orders, generations)
- Pagamento: Mercado Pago Checkout Pro
- IA: Gemini 2.0 flash (env: GEMINI_MODELS=gemini-2.0-flash-exp,gemini-2.0-flash)
- Analytics/Ads: gtag Google Ads (AW-1021062139)

## URLs
- Site: https://cartasapp.netlify.app
- Gerador cartas: /doc.html?slug=... e /doc/{slug}
- Viagem: /viagem.html
- Bagagem: /bagagem.html
- Guias SEO: páginas HTML na raiz (viagem e bagagem)
- Redirect Netlify: /doc/* -> /doc.html (200)

## Conversão Google Ads
- Ação: Compra_Paga
- send_to: AW-1021062139/eWBbCPil_7kbEPvX8OYD
- Disparo: somente quando status=paid; transaction_id = orderId

## Campanha Google Ads
- CartasBR_Search_01
- Orçamento: R$ 3/dia; CPC máx campanha: 0,90 (elevar p/ 1,20 por 24h se não imprimir)
- Regras: pausar custo>R$3 (hora a hora); reativar 00:05

## Produtos
- Cartas (academias, operadoras, plano de saúde)
- Autorização de viagem para menor (viagem.html)
- Bagagem extraviada/danificada (bagagem.html)
- Preço: R$ 6,90

## Estado
- Home com busca global ok
- Viagem v2 ok (autosave, validações)
- Guias viagem e bagagem publicados; sitemap atualizado

## Restart prompt
Contexto: site Netlify com HTML/JS, funções (generate-doc, mp-checkout, mp-webhook, order-status), Supabase (orders/generations), Mercado Pago, Gemini 2.0 flash. URLs: https://cartasapp.netlify.app. Conversão Ads: Compra_Paga (AW-1021062139/eWBbCPil_7kbEPvX8OYD), transaction_id = orderId. Produtos: Cartas, Viagem, Bagagem. Preço R$ 6,90. Entregar arquivos INTEIROS “prontos para colar”, sem comentários. Onde paramos: publicar Pacote B de slugs (abaixo) e acrescentar as URLs no sitemap.
