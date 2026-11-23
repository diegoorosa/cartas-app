/**
 * Relatorio GSC (Search Console API) - cartasapp.com.br
 *
 * Uso:
 *   node scripts/gsc-report.js            -> ultimos 28d vs 28d anteriores + 7d + 90d
 *   node scripts/gsc-report.js --days=90  -> janela customizada
 *
 * Credencial: service account com acesso siteOwner na propriedade.
 * Caminho default: C:\Users\Administrator\Desktop\site-jmf-astro\gsc-credentials.json
 * Pode sobrescrever com a env GSC_CREDENTIALS.
 *
 * Saida: .gsc-analysis/report-<data>.json (gitignored) + resumo no stdout.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CRED_PATH = process.env.GSC_CREDENTIALS || 'C:\\Users\\Administrator\\Desktop\\site-jmf-astro\\gsc-credentials.json';
const SITE_URL = process.env.GSC_SITE || 'https://www.cartasapp.com.br/';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const OUT_DIR = path.join(__dirname, '..', '.gsc-analysis');

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  const creds = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: creds.client_email,
    scope: SCOPE,
    aud: creds.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(creds.private_key);
  const jwt = signingInput + '.' + b64url(signature);

  const res = await fetch(creds.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error('Falha no token: ' + JSON.stringify(json));
  return json.access_token;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

async function query(token, startDate, endDate, dimensions, rowLimit = 25000) {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error('GSC ' + res.status + ': ' + JSON.stringify(json));
  return json.rows || [];
}

function agg(rows) {
  let c = 0, i = 0, posSum = 0;
  for (const r of rows) {
    c += r.clicks;
    i += r.impressions;
    posSum += r.position * r.impressions;
  }
  return {
    clicks: c,
    impressions: i,
    ctr: i ? c / i : 0,
    position: i ? posSum / i : 0,
  };
}

// Totais reais do site: query sem dimensoes devolve 1 linha agregada (o somatorio
// das top queries nao fecha, porque a API corta a cauda longa).
async function siteTotals(token, startDate, endDate) {
  const rows = await query(token, startDate, endDate, [], 1);
  if (!rows.length) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const r = rows[0];
  return { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
}

function keyOf(r, idx = 0) {
  return (r.keys && r.keys[idx]) || '';
}

function topWithDelta(recent, prev, mapKey, limit = 25) {
  const prevMap = new Map();
  for (const r of prev) prevMap.set(mapKey(r), r);

  return recent
    .map((r) => {
      const k = mapKey(r);
      const p = prevMap.get(k);
      const pc = p ? p.clicks : 0;
      const pi = p ? p.impressions : 0;
      return {
        key: k,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        prevClicks: pc,
        prevImpressions: pi,
        prevPosition: p ? p.position : null,
        dClicks: r.clicks - pc,
        dImpressions: r.impressions - pi,
        dPosition: p ? r.position - p.position : null,
        isNew: !p,
      };
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

function lost(recent, prev, mapKey, limit = 15) {
  const recentKeys = new Set(recent.map(mapKey));
  return prev
    .filter((r) => !recentKeys.has(mapKey(r)))
    .map((r) => ({
      key: mapKey(r),
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
      prevClicks: r.clicks,
      prevImpressions: r.impressions,
      dClicks: -r.clicks,
      dImpressions: -r.impressions,
      dPosition: null,
      isNew: false,
    }))
    .sort((a, b) => b.prevImpressions - a.prevImpressions)
    .slice(0, limit);
}

function fmt(n) {
  return n.toLocaleString('pt-BR');
}

function pct(n) {
  return (n * 100).toFixed(2) + '%';
}

function sign(n) {
  return (n >= 0 ? '+' : '') + fmt(n);
}

function table(title, rows) {
  console.log('\n### ' + title);
  console.log(
    pad('', 2) + pad('chave', 46) + pad('cliques', 12) + pad('impr.', 12) + pad('CTR', 8) + pad('pos', 7)
  );
  for (const r of rows) {
    const delta = r.prevClicks !== undefined ? ` (${sign(r.dClicks)})` : '';
    const pos = typeof r.position === 'number' ? r.position.toFixed(1) : '-';
    const posDelta = typeof r.dPosition === 'number' ? ` (${r.dPosition >= 0 ? '+' : ''}${r.dPosition.toFixed(1)})` : '';
    console.log(
      pad('', 2) +
        pad(String(r.key).replace('https://www.cartasapp.com.br', '').slice(0, 44), 46) +
        pad(fmt(r.clicks || 0) + delta, 12) +
        pad(fmt(r.impressions || 0), 12) +
        pad(pct(r.ctr || 0), 8) +
        pad(pos + posDelta, 7)
    );
  }
}

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith('--days='));
  const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : 28;

  const token = await getAccessToken();
  const today = new Date();
  const end = addDays(today, -3); // GSC tem ~3 dias de atraso
  const start = addDays(end, -(days - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));

  console.log('=== GSC cartasapp.com.br ===');
  console.log(`Periodo atual:  ${ymd(start)} a ${ymd(end)} (${days} dias)`);
  console.log(`Periodo anterior: ${ymd(prevStart)} a ${ymd(prevEnd)}`);

  const [totals, prevTotals, recentQ, prevQ, recentP, prevP, daily, devices, countries] = await Promise.all([
    siteTotals(token, ymd(start), ymd(end)),
    siteTotals(token, ymd(prevStart), ymd(prevEnd)),
    query(token, ymd(start), ymd(end), ['query']),
    query(token, ymd(prevStart), ymd(prevEnd), ['query']),
    query(token, ymd(start), ymd(end), ['page']),
    query(token, ymd(prevStart), ymd(prevEnd), ['page']),
    query(token, ymd(addDays(end, -89)), ymd(end), ['date']),
    query(token, ymd(start), ymd(end), ['device']),
    query(token, ymd(start), ymd(end), ['country']),
  ]);

  console.log('\n=== TOTAIS ===');
  console.log(
    `cliques:      ${fmt(totals.clicks)}  (antes ${fmt(prevTotals.clicks)}, ${sign(totals.clicks - prevTotals.clicks)})`
  );
  console.log(
    `impressoes:   ${fmt(totals.impressions)}  (antes ${fmt(prevTotals.impressions)}, ${sign(totals.impressions - prevTotals.impressions)})`
  );
  console.log(`CTR:          ${pct(totals.ctr)}  (antes ${pct(prevTotals.ctr)})`);
  console.log(`posicao media: ${totals.position.toFixed(2)}  (antes ${prevTotals.position.toFixed(2)})`);

  table('TOP QUERIES (periodo atual, com delta de cliques vs anterior)', topWithDelta(recentQ, prevQ, (r) => keyOf(r, 0), 25));
  table('TOP PAGINAS (periodo atual, com delta de cliques vs anterior)', topWithDelta(recentP, prevP, (r) => keyOf(r, 0), 25));

  console.log('\n### QUERIES QUE GANHARAM MAIS CLIQUE');
  const gainers = topWithDelta(recentQ, prevQ, (r) => keyOf(r, 0), 500)
    .sort((a, b) => b.dClicks - a.dClicks)
    .slice(0, 12);
  for (const r of gainers) console.log(`  ${sign(r.dClicks)}  ${r.key}  (${fmt(r.clicks)}c / ${fmt(r.impressions)}i)`);

  console.log('\n### QUERIES QUE PERDERAM MAIS CLIQUE');
  const losers = topWithDelta(recentQ, prevQ, (r) => keyOf(r, 0), 500)
    .sort((a, b) => a.dClicks - b.dClicks)
    .slice(0, 12);
  for (const r of losers) console.log(`  ${sign(r.dClicks)}  ${r.key}  (${fmt(r.clicks)}c / ${fmt(r.impressions)}i)`);

  table('QUERIES QUE SUMIRAM (estavam no periodo anterior)', lost(recentQ, prevQ, (r) => keyOf(r, 0), 12));

  console.log('\n### POR DISPOSITIVO');
  for (const r of devices) {
    console.log(`  ${pad(keyOf(r), 10)} ${fmt(r.clicks)}c  ${fmt(r.impressions)}i  CTR ${pct(r.ctr)}  pos ${r.position.toFixed(1)}`);
  }

  console.log('\n### TOP PAISES');
  for (const r of countries.slice(0, 5)) {
    console.log(`  ${pad(keyOf(r), 6)} ${fmt(r.clicks)}c  ${fmt(r.impressions)}i`);
  }

  console.log('\n### TENDENCIA DIARIA (90d)');
  for (const r of daily) {
    console.log(`  ${keyOf(r)}  ${pad(fmt(r.clicks) + 'c', 8)} ${pad(fmt(r.impressions) + 'i', 10)} pos ${r.position.toFixed(1)}`);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `report-${ymd(today)}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      { site: SITE_URL, period: { start: ymd(start), end: ymd(end) }, prev: { start: ymd(prevStart), end: ymd(prevEnd) }, totals, prevTotals, queries: recentQ, prevQueries: prevQ, pages: recentP, prevPages: prevP, daily, devices, countries },
      null,
      2
    ),
    'utf8'
  );
  console.log('\nJSON salvo em ' + outFile);
}

main().catch((e) => {
  console.error('ERRO: ' + e.message);
  process.exit(1);
});
