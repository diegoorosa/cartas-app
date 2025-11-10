(function (d) {
  var KEY = 'theme';
  var t = localStorage.getItem(KEY) || 'light';
  d.documentElement.setAttribute('data-theme', t);
  d.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var cur = d.documentElement.getAttribute('data-theme') || 'light';
    var next = cur === 'light' ? 'dark' : 'light';
    d.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(KEY, next);
    if (btn.tagName === 'BUTTON') btn.textContent = next === 'light' ? 'Modo escuro' : 'Modo claro';
  });
})(document);