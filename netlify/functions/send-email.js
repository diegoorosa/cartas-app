// ARQUIVO: netlify/functions/send-email.js (VERSÃO SIMPLES COM LINK)

const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
    // 1. Validar a requisição
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { order_id, email_to } = JSON.parse(event.body);

        if (!order_id || !email_to) {
            return { statusCode: 400, body: 'Faltando order_id ou email_to' };
        }

        // 2. Conectar ao Supabase e *apenas verificar* se o documento existe
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { data: doc, error } = await supabase
            .from('generations')
            .select('slug') // Pega só o slug para o nome do documento
            .eq('order_id', order_id)
            .maybeSingle();

        if (error || !doc) {
            return { statusCode: 404, body: 'Documento não encontrado' };
        }

        const docTitle = doc.slug || 'Seu Documento';

        // 3. Criar o Link de Recuperação
        // Usamos a variável de ambiente SITE_URL que já configuramos
        const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
        const recoveryLink = `${BASE_URL}/recuperar.html?o=${order_id}`;

        // 4. Configurar o "Carteiro" (Nodemailer)
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,   // smtp.zoho.com
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER, // contato@cartasapp.com.br
                pass: process.env.EMAIL_PASS, // A senha de app
            },
        });

        // 5. Montar e Enviar o E-mail (com o LINK)
        await transporter.sendMail({
            from: `"CartasApp" <${process.env.EMAIL_USER}>`,
            to: email_to,
            subject: `Link para seu Documento: ${docTitle}`,

            // Texto do e-mail com o link
            text: `Olá!\n\nSeu documento "${docTitle}" está pronto.\n\nPara visualizar e baixar seu documento (PDF ou .DOC), acesse o link seguro abaixo:\n\n${recoveryLink}\n\nObrigado por usar o CartasApp!\n`,

            // Versão em HTML do e-mail
            html: `<p>Olá!</p>
                   <p>Seu documento "${docTitle}" está pronto.</p>
                   <p>Para visualizar e baixar seu documento (PDF ou .DOC), clique no link seguro abaixo:</p>
                   <p><a href="${recoveryLink}" style="font-size: 16px; font-weight: bold; color: #ffffff; background-color: #3b82f6; padding: 12px 20px; text-decoration: none; border-radius: 8px;">Acessar meu Documento</a></p>
                   <p style="font-size: 12px; color: #888;">Se o botão não funcionar, copie e cole este link no seu navegador:<br>${recoveryLink}</p>
                   <br>
                   <p>Obrigado por usar o CartasApp!</p>`
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Email com link enviado com sucesso!' }) };

    } catch (e) {
        console.error('Erro ao enviar e-mail com link:', e);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};