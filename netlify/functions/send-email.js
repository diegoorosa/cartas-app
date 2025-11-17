// ARQUIVO: netlify/functions/send-email.js

const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// Helper que transforma o JSON em texto puro (copiado do seu success.html)
function renderDocText(out) {
    var partes = [];
    if (out.titulo) partes.push(out.titulo.toUpperCase());
    if (out.saudacao) partes.push(out.saudacao);
    var body = out.corpo_paragrafos || [];
    for (var i = 0; i < body.length; i++) partes.push(body[i]);
    if (out.fechamento) partes.push(out.fechamento);
    if (out.check_list_anexos && out.check_list_anexos.length > 0) {
        partes.push('\n---');
        partes.push('CHECKLIST DE ANEXOS:');
        partes.push(out.check_list_anexos.join('\n'));
    }
    if (out.observacoes_legais) {
        partes.push('\n---');
        partes.push(out.observacoes_legais);
    }
    return partes.join('\n\n');
}

exports.handler = async (event) => {
    // 1. Validar a requisição (só aceita POST)
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { order_id, email_to } = JSON.parse(event.body);

        if (!order_id || !email_to) {
            return { statusCode: 400, body: 'Faltando order_id ou email_to' };
        }

        // 2. Conectar ao Supabase e buscar o documento
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { data: doc, error } = await supabase
            .from('generations')
            .select('output_json, slug')
            .eq('order_id', order_id)
            .maybeSingle();

        if (error || !doc) {
            return { statusCode: 404, body: 'Documento não encontrado' };
        }

        // 3. Transformar o JSON do documento em texto puro
        const outputJson = doc.output_json;
        const slug = doc.slug || 'Seu Documento';
        const docTitle = outputJson.titulo || slug;
        const docText = renderDocText(outputJson);

        // 4. Configurar o "Carteiro" (Nodemailer) com as credenciais do Zoho
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,   // smtp.zoho.com (da Fase 2)
            port: 465, // Porta padrão do Zoho para SSL
            secure: true, // true para porta 465
            auth: {
                user: process.env.EMAIL_USER, // contato@cartasapp.com.br (da Fase 2)
                pass: process.env.EMAIL_PASS, // A senha de app que você gerou (da Fase 2)
            },
        });

        // 5. Montar e Enviar o E-mail
        await transporter.sendMail({
            from: `"CartasApp" <${process.env.EMAIL_USER}>`, // Remetente
            to: email_to, // O e-mail que o usuário digitou
            subject: `Seu Documento Gerado: ${docTitle}`, // Assunto
            text: docText, // Corpo do e-mail como texto puro
            html: `<p style="white-space: pre-wrap;">${docText.replace(/\n/g, '<br>')}</p>`, // Corpo em HTML (para manter as quebras de linha)
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Email enviado com sucesso!' }) };

    } catch (e) {
        console.error('Erro ao enviar e-mail:', e);
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};