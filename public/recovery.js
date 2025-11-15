(function () {
    var KEY_GEN = 'lm:generated:v1';
    var TTL = 1000 * 60 * 60 * 24 * 7;
    var WHATSAPP = '5547991323024';
    function saveGeneratedDoc(state) { localStorage.setItem(KEY_GEN, JSON.stringify(Object.assign({}, state, { ts: Date.now() }))); }
    function loadGeneratedDoc() { var raw = localStorage.getItem(KEY_GEN); if (!raw) return null; try { var o = JSON.parse(raw); if (Date.now() - o.ts > TTL) { localStorage.removeItem(KEY_GEN); return null; } return o; } catch (e) { localStorage.removeItem(KEY_GEN); return null; } }
    function clearGeneratedDoc() { localStorage.removeItem(KEY_GEN); }
    function ensureHtml2pdf() { return new Promise(function (res) { if (window.html2pdf) { res(); return; } if (document.getElementById('lm-html2pdf')) { var i = setInterval(function () { if (window.html2pdf) { clearInterval(i); res(); } }, 50); return; } var sc = document.createElement('script'); sc.id = 'lm-html2pdf'; sc.src = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js'; sc.onload = function () { res(); }; document.head.appendChild(sc); }); }
    function downloadDocFromHtml(html, filename) { var full = '<html><head><meta charset="utf-8"><style>body{background:#fff;color:#000;font:12pt "Times New Roman",Times,Georgia,serif;line-height:1.6;margin:0;padding:18mm;box-sizing:border-box}p{margin:0 0 12pt 0;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}</style></head><body>' + html + '</body></html>'; var blob = new Blob(['\ufeff', full], { type: 'application/msword' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = (filename || 'documento') + '.doc'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
    function downloadPdfFromHtml(html, filename) {
        // CORREÇÃO: Primeiro garante que html2pdf está carregado
        ensureHtml2pdf().then(function () {
            var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
            var host = document.createElement('div');
            host.style.position = 'fixed'; host.style.left = '-10000px'; host.style.top = '-10000px';

            // Usa mesmas dimensões para todos, mas com ajustes
            var pageStyle = 'width:210mm;padding:20mm 18mm;box-sizing:border-box;background:#fff;color:#000;font:12pt Times,serif;line-height:1.6;word-break:break-word;overflow-wrap:anywhere';

            host.innerHTML = '<div id="p" style="' + pageStyle + '">' + html + '</div>';
            document.body.appendChild(host);
            var node = host.querySelector('#p');

            var opt = {
                margin: [5, 0, 5, 0],
                filename: (filename || 'documento') + '.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    scrollY: 0,
                    windowHeight: node.scrollHeight + 100
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            html2pdf().set(opt).from(node).toPdf().get('pdf').then(function (pdf) {
                var blob = pdf.output('blob');
                function saveBlob() {
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url; a.download = (filename || 'documento') + '.pdf';
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(function () { URL.revokeObjectURL(url); host.remove(); }, 1200);
                }
                if (isIOS && navigator.share && window.File) {
                    try {
                        var file = new File([blob], (filename || 'documento') + '.pdf', { type: 'application/pdf' });
                        navigator.share({ files: [file], title: (filename || 'documento') }).catch(saveBlob).finally(function () { host.remove(); });
                    } catch (e) { saveBlob(); }
                } else {
                    saveBlob();
                }
            }).catch(function () { host.remove(); });
        });
    }
    function injectStyles() { if (document.getElementById('lm-rec-css')) return; var s = document.createElement('style'); s.id = 'lm-rec-css'; s.textContent = '.lm-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999}.lm-card{background:#111;color:#fff;border:1px solid #333;border-radius:10px;max-width:520px;width:92%;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.4);font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Ubuntu,Arial}.lm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.btn{padding:10px 14px;border-radius:8px;border:1px solid #444;background:#1e1e1e;color:#fff;cursor:pointer}.btn-primary{background:#2563eb;border-color:#1d4ed8}.btn-green{background:#22c55e;border-color:#16a34a}.btn-outline{background:transparent}'; document.head.appendChild(s); }
    function offerRecover() { var state = loadGeneratedDoc(); if (!state) return; injectStyles(); var n = (state && state.meta && state.meta.filename) || 'documento'; var t = (state && state.meta && state.meta.type) || ''; var id = (state && state.meta && state.meta.orderId) || ''; var modal = document.createElement('div'); modal.className = 'lm-modal'; modal.innerHTML = '<div class="lm-card"><h3 style="margin:0 0 8px">Documento encontrado</h3><p>Temos um documento ' + (t ? ('(' + t + ') ') : '') + 'gerado recentemente' + (id ? (' • Pedido: ' + id) : '') + '. Deseja recuperar?</p><div class="lm-actions"><button class="btn btn-primary" id="lm-rec-doc">Baixar DOC</button><button class="btn" id="lm-rec-pdf">Baixar PDF</button><a class="btn btn-green" id="lm-rec-wa" target="_blank" rel="noopener">WhatsApp</a><button class="btn btn-outline" id="lm-rec-clear">Descartar</button></div></div>'; document.body.appendChild(modal); document.getElementById('lm-rec-wa').href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Oi! Preciso de ajuda com meu documento. Tipo: ' + t + ' | Pedido: ' + id); document.getElementById('lm-rec-doc').onclick = function () { downloadDocFromHtml(state.html, n); }; document.getElementById('lm-rec-pdf').onclick = function () { downloadPdfFromHtml(state.html, n); }; document.getElementById('lm-rec-clear').onclick = function () { clearGeneratedDoc(); modal.remove(); }; modal.onclick = function (e) { if (e.target === modal) modal.remove(); }; }
    window.LMRecovery = { saveGeneratedDoc: saveGeneratedDoc, offerRecover: offerRecover, clearGeneratedDoc: clearGeneratedDoc, pdf: downloadPdfFromHtml, doc: downloadDocFromHtml };
})();