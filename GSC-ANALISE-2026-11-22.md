# GSC — www.cartasapp.com.br — 22/nov/2026

**Fonte:** Google Search Console API (`searchAnalytics/query`), dados reais, não export CSV.
**Período:** 24/out a 20/nov/2026 (28 dias) vs 26/set a 23/out/2026 (28 dias anteriores).
**Script:** `node scripts/gsc-report.js` (gera `.gsc-analysis/report-<data>.json`).

Credencial: service account `jmf-seo-bot@jmf-seo-automations.iam.gserviceaccount.com`
(`C:\Users\Administrator\Desktop\site-jmf-astro\gsc-credentials.json`, acesso `siteOwner`).

> Nota técnica: a dimensão `query` da API só devolve as ~1.000 queries de maior volume do site
> (~21% das impressões). Para medir um cluster inteiro, use `dimensions: []` com
> `dimensionFilterGroups` na query — o filtro é aplicado no servidor e o total fecha.

---

## 1. Site inteiro (28d)

| Métrica | Atual | Anterior | Δ |
|---|---|---|---|
| Cliques | 764 | 715 | **+49 (+6,9%)** |
| Impressões | 65.066 | 45.729 | **+19.337 (+42%)** |
| CTR | 1,17% | 1,56% | −0,39 pp |
| Posição média | 6,89 | 6,33 | +0,56 |

**A queda de CTR não é regressão.** As impressões cresceram 42% por conta de queries de
academia (Smart Fit) onde o site aparece na posição ~9 — aparece muito, não é clicado.
Ver seção 3.

## 2. Viagem (o produto que paga as contas)

| Métrica | Atual | Anterior | Δ |
|---|---|---|---|
| Cliques | 473 | 410 | **+63 (+15,4%)** |
| Impressões | 23.141 | 15.097 | **+8.044 (+53,3%)** |
| CTR | 2,04% | 2,72% | −0,68 pp |
| Posição média | 6,06 | 5,66 | +0,40 |

Viagem = **61,9% dos cliques** do site.

### Tendência em janelas de 28 dias

| Janela | Site | Viagem |
|---|---|---|
| 06/jun–03/jul | 144 c / 11.342 i | 90 c / 4.870 i |
| 04/jul–31/jul | 380 c / 24.897 i | 160 c / 8.088 i |
| 01/ago–28/ago | 623 c / 36.533 i | 239 c / 10.163 i |
| 29/ago–25/set | 779 c / 43.877 i | 391 c / 13.151 i |
| 26/set–23/out | 715 c / 45.729 i | 410 c / 15.097 i |
| 24/out–20/nov | 764 c / 65.066 i | **473 c / 23.141 i** |

Cliques de viagem: **90 → 473 (5,2x em 6 meses)**. Impressões: 4.870 → 23.141 (4,7x).

### Páginas de viagem por clique

| Página | Cliques | Δ | Impressões | CTR | Posição |
|---|---|---|---|---|---|
| autorizacao-excursao-escolar.html | 206 | −29 | 4.449 | 4,63% | 4,4 |
| quanto-custa-autorizacao-viagem.html | 56 | +15 | 3.332 | 1,68% | 3,7 |
| modelo-word-pdf-autorizacao-viagem.html | 51 | −9 | 404 | **12,62%** | 6,5 |
| viagem-cruzeiro-maritimo-menor.html | 44 | **+42** | 2.385 | 1,84% | 6,9 |
| pai-falecido-ou-ausente-viagem-menor.html | 18 | 0 | 836 | 2,15% | 4,1 |
| autorizacao-viagem-menor-azul.html | 17 | +15 | 964 | 1,76% | 8,0 |
| autorizacao-viagem-menor-gol.html | 17 | +13 | 1.280 | 1,33% | 8,3 |
| viajar-com-madrasta-padrasto.html | 13 | +2 | 894 | 1,45% | 4,7 |
| cartorio-aeroporto-reconhecer-firma.html | 9 | +6 | 123 | 7,32% | 4,8 |
| viagem-namorado-menor-autorizacao.html | 6 | +4 | 460 | 1,30% | 5,9 |
| passaporte-de-menor.html | 1 | +1 | 1.594 | 0,06% | 9,5 |
| visto-eua-crianca.html | 1 | +1 | 507 | 0,20% | 8,0 |
| reconhecimento-firma-online-...viagem.html | 0 | 0 | 11 | 0% | 7,8 |
| viagem.html (página do produto) | 0 | 0 | 33 | 0% | 8,1 |

## 3. De onde veio o +42% de impressões (e por que não vale nada)

| Cluster (query contains) | Cliques 28d | Impressões 28d | Pos | Impressões antes |
|---|---|---|---|---|
| `cancelar smart fit` | 7 | **2.128** | 9,1 | 187 |
| `cancelar bluefit` | 12 | 772 | 3,3 | 731 |
| `cancelar academia` | 2 | 154 | 7,7 | 106 |
| `multa` | 1 | 622 | 7,4 | 767 |

A página `/cancelar-contrato-academia-multa.html` sozinha acumula **25.064 impressões**
(38% do site) com **85 cliques** e CTR 0,34%, posição 8,3. É impressão sem clique, em
produto de R$ 9,90 com 6 vendas em 4,5 meses. **Não investir aqui.**

## 4. O buraco: o termo que paga as contas

| Cluster | Cliques 28d | Impressões 28d | Pos | Cliques antes |
|---|---|---|---|---|
| `autorização de viagem para menor` | **1** | **99** | 7,2 | 8 / 139 i |
| `autorização de viagem` | 19 | 306 | 7,3 | 23 / 327 i |
| `passeio escolar` | 37 | 393 | 2,5 | 67 / 540 i |
| `reconhecimento de firma` | 0 | **0** | — | 0 |
| `cartório` | 0 | 142 | 6,5 | 0 / 18 i |
| `notificação extrajudicial` | 1 | 319 | 9,1 | 1 / 31 i |
| `passaporte` | 1 | 271 | 15,4 | 0 / 86 i |

O termo-mãe do produto de R$ 39,90 tem **99 impressões em 28 dias** (3,5/dia) e nenhuma
página consolidada nele: `quanto-custa-autorizacao-viagem` (pos 3,4 na query exata, 36 i),
`autorizacao-viagem-menor-gol` (pos 9,8, 34 i), `viagem-cruzeiro` (pos 8,2, 26 i).
**O orgânico não sustenta o produto principal — quem sustenta é o Google Ads.**

`reconhecimento de firma` = 0 impressões: a página criada em nov (firma online/e-Notariado)
ainda não indexou/recebeu impressão. Monitorar em dezembro.

## 5. Leitura por página

- **autorizacao-excursao-escolar (−29 cliques):** sazonal, não é perda de ranking
  (posição 4,4 estável). Ano letivo acabando → menos passeio escolar. Volta em fev/mar.
- **viagem-cruzeiro (+42):** temporada de cruzeiro começando (dez–mar). Query principal
  `autorização de viagem para menor cruzeiro msc` (26 i, pos 8,2, 0 clique) — é posição que falta.
- **modelo-word-pdf:** CTR 12,62% (o melhor do site) em posição 6,5. Subir para o top 4
  dobra o clique sem mexer no texto.
- **quanto-custa-autorizacao-viagem:** posição 3,7 com CTR 1,68% — anômalo para essa posição.
  Título e description já estão bons; suspeita de rich result/PAA consumindo o clique.
  Testar variação de title em dezembro e medir.
- **notificação extrajudicial:** impressões 31 → 319 (10x), 1 clique, pos 9,1. A página
  começou a aparecer agora. Problema é posição, não snippet.
- **viagem.html (produto):** 33 impressões, 0 clique. Esperado — é landing de Ads, não de SEO.
  Consequência: o orgânico manda para páginas satélite, e a ponte satélite → produto
  (CTA interno) é o que converte.

## 6. Recomendações

1. **Ads:** subir orçamento é correto e o momento é **agora**, não dezembro. Comprador de
   dezembro compra com 36–46 dias de antecedência — quem viaja no fim do ano decide em
   novembro. O orgânico entrega 99 impressões/mês no termo-mãe; o Ads é o único canal com volume.
2. **Negative keywords pendentes** (não aplicadas ainda): `net`, `cnj`,
   `conselho nacional de justiça`, `notariado`, `grátis`, `gratuito`, `modelo`, `download`,
   `onde tirar`, `onde pegar`.
3. **Orgânico, prioridade 1:** consolidar autoridade no termo-mãe
   `autorização de viagem para menor` — hoje fragmentado em 3 páginas medianas
   (pos 3,4 / 8,2 / 9,8). Uma página forte + links internos das satélites.
4. **Orgânico, prioridade 2:** cruzeiro (temporada) — mirar top 5 na query
   `autorização de viagem para menor cruzeiro msc`.
5. **Não investir** em academia/`cancelar smart fit`: 2.128 impressões, 7 cliques, posição 9.
6. **Acompanhar em dezembro:** indexação de `reconhecimento-firma-online-autorizacao-viagem`
   (0 impressões) e o CTR de `quanto-custa-autorizacao-viagem`.
