---
description: Audit a CartasApp checkout page for trust violations (fake urgency, fake counters, fake ratings, emoji decor, admin backdoors) and apply the Cartório Moderno credibility fixes.
agent: code-reviewer
---

# Audit Checkout Trust Command

**Usage:** `/audit-checkout-trust [slug]`  
**Example:** `/audit-checkout-trust viagem` → audits `public/viagem.html`

---

## What This Checks (from SESSION_LOG.md §3-4)

| Violation | Description | Fix Applied |
|-----------|-------------|-------------|
| **Admin backdoor** | `?modo=admin` creates "💰 Gerar Admin" button calling `generate-doc` with `admin_key` | Remove entirely |
| **Fake urgency badge** | "Oferta hoje: de R$29,90 por R$9,90" + timer "⚡ O preço pode voltar ao normal em breve" | Remove — price never changed |
| **Fake rating** | "⭐ 4,9 de 5 — centenas de [clientes] já usaram..." | Remove — no review system exists |
| **Emoji decorations** | ✅🔥🛡️⚖️👁️📂💸 in feature badges, guarantee badges, step icons | Replace with SVG/text |
| **Fake counter** | "Últimos 12 documentos emitidos hoje" (static text) | Remove — same as old rolling feed |
| **Rainbow avatar gradients** | Testimonial avatars with purple/green/orange gradients | Unify to navy/slate single tone |
| **Hero blob animation** | Floating animation on hero blobs (playful/unprofessional) | Remove animation, unify blue tones |

---

## Target Pages (Checkout Pages with Real Payment)

1. `public/viagem.html` — Autorização de Viagem (R$39,90)
2. `public/multa.html` — Recurso de Multa (R$19,90)
3. `public/bagagem.html` — Carta de Bagagem (R$19,90)
4. `public/reembolso-cancelamento-passagem.html` — Reembolso Voo (R$19,90)
5. `public/doc.html` — Template genérico `/doc/*` (R$9,90)
6. `public/contestacao-cartao.html` — Contestação Cartão (R$9,90)
7. `public/negativacao-indevida.html` — Negativação Indevida (R$9,90)
8. `public/arrependimento-compra-online.html` — Arrependimento Compra (R$9,90)
9. `public/plano-saude-negativa.html` — Plano Saúde Negativa (R$9,90)
10. `public/ecommerce.html` — E-commerce (R$9,90)

**Note:** Blog/FAQ/guide pages (90+) are NOT in scope — only pages with actual Mercado Pago checkout.

---

## Audit Procedure

### 1. Read the Page
```bash
cat public/[slug].html
```

### 2. Search for Violations
```bash
# Admin backdoor
grep -n "modo.*admin\|\?modo=admin" public/[slug].html

# Fake urgency
grep -n -i "oferta hoje\|preço pode voltar\|timer\|urgência" public/[slug].html

# Fake rating
grep -n -i "4,9 de 5\|centenas.*já usaram\|avaliação" public/[slug].html

# Emoji decorations
grep -n "✅\|🔥\|🛡️\|⚖️\|👁️\|📂\|💸\|💰\|🏛️" public/[slug].html

# Fake counter
grep -n -i "últimos.*documentos\|emitidos hoje" public/[slug].html

# Rainbow avatars
grep -n "gradient.*purple\|gradient.*green\|gradient.*orange" public/[slug].html

# Hero blob animation
grep -n "animation.*blob\|@keyframes.*blob" public/style.css
```

### 3. Apply Fixes (Per SESSION_LOG.md commits 19f1fb7, 530dce4, 402c038)

#### Remove Admin Backdoor
```html
<!-- REMOVE this entire block -->
<script>
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('modo') === 'admin') {
    document.getElementById('admin-btn').style.display = 'block';
  }
</script>
<button id="admin-btn" style="display:none" onclick="generateAdmin()">💰 Gerar Admin</button>
```

#### Remove Fake Urgency
```html
<!-- REMOVE -->
<div class="urgency-badge">⚡ Oferta hoje: de R$29,90 por <strong>R$9,90</strong></div>
<div class="price-timer">⚡ O preço pode voltar ao normal em breve</div>
```

#### Remove Fake Rating
```html
<!-- REMOVE -->
<div class="rating-badge">⭐ 4,9 de 5 — centenas de clientes já usaram</div>
```

#### Replace Emoji Decorations
```html
<!-- BEFORE -->
<span class="feature-icon">✅</span>
<span class="guarantee-icon">🛡️</span>
<span class="step-icon">👁️</span>

<!-- AFTER: Use SVG from Cartório Moderno set -->
<span class="feature-icon"><svg class="icon-check">...</svg></span>
<span class="guarantee-icon"><svg class="icon-shield">...</svg></span>
<span class="step-icon"><svg class="icon-eye">...</svg></span>
```

#### Fix Testimonial Avatars
```css
/* BEFORE: .testimonial-avatar { background: linear-gradient(135deg, #purple, #green, #orange); } */
/* AFTER: */
.testimonial-avatar {
  background: linear-gradient(135deg, #1e2a3a 0%, #2d3e50 100%); /* navy/slate */
}
```

#### Fix Hero Blobs (in style.css — affects ALL pages)
```css
/* REMOVE */
.hero-blob { animation: float 20s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }

/* UNIFY COLORS */
.hero-blob-1 { background: rgba(30, 58, 95, 0.08); } /* navy */
.hero-blob-2 { background: rgba(30, 58, 95, 0.05); } /* navy lighter */
/* Remove cyan/blue mix */
```

### 4. Verify Cartório Moderno Identity Is Intact

Ensure these classes exist and are styled:
- `.hero` with `.notarial-seal` SVG
- `.ementa` step indicator (1. Preencha, 2. Confira, 3. Baixe)
- `.btn-cta` primary button
- `.card` product grid cards
- `.faq-item` with `<details>/<summary>`
- `.price` displays correct PRICE_MAP value

### 5. Validate & Deploy
```bash
# Quick syntax check
node --check public/[slug].html 2>&1 || true

# Verify no violations remain
grep -n "modo.*admin\|oferta hoje\|4,9 de 5\|✅\|🔥\|🛡️\|últimos.*documentos" public/[slug].html
# Should return empty

# Commit
git add public/[slug].html public/style.css
git commit -m "fix(trust): remove fake urgency/rating/backdoor from [slug].html — Cartório Moderno credibility"
git push
```

---

## Quick One-Liner Audit

```bash
slug=viagem
echo "=== AUDIT: $slug ===" && \
grep -n "modo.*admin\|\?modo=admin" public/$slug.html && echo "🔴 ADMIN BACKDOOR" || echo "✅ No admin backdoor" && \
grep -ni "oferta hoje\|preço pode voltar" public/$slug.html && echo "🔴 FAKE URGENCY" || echo "✅ No fake urgency" && \
grep -ni "4,9 de 5\|centenas.*já usaram" public/$slug.html && echo "🔴 FAKE RATING" || echo "✅ No fake rating" && \
grep -n "✅\|🔥\|🛡️\|⚖️\|👁️\|📂\|💸" public/$slug.html && echo "🔴 EMOJI DECOR" || echo "✅ No emoji decor" && \
grep -ni "últimos.*documentos\|emitidos hoje" public/$slug.html && echo "🔴 FAKE COUNTER" || echo "✅ No fake counter"
```

Run for all 10 pages:
```bash
for s in viagem multa bagagem reembolso-cancelamento-passagem doc contestacao-cartao negativacao-indevida arrependimento-compra-online plano-saude-negativa ecommerce; do
  slug=$s bash -c '...one-liner above...'
done
```

---

## Output Format

After audit, report:

```
## Trust Audit: public/[slug].html

### Violations Found
- [ ] Admin backdoor
- [ ] Fake urgency badge
- [ ] Fake rating
- [ ] Emoji decorations (N instances)
- [ ] Fake counter
- [ ] Rainbow avatars
- [ ] Hero blob animation (global style.css)

### Fixes Applied
- [ ] Admin backdoor removed
- [ ] Fake urgency removed
- [ ] Fake rating removed
- [ ] Emojis → SVG icons (N replaced)
- [ ] Fake counter removed
- [ ] Avatars → navy/slate gradient
- [ ] Hero blobs → static navy, no animation

### Verified
- [ ] Cartório Moderno classes intact
- [ ] Price matches PRICE_MAP
- [ ] JSON-LD schemas valid
- [ ] Analytics scripts present
- [ ] No console errors on load

### Commit
`git commit -m "fix(trust): [slug] — removed X violations, Cartório Moderno credibility"`
```