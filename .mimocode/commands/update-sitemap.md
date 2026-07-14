---
description: Add new page URLs to public/sitemap.xml, validate XML, and deploy. Run after creating any new public/*.html page.
---

# Update Sitemap Command

**Usage:** `/update-sitemap <slug1> [slug2] [slug3] ...`  
**Example:** `/update-sitemap saude imoveis` (adds saude.html and imoveis.html)

---

## What It Does

1. Adds `<url>` entries for each slug to `public/sitemap.xml`
2. Validates XML syntax
3. Stages changes for commit
4. Provides commit message template

---

## Sitemap Structure (Current)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.cartasapp.com.br/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.cartasapp.com.br/viagem.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <!-- ... ~204 URLs total as of 2026-06-25 -->
</urlset>
```

---

## Priority & Changefreq Rules

| Page Type | Priority | Changefreq |
|-----------|----------|------------|
| Homepage (`index.html`) | 1.0 | daily |
| Main checkout pages (viagem, multa, bagagem, reembolso, doc) | 0.9 | weekly |
| Category landings (academia, telefonia, energia, educacao) | 0.8 | weekly |
| Product checkout pages (/doc/*, individual .html) | 0.8 | weekly |
| Guide/FAQ pages (guia-*, *-faq.html, como-*, modelo-*) | 0.7 | weekly |
| Blog posts (blog.html, individual articles) | 0.6 | monthly |
| Legal/policy pages | 0.5 | monthly |

---

## Procedure

### 1. Add URLs
For each slug provided, append before `</urlset>`:

```xml
  <url>
    <loc>https://www.cartasapp.com.br/<slug>.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
```

**Adjust priority/changefreq** per table above if needed.

### 2. Validate XML
```bash
# Check well-formed
xmllint --noout public/sitemap.xml 2>&1 || python3 -c "
import xml.etree.ElementTree as ET
ET.parse('public/sitemap.xml')
print('XML valid')
"

# Count URLs
grep -c "<loc>" public/sitemap.xml
```

### 3. Verify URLs Are Accessible (Optional but Recommended)
```bash
# Quick HEAD check on new URLs
for slug in "$@"; do
  curl -sI "https://www.cartasapp.com.br/${slug}.html" | head -1
done
```

### 4. Stage & Commit
```bash
git add public/sitemap.xml
git commit -m "chore(seo): add $(echo $@ | wc -w) URLs to sitemap.xml — $(echo $@ | tr ' ' ', ')"
git push
```

---

## One-Liner for Batch Add

```bash
# Usage: bash update-sitemap.sh slug1 slug2 slug3
# Save as update-sitemap.sh in project root

#!/usr/bin/env bash
set -euo pipefail

SITEMAP="public/sitemap.xml"
BASE="https://www.cartasapp.com.br"

for slug in "$@"; do
  # Determine priority/changefreq based on slug pattern
  if [[ "$slug" == "index" ]]; then
    prio="1.0"; freq="daily"
  elif [[ "$slug" =~ ^(viagem|multa|bagagem|reembolso|doc)$ ]]; then
    prio="0.9"; freq="weekly"
  elif [[ "$slug" =~ ^(academia|telefonia|energia|educacao|saude|transito|viagem)$ ]]; then
    prio="0.8"; freq="weekly"
  elif [[ "$slug" =~ ^(guia-|como-|modelo-|*-faq|direitos-|quanto-custa-) ]]; then
    prio="0.7"; freq="weekly"
  elif [[ "$slug" =~ ^blog ]]; then
    prio="0.6"; freq="monthly"
  else
    prio="0.8"; freq="weekly"
  fi

  # Insert before </urlset>
  sed -i "/<\/urlset>/i\\
  <url>\n    <loc>${BASE}/${slug}.html</loc>\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>\n  </url>" "$SITEMAP"
done

# Validate
python3 -c "import xml.etree.ElementTree as ET; ET.parse('$SITEMAP'); print('XML valid')"

# Count
echo "Total URLs: $(grep -c '<loc>' $SITEMAP)"

# Show diff
git diff "$SITEMAP"
```

---

## Integration with Other Workflows

| Trigger | Command |
|---------|---------|
| After `seo-landing-page-create` skill | `/update-sitemap <new-slug>` |
| After creating guide pages batch | `/update-sitemap guia-x guia-y guia-z` |
| After blog post creation | `/update-sitemap blog-novo-artigo` |
| Manual price/doc fixes | Not needed (no new URLs) |

---

## Historical Context

- **2026-06-24:** 15 URLs added (commit d1f999f) — fixed missing pages from sitemap
- **2026-06-25:** ~17 URLs added (commit 9200240) — 47+ new pages from content blitz
- **Current count:** ~204 URLs in sitemap.xml

**Rule:** Every new `public/*.html` page MUST be added to sitemap.xml before or immediately after deploy. Google uses sitemap as discovery signal.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting `.html` in `<loc>` | Always use `https://www.cartasapp.com.br/<slug>.html` |
| Wrong priority for checkout pages | Main checkout = 0.9, guides = 0.7 |
| Duplicate URLs | Check `grep <slug> public/sitemap.xml` before adding |
| Invalid XML (unescaped &) | Use `&` in URLs; validator catches this |
| Not deploying after add | `git push` triggers Netlify deploy automatically |