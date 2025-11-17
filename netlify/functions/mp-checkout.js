// ARQUIVO: mp-checkout.js (COM TRAVA reCAPTCHA)

const { createClient } = require('@supabase/supabase-js');

// --- NOVA FUNÇÃO HELPER (reCAPTCHA) ---
async function verifyCaptcha(token) {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;
    try {
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();
        return data.success === true;
    } catch (e) {
        console.error('Erro ao verificar reCAPTCHA:', e);
        return false;
    }
}
// --- FIM DA NOVA FUNÇÃO ---

// MAPA DE PREÇOS SEGURO (Copiado do seu arquivo)
const PRICE_MAP = {
    'default': 9.90, // Preço padrão, caso um slug não seja encontrado
    'autorizacao-viagem-menor': 9.90,
    'carta-bagagem': 9.90,
    'carta-ecommerce': 9.90,
    "carta-cancelamento-smart-fit": 9.90,
    "carta-reclamacao-smart-fit-cobranca-indevida": 9.90,
    "carta-cancelamento-bluefit": 9.90,
    "carta-reclamacao-bluefit-cobranca-indevida": 9.90,
    "carta-cancelamento-selfit": 9.90,
    "carta-reclamacao-selfit-cobranca-indevida": 9.90,
    "carta-cancelamento-bodytech": 9.90,
    "carta-reclamacao-bodytech-cobranca-indevida": 9.90,
    "carta-cancelamento-academia-por-mudanca-de-cidade": 9.90,
    "carta-cancelamento-academia-por-motivo-de-saude": 9.90,
    "carta-cancelamento-academia-fim-de-fidelidade": 9.90,
    "carta-cancelamento-academia-fechamento-da-unidade": 9.90,
    "carta-reclamacao-academia-servico-nao-prestado": 9.90,
    "carta-reclamacao-academia-problema-na-cobranca": 9.90,
    "carta-cancelamento-vivo-fibra": 9.90,
    "carta-cancelamento-vivo-movel": 9.90,
    "carta-reclamacao-vivo-cobranca-indevida": 9.90,
    "carta-cancelamento-claro-net": 9.90,
    "carta-cancelamento-claro-movel": 9.90,
    "carta-reclamacao-claro-cobranca-indevida": 9.90,
    "carta-cancelamento-tim": 9.90,
    "carta-reclamacao-tim-cobranca-indevida": 9.90,
    "carta-cancelamento-oi": 9.90,
    "carta-reclamacao-oi-cobranca-indevida": 9.90,
    "carta-cancelamento-sky-tv": 9.90,
    "carta-reclamacao-sky-cobranca-indevida": 9.90,
    "carta-cancelamento-plano-de-saude": 9.90,
    "carta-reclamacao-plano-de-saude-negativa-de-atendimento": 9.90,
    "carta-cancelamento-internet": 9.90,
    "carta-cancelamento-tv-por-assinatura": 9.90,
    "carta-cancelamento-telefonia-movel": 9.90,
    "carta-reclamacao-cobranca-indevida-internet": 9.90,
    "carta-reclamacao-cobranca-indevida-tv": 9.90,
    "carta-direito-arrependimento-ecommerce": 9.90,
    "carta-troca-ou-devolucao-produto": 9.90,
    "carta-cancelamento-smart-fit-unidade": 9.90,
    "carta-cancelamento-bluefit-unidade": 9.90,
    "carta-cancelamento-selfit-unidade": 9.90,
    "carta-cancelamento-bodytech-unidade": 9.90,
    "carta-cancelamento-bio-ritmo": 9.90,
    "carta-reclamacao-bio-ritmo-cobranca-indevida": 9.90,
    "carta-cancelamento-just-fit": 9.90,
    "carta-reclamacao-just-fit-cobranca-indevida": 9.90,
    "carta-cancelamento-oi-fibra": 9.90,
    "carta-cancelamento-algar-fibra": 9.90,
    "carta-cancelamento-claro-tv": 9.90,
    "carta-cancelamento-vivo-tv": 9.90,
    "carta-cancelamento-sky-banda-larga": 9.90,
    "carta-reclamacao-oi-cobranca-indevida-internet": 9.90,
    "carta-reclamacao-algar-cobranca-indevida": 9.90,
    "carta-reclamacao-claro-tv-cobranca-indevida": 9.90,
    "carta-reclamacao-vivo-tv-cobranca-indevida": 9.90,
    "carta-reclamacao-sky-banda-larga-cobranca-indevida": 9.90,
    "carta-cancelamento-cartao-nubank": 9.90,
    "carta-cancelamento-cartao-itau": 9.90,
    "carta-cancelamento-cartao-santander": 9.90,
    "carta-cancelamento-cartao-bradesco": 9.90,
    "carta-cancelamento-cartao-caixa": 9.90,
    "carta-cancelamento-cartao-banco-do-brasil": 9.90,
    "carta-reclamacao-cobranca-indevida-cartao-nubank": 9.90,
    "carta-reclamacao-cobranca-indevida-cartao-itau": 9.90,
    "carta-reclamacao-cobranca-indevida-cartao-santander": 9.90,
    "carta-reclamacao-cobranca-indevida-cartao-bradesco": 9.90,
    "carta-reclamacao-cobranca-indevida-cartao-caixa": 9.90,
    "carta-reclamacao-cobranca-indevida-cartao-banco-do-brasil": 9.90,
    "carta-reclamacao-energia-enel-cobranca-indevida": 9.90,
    "carta-reclamacao-energia-light-cobranca-indevida": 9.90,
    "carta-reclamacao-energia-cemig-cobranca-indevida": 9.90,
    "carta-reclamacao-energia-cpfl-cobranca-indevida": 9.90,
    "carta-reclamacao-energia-coelba-cobranca-indevida": 9.90,
    "carta-reclamacao-agua-sabesp-cobranca-indevida": 9.90,
    "carta-reclamacao-agua-copasa-cobranca-indevida": 9.90,
    "carta-reembolso-atraso-voo-gol": 9.90,
    "carta-reembolso-atraso-voo-latam": 9.90,
    "carta-reembolso-atraso-voo-azul": 9.90,
    "carta-reembolso-cancelamento-voo-gol": 9.90,
    "carta-reembolso-cancelamento-voo-latam": 9.90,
    "carta-reembolso-cancelamento-voo-azul": 9.90,
    "carta-reclamacao-produto-defeituoso-vicio-oculto": 9.90,
    "carta-reclamacao-produto-nao-entregue": 9.90,
    "carta-reembolso-atraso-entrega-ecommerce": 9.90,
    "carta-cancelamento-curso-online": 9.90,
    "carta-cancelamento-curso-presencial": 9.90,
    "carta-cancelamento-matricula-faculdade": 9.90,
    "carta-reembolso-matricula-faculdade": 9.90,
    "carta-bagagem-extraviada": 9.90,
    "carta-bagagem-danificada": 9.90
};


exports.handler = async (event) => {
    try {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

        // --- NOVO: Adicionado 'captchaToken' ---
        const { slug, payload, utm, captchaToken } = JSON.parse(event.body || '{}');

        // (Preço já era seguro, copiado do seu arquivo)
        const price = PRICE_MAP[slug] || PRICE_MAP['default'];

        if (!slug) return { statusCode: 400, body: 'Missing slug' };

        // --- NOVO: VERIFICA O reCAPTCHA ---
        if (!captchaToken) {
            return { statusCode: 403, body: 'reCAPTCHA token ausente' };
        }
        const isHuman = await verifyCaptcha(captchaToken);
        if (!isHuman) {
            return { statusCode: 403, body: 'Falha na verificação do reCAPTCHA. Você é um robô?' };
        }
        // --- FIM DA VERIFICAÇÃO ---

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
        const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br'; // URL atualizada

        const orderId = crypto.randomUUID();

        // (Resto do código copiado do seu arquivo, sem mudanças)
        try {
            await supabase.from('checkout_intents').insert({
                order_id: orderId,
                slug,
                payload: payload || null,
                utm: utm || null
            });
        } catch (e) { }

        const pref = {
            items: [
                {
                    title: `Documento: ${slug}`,
                    quantity: 1,
                    currency_id: 'BRL',
                    unit_price: Number(price)
                }
            ],
            back_urls: {
                success: `${BASE_URL}/success.html?o=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}&s=success`,
                pending: `${BASE_URL}/success.html?o=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}&s=pending`,
                failure: `${BASE_URL}/success.html?o=${encodeURIComponent(orderId)}&slug=${encodeURIComponent(slug)}&s=failure`
            },
            auto_return: 'approved',
            external_reference: orderId,
            notification_url: `${BASE_URL}/.netlify/functions/mp-webhook`,
            metadata: { order_id: orderId, slug, utm: utm || {} }
        };

        const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MP_TOKEN}` },
            body: JSON.stringify(pref)
        });
        const data = await r.json();
        if (!r.ok || !data.init_point) return { statusCode: 400, body: JSON.stringify({ error: 'mp failed', data }) };

        return { statusCode: 200, body: JSON.stringify({ init_point: data.init_point, order_id: orderId }) };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: 'mp-checkout error' }) };
    }
};