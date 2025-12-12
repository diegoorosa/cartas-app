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