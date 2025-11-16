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
  // 1. Tenta pegar o tema salvo pelo usuário (se ele já clicou no 🌙)
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    return;
  }

  // 2. Se não tem nada salvo, detecta o sistema
  //    (Verifica se o sistema prefere o modo CLARO)
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

  // 3. Aplica o tema: 'light' se o sistema preferir, senão 'dark'
  document.documentElement.setAttribute('data-theme', prefersLight ? 'light' : 'dark');
})();