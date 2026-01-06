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
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else {
    // Força tema claro se não houver preferência salva
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

// --- Início do Banner de Cookies Minimalista (All-in-One) ---
document.addEventListener('DOMContentLoaded', function () {
  // Verifica se já aceitou antes
  if (!localStorage.getItem('cookies_accepted')) {

    // 1. Injeta o CSS (Estilo) diretamente pelo JS
    // Isso cria a barrinha flutuante "pílula" sem precisar mexer no style.css
    const style = document.createElement('style');
    style.innerHTML = `
      #cookie-banner {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(17, 24, 39, 0.95);
        color: white;
        padding: 10px 20px;
        border-radius: 50px;
        display: none; /* Começa invisível */
        align-items: center;
        gap: 15px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 99999;
        font-size: 12px;
        width: 90%;
        max-width: 400px;
        border: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(5px);
        font-family: sans-serif;
        opacity: 0;
        transition: opacity 0.5s ease;
      }
      #cookie-banner.visible {
        display: flex;
        opacity: 1;
      }
      #cookie-banner p {
        margin: 0;
        line-height: 1.3;
        flex: 1;
      }
      #cookie-banner a {
        color: #60a5fa;
        text-decoration: underline;
      }
      #cookie-banner button {
        background: white;
        color: #0f172a;
        border: none;
        padding: 6px 16px;
        border-radius: 20px;
        font-weight: 700;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
        transition: transform 0.2s;
      }
      #cookie-banner button:active {
        transform: scale(0.95);
      }
      @media (max-width: 480px) {
        #cookie-banner {
          bottom: 15px;
          width: 94%;
          border-radius: 16px; /* Mais quadrado no celular para aproveitar espaço */
          padding: 12px 16px;
        }
      }
    `;
    document.head.appendChild(style);

    // 2. Cria o HTML do banner
    var bannerHTML = `
      <div id="cookie-banner">
        <p>
          Usamos cookies para melhorar sua experiência. 
          Ao continuar, você concorda com nossa 
          <a href="/privacidade.html">Política de Privacidade</a>.
        </p>
        <button id="btn-accept-cookies">Entendi</button>
      </div>
    `;

    // 3. Insere na página
    document.body.insertAdjacentHTML('beforeend', bannerHTML);

    // 4. Lógica de aparecer suavemente (Timer de 1.5s)
    setTimeout(function() {
        const banner = document.getElementById('cookie-banner');
        if(banner) banner.classList.add('visible');
    }, 1500);

    // 5. Ação do Botão
    document.getElementById('btn-accept-cookies').addEventListener('click', function () {
      localStorage.setItem('cookies_accepted', 'true');
      const banner = document.getElementById('cookie-banner');
      banner.style.opacity = '0'; // Some suavemente
      setTimeout(() => banner.remove(), 500); // Remove do HTML depois de sumir
    });
  }
});
// --- Fim do Banner de Cookies ---
