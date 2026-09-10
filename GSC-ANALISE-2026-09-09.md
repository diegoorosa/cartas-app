# Análise GSC — www.cartasapp.com.br

**Data:** 9 de setembro de 2026 · **Fonte:** Google Search Console API (searchAnalytics/query) · **Período:** 9/mar a 9/set/2026 (6 meses)
**Dados brutos salvos em:** `.gsc-analysis/` (queries_6m.json, pages_6m.json, queries_last3_*.json)

---

## 📈 Quadro geral

- **441 cliques · 18.575 impressões · CTR 2,37%** (queries identificadas; total real com anônimas: ~1.600 cliques, ~104k impressões)
- **Device:** MOBILE 982 c/67.8k i (CTR 1,45%) · DESKTOP 610 c/36.2k i (CTR 1,68%) · TABLET 10 c/367 i

### Tendência mensal — crescimento 16x em 6 meses

| Período | Cliques | Impressões |
|---|---|---|
| mar-abr | 43 | 5.038 |
| abr-mai | 61 | 5.225 |
| mai-jun | 134 | 11.727 |
| jun-jul | 199 | 13.917 |
| jul-ago | 487 | 32.020 |
| ago-set | **714** | **39.907** |

---

## 🎯 Clusters por tema (6 meses)

| Tema | Cliques | Impressões | CTR | nº queries |
|---|---|---|---|---|
| **Academia** (bluefit/smart fit/multa) | 325 | 13.664 | 2,38% | 667 |
| **Viagem/autorização** | 82 | 2.223 | 3,69% | 212 |
| Voo/reembolso | 2 | 695 | 0,29% | 89 |
| Saúde | 10 | 475 | 2,11% | 26 |
| Consumidor/cobrança | 0 | 341 | 0,00% | 58 |
| Pix/financeiro | 0 | 70 | 0,00% | 18 |
| Telefonia/utilidades | 1 | 46 | 2,17% | 28 |
| Multas trânsito | 0 | 1 | 0,00% | 1 |

**Diagnóstico:** 2 clusters vivos (academia + viagem-menor), 5 clusters mortos. 100% da tração está nos 2 primeiros.

---

## 🔴 Problema nº 1: canibalização no cluster academia

### `cancelar-contrato-academia-multa.html` — 41.635 impr, 343 cliques, **CTR 0,8%**, pos 6,9
- Title era: "Como Cancelar Smart Fit ou Bluefit Sem Pagar Multa (2026)" — dual-brand não responde nem a query da Smart Fit nem da Bluefit; pega as impressões de ambas e perde o clique de ambas.
- Queries da Smart Fit com 0 cliques: "qual a multa para desistir da smart fit?" (266), "quanto é a multa da smart fit" (98), "quanto é a multa de cancelamento da smart fit" (81), "multa da smart fit" (72), "qual a multa de cancelamento da smart fit" (54), "multa cancelamento smart fit" (136), "como cancelar plano de academia sem pagar multa" (68) — **~715+ impressões pedindo VALOR da multa, 0-5 cliques**.

### `cancelar-bluefit-guia-completo.html` — 18.537 impr, 477 cliques, CTR 2,6%, pos 4,8 (melhor CTR do cluster)
### `cancelar-smart-fit-guia-completo.html` — 1.980 impr, 2 cliques, **CTR 0,1%**, pos 9,3

---

## 🟢 Cluster viagem/autorização (melhor CTR, maior oportunidade)

| Página | Impressões | Cliques | CTR | Pos |
|---|---|---|---|---|
| autorizacao-excursao-escolar | 9.951 | 314 | 3,2% | 5,8 |
| quanto-custa-autorizacao-viagem | 9.043 | 124 | 1,4% | 5,0 |
| pai-falecido-ou-ausente-viagem-menor | 3.180 | 85 | 2,7% | 5,0 |
| viajar-com-madrasta-padrasto | 2.889 | 52 | 1,8% | 5,1 |
| viagem-cruzeiro-maritimo-menor | 2.283 | 33 | 1,4% | 8,4 |
| guarda-compartilhada-autorizacao-viagem | 1.744 | 10 | 0,6% | 8,8 |
| modelo-word-pdf-autorizacao-viagem | 1.291 | 51 | 4,0% | 9,0 |

Gaps do cluster: "a escola pode liberar o aluno para viajar" (175 impr, 0 clicks, pos 6,6); "formulário padrão de autorização de viagem internacional word" (108, pos 10,1); "modelo de autorização de viagem para menor word" (110, pos 9,9).

---

## ⚫ Cluster voo/reembolso — NÃO INVESTIR

695 impr, 2 cliques, CTR 0,29%. Queries "art 740 cc"/"artigo 740 do código civil" (~440 impr somadas, 0 cliques, pos 9-11) caem em reembolso-cancelamento-passagem.html — intenção errada (quem busca quer o texto do artigo, é advogado/estudante). Competição: Azul/Gol/Latam + Reclame Aqui + AI Overviews. Redirects 301 já consolidaram o suficiente.

## ⚫ Consumidor/cobrança — cluster morto

58 queries indexadas, 0 cliques, 341 impressões. Google não associa o site ao tema. Não criar páginas novas antes de consertar o que existe.

## ⚫ Home — 486 impr/6 meses

Não é onde está o jogo. Queries residuais (site:netlify.app etc).

---

## ✅ Plano de ação

### P0 — CTR puro (executado em 9/set/2026)
1. `cancelar-contrato-academia-multa` — title focado em multa + meta com valores/condições → potencial +700 cliques/mês
2. `cancelar-smart-fit-guia-completo` — meta prometendo shortcut (app, sem loja)
3. `quanto-custa-autorizacao-viagem` — title/meta com preço real na frente
4. `viajar-com-madrasta-padrasto` + `viagem-cruzeiro-maritimo-menor` + `guarda-compartilhada-autorizacao-viagem` — metas revisadas
5. `cancelar-bluefit-guia-completo` — meta reforçada (página campeã de cliques)

### P1 — conteúdo (próximas 2 semanas)
6. Expandir `cancelar-contrato-academia-multa` com seção "Quanto custa cancelar" (tabela de valores por academia/plano) — 715+ impr pedem isso
7. Página/FAQ "a escola pode liberar o aluno para viajar?" (175 impr, snippet fácil)
8. Reforçar `modelo-word-pdf-autorizacao-viagem` para "formulário padrão word" (110-108 impr, pos 10)
9. FAQPage schema na `autorizacao-excursao-escolar`

### P2 — expansão (próximo mês)
10. Hub "Quanto Custa" consolidando as 6 páginas quanto-custa com tabela comparativa
11. Expandir cluster viagem-menor: "passaporte de menor", "visto EUA criança" (CTR 3,69% é o melhor do site, há espaço)

### O que NÃO fazer
- Não perseguir "art 740 cc" (intenção errada)
- Não investir em telefonia/energia (46-475 impr totais)
- Não criar página de cobrança nova (cluster morto, 0 cliques)
- Não otimizar a home
- Não investir no cluster voo

---

## Método (reutilizável)

Token JWT via `C:\Users\Administrator\Desktop\site-jmf-astro\gsc-credentials.json` (SA `jmf-seo-bot@jmf-seo-automations.iam.gserviceaccount.com`, access `siteOwner` em https://www.cartasapp.com.br/). POST em `https://searchconsole.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.cartasapp.com.br%2F/searchAnalytics/query` com body `{startDate, endDate, dimensions, rowLimit}`. ⚠️ Em Windows, escrever JSON com `io.open(..., 'w', encoding='utf-8')` e stdout com `io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')` — cp1252 quebra em pt-BR.

Nota: a credencial antiga `claude-seo@claude-seo-500301` está **revogada** (key_id a2ae347e não bate com os 3 certificados publicados no endpoint x509 do Google). Usar a do jmf-astro.
