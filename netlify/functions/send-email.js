const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

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

    const docTitle = doc.slug || 'Seu Documento';
    const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
    const recoveryLink = `${BASE_URL}/recuperar.html?o=${order_id}`;

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
      subject: `Link para seu Documento: ${docTitle}`,
      text: `Olá!\n\nSeu documento "${docTitle}" está pronto.\n\nBaixe agora no link: ${recoveryLink}\n`,
      html: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #3b82f6;">Seu documento está pronto! ✅</h2>
                <p>Olá!</p>
                <p>Obrigado por confiar no <strong>CartasApp</strong>. Seu documento <strong>${docTitle}</strong> foi gerado com sucesso.</p>
                
                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <a href="${recoveryLink}" style="background-color: #10b981; color: white; padding: 14px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                    📄 Baixar Documento (PDF/DOC)
                </a>
                </div>

                <p style="font-size: 14px; color: #666;">
                <strong>Dica Importante:</strong> Se for enviar por correio, recomendamos o uso de AR (Aviso de Recebimento). Se for por e-mail, anexe o PDF.
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