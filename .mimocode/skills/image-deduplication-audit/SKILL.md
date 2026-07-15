---
name: image-deduplication-audit
description: Audit all content pages for duplicate images, download visually distinct replacements from MULTIPLE sources (Unsplash, Pexels, Pixabay), update frontmatter, and verify uniqueness. Based on 3+ rounds of deduplication in ses_0e63fc025ffe.
---

# Image Deduplication & Sourcing Skill

**Project:** CartasApp (and JMF Astro site)  
**Image directory:** `public/assets/images/` (or `src/assets/images/`)  
**Content sources:** `src/content/blog/*.md` (Astro) or `public/*.html` (CartasApp static)  
**Frontmatter key:** `image: "blog-filename.jpg"`  

---

## When to Use

- After any batch content creation (actors, subagents, manual)
- When user reports "fotos duplicadas" or "mesma imagem"
- Before major deploy to ensure visual diversity
- Periodic audit (monthly)

---

## The Core Problem (from session history)

> **User:** "estao todos com a mesma imagem tambem. nao da assim, voce arruma uma imagem repetida e usa outra repetindo ela de novo, tem que ver isso, pegar outro banco de dados, outrs lugares com imagens relevantes"

**Root cause:** Unsplash photos for business/finance/legal topics look visually similar despite different IDs. Downloading from a single source doesn't guarantee visual distinctness.

**Solution:** Use **multiple stock photo sources** with **explicitly different search themes**.

---

## Workflow

### Phase 1: Full Collision Audit

```bash
# For Astro blog (frontmatter-based)
# Map every post -> its image
cd /path/to/project
for f in src/content/blog/*.md; do
  img=$(grep '^image:' "$f" | head -1 | sed 's/image: *//' | tr -d '"'"'")
  echo "$(basename "$f") -> $img"
done | sort -k3,3 | awk '{print $3 " -> " $1}' | uniq -D -f1
# Output shows: image.jpg -> post1.md, post2.md (COLLISION)

# For static HTML (CartasApp)
grep -rn 'blog-.*\.jpg' public/*.html | sed -E 's/.*(blog-[^"]+\.jpg).*/\1/' | sort | uniq -d
```

**Save output** as `image-collisions.txt` — this is your work list.

### Phase 2: Plan Replacements

For EACH colliding image, assign a **unique source + theme**:

| Post (slug) | Current Image | New Source | Search Theme (distinct!) |
|-------------|---------------|------------|--------------------------|
| fluxo-de-caixa | blog-fluxo-de-caixa.jpg | **Pexels** | "financial dashboard analytics charts" |
| fator-r-simples | blog-fator-r-simples.jpg | **Pixabay** | "tax calculator spreadsheet brazil" |
| alvara-funcionamento | blog-alvara-funcionamento.jpg | **Unsplash** | "municipal building license document" |
| regularizar-debitos | blog-regularizar-debitos.jpg | **Pexels** | "debt negotiation handshake contract" |

**Rule:** No two posts use the same source. Themes must be visually distinct (charts vs buildings vs people vs documents).

### Phase 3: Download & Replace

```bash
# Example: Download from Pexels (requires API key) or manual download
# Manual approach (reliable):
# 1. Search Pexels.com for "financial dashboard analytics charts"
# 2. Download 1200x800 (landscape, blog hero ratio)
# 3. Save as public/assets/images/blog-fluxo-de-caixa.jpg
# 4. Update frontmatter: image: "blog-fluxo-de-caixa.jpg"

# Verify file exists and is valid
file public/assets/images/blog-fluxo-de-caixa.jpg
identify public/assets/images/blog-fluxo-de-caixa.jpg  # ImageMagick
```

### Phase 4: Verify Uniqueness (Perceptual Hash)

```bash
# Install: npm install -g imagediff or use Python
# Quick perceptual hash comparison (dHash)
python3 -c "
import imagehash, PIL.Image, os, sys
hashes = {}
for f in os.listdir('public/assets/images/'):
    if f.startswith('blog-') and f.endswith('.jpg'):
        h = imagehash.dhash(PIL.Image.open(os.path.join('public/assets/images/', f)))
        if h in hashes:
            print(f'COLLISION: {f} == {hashes[h]} (hash: {h})')
        else:
            hashes[h] = f
print('Unique images:', len(hashes))
"
```

**Threshold:** dHash distance < 10 = visually similar. Investigate.

### Phase 5: Build & Visual Spot-Check

```bash
# Build site
npm run build  # or npx astro build

# Open 3-5 random posts in browser, verify hero images look different
# Check: https://localhost:4321/blog/slug
```

---

## Approved Stock Sources (Prioritize Diversity)

| Source | Best For | Access |
|--------|----------|--------|
| **Pexels** | Business, finance, technology, people working | Free, API available |
| **Pixabay** | Illustrations, vectors, abstract concepts, documents | Free, API available |
| **Unsplash** | High-quality photography, lifestyle, offices | Free, API available |
| **Freepik** | Vectors, illustrations, infographics | Free with attribution / Premium |
| **Rawpixel** | Diverse people, modern office scenes | Free with attribution |
| **AI Generation** (DALL-E, Midjourney) | Ultra-specific concepts (e.g., "CNPJ certificate with Brazilian flag") | Paid / local |

**Strategy for legal/consumer topics:**
- Contracts/documents → Pixabay (document vectors)
- Money/finance → Pexels (charts, calculators, coins)
- People/consumers → Unsplash/Rawpixel (diverse Brazilian people)
- Abstract concepts → Freepik vectors or AI generation

---

## CartasApp Static HTML Adaptation

For `public/*.html` pages with inline images:

```bash
# Find all image references
grep -rn 'src=".*blog-' public/*.html | sed -E 's/.*src="([^"]+)".*/\1/' | sort | uniq -c | sort -rn

# Audit collisions
grep -rn 'src=".*blog-' public/*.html | sed -E 's/.*(blog-[^"]+).*/\1/' | sort | uniq -d
```

Replace in HTML:
```bash
# Update src attribute
sed -i 's|src="assets/images/blog-old.jpg"|src="assets/images/blog-new.jpg"|g' public/page.html
```

---

## Checklist per Audit Round

- [ ] Collision map generated (`image-collisions.txt`)
- [ ] Replacement plan created with **unique source + theme per post**
- [ ] All replacement images downloaded to `public/assets/images/`
- [ ] All frontmatter / HTML `src` attributes updated
- [ ] Perceptual hash check passes (no near-duplicates)
- [ ] Build succeeds
- [ ] Visual spot-check: 5 random posts look distinct
- [ ] Commit message: `fix(images): deduplicate blog heroes — N collisions fixed, sources: Pexels/Pixabay/Unsplash`

---

## Automation Note

**Do not fully automate downloads** — the visual theme selection requires human judgment. The audit (Phase 1) and verification (Phase 4) CAN be scripted. Phase 2-3 are manual curation.

**Semi-automation idea:** A Node script that:
1. Runs collision audit
2. Opens browser tabs for each collision on Pexels/Pixabay/Unsplash with pre-filled search themes
3. You download manually, script verifies hashes and updates frontmatter

---

## Historical Collisions Fixed (ses_0e63fc025ffe)

| Round | Collisions | Posts Fixed | Sources Used |
|-------|------------|-------------|--------------|
| 1 | 6 | alvara-funcionamento, abertura-empresa-indaial, contador-gaspar, nfs-e-blumenau, impostos-indaial, regimes-tributarios | Unsplash |
| 2 | 4 | fluxo-de-caixa, fator-r-simples, alvara-funcionamento (again), regularizar-debitos | Unsplash (user rejected — too similar) |
| 3 (pending) | 4+ | User demands **different sources** | **Pexels, Pixabay, AI** |

**Lesson:** Round 2 failed because all Unsplash. Round 3 must enforce source diversity.