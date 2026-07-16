---
name: price-audit-sync
description: Audit all frontend pages against PRICE_MAP in netlify/functions/price-map.js and sync mismatched prices. Source of truth is price-map.js (imported by mp-checkout.js); frontend HTML must match exactly.
---

# Price Audit & Sync Skill

**Purpose:** Ensure every customer-facing page shows the exact price defined in `PRICE_MAP` (`netlify/functions/price-map.js`, imported by `mp-checkout.js`). Prevents conversion-killing mismatches like R$29,90 vs R$39,90 on the same page.

**Trigger:** Run after any pricing change, before major deployments, or when user reports "preço errado".

---

## Source of Truth

**File:** `netlify/functions/price-map.js`  
**Variable:** `const PRICE_MAP = { ... }` (lines ~3-115)  
**Consumer:** `netlify/functions/mp-checkout.js` imports via `const { PRICE_MAP } = require('./price-map')`

```javascript
// Current tiers (2026-06-24):
// "autorizacao-viagem-menor": 3990  → R$39,90 (HIGHEST)
// "recurso-multa-transito": 1990, "carta-bagagem": 1990, "carta-reembolso-cancelamento-passagem": 1990, "carta-reembolso-atraso-voo": 1990 → R$19,90
// Everything else: 990 → R$9,90
```

**Format:** Values are in **cents** (integer). Display as `R$${(value/100).toFixed(2).replace('.', ',')}`.

---

## Audit Scope

Check **all** price occurrences in:
| Location | Pattern | Pages |
|----------|---------|-------|
| Hero/CTA price | `R\$[\d.,]+` | All checkout pages |
| Product grid cards | `R\$[\d.,]+` | Landing pages (academia.html, telefonia.html, etc.) |
| "Quanto custa" guide pages | `R\$[\d.,]+` | quanto-custa-*.html |
| Combined price calculators | `R\$[\d.,]+` | quanto-custa-autorizacao-viagem.html |
| Docs (AGENTS.md, SESSION_LOG.md) | `R\$[\d.,]+` | Project docs |
| JSON-LD schemas (offers) | `"price": "..."` | Any page with Product schema |

**Known checkout pages (10):** viagem.html, multa.html, bagagem.html, reembolso-cancelamento-passagem.html, doc.html, contestacao-cartao.html, negativacao-indevida.html, arrependimento-compra-online.html, plano-saude-negativa.html, ecommerce.html

**Known landing pages (4+):** academia.html, telefonia.html, energia.html, educacao.html, saude.html (if created)

**Known guide pages (10+):** quanto-custa-*.html, cancelar-*-guia-completo.html

---

## Audit Procedure

### Step 1: Extract PRICE_MAP
```bash
# Get canonical prices in cents (from price-map.js, the actual source file)
node -e "
const fs = require('fs');
const content = fs.readFileSync('netlify/functions/price-map.js', 'utf8');
const match = content.match(/const PRICE_MAP = ({[\s\S]*?^});/m);
if (match) {
  const PRICE_MAP = eval('(' + match[1] + ')');
  Object.entries(PRICE_MAP).forEach(([slug, cents]) => {
    console.log(slug + ':' + (cents/100).toFixed(2).replace('.', ','));
  });
}
"
```

### Step 2: Scan All HTML Pages for Prices
```bash
# Find all price-like strings in public/*.html
grep -rno "R\$[0-9.,]*" public/*.html | grep -v node_modules
```

### Step 3: Compare & Report Mismatches
For each occurrence:
1. Identify which slug/product the page refers to
2. Look up canonical price in PRICE_MAP
3. Flag if different

**Common mismatch patterns:**
- `R$29,90` vs `R$39,90` on viagem pages (happened 2026-06-24)
- `R$9,90` on multa/bagagem/reembolso pages (should be R$19,90)
- `R$6,90` or `R$19,90` in docs (stale)

### Step 4: Fix Mismatches
Edit each HTML file directly. **Common locations:**
- Hero section: `<span class="price">R$XX,XX</span>`
- CTA button: `<a class="btn-cta">Gerar — R$XX,XX</a>`
- Product cards: `<p class="price">R$XX,XX</p>`
- JSON-LD Offer: `"price": "XX.XX", "priceCurrency": "BRL"`

### Step 5: Update Documentation
```bash
# Fix AGENTS.md, SESSION_LOG.md, PROJECT_SNAPSHOT.md
sed -i 's/R\$29,90/R\$39,90/g' AGENTS.md SESSION_LOG.md PROJECT_SNAPSHOT.md
# Verify no stale prices remain
grep -n "R\$[0-9.,]*" AGENTS.md SESSION_LOG.md PROJECT_SNAPSHOT.md
```

### Step 6: Validate & Deploy
```bash
# Quick smoke test: check a few key pages
curl -s https://www.cartasapp.com.br/viagem.html | grep -o "R\$[0-9.,]*"
curl -s https://www.cartasapp.com.br/multa.html | grep -o "R\$[0-9.,]*"

# Commit all changes
git add public/*.html AGENTS.md SESSION_LOG.md PROJECT_SNAPSHOT.md
git commit -m "fix(pricing): sync all frontend prices to PRICE_MAP (R$39,90 viagem, R$19,90 multa/bagagem/reembolso, R$9,90 demais)"
git push
```

---

## Automation Helper (One-Liner)

Run this to get a quick mismatch report:
```bash
node -e "
const fs = require('fs');
const checkout = fs.readFileSync('netlify/functions/price-map.js', 'utf8');
const pmMatch = checkout.match(/const PRICE_MAP = ({[\s\S]*?^});/m);
const PRICE_MAP = eval('(' + pmMatch[1] + ')');

const glob = require('glob');
const files = glob.sync('public/**/*.html');
const mismatches = [];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const prices = [...content.matchAll(/R\$([0-9]+)[.,]([0-9]{2})/g)];
  prices.forEach(([,reais, centavos]) => {
    const display = parseFloat(reais + '.' + centavos);
    // Heuristic: find slug from filename or nearby context
    const slug = f.replace('public/', '').replace('.html', '');
    if (PRICE_MAP[slug]) {
      const canonical = PRICE_MAP[slug] / 100;
      if (Math.abs(display - canonical) > 0.01) {
        mismatches.push({file: f, slug, display, canonical});
      }
    }
  });
});

console.log('MISMATCHES:', mismatches.length);
mismatches.forEach(m => console.log(m.file, '->', m.slug, 'display:', m.display, 'canonical:', m.canonical));
"
```

---

## Historical Fixes (Reference)

| Date | Commit | Issue | Fix |
|------|--------|-------|-----|
| 2026-06-24 | d1f999f | viagem.html hero R$39,90, checkout R$29,90, CTA R$39,90 | Unified to R$39,90 |
| 2026-06-24 | d1f999f | AGENTS.md, SESSION_LOG.md had R$29,90 / R$6,90 | Updated all to match PRICE_MAP |
| 2026-06-24 | d1f999f | quanto-custa-autorizacao-viagem.html combined price wrong | Recalculated with R$39,90 base |

---

## Quick Reference Card

| Product (slug) | Tier | Price (cents) | Display |
|----------------|------|---------------|---------|
| autorizacao-viagem-menor | PREMIUM | 3990 | **R$39,90** |
| recurso-multa-transito | MID | 1990 | **R$19,90** |
| carta-bagagem | MID | 1990 | **R$19,90** |
| carta-reembolso-cancelamento-passagem | MID | 1990 | **R$19,90** |
| carta-reembolso-atraso-voo | MID | 1990 | **R$19,90** |
| Everything else | BASE | 990 | **R$9,90** |

**Rule:** Before "correcting" any price on any page, **check PRICE_MAP first**. The function is the only source of truth.