# Auditoria de conversão — /viagem2 (foco mobile)

> **Data:** 2026-07-03
> **Escopo:** apenas `https://www.cartasapp.com.br/viagem2` + `public/viagem2.html`
> **Método:** Playwright (Chromium headless) simulando iPhone 13 (390×844 @3x) e desktop 1440×900, percorrendo o funil completo — 4 etapas do formulário, prévia gerada pelo backend real, modal de termos, modal "Quase lá" e checkout do Mercado Pago — com dados fictícios (CPFs de teste válidos, nomes "… Teste").
>
> **Aviso operacional:** o teste criou um pedido real *pendente* no backend (e-mail `teste.auditoria@example.com`) via `mp-checkout` e um lead via `capture-lead`. Nada foi pago — ignorar/limpar depois.

---

## 1. Performance (medido no load mobile)

A página é **leve e rápida** — isso não é o gargalo de conversão:

| Métrica | Valor |
|---|---|
| FCP | 428 ms |
| Load completo | 904 ms |
| HTML transferido | 22,7 KB |
| Total de recursos | ~132 KB (27 requests) |

O maior recurso individual é o **logo.png (~104 KB)** — com `preload` prioritário, ele consome mais banda que todo o resto do site somado. Um WebP de 42px ficaria em ~5 KB. Os outros pontos são menores: `/theme.js` e `/gtag.js` síncronos no head (pequenos), e 3 famílias do Google Fonts com ~10 pesos declarados.

## 2. Confiança e medo

**O que está bom:** selo CNJ 295/2019, prévia gratuita antes de pagar, garantia de 7 dias, badge Mercado Pago, FAQ com objeções reais (cartório, vias, Polícia Federal), depoimentos com destino. O modal de termos é honesto sobre o que está sendo comprado (modelo + firma em cartório à parte) — isso reduz reembolso e chargebacks.

**O que pode gerar insegurança:**

- **"Taxa de Emissão"** como rótulo do preço (hero e sticky bar) soa como taxa governamental. Para quem lê o disclaimer do rodapé ("não temos vínculo com o Governo"), isso cria dissonância — parece imitação de órgão oficial. "Documento completo" ou "Valor único" é mais honesto e vende igual.
- **"100% de aceitação — Nenhuma recusa de embarque registrada"** aparece 3× e é uma alegação absoluta não verificável. Céticos desconfiam de "100%", e juridicamente é frágil. Reformular para algo comprovável: "Centenas de embarques aprovados — nenhuma recusa reportada por clientes".
- **"✓ Verificado" nos depoimentos** sem nenhuma fonte (Google, site de reviews). Selo de verificação que não linka para nada pode ter efeito reverso.
- **Sem CNPJ/razão social visível** no rodapé — no Brasil isso é um dos primeiros sinais que compradores desconfiados procuram. Custo zero para adicionar.
- **Quebra de identidade visual na hora H:** os botões "IR PARA PAGAMENTO SEGURO", "Confirmar e Pagar" e "Ir para Pagamento" usam um gradiente dourado→azul-turquesa (herdado do `style.css` global) que destoa completamente da identidade "cartório moderno" navy/dourado do resto da página — justamente nos 3 cliques de maior ansiedade.
- **No checkout do MP aparece "Documento: autorizacao-viagem-menor"** — slug cru com hífens. Deveria ser "Autorização de Viagem para Menor" (título do item no `mp-checkout`).
- Erros de geração usam `alert()` nativo — visual de site amador no pior momento possível.

## 3. Preço

- **Transparência boa**: R$ 39,90 aparece cedo (ticket no hero), na sticky bar, no CTA pós-prévia e no resumo. Ninguém é surpreendido.
- **Ancoragem fraca**: o bloco "Cartório não redige" diz que escritura pública é "muito mais caro", mas **sem número**. Âncora sem número não ancora. Colocar ao lado do preço: "Advogado: R$ 250+ · Escritura em cartório: R$ 150+ · **Aqui: R$ 39,90**" muda a percepção de caro→barato instantaneamente.
- **Pix invisível até o fim**: "Pix ou Cartão" só aparece no último modal. Para público mobile brasileiro, "Pix" perto do preço desde o início reduz fricção percebida.
- O custo extra do cartório (~R$ 8,25/assinatura) só aparece no FAQ e no modal de termos — está bem posicionado, não mexer.

## 4. Hierarquia visual mobile (acima da dobra)

O problema mais claro da auditoria:

- **Nenhum CTA e nenhum preço na primeira dobra.** A tela inicial mostra: selo + "CNJ 295/2019" + H1 de 2 linhas + subtítulo de 2 linhas + 2 badges + título "Como funciona" + card "Preencha". O botão "GERAR AUTORIZAÇÃO AGORA" só aparece após ~1,5 telas de scroll.
- A **sticky bottom bar (que tem preço + CTA) fica coberta pelo banner de cookies** durante toda a primeira visita, até a pessoa clicar OK. O mecanismo criado exatamente para garantir CTA permanente está invisível no momento mais importante (primeira impressão). O banner ainda cobre parte do ticket de preço no hero.
- O **botão flutuante do WhatsApp sobrepõe conteúdo útil**: cobre o link "editar formulário" no paybox e o card "Baixe" na dobra inicial.
- O bloco selo+CNJ no topo consome ~15% da dobra antes do H1. Comprimir (selo 40px, uma linha) já puxa o CTA para perto da dobra.

## 5. Fricção no funil

Contagem real de interações até pagar: scroll → step 1 (6 campos) → step 2 (escolha + 2-4 campos) → step 3 (escolha + 2-8 campos) → step 4 (1-3 campos) → "Ver Prévia" (espera backend 1-3s) → scroll até paybox → "IR PARA PAGAMENTO" → modal termos (checkbox + "Confirmar e Pagar", espera `mp-checkout`) → **modal "Quase lá!" (mais um clique)** → nova aba MP → escolher método. **~9 interações após o formulário.**

- **O modal "Quase lá!" é uma etapa inteira que existe só por causa do `window.open` + polling.** O usuário já disse "sim" duas vezes (pagar + confirmar termos) e recebe... outro botão. Redirecionar direto (`location.href = init_point`) elimina um modal e um clique no ponto de maior intenção. O retorno pode ser tratado pela `back_url` do MP + `success.html` (que já existe), em vez de polling na aba original.
- **A cada troca de etapa, o scroll volta para o topo do `formArea`** — que inclui o bloco repetido de badges ("Utilizado com sucesso… Dados Criptografados… Válido em todo Brasil"). O usuário revê o mesmo cabeçalho 4 vezes. Rolar para o `step-indicator` em vez do `formArea` ganha meia tela por etapa.
- **Steps 3 e 4 podem ser fundidos**: a etapa 4 tem apenas 1 campo obrigatório (cidade). 4 etapas → 3 reduz a percepção de formulário longo (o indicador "1 2 3 4" assusta antes de a pessoa começar).
- **A prévia depende de request ao backend** (`generate-doc`), com retry para 503. Como o documento agora é template (Gemini removido), a prévia poderia ser montada client-side, instantânea, com zero ponto de falha — o backend só precisaria ser chamado no pagamento.
- Micro-fricções: step 2 sem seleção default (dá erro se tocar "Próximo" direto); data de volta obrigatória com instrução manual "selecione hoje + 2 anos" (um checkbox "sem volta definida" auto-preencheria); texto justificado da prévia cria "rios" de espaço em coluna estreita — `text-align: left` no mobile lê muito melhor.

## 6. Mobile vs desktop

- Desktop mostra **preço dentro da dobra**; mobile não mostra preço nem CTA (agravado pelo cookie banner sobre a sticky bar). É a diferença mais relevante.
- O restante é consistente — os cards empilham bem, botões têm bom tamanho de toque (≥52px), steps compactados funcionam.

## 7. Qualidade do código (achados objetivos)

1. **Bug de analytics — `begin_checkout` envia `value: 29.9`**, mas o preço é 39,90 (`viagem2.html:1985`). Como a tag AW- do Google Ads otimiza por valor, isso distorce ROAS/lances das campanhas. Idem `generate_lead` com label fixo `'viagem_nacional'` mesmo em viagens internacionais.
2. **Bug de label**: ao fechar o modal do MP, o botão vira "Gerar documento completo (R$ 39,90)" (`viagem2.html:2024`) — texto que não existe mais; o original é "IR PARA PAGAMENTO SEGURO".
3. **Código morto**: `grecaptcha.reset()` (`viagem2.html:2020`) — não há reCAPTCHA na página.
4. `alert()` para erros de geração/pagamento em vez do componente `stepError` que já existe.
5. logo.png ~104 KB com preload (maior custo de rede da página).
6. 3 famílias de fonte / ~10 pesos declarados; `Source Serif 4` com 3 pesos e `IBM Plex Mono` com 2 — dá para cortar ~metade.

---

# Lista priorizada de mudanças

## A) Copy/texto — baixo esforço

| # | Mudança | Impacto | Esforço |
|---|---|---|---|
| A1 | Âncora de preço com números: "Advogado R$ 250+ · Escritura R$ 150+ · Aqui R$ 39,90" junto ao ticket do hero e ao paybox | **Alto** | Baixo |
| A2 | Trocar "Taxa de Emissão" por "Documento completo — pagamento único" (hero + sticky bar) | **Alto** | Baixo |
| A3 | Mencionar "Pix ou cartão" junto ao preço no hero e no paybox (não só no último modal) | Médio | Baixo |
| A4 | Reformular "100% de aceitação" para alegação verificável; unificar (aparece 3×) | Médio | Baixo |
| A5 | Adicionar CNPJ/razão social no rodapé | Médio | Baixo |
| A6 | Título do item no MP: "Autorização de Viagem para Menor" em vez do slug (ajuste no `mp-checkout`) | Médio | Baixo |
| A7 | Remover ou fundamentar o "✓ Verificado" dos depoimentos (linkar Google Reviews se existir) | Baixo | Baixo |
| A8 | Corrigir texto restaurado do btnPagar ao fechar modal MP | Baixo | Baixo |

## B) Layout/hierarquia visual — esforço médio

| # | Mudança | Impacto | Esforço |
|---|---|---|---|
| B1 | Cookie banner: reduzir para uma linha discreta no topo, ou auto-dismiss — hoje ele esconde a sticky bar (preço+CTA) na primeira visita inteira | **Alto** | Baixo/Médio |
| B2 | Comprimir hero mobile (selo 40px inline, subtítulo 1 linha, "Como funciona" abaixo do CTA) para colocar **CTA + preço na primeira dobra** | **Alto** | Médio |
| B3 | Sticky bar contextual: esconder (ou virar "FINALIZAR — R$ 39,90" rolando ao paybox) quando prévia/pagamento estiverem visíveis | Médio | Médio |
| B4 | Unificar botões de pagamento no navy da identidade (remover gradiente teal herdado do style.css) | Médio | Baixo |
| B5 | Scroll de troca de etapa mirar no `step-indicator`, não no `formArea` (elimina re-visualização das badges 4×) | Médio | Baixo |
| B6 | Prévia com `text-align: left` no mobile (justify cria rios em coluna estreita) | Baixo/Médio | Baixo |
| B7 | WhatsApp float: esconder quando paybox/modais visíveis (hoje cobre o link "editar formulário") | Baixo | Baixo |
| B8 | Checkbox "Sem volta definida" que auto-preenche data +2 anos | Baixo | Baixo |
| B9 | Pré-selecionar opção mais comum no step 2 (ou destacar que é obrigatório escolher) | Baixo | Baixo |

## C) Estrutural (fluxo/código) — esforço maior

| # | Mudança | Impacto | Esforço |
|---|---|---|---|
| C1 | **Eliminar o modal "Quase lá!"**: redirecionar direto ao `init_point` na mesma aba e tratar retorno via `back_urls` do MP → corta 1 modal + 1 clique no pico de intenção | **Alto** | Médio |
| C2 | **Corrigir `begin_checkout` value 29.9 → 39.9** (+ label dinâmico nacional/internacional no `generate_lead`) — não muda a página, mas conserta a otimização das campanhas que trazem o tráfego | **Alto** (aquisição) | Baixo |
| C3 | Fundir steps 3 e 4 (funil vira 3 etapas; etapa 4 tem só 1 campo obrigatório) | Médio | Médio |
| C4 | Gerar prévia client-side (documento é template — sem Gemini): prévia instantânea, sem 503/retry/latência | Médio | Médio/Alto |
| C5 | Converter logo.png (~104 KB) para WebP/PNG otimizado (~5-10 KB) | Baixo/Médio | Baixo |
| C6 | Reduzir pesos de fontes (Public Sans 400/700, Source Serif 600/700, Plex Mono 600) | Baixo | Baixo |
| C7 | Substituir `alert()` por mensagens no `stepError`; remover `grecaptcha.reset()` morto | Baixo | Baixo |

**Top 5 para fazer primeiro:** B1 (cookie banner × sticky bar), B2 (CTA na dobra), A1+A2 (âncora de preço + rótulo honesto), C1 (matar o modal "Quase lá") e C2 (fix do analytics — é 1 linha e afeta todo o tráfego pago).
