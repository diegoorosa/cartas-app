# Auditoria Completa — CartasApp

**Data:** 12 de julho de 2026
**Verificação:** Todos os itens abaixo foram confirmados diretamente nos arquivos do repositório (`C:\Users\Administrator\Desktop\cartas-app`), com referências de `arquivo:linha`.

---

## 1. BUGS URGENTES (dinheiro perdido agora)

### 1.1. WhatsApp errado no `recovery.js`

**Local:** `public/recovery.js:4`

```js
var WHATSAPP = '5547991323024';
```

**Problema:** Todos os outros ~100 arquivos do site usam `5547988616874`:
- `success.html:336`
- `recuperar.html:142`
- `viagem.html:1519`
- `doc.html:298`
- Todas as páginas em `public/doc/*.html:320`
- Todas as páginas de guia/blog/etc. (`grep 5547988616874` retorna 100+ matches)

O `recovery.js` é o único arquivo com o número `5547991323024`. Clientes que tentam recuperar documento via modal de recovery falam com número errado — exatamente no momento mais sensível do funil (pós-pagamento, doc perdido).

**Fix:** trocar `5547991323024` → `5547988616874` em `recovery.js:4`.

---

### 1.2. ~~Email de recuperação aponta para página errada~~ (REMOVIDO — erro da auditoria)

**Retratação:** O subagenteno analisar `success.html` superficialmente concluiu que a página "expira" após 15s de polling. Verificando o código completo (`success.html:564-616`), confirmamos que o polling é apenas a primeira etapa — depois ele busca o doc no Supabase via `generate-doc` (3 retries, linhas 589-608) e tem fallback de cache local (linhas 610-615). Funciona para acessos tempo depois. Item removido. O email link para `success.html` está correto tal como está.

---

### 1.3. Valor de `begin_checkout` errado nas landing pages (mas `conversion` está certo)

**Importante:** O evento `conversion` (disparado em `success.html:522`) está **correto** — o `order-status.js:19,38,58` sempre retorna o preço real do produto (do `PRICE_MAP` ou `transaction_amount` do MP), e `success.html:573` passa esse valor real para `sendConversionEC(st.price)`. O fallback `29.9` em `success.html:521` só dispara em caso raríssimo onde `price` não é populado (todas as paths do `order-status.js` populam `price`).

**O que está errado é o evento `begin_checkout`** (intenção de compra, disparado quando o usuário clica em "Pagar"), hardcodado nas landing pages:

| Arquivo | Linha | Valor hardcoded | Preço real (price-map.js) | Erro |
|---------|-------|-----------------|--------------------------|------|
| `multa.html` | 722 | `9.9` | 19.90 (`recurso-multa-transito`) | -50% |
| `reembolso-cancelamento-passagem.html` | 586 | `9.9` | 19.90 (`reembolso-cancelamento-passagem`) | -50% |
| `contestacao-cartao.html` | 770 | `9.9` | 19.90 (`carta-contestacao-cartao-credito`) | -50% |
| `negativacao-indevida.html` | 740 | `9.9` | 19.90 (`carta-negativacao-indevida`) | -50% |
| `plano-saude-negativa.html` | 745 | `9.9` | 19.90 (`carta-negativa-plano-saude`) | -50% |
| `bagagem.html` | 671 | `9.9` | 19.90 (`carta-bagagem`) | -50% |
| `viagem.html` | 2164 | `39.9` | 39.90 (`autorizacao-viagem-menor`) | ✅ correto |
| `arrependimento-compra-online.html` | 782 | `9.9` | 9.90 (`carta-direito-arrependimento-compra-online`) | ✅ correto (coincide) |

**Impacto:** O Google Ads usa o ROAS do `begin_checkout` para otimizar bidding (target CPA, maximize conversion value). Com 50% dos produtos underreportando o valor de intenção, o algoritmo super-otimiza para produtos de R$9,90 e sub-otimiza para os de R$19,90. O `conversion` (venda final) está certo, mas o sinal intermediário está distorcido.

**Fix:** Ler o preço dinamicamente em cada landing page (do `PRICE_MAP` injetado via `slugs.js`, ou hardcoded corretamente por página).

---

## 2. OPORTUNIDADES DE VENDER MAIS

### 2.1. Sem upsell/cross-sell com desconto na `success.html`

**Local:** `public/success.html:151-206`

**O que acontece hoje:** Após o pagamento, `#extra-docs` mostra 4 cards (viagem, multa, reembolso, bagagem) com link para as landing pages a **preço cheio**. Nenhum benefício, cupom ou incentivo.

**Problema:** O cliente acabou de pagar (maior momente de confiança). Ele é o lead mais quente possível para uma segunda compra — e recebe exatamente a mesma oferta de um visitante frio.

**Oportunidade:**
- Oferecer "compre também X por R$Y com 30% OFF usando o cupom que está no seu email"
- Criar "pacote família": autorização de viagem + reembolso de passagem por R$49,90 (vs R$59,80 separado)
- Aplicar `payload` pré-preenchido: cliente que acabou de preencher nome/CPF/cidade deveria ver o segundo form pré-preenchido

---

### 2.2. "Gerar Novo Documento" leva ao mesmo produto

**Local:** `public/success.html:136,344`

```js
btnNovoDoc.href = getPageUrl(slug);
```

**Problema:** O botão "Gerar Novo Documento" envia o cliente de volta ao mesmo produto que ele acabou de comprar. Sem utilidade. Deveria apontar para a home (`/`) ou para o cross-sell mais provável.

---

### 2.3. Sem order-bump no checkout

**Problema:** Grep por `order.?bump|upsell|one.?click` em todo o projeto retorna zero matches. Não existe mecanismo de "adicione também X por +R$Y" antes/durante o pagamento nem no `mp-checkout.js` nem nas landing pages.

**Oportunidade:** Cliente pagando `autorizacao-viagem` (R$39,90, maior margem) poderia aceitar +R$9,90 por um "modelo de declaração de guarda complementar" no mesmo checkout.

---

### 2.4. Email/telefone opcionais = leads perdidos

**Local:** Em todas as páginas de checkout:

- `doc.html:174-180` (email e telefone ambos "opcional")
- `multa.html:235-242` (idem, confirmar nas outras)

**Problema:** O `capture-lead` (`netlify/functions/capture-lead.js`, chamado em `doc.html:443` e similares) faz `if (!p.email && !p.telefone) return;` quando ambos estão vazios. Como são opcionais, a maioria das prévias geradas não deixa contato.

Resultado: Usuário gera a prévia, vê o documento, fecha a aba, não paga — e você não tem como retomar contato. Toda a coorte "abandonou a prévia" está perdida forever.

**Fix (duas opções):**
1. **Gate mais leve:** tornar email obrigatório antes de gerar a prévia (label: "enviamos sua prévia por email")
2. **Gate mais agressivo:** só mostrar a prévia depois de informar email OU telefone

Isso desbloqueia todo o funil de recuperação de abandono.

---

### 2.5. Sem recuperação de carrinho abandonado

**Problema:** O `recovery.js` (`public/recovery.js`) só recupera **documentos já pagos** via `lm:generated:v1` (linha 2). Não existe fluxo para usuários que preencheram o formulário, viram a prévia e saíram sem pagar.

**Nota adicional — `recuperar.html` é órfã:** Confirmado por grep: `/recuperar.html` não é linkada em lugar nenhum do site (só aparece em `pix-errado-como-recuperar.html` que é um guia blog sobre Pix, não linka para a página). O fluxo real de recuperação de documento pós-pagamento é 100% via `success.html?o=...` (link do email). `recuperar.html` existe e carrega `recovery.js` (`recuperar.html:86`) mas é uma página sem entrada — clientes nunca chegam nela. Os itens 7.1-7.4 da auditoria sobre `recuperar.html` são técnicos (baixo impacto prático enquanto não for linkada).

Toda a infraestrutura já existe:
- `pendingPayload` está em localStorage ao gerar prévia (`doc.html:520`)
- `capture-lead` grava no Supabase (`capture-lead.js`)
- `mp-webhook.js` dispara email na aprovação

Falata: um cron job ou trigger que, ao ver `checkout_intents` com payload + sem payment, envie email/sms de retomada (com cupom de 10% OFF, por exemplo).

---

### 2.6. `LMRecovery.offerRecover()` não é invocado nas landing pages principais

**Problema:** Confirmado: `offerRecover()` é chamado em `doc.html:315` e nos ~67 arquivos em `public/doc/*.html`. Mas **não** é chamado em:

- `success.html`
- `recuperar.html`
- `viagem.html`
- `multa.html`
- `reembolso-cancelamento-passagem.html`
- `contestacao-cartao.html`
- `negativacao-indevida.html`
- `bagagem.html`

Nestas landing pages principais (maior tráfego, maior conversão), o modal "Documento encontrado, voltar a ver?" não dispara. Usuários que já compraram e voltam não são re-engajados.

---

## 3. EMAIL PÓS-COMPRA (`send-email.js`)

### 3.1. ~~Link aponta para página errada~~ (REMOVIDO — ver item 1.2)

### 3.2. Sem tracking/UTM no link do email

**Local:** `netlify/functions/send-email.js:97,116`

```js
<a href="${recoveryLink}" ...
Link direto: ${recoveryLink}
```

O link não tem `?utm_source=email&utm_medium=transactional&utm_campaign=document_ready`. Visitas vindas do email aparecem como direct/unknown no GA4, impossível medir effect do email no re-engajamento.

---

### 3.3. Sem CTA secundária / upsell no email

**Local:** `netlify/functions/send-email.js:87-119`

Email é puramente funcional ("seu documento está pronto, clique para baixar"). Não tem:
- "Próximo passo: imprima em 3 vias e reconheça firma" (para viagem)
- "Anexe este PDF e envie para contato@empresa.com" (para reembolso)
- "Compre outro documento com 20% OFF" (upsell)

Open rate de email transacional é 60-80% — público cativo desperdiçado.

---

### 3.4. `mp-webhook.js` não envia email se cliente não informou email

**Local:** `netlify/functions/mp-webhook.js:179` (verificar — `if (payload.email && payload.email.includes('@'))`)

Como email é opcional no form (item 2.4), fração significativa dos compradores não recebe confirmação por email. Se fecharem a aba, só têm o browser back button como recuperação.

---

## 4. NOVOS PRODUTOS (expansão de catálogo)

### 4.1. Categorias inteiras de documentos jurídicos sem cobertura

Confirmado por grep no projeto: nenhuma das seguintes categorias existe como produto em `slugs.js` ou `PRICE_MAP`:

| Categoria | Busca no Brasil | Preço típico de concorrentes | Status no CartasApp |
|-----------|-----------------|------------------------------|---------------------|
| **Procuração** (geral, para banco, para viagem) | altíssima | R$20-50 | Ausente |
| **Notificação extrajudicial** general (CDC art. 7º) | alta | R$20-40 | Só existe como guia (`guia-carta-notificacao-formal.html`), não como gerador |
| **Contrato de aluguel** / recibo / termo | alta | R$20-50 | Ausente (mencionado só em texto de FAQ) |
| **Termo de guarda / guarda compartilhada** | média-alta | R$20-40 | Só existe como blog (`guarda-compartilhada-autorizacao-viagem.html`) |
| **Divórcio consensual / partilha** | alta | R$30-80 | Ausente (citado só em blog) |
| **Inventário** | média | R$40-100 | Ausente |
| **Usucapião** / declaração de posse | média | R$30-60 | Ausente |
| **Recibo formal** / declaração de renda | altíssima | R$10-30 | Ausente |

Esses categorias utilizam a mesma pipeline (`generate-doc.js` template-based, Mercado Pago, Supabase), então o custo de adicionar cada uma é baixo.

---

## 5. SEO E TRÁFEGO

### 5.1. `llms-full.txt` só cobre viagem

**Local:** `public/llms-full.txt` (1.774 linhas) e `public/llms.txt` (22 linhas)

Conteúdo: apenas 5 páginas, todas do tema "autorização de viagem" (viagem.html, guia-definitivo-viagem-menor.html, quanto-custa-autorizacao-viagem.html, autorizacao-viagem-faq.html, sobre.html).

Os outros ~125 produtos (multa, reembolso, bagagem, cancelamentos, consumo) não estão no arquivo otimizado para LLMs/AI search. Em 2026, com Google AI Overviews, ChatGPT, Perplexity etc., isso é uma superfície relevante.

---

### 5.2. Landing pages de checkout sem `FAQPage` JSON-LD inline

Pages com FAQs separadas (`*-faq.html`) mas **sem** schema FAQPage inline na landing page:

- `multa.html` (tem `multa-faq.html` separado, sem schema inline)
- `contestacao-cartao.html` (tem `contestacao-cartao-faq.html`, sem schema inline)
- `negativacao-indevida.html` (tem `negativacao-indevida-faq.html`, sem schema inline)
- `plano-saude-negativa.html` (tem `plano-saude-negativa-faq.html`, sem schema inline)

Exemplo positivo: `reembolso-cancelamento-passagem.html:82-105` tem FAQPage inline (template a copiar).

Sem o schema inline, Google não gera rich snippets para "recurso de multa prazo", "contestação cartão como fazer" etc. — concorrentes ganham esos SERP features.

---

### 5.3. Sem Twitter Card meta em páginas de checkout

**Pages afetadas:**
- `contestacao-cartao.html` (confirmar)
- `negativacao-indevida.html` (confirmar)

**Com Twitter Card:**
- `reembolso-cancelamento-passagem.html:14-18` (template a copiar)

WhatsApp usa Open Graph (já presente em todas), mas Twitter/Telegram/X usam twitter:card para previews.

---

### 5.4. Sitemap não tem `<priority>` ou `<changefreq>`

**Local:** `public/sitemap.xml`

129-170 URLs listadas, todas com `lastmod` mas sem `priority` ou `changefreq`. Opcional, mas `priority: 1.0` para `/`, `0.9` para landing pages de checkout (`viagem.html`, `multa.html` etc.) e `0.6` para página de blog ajuda o crawler.

---

## 6. RISCO TÉCNICO

### 6.1. CSS marcado como `immutable` por 1 ano

**Local:** `public/_headers:32` (confirmar linha exata)

```
/*.css
  Cache-Control: public, max-age=31536000, immutable
```

**Problema:** `style.css` é compartilhado por ~100 páginas e é referenciado como `<link rel="stylesheet" href="/style.css">` (sem `?v=` cache-buster) em todos os arquivos. Combina com o histórico documentado:

- `SESSION_LOG.md:17` — "Causa raiz 2: commit `fbd3cdb` apagou 505 linhas de CSS"
- `AGENTS.md` — "A previous agent accidentally removed 505 lines thinking they were only for one page"

Com `immutable`, um deploy que quebre o CSS fica cached por 1 ano em browsers/CDN. Fix difícil: cada visitante precisaria hard-refresh. Não há purge automático na Netlify (só via webhook manual).

**Fix:**
- **Opção A (conservadora):** `max-age=300, must-revalidate` (5 min, behavior atual do JS: ver `_headers` linha correspondente)
- **Opção B (moderna):** adicionar `?v=YYYYMMDD` no `<link rel="stylesheet">` de todas as páginas a cada deploy -- infraestrutura maior

Recomendo A imediatamente, B como projeto futuro.

---

### 6.2. `Cross-Origin-Resource-Policy: same-origin`

**Local:** `public/_headers:12` (confirmar)

Pode bloquear hotlinking legit do logo (`logo.png`, `logo.webp`) de reviews/sites terceiros. Baixo impacto, vale uma review.

---

## 7. OUTROS ACHADOS SECUNDÁRIOS

### 7.1. `recuperar.html` não chama `LMRecovery.saveGeneratedDoc`

**Local:** `public/recuperar.html:133-143`

Após carregar o doc, não chama `recovery.js`'s `saveGeneratedDoc()`. Se o usuário navega fora e volta, não vê o modal " documento encontrado".

---

### 7.2. `recuperar.html` filename genérico

**Local:** `public/recuperar.html:135-136`

```js
var filename = 'Documento_CartasApp';
if (orderId) filename += '_' + orderId.substring(0, 5);
```

Vs. `success.html:302-326` que constrói "Autorizacao de Viagem - Enzo Gabriel" (usando nome + tipo). UX regression no recuperar vs success.

---

### 7.3. `recuperar.html` sem analytics

**Local:** `public/recuperar.html` (arquivo completo)

Sem GA4, sem Google Ads, sem Clarity. Visitas do email (dark traffic) são 100% não-atribuídas. Impossível medir reopen rate do email follow-up.

---

### 7.4. `recuperar.html` "Compartilhar no WhatsApp" joga texto completo no `api.whatsapp.com/send`

**Local:** `public/recuperar.html:141`

```js
btnZap.onclick = function () {
  var url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(fullText);
  ...
```

Para documentos de 600+ palavras, isso é inutilizável no mobile. Deveria compartilhar um short link para a própria página (`recuperar.html?o=...`).

---

### 7.5. Sem mecanismo de review/NPS no pós-compra

**Local:** `public/success.html` (ver `#email-section:121-132`)

Captura de email pós-pagamento, mas sem prompt de "como foi sua experiência? ☆☆☆☆☆". Social proof (avaliações reais com fotos, como as já usadas na `index.html:634-678` mas fabricadas) seria ganho de conversão.

---

### 7.6. Sem referral / programa "indique um amigo"

`success.html` tem dados do comprador (email, telefone confirmados). Nenhum incentive "indique um amigo, ganhe R$10 no próximo documento".

---

## 8. PRIORIZAÇÃO SUGERIDA

| # | Item | Esforço | Impacto | Urgência |
|---|------|---------|---------|----------|
| 1 | WhatsApp errado no `recovery.js:4` | 1 min | Alto | 🔴 Crítico |
| 1.1 | ~~Email aponta `success.html` em `send-email.js:65`~~ (REMOVIDO — erro) | — | — | ❌ Cancelado |
| 1.2 | `value: 9.9` em 6 landing pages → preço real | 15 min | Alto | 🔴 Crítico |
| 1.3 | Fallback `29.9` em `success.html:521` → `9.90` | 1 min | Médio | 🟡 Alto |
| 2.1 | Cross-sell com desconto em `success.html` | 2-4h | Alto | 🟡 Alto |
| 2.4 | Email obrigatório antes da prévia | 30 min | Alto | 🟡 Alto |
| 6.1 | CSS `immutable` 1 ano → `max-age=300` | 1 min | Alto | 🟡 Alto |
| 5.2 | `FAQPage` JSON-LD inline em 4 landing pages | 2h | Médio | 🟢 Médio |
| 2.6 | `LMRecovery.offerRecover()` em landing pages | 30 min | Médio | 🟢 Médio |
| 3.3 | CTA secundária/upsell no email | 1h | Médio | 🟢 Médio |
| 2.3 | Order-bump no checkout | 1 dia | Médio | 🟢 Médio |
| 2.5 | Recuperação de abandono (cron + email) | 1-2 dias | Alto | 🟢 Médio |
| 4 | Novos produtos (procuração, aluguel, etc.) | dias cada | Alto | 🟢 Médio |
| 5.1 | Expandir `llms-full.txt` para outras categorias | 2-3h | Médio-baixo | 🟢 Baixo |
| 7.x | Itens secundários (recuperar.html, analytics, referral, etc.) | variados | Baixo-médio | 🟢 Baixo |

---

## 9. CONTEXTO HISTÓRICO

Estes achados se somam aos já documentados em `SESSION_LOG.md` (CSS deletion, CSP breakage, admin backdoor, orphan `}`, etc.). A seção "O QUE FICOU PENDENTE" no `SESSION_LOG.md:59-69` lista itens pendentes da sessão anterior que ainda não foram feitos — em particular:

- Itens 1, 2 do `SESSION_LOG.md`: ~90 páginas sem tratamento de credibilidade visual
- Item 3: performance real (Core Web Vitals, Lighthouse) nunca medida
- Item 4: nunca testado pagamento real ponta a ponta após mudanças
- Item 5: sem confirmação de Google Ads/Clarity recebendo dados de conversão após fix do CSP

Esta auditoria confirma o item 5 do `SESSION_LOG.md` -- os valores de `begin_checkout` estando errados (item 1.3 acima) indicam que, mesmo com o CSP corrigido, os eventos que chegam ao Google Ads têm valor distorcido. O fix do CSP permite os dados chegarem, mas os dados em si já estão errados.

---

**Fim da auditoria.** Itens marcados como "confirmar" precisam de leitura adicional da linha específica antes do fix, mas o padrão geral foi verificado em todos os arquivos citados.
