---
name: seo-landing-page-create
description: Create SEO-optimized category landing pages for CartasApp using the Cartório Moderno visual identity, FAQPage schema, legal citations, PRICE_MAP pricing, and internal linking patterns. One page per product category (academia, telefonia, energia, educacao, viagem, transito, etc.).
---

# SEO Landing Page Creation Skill

**Project:** CartasApp (cartasapp.com.br)  
**Template reference:** `public/academia.html`, `public/telefonia.html`, `public/energia.html`, `public/educacao.html` (created 2026-06-24)  
**Visual identity:** Cartório Moderno (Source Serif 4, Public Sans, IBM Plex Mono, navy/gold palette, notarial seal SVG hero, "ementa numerada" step indicator)  
**Analytics on all checkout pages:** GA4 (AW-1021062139 + G-D40QPP9KNP), Clarity (u4x90t35gk), theme.js  

---

## When to Use

- Creating a new category landing page (e.g., `public/saude.html`, `public/imoveis.html`)
- User requests "faz uma landing para [categoria]" with full SEO
- Content expansion phase for new product verticals

---

## Prerequisites

1. **Slug exists in `public/slugs.js`** — verify the product catalog has entries for this category
2. **Price in `PRICE_MAP`** — check `netlify/functions/mp-checkout.js` for correct tier
3. **Legal basis identified** — CDC, ANATEL, ANEEL, Lei 13.455/2017, etc. (real Brazilian laws only)
4. **Phone numbers for brand-specific guides** — exact SAC numbers (10518, 10561, 1056, 10315, 10432, etc.)

---

## Page Structure Template

Every landing page follows this structure:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>[Categoria] — CartasApp</title>
  <meta name="description" content="[150-160 chars: benefício principal + categoria + CartasApp]">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://www.cartasapp.com.br/[slug].html">
  <link rel="stylesheet" href="/style.css">
  
  <!-- JSON-LD: FAQPage schema (required) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {"@type": "Question", "name": "Pergunta 1", "acceptedAnswer": {"@type": "Answer", "text": "Resposta 1"}},
      {"@type": "Question", "name": "Pergunta 2", "acceptedAnswer": {"@type": "Answer", "text": "Resposta 2"}}
      // 5-8 FAQs per page
    ]
  }
  </script>
  
  <!-- Open Graph + Twitter Card -->
  <meta property="og:title" content="[Título da página]">
  <meta property="og:description" content="[Meta description]">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://www.cartasapp.com.br/[slug].html">
  <meta property="og:image" content="https://www.cartasapp.com.br/logo.png">
  <meta name="twitter:card" content="summary_large_image">
  
  <!-- BreadcrumbList JSON-LD -->
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {"@type":"ListItem","position":1,"name":"Início","item":"https://www.cartasapp.com.br/"},
    {"@type":"ListItem","position":2,"name":"[Categoria]","item":"https://www.cartasapp.com.br/[slug].html"}
  ]}
  </script>
</head>
<body>
  <!-- Hero com Cartório Moderno identity -->
  <header class="hero">
    <div class="hero-content">
      <div class="notarial-seal" aria-hidden="true">
        <svg>...</svg>  <!-- Copy from academia.html -->
      </div>
      <h1>[Título da Categoria]</h1>
      <p class="hero-subtitle">[Subtítulo com benefício claro]</p>
      <div class="ementa-numerada" role="list" aria-label="Passos">
        <span role="listitem">1. Preencha</span>
        <span role="listitem">2. Confira</span>
        <span role="listitem">3. Baixe</span>
      </div>
      <a href="/[slug-produto].html" class="btn-cta">Gerar [Documento] — R$[preço]</a>
    </div>
  </header>

  <main>
    <!-- Intro + Legal Basis -->
    <section class="section intro">
      <h2>Por que usar a CartasApp para [categoria]?</h2>
      <p>Base legal: [CDC Art. X, Lei Y, Resolução Z — citações reais]</p>
      <ul class="benefits">...</ul>
    </section>

    <!-- Product Grid (cards linking to individual checkout pages) -->
    <section class="section products">
      <h2>[Categoria] — Documentos Disponíveis</h2>
      <div class="grid">
        <!-- One card per slug in this category -->
        <article class="card">
          <h3>[Nome do Produto]</h3>
          <p class="price">R$[preço do PRICE_MAP]</p>
          <a href="/[slug].html" class="btn">Gerar Documento</a>
        </article>
      </div>
    </section>

    <!-- FAQ Section (feeds FAQPage schema) -->
    <section class="section faq">
      <h2>Dúvidas Frequentes</h2>
      <details class="faq-item">
        <summary>Pergunta 1</summary>
        <p>Resposta completa com base legal.</p>
      </details>
      <!-- 5-8 FAQs -->
    </section>

    <!-- Internal Links: "Guias Relacionados" -->
    <section class="section related-guides">
      <h2>Guias Relacionados</h2>
      <nav class="guide-links">
        <a href="/guia-[topico].html">Guia [Tópico]</a>
        <!-- 4-6 links to existing guide pages -->
      </nav>
    </section>
  </main>

  <footer class="footer">
    <p>&copy; 2025 CartasApp. Todos os direitos reservados.</p>
    <nav>
      <a href="/politica-privacidade.html">Privacidade</a>
      <a href="/termos-uso.html">Termos</a>
      <a href="/sobre.html">Sobre</a>
    </nav>
  </footer>

  <!-- Scripts (copy from academia.html) -->
  <script src="/theme.js"></script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=AW-1021062139"></script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-D40QPP9KNP"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'AW-1021062139');
    gtag('config', 'G-D40QPP9KNP');
  </script>
  <script src="https://cdn.clarity.ms/u4x90t35gk.js" async></script>
</body>
</html>
```

---

## Step-by-Step Creation Process

### 1. Identify Category Slugs & Prices
```bash
# From slugs.js - find all products in this category
grep -i "categoria" public/slugs.js
# From PRICE_MAP - verify prices
grep -A 100 "const PRICE_MAP" netlify/functions/mp-checkout.js
```

### 2. Research Legal Basis (Required)
- Search for: CDC articles, specific laws (Lei 13.455/2017 para academia), ANATEL resolutions, ANEEL norms, ANAC Resolution 400
- **Never invent laws** — cite actual article numbers

### 3. Create the HTML File
- Copy `public/academia.html` as template
- Replace category-specific content
- Keep Cartório Moderno CSS classes exactly (hero, notarial-seal, ementa, card, btn-cta, etc.)
- Update all slugs in product grid to match `slugs.js`

### 4. Add to Sitemap
```bash
# Add URL to public/sitemap.xml before </urlset>
# Format:
# <url><loc>https://www.cartasapp.com.br/[slug].html</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
```

### 5. Add Internal Links from Homepage
Edit `public/index.html` → "Guias e Dicas" section → add to appropriate category

### 6. Validate & Deploy
```bash
# Syntax check
node --check public/[slug].html 2>&1 || true  # HTML not JS, but checks for obvious issues

# Verify JSON-LD is valid
# (copy JSON-LD blocks to jsonlint.com or use node -e "JSON.parse(...)")

# Commit & push
git add public/[slug].html public/sitemap.xml public/index.html
git commit -m "feat(seo): add [categoria] landing page with Cartório Moderno identity, FAQPage schema, legal citations"
git push
```

---

## Quality Checklist (Every Page)

| Check | How to Verify |
|-------|---------------|
| ✅ Canonical URL matches filename | `<link rel="canonical" href="https://www.cartasapp.com.br/[slug].html">` |
| ✅ Title ≤ 60 chars | Count chars in `<title>` |
| ✅ Meta description 150-160 chars | Count chars in `meta[name="description"]` |
| ✅ FAQPage schema valid JSON-LD | `node -e "JSON.parse(require('fs').readFileSync('public/[slug].html','utf8').match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/)[1])"` |
| ✅ BreadcrumbList schema present | Same validation |
| ✅ Prices match PRICE_MAP exactly | Cross-reference each product card price |
| ✅ Legal citations are real laws | Verify article numbers exist |
| ✅ Internal links work (not 404) | `curl -I https://www.cartasapp.com.br/[linked-slug].html` |
| ✅ Cartório Moderno classes intact | `hero`, `notarial-seal`, `ementa`, `card`, `btn-cta`, `faq-item` |
| ✅ Analytics scripts present | GA4 (2 IDs) + Clarity |
| ✅ Added to sitemap.xml | Check file |
| ✅ Added to homepage "Guias e Dicas" | Check index.html |

---

## Common Mistakes to Avoid

| Mistake | Consequence |
|---------|-------------|
| Using fake urgency badges ("Oferta hoje", timer) | Removed in SESSION_LOG.md §4 — credibility violation |
| Fake ratings ("4,9 de 5 — centenas de clientes") | No review system exists — removed in commit 402c038 |
| Admin backdoor `?modo=admin` | Security hole — removed from all checkout pages |
| Emoji decorativos (✅🔥🛡️) | Unprofessional — replaced with SVG/text in §3 |
| Stale prices not matching PRICE_MAP | Conversion confusion — audit with `price-audit-sync` skill |
| Missing FAQPage schema | Lost rich snippet eligibility |
| Broken internal links | Crawl errors, poor UX |

---

## Example: Creating `public/saude.html` (Plano de Saúde)

**Input:**
- Category: Planos de saúde / negativa de cobertura
- Slugs from `slugs.js`: `plano-saude-negativa`, `reembolso-plano-saude`, `carencia-plano-saude`
- Prices: All R$9,90 (per PRICE_MAP)
- Legal basis: Lei 9.656/98 (Lei dos Planos de Saúde), RN ANS 395, CDC Art. 6º, 14, 51
- Brand guides: Amil, Bradesco Saúde, SulAmérica, Unimed, NotreDame

**Output:** `public/saude.html` following template above, with:
- Hero: "Negativa de Cobertura de Plano de Saúde"
- Product grid: 3 cards linking to individual checkout pages
- FAQ: 6 questions (negativa urgência, reembolso, carência, rede credenciada, reajuste, ANS)
- Related guides: `cancelar-plano-saude-guia-completo.html`, `quanto-custa-cancelar-plano-saude.html`, `como-reclamar-ans-guia.html`
- All schemas, analytics, Cartório Moderno identity intact