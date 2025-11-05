(function () {
    var q = document.getElementById('q');

    var secViagemCard = document.getElementById('section-viagem-card');
    var h2Guias = document.getElementById('h2-guias-viagem');
    var secGuias = document.getElementById('section-guias-viagem');
    var h2Bagagem = document.getElementById('h2-bagagem');
    var secBagagem = document.getElementById('section-bagagem');
    var h2Pop = document.getElementById('h2-populares');
    var gridPop = document.getElementById('grid');

    var searchWrap = document.getElementById('searchResults');
    var searchGrid = document.getElementById('searchGrid');
    var noResults = document.getElementById('noResults');

    function renderPopular() {
        gridPop.innerHTML = '';
        var SL = window.SLUGS || [];
        for (var i = 0; i < SL.length; i++) {
            var s = SL[i];
            var a = document.createElement('a');
            var t = encodeURIComponent(s.title);
            a.href = '/doc.html?slug=' + encodeURIComponent(s.slug) + '&t=' + t;
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
            gridPop.appendChild(a);
        }
    }

    var CARD_TOOLS = [
        { title: 'Autorização de Viagem para Menor', href: '/viagem.html', tags: ['viagem', 'autorizacao', 'menor', 'nacional', 'internacional'], type: 'tool' },
        { title: 'Carta – Bagagem Extraviada/Danificada', href: '/bagagem.html', tags: ['bagagem', 'companhia aerea', 'carta', 'reclamacao'], type: 'tool' }
    ];
    var CARD_GUIDES = [
        { title: 'Menor – Nacional (1 responsável)', href: '/menor-nacional-um-responsavel.html', tags: ['viagem', 'menor', 'nacional', 'guia'], type: 'guide' },
        { title: 'Menor – Nacional (2 responsáveis)', href: '/menor-nacional-dois-responsaveis.html', tags: ['viagem', 'menor', 'nacional', 'guia'], type: 'guide' },
        { title: 'Menor – Internacional (1 resp.)', href: '/menor-internacional-um-responsavel.html', tags: ['viagem', 'menor', 'internacional', 'guia'], type: 'guide' },
        { title: 'Menor – Internacional (2 resp.)', href: '/menor-internacional-dois-responsaveis.html', tags: ['viagem', 'menor', 'internacional', 'guia'], type: 'guide' },
        { title: 'Menor – Acompanhado por terceiro', href: '/menor-acompanhado-por-terceiro.html', tags: ['viagem', 'menor', 'acompanhante', 'guia'], type: 'guide' },
        { title: 'Bagagem extraviada', href: '/bagagem-extraviada.html', tags: ['bagagem', 'extraviada', 'guia'], type: 'guide' },
        { title: 'Bagagem danificada', href: '/bagagem-danificada.html', tags: ['bagagem', 'danificada', 'guia'], type: 'guide' }
    ];
    var CARD_DOCS = (window.SLUGS || []).map(function (s) {
        return { title: s.title, href: '/doc.html?slug=' + encodeURIComponent(s.slug) + '&t=' + encodeURIComponent(s.title), tags: [s.brand || '', s.tipo || '', 'carta', 'modelo'], type: 'doc' };
    });

    function renderSearch(term) {
        var t = term.toLowerCase().trim();
        if (!t) {
            searchWrap.style.display = 'none';
            noResults.style.display = 'none';
            secViagemCard.style.display = '';
            h2Guias.style.display = '';
            secGuias.style.display = '';
            h2Bagagem.style.display = '';
            secBagagem.style.display = '';
            h2Pop.style.display = '';
            gridPop.style.display = '';
            return;
        }
        var all = CARD_TOOLS.concat(CARD_GUIDES).concat(CARD_DOCS);
        var out = all.filter(function (it) {
            var hay = (it.title + ' ' + (it.tags || []).join(' ')).toLowerCase();
            return hay.indexOf(t) !== -1;
        });

        out.sort(function (a, b) {
            var w = { tool: 0, doc: 1, guide: 2 };
            return (w[a.type] - w[b.type]) || a.title.localeCompare(b.title);
        });

        secViagemCard.style.display = 'none';
        h2Guias.style.display = 'none';
        secGuias.style.display = 'none';
        h2Bagagem.style.display = 'none';
        secBagagem.style.display = 'none';
        h2Pop.style.display = 'none';
        gridPop.style.display = 'none';

        searchWrap.style.display = '';
        searchGrid.innerHTML = '';
        if (out.length === 0) {
            noResults.style.display = '';
            return;
        }
        noResults.style.display = 'none';
        for (var i = 0; i < out.length; i++) {
            var c = out[i];
            var a = document.createElement('a');
            a.href = c.href;
            a.className = 'card-link';
            var subtitle = c.type === 'tool' ? 'Gerador rápido' : (c.type === 'guide' ? 'Guia' : 'Modelo');
            a.innerHTML =
                '<div class="card">' +
                '<h3 class="card-title">' + c.title + '</h3>' +
                '<div class="small">' + subtitle + '</div>' +
                '<div style="margin-top:12px"><button class="btn btn-sm">' + (c.type === 'guide' ? 'Ver' : 'Abrir') + '</button></div>' +
                '</div>';
            searchGrid.appendChild(a);
        }
    }

    renderPopular();

    q.addEventListener('input', function () {
        renderSearch(q.value);
    });
})();