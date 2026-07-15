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
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

// --- Banner de Cookies "Nano" ---
document.addEventListener('DOMContentLoaded', function () {
  if (!localStorage.getItem('cookies_accepted')) {
    const style = document.createElement('style');
    // CSS Otimizado para ser BEM MENOR
    style.innerHTML = `
      #cookie-banner {
        position: fixed;
        bottom: 10px; /* Mais colado no fundo */
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.95);
        color: white;
        padding: 6px 14px; /* Bem mais fino */
        border-radius: 50px;
        display: none;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 99999;
        font-size: 11px; /* Letra menor */
        width: auto; /* Largura automática */
        max-width: 90%;
        border: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(4px);
        font-family: sans-serif;
        opacity: 0;
        transition: opacity 0.5s ease;
        white-space: nowrap; /* Tenta manter em uma linha */
      }
      #cookie-banner.visible { display: flex; opacity: 1; }
      #cookie-banner p { margin: 0; }
      #cookie-banner a { color: #60a5fa; text-decoration: underline; }
      #cookie-banner button {
        background: white; color: #0f172a; border: none;
        padding: 4px 12px; border-radius: 20px;
        font-weight: 700; cursor: pointer; font-size: 10px;
        white-space: nowrap;
      }
      @media (max-width: 480px) {
        #cookie-banner {
            white-space: normal; /* No celular quebra linha se precisar */
            text-align: center;
            width: 90%;
            bottom: 15px;
        }
      }
    `;
    document.head.appendChild(style);

    var bannerHTML = `
      <div id="cookie-banner">
        <p>Usamos cookies para melhorar sua experiência. <a href="/privacidade.html">Política de Privacidade</a>.</p>
        <button id="btn-accept-cookies">OK</button>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', bannerHTML);

    setTimeout(function() {
        const banner = document.getElementById('cookie-banner');
        if(banner) banner.classList.add('visible');
    }, 2000); // 2 segundos de atraso

    document.getElementById('btn-accept-cookies').addEventListener('click', function () {
      localStorage.setItem('cookies_accepted', 'true');
      const banner = document.getElementById('cookie-banner');
      banner.style.opacity = '0';
      setTimeout(() => banner.remove(), 500);
    });
  }
});
