(function () {
    var grid = document.getElementById('grid');
    var q = document.getElementById('q');
    var SL = window.SLUGS || [];

    function render(list) {
        grid.innerHTML = '';
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            var a = document.createElement('a');
            var t = encodeURIComponent(s.title);
            a.href = '/doc/' + s.slug + '?t=' + t;
            a.className = 'card-link';
            a.innerHTML =
                '<div class="card">' +
                '<h3 class="card-title">' + s.title + '</h3>' +
                '<div class="tags">' +
                '<span class="tag tag--type">' + s.tipo + '</span>' +
                '<span class="tag tag--brand">' + s.brand + '</span>' +
                '</div>' +
                '<div class="small">Clique para gerar com seus dados</div>' +
                '<div style="margin-top:12px"><button class="btn btn-sm">Gerar agora</button></div>' +
                '</div>';
            grid.appendChild(a);
        }
    }

    render(SL);

    q.addEventListener('input', function () {
        var term = q.value.toLowerCase().trim();
        if (!term) { render(SL); return; }
        var out = SL.filter(function (s) {
            return s.title.toLowerCase().includes(term) ||
                (s.brand || '').toLowerCase().includes(term) ||
                (s.tipo || '').toLowerCase().includes(term) ||
                (s.slug || '').toLowerCase().includes(term);
        });
        render(out);
    });
})();