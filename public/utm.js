(function () {
    var p = new URLSearchParams(location.search);
    var utm = {
        source: p.get('utm_source') || sessionStorage.getItem('utm_source') || '',
        medium: p.get('utm_medium') || sessionStorage.getItem('utm_medium') || '',
        campaign: p.get('utm_campaign') || sessionStorage.getItem('utm_campaign') || '',
        term: p.get('utm_term') || sessionStorage.getItem('utm_term') || '',
        content: p.get('utm_content') || sessionStorage.getItem('utm_content') || ''
    };
    Object.keys(utm).forEach(function (k) { sessionStorage.setItem('utm_' + k, utm[k]); });
    localStorage.setItem('utm', JSON.stringify(utm));
    window.LMUTM = { get: function () { try { return JSON.parse(localStorage.getItem('utm') || '{}'); } catch (e) { return {}; } } };
})();