# Relatório SEO — www.cartasapp.com.br

**Data:** 7-8 de setembro de 2026 · **Repo:** cartas-app-main · **Branch:** `main` (todos os commits abaixo já estão no `main`)

Site estático na Netlify (~175 HTML em `public/`), conteúdo jurídico-consumidor em pt-BR, SaaS pay-per-document (R$ 9,90-19,90).

---

## ✅ Concluído

### Critical (C1–C3)
| ID | Item | Status |
|---|---|---|
| C1 | `viagem2.html` removido; páginas válidas adicionadas ao sitemap | ✅ commitado |
| C2 | Correções de sitemap/robots | ✅ commitado |
| C3 | Canonicais apontando para páginas inexistentes corrigidos — incluindo `guia-carta-notificacao-formal.html` que apontava para `carta-notificacao-formal.html` (não existia); fixado para self-referencial | ✅ commitado |

### High (H1–H4)
| ID | Item | Escopo | Status |
|---|---|---|---|
| H1 | Meta descriptions | 57 páginas | ✅ commitado |
| H2 | Canonicais | 50 páginas | ✅ commitado |
| H3 | Article schema (JSON-LD) | 133 páginas | ✅ commitado |
| H4 | Artigos finos <600 palavras expandidos | 8 páginas | ✅ commitado |

### Detalhe H4 — páginas expandidas
| Página | Antes | Depois | Seções adicionadas |
|---|---|---|---|
| guia-carta-notificacao-formal.html | 524 | 762 | AR dos Correios como prova mais forte (presunção de veracidade); notificação constitui em mora e gera juros (CC Arts. 389/395) |
| como-cancelar-cartao-nubank.html | 529 | 748 | Cancelar ≠ bloquear (anuidade continua); cobrança pós-cancelamento = devolução em dobro (CDC Art. 42, § único) |
| direito-de-arrependimento.html | 556 | 761 | Prazo conta do recebimento efetivo; regra só vale fora do estabelecimento (loja física = favor comercial); reembolso integral com frete, sem multa |
| seguradora-nao-paga-sinistro.html | 570 | 808 | Dossiê de documentação (apólice, aviso com protocolo, negativa formal); caminho do Juizado após Susep |
| pix-errado-como-recuperar.html | 586 | 839 | Enriquecimento sem causa (CC Art. 884); mora gera juros após notificação; notificação formal vale mesmo sem resposta; Juizado sem advogado |
| nome-sujo-sem-dever.html | 593 | 969 | Dívida prescrita (5 anos, CC Art. 206) não gera negativação; erro de cadastro/homônimo = dano moral reconhecido |
| como-cancelar-smart-fit.html | 597 | 960 | Hipóteses sem multa (atestado médico, mudança, má prestação Art. 20, arrependimento Art. 49); cobrança pós-cancelamento = dobro (CDC 42) |
| cancelar-sky-tv-guia.html | 599 | 894 | Resolução 632/2014 ANATEL (mesmo canal da contratação, 10 dias úteis); multa só com fidelidade válida e proporcional |

**Disciplina aplicada em cada página:** fatos verificados apenas nos textos das próprias páginas ricas do site (grep em HTML — nada inventado), 2 links internos por página para arquivos confirmados com `ls`, JSON-LD validado (`python`), `dateModified` = `2026-09-07T09:00:00-03:00` (datePublished preservado em `2026-07-16`), data visível "Última atualização: 7 de setembro de 2026" quando presente, sitemap `lastmod` = 2026-09-07.

### Fora do escopo H4 (não são artigos)
- `energia.html` (512 palavras) — página de produto/hub
- `contato.html` (298) — página de contato
- `failure.html` (90), `pending.html` (96), `json.html` (226), `google5fe...html` (2) — técnicas do fluxo de pagamento / verificação Google

---

## ⏳ Pendente

### Deploy
- **Publicar no Netlify** — todos os commits estão no `main`, mas o deploy ainda não foi feito.

### Medium
- **FAQPage schema**: páginas com FAQ visível não têm FAQPage JSON-LD. Restrição Google (ago/2023): rich results só para gov/saúde — para site comercial o benefício é citação por IA (LLMs), prioridade Info, não Critical.
- **Imagens sem `alt`** em alguns artigos.

### Low
- Itens de polimento backlog (a levantar do relatório original do audit).

---

## Protocolo de expansão de artigos (reutilizável)

1. Word count: `sed 's/<[^>]*>/ /g' <file> | tr -s ' \n' ' ' | wc -w` (inclui ~150 palavras de nav/footer boilerplate; alvo >600)
2. Fatos: extrair verbatim das páginas ricas do próprio site — `sed 's/<[^>]*>/ /g' <page> | tr -s ' \n' ' '` + `grep -o "padrão[^.]*\."` — nunca inventar
3. Links internos: confirmar alvo com `ls public/<arquivo>.html` antes de adicionar; estilo `<a href="/..." style="color: var(--accent-primary);">`
4. JSON-LD: validar com `python -c "import json..."` (Windows: `python`, não `python3`)
5. Datas: `dateModified` → data do dia; data visível → "N de <mês> de 2026"
6. Sitemap: `grep -n <file> public/sitemap.xml` → `sed -i` no lastmod se necessário
7. Commit: `content: expand <file-stem> (<old> to <new> words) - <key additions>; sitemap lastmod <date>`
8. Todo comando Bash: prefixo `cd "C:\Users\Administrator\Desktop\cartas-app-main" &&`

## Últimos commits (H4)

```
3ac0574 content: expand cancelar-sky-tv-guia (599 to 894 words) - Resolucao 632/2014 mesmo canal / multa so com fidelidade valida sections, 2 internal links
d29a0b4 content: expand como-cancelar-smart-fit (597 to 960 words) - multa nao cabivel / cobranca pos-cancelamento CDC Art.42 sections, 2 internal links; sitemap lastmod 2026-09-07
e529d2c content: expand nome-sujo-sem-dever (593 to 969 words) - prescricao 5 anos / erro de cadastro-dano moral sections, 2 internal links; sitemap lastmod 2026-09-07
c1d6109 content: expand pix-errado-como-recuperar (586 to 839 words) - enriquecimento sem causa CC Art. 884 + mora Art. 395 gera juros/correcao apos notificacao, notificacao formal vale independentemente de resposta + Juizado Especial sem advogado ate 20 salarios; 2 internal links; sitemap lastmod 2026-09-07
e65f2c2 content: expand seguradora-nao-paga-sinistro (570 to 808 words) - dossier de documentacao (apolice, aviso com protocolo, negativa formal por escrito) e caminho do Juizado Especial sem advogado ate 20 salarios minimos apos esgotar Susep/Consumidor.gov; 2 internal links; sitemap lastmod 2026-09-07
75d793d content: expand direito-de-arrependimento (556 to 761 words) - prazo conta do recebimento efetivo (assinatura do recibo), regra vale so fora do estabelecimento (loja fisica = favor comercial), reembolso integral com frete sem multa CDC Art. 49 + Procon/Consumidor.gov; 2 internal links; sitemap lastmod 2026-09-07
2dda929 content: expand como-cancelar-cartao-nubank (529 to 748 words) - cancelar x bloquear (so encerrimento corta anuidade), cobranca apos cancelamento = devolucao em dobro CDC Art. 42 paragrafo unico + Procon/Banco Central/Juizado; 2 internal links; sitemap lastmod 2026-09-07
b3feb0d content: expand guia-carta-notificacao-formal (524 to 762 words) - AR dos Correios presuncao de veracidade vs e-mail/WhatsApp, constituicao em mora inicia contagem de juros e abre protesto (CC Arts. 389/395); 2 internal links; fix canonical pointing to nonexistent carta-notificacao-formal.html
```
