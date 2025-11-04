(function () {
    const grid = document.getElementById('grid');
    const q = document.getElementById('q');
    const SL = window.SLUGS || [];

    function render(list) {
        grid.innerHTML = '';
        list.forEach(s => {
            const a = document.createElement('a');
            const t = encodeURIComponent(s.title);
            a.href = `/doc/${s.slug}?t = ${t}`;
            a.className = 'card-link';
            a.innerHTML = `<div class="card"> <h3 class="card-title">${s.title}</h3> <div class="tags"> <span class="tag tag--type">${s.tipo}</span> <span class="tag tag--brand">${s.brand}</span> </div> <div class="small">Clique para gerar com seus dados</div> <div style="margin-top:12px"> <button class="btn btn-sm">Gerar agora</button> </div> </div>`;
            grid.appendChild(a);
        });
    }

    render(SL);

    q.addEventListener('input', () => {
        const term = q.value.toLowerCase().trim();
        if (!term) return render(SL);
        const out = SL.filter(s =>
            s.title.toLowerCase().includes(term) ||
            (s.brand || '').toLowerCase().includes(term) ||
            (s.tipo || '').toLowerCase().includes(term) ||
            (s.slug || '').toLowerCase().includes(term)
        );
        render(out);
    });
})();