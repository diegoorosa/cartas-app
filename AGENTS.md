# AGENTS.md — CartasApp

## What this is
Static HTML/JS site on Netlify selling legal document generation (cancellation letters, travel authorizations, etc.) for Brazilian consumers. No framework, no build step — plain HTML + vanilla JS.

## Dev commands
- **Local dev**: `npm run dev` (runs `netlify dev`)
- **No build**: `npm run build` is a no-op. Deploy is git-push to Netlify.
- **No tests, no lint, no typecheck** exist in this repo.

## Architecture
- **`public/`** — Static site. ~100 HTML pages, shared `style.css`, `slugs.js` (product catalog), `recovery.js`, `theme.js`, `utm.js`.
- **`netlify/functions/`** — 6 serverless functions:
  - `generate-doc.js` — Template-based document generation (routing by slug: viagem → multa → reembolso → consumo_generico). Uses DOMPurify for sanitization.
  - `mp-checkout.js` — Creates Mercado Pago Checkout Pro preference. Contains `PRICE_MAP` (source of truth for pricing).
  - `mp-webhook.js` — Handles MP payment notifications. Calls generate-doc on approval, sends email.
  - `order-status.js` — Checks payment status (Supabase fast-path → MP direct → MP search fallback).
  - `send-email.js` — Sends document link via Zoho SMTP (nodemailer).
  - `capture-lead.js` — Saves lead data to Supabase before payment.
- **Supabase tables**: `orders`, `generations`, `checkout_intents`, `webhook_processed`, `consent_logs`, `leads`.

## Critical gotchas

### Pricing
- `autorizacao-viagem-menor`: **R$39,90** (highest margin)
- `recurso-multa-transito`, `carta-bagagem`, `carta-reembolso-*` (voo): **R$19,90**
- **Everything else**: **R$9,90** (academia, telecom, cartão, utilidade, e-commerce, educação)
- Before "correcting" a price on any page, check `PRICE_MAP` in `netlify/functions/mp-checkout.js` first.

### style.css is shared by ~100 pages
Any change to `public/style.css` propagates to ALL pages. A previous agent accidentally removed 505 lines thinking they were only for one page — it broke CSS on every checkout page.

### CSP in public/_headers
The Content-Security-Policy header broke Microsoft Clarity and Google Ads conversion tracking when modified without testing. Be extremely careful adding new domains — test that Clarity (`*.clarity.ms`) and Google Ads (`googleads.g.doubleclick.net`, `www.googleadservices.com`) still work after any CSP change.

### Internal function calls
Functions call each other using `x-internal-secret` header (set to `INTERNAL_FUNCTION_SECRET` env var, fallback to `SUPABASE_SERVICE_ROLE_KEY`). Never expose this header client-side.

### Routing in generate-doc.js
Slugs containing `viagem` or payload with `menor_nome` → travel auth template. Slugs with `multa` or fields `placa`/`cnh`/`auto_infracao` → traffic ticket template. Slugs with `reembolso-cancelamento-passagem` or `voo` → flight refund template. Everything else → generic consumer template.

### Netlify redirects
`netlify.toml` redirects `/doc/*` → `/doc.html` with status 200 (not 301). This makes `doc.html` a shared template for dozens of products. Don't add a `/viagem` → `/viagem.html` redirect — Google Ads uses the `.html` URL as landing page and a redirect adds latency (confirmed decision in SESSION_LOG.md).

## Adding a new product
1. Add slug entry to `public/slugs.js` (slug, title, brand, tipo)
2. Add price to `PRICE_MAP` in `netlify/functions/mp-checkout.js`
3. Create an SEO landing page in `public/` if needed
4. If it needs a new document template, add a function in `generate-doc.js` (currently uses generic consumer template as fallback)
5. Add the page URL to `public/sitemap.xml` if created

## Env vars (Netlify)
All serverless functions rely on these: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `INTERNAL_FUNCTION_SECRET`, `ADMIN_KEY`, `SITE_URL`, `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS`, `GEMINI_MODELS`.

## Session history
See `SESSION_LOG.md` for detailed context on past bugs (the orphan `}` SyntaxError, the 505-line CSS deletion, CSP breakage, admin backdoor removal, price audits). Read it before making CSS or CSP changes.
