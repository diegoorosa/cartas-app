// Adiciona <lastmod> real (data do último commit git) em cada <url> do sitemap.xml.
// Roda depois do generate-doc-pages.js (build), pois depende de public/doc/*.html existir.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const SITEMAP_PATH = path.join(REPO_ROOT, 'public', 'sitemap.xml');

function urlToRelPath(url) {
  const u = new URL(url);
  if (u.pathname === '/') return 'public/index.html';
  if (u.pathname.startsWith('/doc/')) return `public/doc/${u.pathname.slice('/doc/'.length)}.html`;
  return `public${u.pathname}`;
}

function lastModifiedDate(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  try {
    const out = execSync(`git log -1 --format=%aI -- "${relPath}"`, { cwd: REPO_ROOT }).toString().trim();
    if (out) return out.slice(0, 10);
  } catch (_) {
    // sem histórico git, cai no fallback abaixo
  }
  if (fs.existsSync(absPath)) return fs.statSync(absPath).mtime.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function run() {
  const xml = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const updated = xml.replace(/<url><loc>([^<]+)<\/loc>(?:<lastmod>[^<]*<\/lastmod>)?<\/url>/g, (_match, url) => {
    const date = lastModifiedDate(urlToRelPath(url));
    return `<url><loc>${url}</loc><lastmod>${date}</lastmod></url>`;
  });
  fs.writeFileSync(SITEMAP_PATH, updated);
  console.log('sitemap.xml: lastmod atualizado.');
}

run();
