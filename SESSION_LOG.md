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
