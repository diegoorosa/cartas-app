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
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

exports.handler = async (event) => {
  console.log('[send-email] Iniciando...');

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Verifica autenticação interna
  const authHeader = event.headers['x-internal-secret'] || event.headers['authorization'];
  const INTERNAL_SECRET = process.env.INTERNAL_FUNCTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isInternal = authHeader === INTERNAL_SECRET || authHeader === `Bearer ${INTERNAL_SECRET}`;
  
  if (!isInternal) {
    console.warn('[send-email] Tentativa não autorizada');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  try {
    const body = JSON.parse(event.body);
    const { order_id, email_to, recovery_mode, reminder_mode, coupon, final_price, checkout_url, slug } = body;

    console.log(`[send-email] Modo: ${recovery_mode ? 'recuperação' : 'transacional'} | Email: ${email_to} | Order: ${order_id}`);

    if (!order_id || !email_to) {
      return { statusCode: 400, body: 'Faltando order_id ou email_to' };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const BASE_URL = process.env.SITE_URL || 'https://www.cartasapp.com.br';
    const logoUrl = `${BASE_URL}/logo.png`;

    let subject, textBody, htmlBody;

    if (recovery_mode) {
      // ========== EMAIL DE RECUPERAÇÃO DE ABANDONO ==========
      const discountPercent = coupon === 'VOLTA10' ? '10%' : 
                              coupon === 'BEMVINDO15' ? '15%' : 
                              coupon === 'INDICA20' ? '20%' : 'DESCONTO';
      const priceDisplay = final_price ? `R$ ${final_price.toFixed(2).replace('.', ',')}` : 'preço especial';

      const actionLink = checkout_url || `${BASE_URL}/.netlify/functions/mp-checkout`;
      
      // Busca título do documento pelo slug (precisa achar o slug)
      let docTitle = 'Seu Documento';
      // 1. Tenta slug vindo direto do body (cron recovery)
      if (slug) {
        docTitle = friendlyTitle(slug);
      } else {
        // 2. Tenta achar o slug no checkout_intents
        const { data: intent } = await supabase
          .from('checkout_intents')
          .select('slug')
          .eq('order_id', order_id)
          .maybeSingle();
        if (intent?.slug) docTitle = friendlyTitle(intent.slug);
      }

      subject = reminder_mode
        ? `⏰ ÚLTIMA CHANCE — "${docTitle}" — ${discountPercent} OFF expira em 12h`
        : `⏰ Sua prévia de "${docTitle}" expira em 24h — ${discountPercent} OFF`;

      textBody = `Olá!\n\nVocê preencheu os dados para "${docTitle}" mas não finalizou o pagamento.\n\nA prévia expira em 24 horas. Use o cupom ${coupon || 'VOLTA10'} para ${discountPercent} OFF:\n${actionLink}\n\nPreço com desconto: ${priceDisplay}\n\n---\nAVISO: este é um modelo de documento gerado automaticamente. O CartasApp não presta assessoria jurídica e não garante aceitação por órgãos públicos, cartórios ou empresas. Revise os dados antes de assinar.\n`;

      htmlBody = `
        <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${logoUrl}" alt="CartasApp" style="height: 72px; width: auto;" />
          </div>

          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #92400e;"><strong>⏰ Sua prévia expira em 24 horas</strong></p>
            <p style="margin: 0; font-size: 28px; font-weight: bold; color: #92400e;">${discountPercent} OFF com cupom <strong>${coupon || 'VOLTA10'}</strong></p>
          </div>

          <h2 style="color: #3b82f6; text-align: center; margin-bottom: 16px;">Finalize seu documento: <strong>${docTitle}</strong></h2>
          <p>Olá! Você preencheu os dados e viu a prévia, mas o pagamento não foi concluído.</p>
          <p>O documento fica salvo por <strong>24 horas</strong>. Depois disso, você precisará preencher tudo de novo.</p>

          <div style="background: #f3f4f6; padding: 24px; border-radius: 8px; text-align: center; margin: 24px 0;">
            <a href="${actionLink}" style="background-color: #10b981; color: white; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px; display: inline-block;">
              💳 Finalizar com ${discountPercent} OFF (${priceDisplay})
            </a>
            <p style="font-size: 12px; color: #888; margin: 10px 0 0;">Cupom <strong>${coupon || 'VOLTA10'}</strong> aplicado automaticamente no link acima.</p>
          </div>

          <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 14px 16px; border-radius: 8px; margin: 20px 0;">
            <p style="font-size: 13px; color: #92400e; margin: 0;">
            <strong>⚠️ Aviso importante:</strong> este é um <strong>modelo de documento</strong> gerado automaticamente. O CartasApp não presta assessoria jurídica individual e <strong>não garante que o modelo será aceito</strong> por órgãos públicos, cartórios, empresas ou autoridades. <strong>Revise com atenção todos os dados antes de assinar ou enviar</strong>, e confirme com a instituição responsável se o modelo atende às exigências do seu caso.
            </p>
          </div>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 14px 16px; border-radius: 8px; margin: 20px 0;">
            <p style="font-size: 13px; color: #1e40af; margin: 0;">
            <strong>🔒 Ao clicar no botão de pagamento acima</strong>, você confirma que leu e concorda com nossos
            <a href="https://www.cartasapp.com.br/termos" style="color: #2563eb;">Termos de Uso</a>
            e
            <a href="https://www.cartasapp.com.br/privacidade" style="color: #2563eb;">Política de Privacidade</a>.
            Os dados informados serão utilizados exclusivamente para a geração do documento e comunicação sobre seu pedido.
            </p>
          </div>

          <p style="font-size: 14px; color: #666; margin-top: 24px;">
            <strong>Dica:</strong> Se for enviar por correio, use AR (Aviso de Recebimento). Se for por e-mail, anexe o PDF baixado.
          </p>

          <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="font-size: 12px; color: #888;">
            Precisa de ajuda? Responda este e-mail.<br>
            Link direto: ${actionLink}
          </p>
        </div>
      `;

    } else {
      // ========== EMAIL TRANSACTIONAL PADRÃO (DOCUMENTO PRONTO) ==========
      // Tenta pegar slug do body (passado pelo webhook/success.html) ou do generations
      let docSlug = slug;
      if (!docSlug) {
        const { data: doc, error } = await supabase
          .from('generations')
          .select('slug')
          .eq('order_id', order_id)
          .maybeSingle();

        if (error || !doc) {
          console.error('[send-email] Documento não encontrado para order_id:', order_id);
          return { statusCode: 404, body: 'Documento não encontrado' };
        }
        docSlug = doc.slug;
      }

      const docTitle = friendlyTitle(docSlug);
      const recoveryLink = `${BASE_URL}/success.html?o=${order_id}&utm_source=email&utm_medium=transactional&utm_campaign=document_ready`;

      subject = `Seu documento está pronto: ${docTitle}`;

      textBody = `Olá!\n\nSeu documento "${docTitle}" está pronto.\n\nBaixe agora no link: ${recoveryLink}\n\nAVISO IMPORTANTE: este é um modelo de documento gerado automaticamente. O CartasApp não presta assessoria jurídica individual e não garante que o modelo será aceito por órgãos públicos, cartórios, empresas ou autoridades. Revise com atenção se todos os dados estão corretos antes de assinar ou enviar, e confirme com a instituição responsável se o modelo atende às exigências do seu caso.\n`;

      htmlBody = `
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

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 14px 16px; border-radius: 8px; margin: 20px 0;">
            <p style="font-size: 13px; color: #1e40af; margin: 0;">
            <strong>🔒</strong> Este documento foi gerado com base nos dados que você forneceu no site. Ao realizar o pagamento, você confirmou que leu e concordou com nossos
            <a href="https://www.cartasapp.com.br/termos" style="color: #2563eb;">Termos de Uso</a>
            e
            <a href="https://www.cartasapp.com.br/privacidade" style="color: #2563eb;">Política de Privacidade</a>.
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
      `;
    }

    // Envia via Nodemailer (Zoho)
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"CartasApp" <${process.env.EMAIL_USER}>`,
      to: email_to,
      subject,
      text: textBody,
      html: htmlBody
    });

    console.log(`[send-email] ✅ Enviado para ${email_to} (${recovery_mode ? 'recuperação' : 'transacional'})`);
    return { statusCode: 200, body: JSON.stringify({ message: 'Email enviado!' }) };

  } catch (e) {
    console.error('[send-email] Erro CRÍTICO:', e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};