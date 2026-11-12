# Log de Sessão — Auditoria, Segurança e SEO do CartasApp

Última atualização: 2026-06-19. Projeto oficial: `C:\Users\Administrador\Desktop\cartas-app` (NÃO confundir com `C:\Users\Administrador\Desktop\cartas`, que é uma cópia não-oficial).

Repo git: https://github.com/diegoorosa/cartas-app.git — branch `main`.

## Como retomar
Diga "continua o que estávamos fazendo no cartas-app" ou referencie este arquivo. Itens pendentes estão na seção "O QUE FICOU PENDENTE" no final.

## Contexto do disparo inicial
Site `www.cartasapp.com.br/viagem` quebrou (formulário desapareceu) após um outro agente ter feito mudanças. Investigamos, corrigimos, e depois expandimos para auditoria geral de SEO, segurança e credibilidade visual.

## O QUE FOI FEITO (em ordem cronológica, com commits)

### 1. Bugs que quebraram `/viagem` (commits `690cd9e`, `42c186c`)
- **Causa raiz 1**: commit `59b7d55` ("P0 Critical fixes") removeu o "modo admin" de `viagem.html` mas deixou uma chave `}` órfã no JS — `SyntaxError` que travava todo o script, inclusive o que renderiza o formulário. Corrigido removendo a chave.
- **Causa raiz 2**: commit `fbd3cdb` apagou 505 linhas de CSS achando que estava limpando só o contador fake/rolling-feed, mas levou junto `.testimonial-card`, `.testimonial-avatar`, `.verified-badge`, `.urgency-badge`, `.pay-box`, `.mp-protected-badge`, overrides mobile de botões/inputs/FAQ. Restaurado tudo, exceto o que devia mesmo sair (contador fake, rolling-feed).

### 2. Auditoria de SEO do `/viagem` (commits `190373c`, `2f85388`)
- CSP bloqueava Microsoft Clarity (domínio errado: `www.clarity.ms` em vez de `*.clarity.ms`) e o rastreamento de conversão do Google Ads (doubleclick.net não estava liberado) — corrigido em `public/_headers`.
- `<link rel="preload">` apontava para `/logo.webp` e `/logo.avif`, arquivos que nunca existiram (404 toda carga) — trocado para `/logo.png` (existe).
- JSON-LD inválido em 16 páginas: comentário JS dentro de bloco JSON (15 páginas, breadcrumb) + `"@type": Answer` sem aspas (`academia-faq.html`).
- Preço desatualizado (R$9,90 em vez de R$39,90) em 15 páginas do cluster de viagem que linkam para `/viagem.html`. Recalculado também o "custo total" combinado com taxa de cartório em `quanto-custa-autorizacao-viagem.html` (R$37,90-81,90 → R$57,90-101,90).
- Adicionado Open Graph + Twitter Card em `viagem.html` (não existia — preview feio no WhatsApp).
- Decisão tomada COM o usuário: não criar redirect `/viagem` → `/viagem.html`, pois o Google Ads usa a URL sem `.html` como landing page e um redirect adicionaria latência. O canonical já resolve a duplicidade pro Google orgânico.
- Removidas páginas órfãs `viagemold.html` a `viagemold5.html` (não linkadas, fora do sitemap).
- Title de `viagem.html`: 81 → 44 caracteres ("Autorização de Viagem para Menor | CartasApp").
- Meta description: 172 → 152 caracteres.
- Adicionado `BreadcrumbList` JSON-LD em `viagem.html` (faltava na página principal).
- Anchor text genérico melhorado em 2 lugares ("Começar Agora" e "Gerar Agora" → textos descritivos).

### 3. Limpeza visual/credibilidade do `/viagem` (commits `19f1fb7`, `530dce4`)
Motivação: usuário achou o site "colorido demais, cheio de ícone, parece falso, precisa parecer sério/jurídico/confiável".
- Removido selo duplicado "Conforme CNJ 295/2019" (aparecia 2x).
- Removida alegação de urgência falsa "Últimos 12 documentos emitidos hoje" (texto fixo, não real — mesma categoria do contador fake já removido antes).
- Trocado emoji decorativo (✅🔒🛡️⚖️👁️📌💸) por texto limpo ou ícones SVG outline (mesma linguagem visual usada no badge do hero) em ~10 lugares, incluindo o "olho gigante" do passo "Confira" e os ícones do "Preencha/Confira/Baixe".
- Avatares dos depoimentos: gradiente arco-íris (roxo/verde/laranja) → tom navy/slate único.
- `style.css`: removida a animação de flutuação dos blobs do hero (ficava "vivo"/playful demais) e unificado azul+ciano em um único tom de azul mais sutil — isso é CSS compartilhado, então já se aplica a TODAS as páginas do site automaticamente.

### 4. Segurança + credibilidade nas páginas que vendem (commit `402c038`)
Identificamos que essas mesmas práticas problemáticas (emoji decorativo, ofertas falsas) estavam espalhadas pelo site inteiro — não só no `/viagem`. Decisão do usuário: tratar só as páginas com checkout real, não as ~90 páginas de conteúdo/FAQ/blog.

Páginas tratadas: `doc.html` (template genérico usado por dezenas de produtos via `/doc/*`), `multa.html`, `bagagem.html`, `ecommerce.html`, `negativacao-indevida.html`, `contestacao-cartao.html`, `plano-saude-negativa.html`, `reembolso-cancelamento-passagem.html`, `arrependimento-compra-online.html`.

Em cada uma:
- **SEGURANÇA**: removido o backdoor client-side `?modo=admin` (criava botão "👑 Gerar Admin" que chamava `generate-doc` com `admin_key`). Esse backdoor só tinha sido removido de `viagem.html` no commit P0 anterior — continuava ativo em TODAS as outras páginas de checkout.
- Removida a "Oferta hoje: de R$29,90 por R$9,90" com timer "⚡ O preço pode voltar ao normal em breve" — esses produtos sempre custaram R$9,90 (confirmado no `PRICE_MAP` de `netlify/functions/price-map.js`), nunca houve desconto real. Era um preço-âncora e urgência fabricados.
- Removida claim fabricada "⭐️ 4,9 de 5 — centenas de [clientes] já usaram..." (sem sistema de avaliação real por trás).
- Emoji decorativo trocado por texto limpo/SVG nos badges de feature e garantia.
- Removido `ecom.html` (rascunho antigo órfão, substituído por `ecommerce.html`).

## ARQUIVOS-CHAVE PARA CONTEXTO FUTURO
- `netlify/functions/price-map.js` — `PRICE_MAP` com o preço real de cada produto (importado por `mp-checkout.js`). **Importante**: só `autorizacao-viagem-menor` custa R$39,90; `recurso-multa-transito`, `carta-bagagem`, `carta-reembolso-*` custam R$19,90; todo o resto é R$9,90. Antes de "corrigir" qualquer preço em qualquer página, checar esse mapa primeiro.
- `netlify/functions/generate-doc.js` — gera o texto dos documentos, roteamento por slug.
- `netlify.toml` — redirect `/doc/*` → `/doc.html` (200, não 301) é o que torna `doc.html` um template genérico pra dezenas de produtos.
- `public/style.css` — CSS compartilhado por ~100 páginas. Qualquer mudança nele se propaga pra tudo automaticamente (foi assim que a animação do hero e a cor dos blobs foram corrigidas em todas as páginas de uma vez).
- `public/_headers` — Content-Security-Policy. Cuidado ao adicionar CSP mais restritivo sem testar Clarity/Google Ads em produção (foi exatamente isso que quebrou silenciosamente antes).

## O QUE FICOU PENDENTE (não foi feito, decisão consciente ou falta de tempo)
1. As ~90 páginas restantes (blog, FAQs, guias de conteúdo) **não** receberam o mesmo tratamento visual/credibilidade (emoji, ofertas, badges) — só as 9 páginas de venda + `/viagem` foram tratadas. Pode ter os mesmos padrões problemáticos.
2. SEO (title/description/breadcrumb/anchor text) só foi otimizado no `/viagem`. As outras páginas não foram auditadas.
3. Performance real (Core Web Vitals, Lighthouse) nunca foi medida — só removemos o que estava claramente quebrado (404s).
4. Nunca testamos um pagamento real ponta a ponta no Mercado Pago após as mudanças.
5. Não confirmamos se o Google Ads/Clarity estão de fato recebendo dados de conversão agora que o CSP foi corrigido (precisa checar no painel do Google Ads/Clarity, não só no código).
6. Responsividade mobile testada só visualmente num viewport, não em dispositivos reais.
7. Acessibilidade (a11y) nunca foi auditada.
8. Possível canibalização de palavra-chave entre 3 páginas que competem pelo mesmo tema ("guia completo de autorização de viagem", "guia definitivo de viagem menor", "como fazer autorização de viagem para menor") — só foi apontada, nunca investigada a fundo.
9. Logo em formato moderno (webp/avif) nunca foi gerado de fato — só removemos o preload quebrado que apontava pra arquivos inexistentes. Se quiser otimização real de imagem, precisa instalar uma ferramenta de conversão (sharp, imagemagick) e gerar os arquivos.
10. As ~40 páginas que mostram "R$9,90" e que confirmamos estarem com preço CORRETO (produtos diferentes do de viagem) nunca passaram por revisão visual/credibilidade.

## Commits desta sessão (em ordem)
`690cd9e` → `42c186c` → `190373c` → `19f1fb7` → `530dce4` → `402c038` → `2f85388`

## Sprint de Monetizacao (2026-10-13 a 2026-11-09) â€” CRESCIMENTO REAL

### Contexto
Dono pediu analise completa: vendas baixissimas, precisa de renda. Dados GSC exportados + relatorio de termos Google Ads + acesso ao Supabase (chaves passadas pelo dono, salvas so no .env local, nunca commitadas).

### Diagnostico inicial (01/set a 12/out)
- 223 cliques no Ads (R$ 136,43), ~2 conversoes registradas (tag de conversao inativa desde setembro).
- Vendas reais: apenas 3 em 42 dias (15 "vendas" eram testes do proprio dono - filtrar e-mails diegosch.rosa@ / diego.sch.rosa@ e nomes Fernanda/Frare/Fabricio/Lisa).
- Funil real: 18 checkouts -> 3 vendas = 17%, com 13 dos 15 abandonos no produto de viagem.
- Abandonos chegavam a criar checkout_intent (que so e criado no clique de "Confirmar e Pagar"), ou seja: o abandono acontecia NA PAGINA DO MERCADO PAGO.

### Mudancas aplicadas (commits)
1. `e7228bb` - title/description de cancelar-contrato-academia-multa (47k impressoes, CTR 0,76%) + CTA primario acima da dobra.
2. `666c7e3` - titles de 5 paginas com CTR < 1,5% (guarda-compartilhada, madrasta, smart-fit, cruzeiro, reembolso) + CTA no topo de quanto-custa-autorizacao.
3. `2a4d465` - correcao da tag de conversao no success.html (enhanced conversions, valor dinamico 9,90/19,90/39,90, dedupe com onceConv) + gtag AW/G- na cobranca.html. Edicao original feita pelo dono com Gemini; revisada e validada (node --check) antes do push.
4. `53254e8` - tranquilizacao de pagamento no modal pre-pagamento de 89 paginas (MP/Pix sem conta/entrega 1 min/garantia 7 dias).
5. `5be516e` - mesma mensagem no e-mail de recuperacao de carrinho (send-email.js).
6. `8681f55` - nova pagina sazonal viagem-menor-ferias-fim-de-ano.html + link interno + sitemap.
7. Guias de telefonia: cancelar-vivo-fibra-guia (title + CTA direto no produto + sticky mobile), claro-net/tim/sky-tv (CTA /telefonia.html -> /doc.html?slug=... + CTA primario no topo).

### Resultado medido (20/out a 09/nov, via Supabase)
- 8 vendas reais (6 viagem R$39,90 + 2 smart-fit R$9,90) = R$ 259,20 em 3 semanas (~11-12 vendas/mes vs 3 em 42 dias antes).
- Funil: 16 checkouts reais -> 8 vendas = **50% de conversao** (antes 17%).
- Atribuicao: 1-2 vendas via Ads (utm google), maioria organico/direto, recuperacao por e-mail convertendo (ex.: Francine 29/out voltou com VOLTA10).
- Ressalva: novembro e inicio de alta temporada de viagem; parte do crescimento pode ser sazonal.

### Como repetir esta analise
- Credenciais: .env local (gitignored): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. URL do projeto: https://jnfbdirnvjlhgjuilguz.supabase.co
- Vendas = linhas em `generations` (slug + input_json.email). Checkouts = `checkout_intents` (payload.email + utm). payment_id em checkout_intents fica sempre null; use generations como fonte de venda.
- SEMPRE filtrar testes do dono: diegosch.rosa@gmail.com, diego.sch.rosa@gmail.com.
- Relatorio de termos Ads: CSV exportado do painel (colunas: Termo, Cliques, Impr., Custo, Conversoes). Negativar termos: net, cnj, conselho nacional de justica, notariado.


### Rodada 2 (2026-11-09) â€” CTR + funil nas pÃ¡ginas de maior trÃ¡fego

Auditoria: cruzei todas as pÃ¡ginas do GSC (>=200 impressÃµes) com a presenÃ§a real de funil de venda no HTML. Resultado: as pÃ¡ginas de viagem jÃ¡ tinham CTA para `/viagem.html`; o problema delas Ã© CTR/posiÃ§Ã£o. As reais oportunidades eram tÃ­tulos truncados e CTAs quebrados.

- **TÃ­tulos truncados corrigidos** (Google corta ~60 chars): `/cancelar-contrato-academia-multa` (82 â†’ 60) e `/quanto-custa-autorizacao-viagem` (91 â†’ 55; o preÃ§o R$ 39,90 estava sendo cortado do snippet).
- **TÃ­tulos reescritos em pÃ¡ginas com 0 clique**: `/multa-fidelidade-academia` (400 impr, 0 clique), `/como-reclamar-aneel-guia` (336/0 â€” tambÃ©m corrigido "Ãgua", que a ANEEL nÃ£o regula), `/quanto-custa-recorrer-multa` (308/0), `/guia-cobranca-indevida-energia` (416/2).
- **`/autorizacao-excursao-escolar`** (13.516 impr, 3Âº maior trÃ¡fego): CTA acima da dobra qualificado para excursÃ£o interestadual/com pernoite/formatura, CTA final com preÃ§o + garantia e sticky CTA mobile.
- **`/cancelar-contrato-academia-multa`** (47.758 impr, maior pÃ¡gina do site): sticky CTA mobile adicionado.
- **Bug de layout corrigido** em `/viajar-com-madrasta-padrasto` e `/viagem-cruzeiro-maritimo-menor`: o botÃ£o "Gerar autorizaÃ§Ã£o" estava FORA do card (depois de `</section>`, com 2 `</div>` sobrando â€” 12 fechamentos para 10 aberturas). Trocado por bloco `.article-cta` vÃ¡lido antes do footer.
- **CTAs de categoria â†’ produto direto** (um clique a menos): `/multa-fidelidade-academia` â†’ `carta-reclamacao-academia-problema-na-cobranca`; `/quanto-custa-recorrer-multa` â†’ `recurso-multa-transito` (R$ 19,90); `/guia-cobranca-indevida-energia` â†’ CTA direto ENEL + link para outras concessionÃ¡rias.
- **NÃ£o alterado de propÃ³sito**: `/cancelar-bluefit-guia-completo` (melhor vendedor; CTR 2,45% limitado por posiÃ§Ã£o, nÃ£o por snippet) e pÃ¡ginas de produto autocontidas (`reembolso-cancelamento-passagem`, `plano-saude-negativa`) que jÃ¡ chamam `mp-checkout` direto.

Como medir: GSC em 3-4 semanas (CTR das pÃ¡ginas alteradas) + Supabase (`generations`) para vendas. Lembrar que nov-dez Ã© alta temporada de viagem.



### Rodada 3 (2026-11-12) — CTR por intenção de busca + links internos (commit `76e5e54`)

Base: export GSC `https://www.cartasapp.com.br_-Performance-on-Search-2026-10-12` (11/jul–10/out, últimos 3 meses).
Totais: **2.104 cliques / 125.419 impressões / CTR 1,69% / posição ~6** (celular 1.138 cliques, desktop 957).

**Descoberta 1 — o CSV de Consultas não serve para totais.** O arquivo tem 1.000 linhas e cobre só 657 cliques / 23.348 impressões (cortado + consultas anonimizadas). Use `Páginas.csv` para totais e `Consultas.csv` apenas para temas. Além disso, `Import-Csv` do PowerShell falha nesse arquivo (quebras de linha dentro do campo) — usar `Microsoft.VisualBasic.FileIO.TextFieldParser` e validar com `TryParse` antes de converter CTR/posição.

**Descoberta 2 — a página sazonal não tem demanda orgânica.** Zero consultas contendo "férias", "fim de ano", "natal", "dezembro" ou "virada" em 1.000 consultas. `viagem-menor-ferias-fim-de-ano.html` tem 0 impressões no GSC e 1 único link interno. Ou seja: a página serve como landing para Ads/e-mail/interno, **não** como captura orgânica. A intenção sazonal real é capturada pelas consultas "autorização de viagem", que crescem em nov–dez.

**Descoberta 3 — páginas órfãs.** `/modelo-word-pdf-autorizacao-viagem` (1.117 impr, CTR 7,97% — a melhor do site), `/guarda-compartilhada-autorizacao-viagem` (1.740 impr, CTR 0,52%), `/viagem-cruzeiro-maritimo-menor` (2.216 impr, 1,22%) e `/autorizacao-excursao-escolar` (13.516 impr!) tinham apenas **2 links internos** cada. Links de entrada após a rodada: 7 / 7 / 7 / 6.

**Snippets reescritos (resposta-primeiro + número quando existe):**
| Página | Antes | Depois |
|---|---|---|
| `/cancelar-contrato-academia-multa` (47.758 impr, CTR 0,76%) | "Como Cancelar Academia sem Multa: Smart Fit e Bluefit (2026)" | "Cancelar Academia sem Multa: Seus Direitos e Nome Sujo" |
| `/cancelar-smart-fit-guia-completo` (2.327 impr, 3 cliques) | "Como Cancelar Smart Fit sem Pagar Multa: Passo a Passo 2026" | "Multa Smart Fit: Quanto Custa e Como Cancelar sem Pagar" |
| `/quanto-custa-notificacao-extrajudicial-cartorio` (1.805 impr, CTR 1%) | "Quanto Custa Notificação Extrajudicial no Cartório? \| CartasApp" | "Notificação Extrajudicial no Cartório: R$ 150 a R$ 380" |
| `/guarda-compartilhada-autorizacao-viagem` (CTR 0,52%) | "Guarda Compartilhada: Quando Precisa de Autorização de Viagem (2026)" | "Guarda Compartilhada: Posso Viajar com Meu Filho? (2026)" |
| `/viagem-cruzeiro-maritimo-menor` (CTR 1,22%) | "Cruzeiro com Menor: Documentos, Passaporte e Autorização (2026)" | "Cruzeiro Precisa de Passaporte? Regras por Destino (2026)" |
| `/autorizacao-viagem-menor-gol` (CTR 0,56%) | "Autorização de Viagem Menor GOL \| Voe Junto e Regras" | "Voe Junto GOL: O Que É, Preço e Quando É Obrigatório" |
| `/visto-eua-crianca` (330 impr, 0 clique) | "Visto Americano para Criança: Passo a Passo e Taxa 2026" | "Visto Americano para Criança: Precisa? Taxa US$ 185 (2026)" |
| `/modelo-word-pdf-autorizacao-viagem` | "Autorização de Viagem para Menor: Word e PDF 2026" | "Formulário de Autorização de Viagem para Menor: Word e PDF" |

Descrições atualizadas junto (og/twitter também) — regra: responder a pergunta na primeira metade e mostrar número (R$ 119,88 / R$ 150 a R$ 380 / US$ 185).

**Links internos adicionados:** bloco "Leia também" em `viagem.html` (antes de `</main>`), `autorizacao-excursao-escolar.html` e `modelo-word-pdf-autorizacao-viagem.html`; entradas extras nas listas "Relacionados" de `guarda-compartilhada-autorizacao-viagem.html`, `quanto-custa-autorizacao-viagem.html` e `viagem-cruzeiro-maritimo-menor.html`; link para `multa-fidelidade-academia.html` dentro de `cancelar-contrato-academia-multa.html`.

**Hipótese sobre a pág. de 47.758 impressões:** nenhuma consulta individual no export chega perto desse volume (máx. 1.642), então as impressões vêm de milhares de consultas de cauda longa sobre academia. Um título por marca (Smart Fit/Bluefit) só casa com uma intenção; por isso o título passou a cobrir "cancelar academia + multa + nome sujo". CTR esperado sobe de 0,76% para ~1,2–1,5%.

**O que NÃO foi feito de propósito:** não mexer em `/cancelar-bluefit-guia-completo` (CTR 2,45%, limitado por posição — é o melhor vendedor) e não alterar a página sazonal para "fingir" demanda que não existe.

**Como medir em 3–4 semanas:** GSC → CTR e posição das 8 URLs acima (esperado: smart-fit, notificação, guarda, cruzeiro, GOL, visto saindo de ~0,5% para 2%+); Supabase `generations` para vendas de viagem com `data_ida` entre 15/dez e 15/jan e UTMs `campaign=fim-de-ano` / `excursao-escolar`.

### Rodada 4 (2026-11-12) — diagnóstico: por que academia vende tão pouco (commit `e0b2083`)

Pergunta do dono: "venda de smart fit/bluefit não tem, é raro alguém comprar — é credibilidade? valor baixo? não é o que procuram?"

**Resposta medida (Supabase, 01/jul→12/nov = 4,5 meses, só vendas reais, testes do dono excluídos):**

| Linha | Vendas | Receita | % receita |
|---|---|---|---|
| Viagem (R$ 39,90) | 39 | R$ 1.556,10 | 96,3% |
| Academia (R$ 9,90) | 6 | R$ 59,40 | 3,7% |
| Outros | 2 | — | — |
| **Total** | **47** | **R$ 1.615,50** | |

Checkouts reais no mesmo período: **83** → 70 viagem, 12 academia, 1 curso.

**Conversão checkout→venda:** academia 12→6 = **50%**; viagem 70→39 = **56%**. Praticamente igual.

**Conclusão: NÃO é credibilidade nem preço.** Se fosse, a desistência apareceria no checkout — e ela não aparece (metade compra). O vazamento é ANTES do checkout.

**Onde vaza:** GSC mostra que das consultas visíveis de academia (457 cliques / 18.514 impr):
- **320 cliques (70%) = "como cancelar"** — a pessoa quer cancelar, a página ensina de graça (app/site/SAC), ela cancela e vai embora satisfeita.
- **38 cliques (8%) = "problema"** (multa, nome sujo, cobrança depois) — é o único grupo que realmente precisa de documento.
- O resto = navegação de marca.

Ou seja: academia tem **mais cliques que viagem** (~1.057 vs ~949 em 3 meses no GSC) e **1/26 da receita**. Receita por clique: ~R$ 0,04 (academia) vs ~R$ 1,09 (viagem), ~29x.

**Vazamento técnico encontrado:** as páginas de academia tocavam o assunto "cancelei e continuaram cobrando / negativaram meu nome" e então vendiam **carta de cancelamento** (produto errado para quem já cancelou). Pior: `carta-reclamacao-smart-fit-cobranca-indevida` e `carta-reclamacao-bluefit-cobranca-indevida` só existiam no `success.html` (upsell pós-compra) — nunca numa página de tráfego.

**Correção aplicada:**
- `como-cancelar-smart-fit.html`: na seção "Cancelei e Continuaram Cobrando", o CTA principal passou a ser a **reclamação de cobrança indevida** (CDC Art. 42, devolução em dobro), com link secundário para quem ainda não cancelou.
- `cancelar-contrato-academia-multa.html` (47,7k impr): CTA de reclamação adicionado dentro da seção "Academia pode sujar meu nome? (Serasa/SPC)".
- `cancelar-bluefit-guia-completo.html` (melhor vendedor): link de reclamação adicionado no CTA final, sem mexer no CTA principal.

**Teto honesto:** mesmo dobrando a conversão de academia (0,8% → 1,6% de clique→checkout), seriam ~12 vendas em 4,5 meses = ~R$ 119 em vez de R$ 59. É +R$ 60 no período. **Não vale investir mais conteúdo em academia** — o dinheiro está em viagem (R$ 39,90, 96% da receita, e o pico de dezembro está na janela de compra agora).

Se um dia quiser monetizar o tráfego de academia de verdade, o caminho não é documento: é captura de e-mail (lead magnet tipo "calculadora de multa") para vender depois. Fica registrado como ideia, não executado.
