// ARQUIVO: netlify/functions/get-mp-config.js
// Retorna a PUBLIC KEY do Mercado Pago para uso client-side nos Bricks.
// Public key NÃO é segredo — ela é a única credencial do MP que pode ir pro front.
// O access token (privado) nunca sai daqui.

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  const publicKey = process.env.MP_PUBLIC_KEY;
  if (!publicKey) {
    console.error('[get-mp-config] MP_PUBLIC_KEY nao definida no ambiente');
    return { statusCode: 500, body: JSON.stringify({ error: 'Public key nao configurada' }) };
  }
  // CORS liberado para o proprio dominio
  const origin = event.headers.origin || '';
  const headers = {
    'Access-Control-Allow-Origin': origin && origin.includes('cartasapp.com.br') ? origin : 'https://www.cartasapp.com.br',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'
  };
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ public_key: publicKey, country: 'BR' })
  };
};
