# Auditoria SEO completa — www.cartasapp.com.br (06/07/2026)

Rodada via `/seo audit`, 8 subagentes especializados (técnico, conteúdo/E-E-A-T,
schema, sitemap, performance, GEO/IA, SXO, Google APIs).

**SEO Health Score: 60/100**

| Categoria | Score |
|---|---|
| Técnico | 70 |
| Conteúdo/E-E-A-T | 47 |
| Schema | 58 |
| Sitemap | 62 |
| Performance | 78 |
| GEO (IA) | 58 |
| SXO | 57 |

**Dados reais (GA4, 90 dias):** 1.219 sessões orgânicas, **+69,8%** últimos 28 dias
vs anteriores. 47% do tráfego concentrado em 1 página
(`/modelo-word-pdf-autorizacao-viagem`). **GSC bloqueado** — API desabilitada no
projeto GCP `claude-seo-500301` (nº 915054547433) e service account não está na
propriedade.

## Achado-raiz (atravessa 4 auditorias)

As ~67 páginas `/doc/{slug}` eram renderizadas 100% via JS: HTML bruto idêntico
(title genérico, H1 placeholder, canonical apontando pro `/doc.html`). Isso gerava
duplicação técnica + conteúdo raso + zero schema por slug + invisibilidade total
para crawlers de IA (GPTBot/ClaudeBot/PerplexityBot não rodam JS). Um único fix
resolve os quatro sintomas — ver Item 1 abaixo.

## Itens Críticos

- [x] **1. Pré-renderizar `/doc/{slug}`** — `scripts/generate-doc-pages.js`
  gera as 67 páginas (title/H1/canonical/og/JSON-LD Service únicos por slug) a
  partir de `slugs.js` + `sitemap.xml`. Wired no `npm run build` (roda a cada
  deploy Netlify). Rodado localmente em 06/07/2026, arquivos em `public/doc/*.html`
  commitados.
- [x] **2. Destravar GSC** — usuário habilitou a API e adicionou a service
  account na propriedade `https://www.cartasapp.com.br/` (verificado
  06/07/2026 via `sites.list()`: `siteFullUser`). `sc-domain:` não foi
  adicionado (exigiria verificação DNS) — decisão deliberada, tráfego real
  já cai todo na propriedade www por causa do HSTS/redirect.
- [x] **3. Religar cluster de links** viagem.html ↔ guia-definitivo-viagem-menor.html
  ↔ quanto-custa-autorizacao-viagem.html — antes só existia 1 link (viagem→quanto-custa);
  agora mesh completo (6 links cruzados).

## Alto

- [x] Redirect 301 `/viagem` → `/viagem.html` (06/07/2026, `netlify.toml`,
  `force = true`)
- [x] `<lastmod>` real no sitemap.xml (06/07/2026, `scripts/add-sitemap-lastmod.js`
  wired no `npm run build`, data via `git log` por arquivo)
- [x] Schema: `publisher` no Article do guia; Article+BreadcrumbList no
  quanto-custa (rankeia e não tem nenhum JSON-LD); author Person (Diego Rosa)
  em vez de Organization — feito 06/07/2026 (commit `538fe79`)
- [x] Performance: consolidar gtag.js duplicado — 128 páginas carregavam
  `/gtag.js` local repetindo o `config` do Ads por cima do script inline
  (que já configura GA4+Ads). Removido + arquivo órfão deletado (06/07/2026,
  commits `adb7d8f`+`7fbca51`). Tag de conversão real (`success.html`,
  evento `conversion` com `send_to` específico) não usava esse arquivo,
  ficou intacta.
- [ ] Encurtar cadeia de redirect do domínio apex (2 hops → 1)
- [x] E-E-A-T: caixa de autor (Diego Rosa) + link de saída p/ fonte oficial
  CNJ (atos.cnj.jus.br/atos/detalhar/3015) no guia-definitivo-viagem-menor
  (06/07/2026, commit `6a20b00`). CNPJ e garantia de reembolso ficam de fora:
  **decisão do usuário (06/07/2026)** — CNPJ só quando o negócio "vingar"
  (sem empresa aberta ainda); claim "nenhuma recusa registrada" mantido como
  está — usuário considera verdadeiro (ausência de reclamação até hoje).
- [x] Performance: `logo.png` (103KB, preloaded) agora serve via
  `<picture>` (AVIF ~14KB → WebP ~21KB → PNG fallback) em 116 páginas +
  template doc.html; preload do index.html aponta pro AVIF (06/07/2026,
  commit `cc45d71`)
- [ ] Performance: defer/inline scripts do head

## Médio / Baixo

- [ ] Expandir quanto-custa (742 palavras, bounce 51,5%)
- [ ] Comparativo grátis vs pago no hero da viagem.html + avisar sobre cartório
- [ ] FAQPage JSON-LD no FAQ do guia
- [ ] noindex em `/doc.html` nu (após item 1)
- [ ] Investigar 70 sessões "(not set)" no GA4 (98,6% bounce — falha de tracking?)
- [ ] `lang="pt-BR"`, `llms-full.txt`, imagem editorial nos Articles,
  `contactPoint` no Organization

## O que já está bom (não mexer)

HTTPS/HSTS/CSP, robots.txt aberto a crawlers de IA (sem cloaking), llms.txt já
existe, 404 real, CLS=0, TTFB 65-90ms, preço consistente schema↔página,
citações legais precisas (CNJ 295/2019), tendência orgânica +70%.
