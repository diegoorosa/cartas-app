// Theme toggle
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// Load saved theme
(function () {
  // 1. Tenta pegar o tema salvo pelo usuário (se ele já clicou no 🌙 alguma vez)
  const savedTheme = localStorage.getItem('theme');

  if (savedTheme) {
    // Se ele já escolheu um tema antes, respeitamos a escolha dele
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else {
    // 2. Se é a primeira vez (ou não tem nada salvo):
    // FORÇAMOS O TEMA CLARO (LIGHT), ignorando se o celular está no modo escuro.
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

// --- Início do Banner de Cookies (LGPD) ---
document.addEventListener('DOMContentLoaded', function () {
  // Verifica se já aceitou antes
  if (!localStorage.getItem('cookies_accepted')) {

    // Cria o HTML do banner dinamicamente
    var bannerHTML = `
            <div id="cookie-banner" style="position:fixed; bottom:0; left:0; right:0; background:#0f172a; color:#fff; padding:16px; z-index:99999; border-top:1px solid #334155; box-shadow:0 -4px 20px rgba(0,0,0,0.3); font-family: sans-serif;">
                <div style="max-width: 1200px; margin: 0 auto; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px; padding: 0 20px;">
                    <p style="margin:0; color:#cbd5e1; flex:1; font-size: 14px; line-height: 1.5;">
                        Utilizamos cookies para melhorar a experiência e analisar o tráfego. 
                        Ao continuar, você concorda com nossa 
                        <a href="/privacidade.html" style="color:#60a5fa; text-decoration:underline;">Política de Privacidade</a>.
                    </p>
                    <button id="btn-accept-cookies" style="background-color: #3b82f6; color: white; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; transition: background 0.2s;">
                        Entendi
                    </button>
                </div>
            </div>
        `;

    // Insere o banner no final da página (sem apagar o resto)
    document.body.insertAdjacentHTML('beforeend', bannerHTML);

    // Adiciona a função de clique no botão
    document.getElementById('btn-accept-cookies').addEventListener('click', function () {
      // Salva a decisão no navegador da pessoa
      localStorage.setItem('cookies_accepted', 'true');
      // Remove o banner da tela
      document.getElementById('cookie-banner').style.display = 'none';
    });
  }
});
// --- Fim do Banner de Cookies ---