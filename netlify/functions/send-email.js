// ARQUIVO: netlify/functions/send-email.js (VERSÃO FINAL COM PDF)

const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const html_to_pdf = require('html-pdf-node'); // A nova "Fábrica de PDFs"

// Helper que transforma o JSON em HTML (para o PDF)
function renderDocHTML(out) {
    var partes = [];
    if (out.titulo) partes.push(`<h1>${out.titulo.toUpperCase()}</h1>`);
    if (out.saudacao) partes.push(`<p>${out.saudacao}</p>`);

    var body = out.corpo_paragrafos || [];
    for (var i = 0; i < body.length; i++) {
        partes.push(`<p>${body[i].replace(/\n/g, '<br>')}</p>`);
    }

    if (out.fechamento) partes.push(`<p>${out.fechamento.replace(/\n/g, '<br>')}</p>`);

    if (out.check_list_anexos && out.check_list_anexos.length > 0) {
        partes.push('<hr>');
        partes.push('<h3>CHECKLIST DE ANEXOS:</h3>');
        partes.push('<ul>');
        out.check_list_anexos.forEach(item => {
            partes.push(`<li>${item}</li>`);
        });
        partes.push('</ul>');
    }

    if (out.observacoes_legais) {
        partes.push('<hr>');
        partes.push(`<p style="font-size: 10px; color: #555;">${out.observacoes_legais}</p>`);
    }
    return partes.join('\n');
}

// Estilos do PDF
const pdfStyles = `
<style>
    body {
        font-family: 'Times New Roman', Times, serif;
        font-size: 12pt;
        line-height: 1.6;
        padding: 2cm;
    }
    h1 {
        font-size: 16pt;
        text-align: center;
        margin-bottom: 30px;
    }
    p {
        margin-bottom: 1em;
        text-align: justify;
    }
    ul {
        margin-top: 0.5em;
    }
    hr {
        border: 0;
        border-top: 1px solid #ccc;
        margin: 1em 0;
    }
</style>
`;

exports.handler = async (event) => {
    // 1. Validar a requisição (sem mudança)
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { order_id, email_to } = JSON.parse(event.body);
        if (!order_id || !email_to) {
            return { statusCode: 400, body: 'Faltando order_id ou email_to' };
        }

        // 2. Conectar ao Supabase (sem mudança)
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { data: doc, error } = await supabase
            .from('generations')
            .select('output_json, slug')
            .eq('order_id', order_id)
            .maybeSingle();

        if (error || !doc) {
            return { statusCode: 404, body: 'Documento não encontrado' };
        }

        // 3. Transformar o JSON do documento em HTML
        const outputJson = doc.output_json;
        const slug = doc.slug || 'documento';
        const docTitle = outputJson.titulo || slug;
        const docHtmlBody = renderDocHTML(outputJson);
        const fullHtml = `<html><head>${pdfStyles}</head><body>${docHtmlBody}</body></html>`;

        // 4. GERAR O PDF (A grande mudança)
        let options = { format: 'A4' };
        let file = { content: fullHtml };
        const pdfBuffer = await html_to_pdf.generatePdf(file, options);

        // 5. Configurar o "Carteiro" (Nodemailer) (sem mudança)
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        // 6. Montar e Enviar o E-mail (com o ANEXO)
        await transporter.sendMail({
            from: `"CartasApp" <${process.env.EMAIL_USER}>`,
            to: email_to,
            subject: `Seu Documento Gerado: ${docTitle}`,
            // Corpo do e-mail (agora mais simples)
            text: `Olá!\n\nSeu documento "${docTitle}" gerado em nosso site está em anexo.\n\nObrigado por usar o CartasApp!\n\nhttps://www.cartasapp.com.br`,
            html: `<p>Olá!</p><p>Seu documento "${docTitle}" gerado em nosso site está em anexo.</p><p>Obrigado por usar o CartasApp!</p><p><a href="https://www.cartasapp.com.br">www.cartasapp.com.br</a></p>`,

            // O Anexo em PDF!
            attachments: [
                {
                    filename: `${slug}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                },
            ],
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Email com PDF enviado com sucesso!' }) };

    } catch (e) {
        console.error('Erro ao enviar e-mail com PDF:', e);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};