const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Slugs "produto principal" que não passam pelo catálogo genérico de slugs.js
const TOP_LEVEL_TITLES = {
  'autorizacao-viagem-menor': 'Autorização de Viagem para Menor',
  'recurso-multa-transito': 'Recurso de Multa de Trânsito',
  'reembolso-cancelamento-passagem': 'Reembolso de Passagem (Art. 740 CC)',
  'carta-bagagem': 'Carta de Bagagem Extraviada ou Danificada',
  'carta-consumo-generico': 'Notificação Extrajudicial de Consumo',
  'carta-ecommerce': 'Carta de Reclamação — E-commerce'
};

function friendlyTitle(slug) {
  if (!slug) return 'Seu Documento';
  if (TOP_LEVEL_TITLES[slug]) return TOP_LEVEL_TITLES[slug];
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'slugs.js'), 'utf8');
    const fn = new Function(`var window = {}; ${src}; return window.SLUGS;`);
    const found = fn().find((s) => s.slug === slug);
    if (found) return found.title;
  } catch (e) { /* segue pro fallback */ }
  // Fallback: humaniza o slug cru ("carta-cancelamento-tim" -> "Carta Cancelamento Tim")
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

exports.handler = async (event) => {
  // Log inicial para confirmar que chegou
  console.log("Iniciando envio de e-mail...");

  // 1. Validar o método HTTP
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse do corpo da requisição
    const body = JSON.parse(event.body);
    const { order_id, email_to } = body;

    console.log(`Dados recebidos -> Order: ${order_id}, Email: ${email_to}`);

    if (!order_id || !email_to) {
      console.error("Faltando dados obrigatórios.");
      return { statusCode: 400, body: 'Faltando order_id ou email_to' };
    }

    // 2. Conectar ao Supabase para pegar o nome do documento
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: doc, error } = await supabase
      .from('generations')
      .select('slug')
      .eq('order_id', order_id)
      .maybeSingle();

    if (error || !doc) {
      console.error("Documento não encontrado no banco para este ID.");
      return { statusCode: 404, body: 'Documento não encontrado' };
    }

    const docTitle = friendlyTitle(doc.slug);
    const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
    const recoveryLink = `${BASE_URL}/success.html?o=${order_id}&utm_source=email&utm_medium=transactional&utm_campaign=document_ready`;
    const logoUrl = `${BASE_URL}/logo.png`;

    console.log(`Documento encontrado: ${docTitle}. Preparando envio...`);

    // 3. Configurar o Nodemailer (Zoho)
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST, // smtp.zoho.com
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // 4. Enviar o E-mail
    await transporter.sendMail({
      from: `"CartasApp" <${process.env.EMAIL_USER}>`,
      to: email_to,
      subject: `Seu documento está pronto: ${docTitle}`,
      text: `Olá!\n\nSeu documento "${docTitle}" está pronto.\n\nBaixe agora no link: ${recoveryLink}\n\nAVISO IMPORTANTE: este é um modelo de documento gerado automaticamente. O CartasApp não presta assessoria jurídica individual e não garante que o modelo será aceito por órgãos públicos, cartórios, empresas ou autoridades. Revise com atenção se todos os dados estão corretos antes de assinar ou enviar, e confirme com a instituição responsável se o modelo atende às exigências do seu caso.\n`,
      html: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <img src="${logoUrl}" alt="CartasApp" style="height: 72px; width: auto;" />
                </div>
                <h2 style="color: #3b82f6; text-align: center;">Seu documento está pronto! ✅</h2>
                <p>Olá!</p>
                <p>Obrigado por confiar no <strong>CartasApp</strong>. Seu documento <strong>${docTitle}</strong> foi gerado com sucesso.</p>

                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <a href="${recoveryLink}" style="background-color: #10b981; color: white; padding: 14px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                    📄 Baixar Documento (PDF/DOC)
                </a>
                <p style="font-size: 12px; color: #888; margin: 10px 0 0;">O PDF não vai anexado a este e-mail — clique no botão para baixar no site.</p>
                </div>

                <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 14px 16px; border-radius: 8px; margin: 20px 0;">
                <p style="font-size: 13px; color: #92400e; margin: 0;">
                <strong>⚠️ Aviso importante:</strong> este é um <strong>modelo de documento</strong> gerado automaticamente a partir dos dados que você informou. O CartasApp não presta assessoria jurídica individual e <strong>não garante que o modelo será aceito</strong> por órgãos públicos, cartórios, empresas ou autoridades. <strong>Revise com atenção todos os dados antes de assinar ou enviar</strong>, e confirme com a instituição responsável (cartório, companhia aérea, Polícia Federal, empresa etc.) se o modelo atende às exigências do seu caso.
                </p>
                </div>

                <p style="font-size: 14px; color: #666;">
                <strong>Dica Importante:</strong> Se for enviar por correio, recomendamos o uso de AR (Aviso de Recebimento). Se for por e-mail, anexe o PDF baixado.
                </p>

                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #888;">
                Precisa de ajuda? Responda este e-mail.<br>
                Link direto: ${recoveryLink}
                </p>
            </div>
            `
    });

    console.log("E-mail enviado com sucesso!");
    return { statusCode: 200, body: JSON.stringify({ message: 'Email enviado!' }) };

  } catch (e) {
    console.error('Erro CRÍTICO ao enviar e-mail:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};