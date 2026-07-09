// Pré-renderiza title/H1/canonical/og/JSON-LD por slug para as páginas /doc/{slug}
// que estão no sitemap. Sem isso, crawlers sem JS (Bing, IA) viam sempre o
// mesmo doc.html genérico. Rodado a cada build (ver package.json).
'use strict';
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TEMPLATE_PATH = path.join(PUBLIC_DIR, 'doc.html');
const SLUGS_PATH = path.join(PUBLIC_DIR, 'slugs.js');
const SITEMAP_PATH = path.join(PUBLIC_DIR, 'sitemap.xml');
const OUT_DIR = path.join(PUBLIC_DIR, 'doc');

function loadSlugs() {
  const src = fs.readFileSync(SLUGS_PATH, 'utf8');
  const fn = new Function(`var window = {}; ${src}; return window.SLUGS;`);
  return fn();
}

function sitemapSlugs() {
  const xml = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const matches = [...xml.matchAll(/cartasapp\.com\.br\/doc\/([a-z0-9-]+)/g)];
  return new Set(matches.map((m) => m[1]));
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPage(template, cfg) {
  const safeTitle = escapeHtml(cfg.title);
  const price = typeof cfg.price === 'number' ? cfg.price : 9.9;
  const url = `https://www.cartasapp.com.br/doc/${cfg.slug}`;
  const desc = escapeHtml(`${cfg.title}. Preencha os dados e baixe em PDF/DOC.`);

  let html = template;
  // As 67 páginas /doc/{slug} são 95% idênticas ao template (só title/H1/meta
  // mudam) — Google rejeita indexação em todas por conteúdo quase-duplicado
  // (confirmado 2026-07-09: 0/5 amostradas indexadas, zero tráfego orgânico
  // em 90 dias). Mantém o noindex do template — são páginas funcionais
  // (prévia antes da compra), o SEO real acontece nas páginas-guia.
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${safeTitle} | Gerador</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${desc}">`);
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${safeTitle} | CartasApp">`);
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${desc}">\n    <meta property="og:url" content="${url}">`
  );
  html = html.replace(
    /<h1 id="docTitle" style="font-size: 42px; line-height: 1.2;">[\s\S]*?<\/h1>/,
    `<h1 id="docTitle" style="font-size: 42px; line-height: 1.2;">${safeTitle}</h1>`
  );

  const jsonLd = JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: cfg.title,
      description: `${cfg.title}. Preencha os dados e baixe em PDF/DOC.`,
      provider: { '@type': 'Organization', name: 'CartasApp', url: 'https://www.cartasapp.com.br/' },
      areaServed: { '@type': 'Country', name: 'Brazil' },
      offers: { '@type': 'Offer', priceCurrency: 'BRL', price: price.toFixed(2), url }
    },
    null,
    4
  );
  html = html.replace('</head>', `    <script type="application/ld+json">\n${jsonLd}\n    </script>\n</head>`);

  return html;
}

function main() {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const slugs = loadSlugs();
  const wanted = sitemapSlugs();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let count = 0;
  for (const cfg of slugs) {
    if (!wanted.has(cfg.slug)) continue;
    fs.writeFileSync(path.join(OUT_DIR, `${cfg.slug}.html`), buildPage(template, cfg), 'utf8');
    count++;
  }
  console.log(`[generate-doc-pages] ${count} páginas /doc/{slug} pré-renderizadas em ${OUT_DIR}`);
}

main();
