// ====== CHECKOUT APENAS PIX (cartao temporariamente desabilitado) ======
// Cartao temporariamente desabilitado para resolver 502 no order-status.
// Pix funciona 100% via mp-pix-payment.js + polling order-status.
async function abrirBricksCheckout(preferenceId, orderId, slugStr, payerEmail, finalPrice) {
    // Modal unico -- apenas Pix
    var modalExistente = document.getElementById('bricksModal');
    if (modalExistente) modalExistente.remove();

    var modal = document.createElement('div');
    modal.id = 'bricksModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;';
    modal.innerHTML =
        '<div style="background:#fff;border-radius:12px;max-width:480px;width:100%;max-height:92vh;overflow:auto;padding:24px;position:relative;">' +
          '<button id="bricksClose" style="position:absolute;top:12px;right:12px;background:none;border:0;font-size:24px;cursor:pointer;color:#666;">&times;</button>' +
          '<h3 style="margin:0 0 12px 0;font-size:20px;">Pagamento seguro</h3>' +
          '<p style="margin:0 0 16px 0;font-size:14px;color:#666;">Cartao temporariamente indisponivel. Use Pix para pagamento instantaneo.</p>' +
          '<div id="pixContainer"></div>' +
        '</div>';
    document.body.appendChild(modal);

    document.getElementById('bricksClose').onclick = function () { modal.remove(); };

    // Fluxo Pix manual: chama mp-pix-payment, mostra QR inline, polling ate approved
    var pixGerado = false;
    var pixPollingAtivo = false;
    async function gerarPix() {
        if (pixGerado) return;
        pixGerado = true;
        var pixContainer = document.getElementById('pixContainer');
        pixContainer.innerHTML = '<p style="margin:0;padding:24px;text-align:center;color:#666;">Gerando QR Code Pix...</p>';

        try {
            var r = await fetch('/.netlify/functions/mp-pix-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, slug: slugStr, email: payerEmail })
            });
            var data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Falha ao gerar QR');

            // Renderiza o QR Code (PNG base64 pronto do MP) + botao copia-e-cola
            var pixContainer = document.getElementById('pixContainer');
            pixContainer.innerHTML =
                '<div style="text-align:center;">' +
                  '<img src="data:image/png;base64,' + data.qr_code_base64 + '" style="width:240px;height:240px;border:1px solid #e0e0e0;border-radius:8px;" alt="QR Code Pix" />' +
                  '<p style="margin:12px 0 8px 0;font-size:14px;color:#333;">Abra o app do seu banco e escaneie o QR Code.</p>' +
                  '<button id="btnCopiar" style="padding:8px 16px;background:#009ee3;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600;">Copiar codigo Pix</button>' +
                  '<p id="copiado" style="margin:8px 0 0 0;font-size:12px;color:#16a34a;display:none;">Codigo copiado!</p>' +
                  '<p style="margin:16px 0 0 0;font-size:13px;color:#666;">Apos pagar, voce sera redirecionado automaticamente.</p>' +
                  '<p id="pixStatus" style="margin:12px 0 0 0;font-size:13px;color:#666;">Aguardando pagamento...</p>' +
                '</div>';

            var btnCopiar = document.getElementById('btnCopiar');
            if (btnCopiar) {
                btnCopiar.onclick = function () {
                    try {
                        navigator.clipboard.writeText(data.qr_code);
                        document.getElementById('copiado').style.display = 'block';
                        setTimeout(function () { var el = document.getElementById('copiado'); if (el) el.style.display = 'none'; }, 2000);
                    } catch (e) {
                        alert('Codigo Pix:\n\n' + data.qr_code);
                    }
                };
            }

            // Polling em order-status ate approved
            if (!pixPollingAtivo) {
                pixPollingAtivo = true;
                var tentativas = 0;
                var maxTentativas = 60; // 5 min
                function checar() {
                    tentativas++;
                    fetch('/.netlify/functions/order-status?o=' + encodeURIComponent(orderId))
                        .then(function (r) { return r.json(); })
                        .then(function (status) {
                            if (status && (status.status === 'paid' || status.status === 'approved')) {
                                window.location.href = '/success.html?o=' + encodeURIComponent(orderId) + '&slug=' + encodeURIComponent(slugStr) + '&s=success';
                            } else if (status && (status.status === 'rejected' || status.status === 'cancelled')) {
                                var st = document.getElementById('pixStatus');
                                if (st) st.textContent = 'Pagamento rejeitado. Tente novamente.';
                            } else if (tentativas < maxTentativas) {
                                setTimeout(checar, 5000);
                            } else {
                                var st2 = document.getElementById('pixStatus');
                                if (st2) st2.textContent = 'Ainda aguardando. Se ja pagou, recarregue a pagina em 1 minuto -- voce recebera o documento por e-mail.';
                            }
                        })
                        .catch(function () {
                            if (tentativas < maxTentativas) setTimeout(checar, 5000);
                        });
                }
                setTimeout(checar, 3000);
            }
        } catch (e) {
            pixGerado = false;
            var pixContainer = document.getElementById('pixContainer');
            pixContainer.innerHTML = '<p style="color:#dc2626;margin:0;padding:16px;">Erro: ' + (e.message || 'falhou') + '</p><button id="btnRetryPix" style="margin-top:8px;padding:8px 16px;background:#009ee3;color:#fff;border:0;border-radius:6px;cursor:pointer;">Tentar de novo</button>';
            var retry = document.getElementById('btnRetryPix');
            if (retry) retry.onclick = function () { gerarPix(); };
        }
    }

    // Inicia direto no Pix (sem abas)
    gerarPix();
}