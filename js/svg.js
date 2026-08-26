/* ═══════════════════════════════════════════════════════════
   Hand-drawn SVG artwork — ported from src/components/svg/*.
   NeuralNetwork, TensorChip, OnCallComic, StackHealth.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

window.NewsSvg = {
  NeuralNetwork: function () {
    return '<svg viewBox="0 0 300 250" role="img" aria-label="Agentic graph traced through a neural network" style="width:100%">' +
      '<defs><pattern id="nn-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#333538"/></pattern>' +
      '<marker id="nn-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#444950"/></marker></defs>' +
      '<rect width="300" height="250" fill="url(#nn-dots)"/>' +
      '<g stroke="#333538" stroke-width="1.1" fill="none">' +
      '<path d="M50 55 Q 95 25 132 48"/><path d="M50 55 Q 92 70 132 120"/><path d="M50 125 Q 90 90 132 120"/><path d="M50 125 Q 92 160 132 192"/><path d="M50 195 Q 90 170 132 192"/>' +
      '<path d="M132 48 Q 172 28 212 62"/><path d="M132 48 Q 175 80 212 128"/><path d="M132 120 Q 172 95 212 128"/><path d="M132 120 Q 176 160 212 190"/><path d="M132 192 Q 172 170 212 190"/>' +
      '<path d="M212 62 Q 240 90 262 140"/><path d="M212 128 Q 242 150 262 185"/><path d="M212 190 Q 240 175 262 150"/></g>' +
      '<g fill="#202123" stroke="#444950" stroke-width="1.4">' +
      '<circle cx="50" cy="55" r="7"/><circle cx="50" cy="125" r="7"/><circle cx="50" cy="195" r="7"/>' +
      '<circle cx="132" cy="48" r="7"/><circle cx="132" cy="120" r="7"/><circle cx="132" cy="192" r="7"/>' +
      '<circle cx="212" cy="62" r="7"/><circle cx="212" cy="128" r="7"/><circle cx="212" cy="190" r="7"/>' +
      '<circle cx="262" cy="140" r="7"/><circle cx="262" cy="185" r="7"/></g>' +
      '<path d="M50 125 Q 90 90 132 120 Q 172 95 212 128 Q 242 150 262 185" fill="none" stroke="#53a3f9" stroke-width="1.8" stroke-dasharray="5 4" marker-end="url(#nn-arrow)"/>' +
      '<g fill="#53a3f9"><circle cx="50" cy="125" r="5"/><circle cx="132" cy="120" r="5"/><circle cx="212" cy="128" r="5"/><circle cx="262" cy="185" r="5"/></g>' +
      '<circle cx="50" cy="125" r="9" fill="none" stroke="#53a3f9" stroke-width="0.8" opacity="0.55"/></svg>';
  },

  TensorChip: function () {
    var pins = '';
    [22, 34, 46, 58, 70, 82, 94].forEach(function (x) {
      pins += '<line x1="' + x + '" y1="6" x2="' + x + '" y2="20"/><line x1="' + x + '" y1="100" x2="' + x + '" y2="114"/>';
    });
    [22, 34, 46, 58, 70, 82, 94].forEach(function (y) {
      pins += '<line x1="6" y1="' + y + '" x2="20" y2="' + y + '"/><line x1="100" y1="' + y + '" x2="114" y2="' + y + '"/>';
    });
    var grid = '';
    [30, 48, 66, 84].forEach(function (x) { grid += '<line x1="' + x + '" y1="30" x2="' + x + '" y2="90"/>'; });
    [30, 48, 66, 84].forEach(function (y) { grid += '<line x1="30" y1="' + y + '" x2="90" y2="' + y + '"/>'; });
    return '<svg viewBox="0 0 120 120" role="img" aria-label="Tensor processing chip" style="width:100%">' +
      '<g stroke="#444950" stroke-width="2">' + pins + '</g>' +
      '<rect x="22" y="22" width="76" height="76" rx="4" fill="#202123" stroke="#e3e3e3" stroke-width="1.4"/>' +
      '<g stroke="#444950" stroke-width="1">' + grid + '</g>' +
      '<rect x="68" y="68" width="16" height="16" fill="#53a3f9"/>' +
      '<circle cx="76" cy="76" r="14" fill="none" stroke="#53a3f9" stroke-width="0.8" opacity="0.6"/>' +
      '<text x="34" y="105" font-family="Spline Sans Mono, monospace" font-size="6" letter-spacing="0.14em" fill="#bec3c9">MUBDIUR//TC-1</text></svg>';
  },

  OnCallComic: function () {
    return '<svg viewBox="0 0 660 232" role="img" aria-label="Comic strip, three panels: at 01:47 the pager sings; the database insists it is fine; it was the LLM, paging itself." style="width:100%">' +
      '<defs><marker id="occ-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#fb565b"/></marker></defs>' +
      '<rect x="15" y="16" width="200" height="200" rx="8" fill="#101011" stroke="#333538" stroke-width="1.5"/>' +
      '<rect x="230" y="16" width="200" height="200" rx="8" fill="#101011" stroke="#333538" stroke-width="1.5"/>' +
      '<rect x="445" y="16" width="200" height="200" rx="8" fill="#101011" stroke="#333538" stroke-width="1.5"/>' +
      '<text x="27" y="38" font-family="Spline Sans Mono, monospace" font-size="10" font-weight="700" fill="#fb565b">01:47</text>' +
      '<text x="242" y="38" font-family="Spline Sans Mono, monospace" font-size="10" font-weight="700" fill="#fb565b">01:47</text>' +
      '<text x="457" y="38" font-family="Spline Sans Mono, monospace" font-size="10" font-weight="700" fill="#fb565b">01:49</text>' +
      '<g stroke="#bec3c9" stroke-width="1.6" fill="none" stroke-linecap="round">' +
      '<path d="M83 88 q -12 10 0 24"/><path d="M76 79 q -20 17 0 38"/><path d="M147 88 q 12 10 0 24"/><path d="M154 79 q 20 17 0 38"/></g>' +
      '<rect x="93" y="80" width="44" height="58" rx="8" fill="#202123" stroke="#e3e3e3" stroke-width="1.8"/>' +
      '<rect x="99" y="88" width="32" height="24" rx="3" fill="#101011" stroke="#333538" stroke-width="1.2"/>' +
      '<text x="115" y="101" font-family="Spline Sans Mono, monospace" font-size="8" font-weight="700" fill="#fb565b" text-anchor="middle">PAGE</text>' +
      '<circle cx="127" cy="93" r="2" fill="#fb565b"/>' +
      '<rect x="99" y="120" width="13" height="9" rx="2" fill="#333538"/><rect x="114" y="120" width="13" height="9" rx="2" fill="#333538"/>' +
      '<text x="115" y="199" font-family="Spline Sans Mono, monospace" font-size="10" fill="#bec3c9" text-anchor="middle">01:47 — the pager sings</text>' +
      '<ellipse cx="330" cy="76" rx="36" ry="11" fill="none" stroke="#e3e3e3" stroke-width="1.8"/>' +
      '<path d="M294 76 L294 118 A36 11 0 0 0 366 118 L366 76" fill="#101011" stroke="#e3e3e3" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<circle cx="318" cy="90" r="3" fill="#e3e3e3"/><circle cx="342" cy="90" r="3" fill="#e3e3e3"/>' +
      '<path d="M318 100 Q330 110 342 100" fill="none" stroke="#e3e3e3" stroke-width="1.6" stroke-linecap="round"/>' +
      '<rect x="291" y="46" width="78" height="22" rx="11" fill="#333538" stroke="#e3e3e3" stroke-width="1.4"/>' +
      '<path d="M318 68 L324 80 L336 68" fill="#333538"/>' +
      '<text x="330" y="61" font-family="Spline Sans Mono, monospace" font-size="9" fill="#e3e3e3" text-anchor="middle">the db is fine.</text>' +
      '<text x="330" y="199" font-family="Spline Sans Mono, monospace" font-size="10" fill="#bec3c9" text-anchor="middle">the database is fine.</text>' +
      '<rect x="497" y="44" width="96" height="22" rx="11" fill="#333538" stroke="#e3e3e3" stroke-width="1.4"/>' +
      '<path d="M523 66 L530 80 L537 66" fill="#333538"/>' +
      '<text x="545" y="59" font-family="Spline Sans Mono, monospace" font-size="9" fill="#e3e3e3" text-anchor="middle">paging itself.</text>' +
      '<line x1="545" y1="80" x2="545" y2="66" stroke="#e3e3e3" stroke-width="1.6"/>' +
      '<circle cx="545" cy="62" r="3.5" fill="#fb565b"/>' +
      '<rect x="519" y="80" width="52" height="48" rx="10" fill="#202123" stroke="#e3e3e3" stroke-width="1.8"/>' +
      '<rect x="531" y="92" width="8" height="11" fill="#e3e3e3"/><rect x="551" y="96" width="8" height="5" fill="#e3e3e3"/>' +
      '<path d="M531 114 q 7 -5 14 0 q 7 5 14 0" fill="none" stroke="#e3e3e3" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M571 86 A 20 20 0 1 1 569 116" fill="none" stroke="#fb565b" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#occ-arrow)"/>' +
      '<text x="545" y="199" font-family="Spline Sans Mono, monospace" font-size="10" fill="#bec3c9" text-anchor="middle">it was the LLM, paging itself.</text></svg>';
  },

  StackHealth: function () {
    var collectors = [
      { name: 'LOKI', sub: 'logs', y: 20, icon: '<path d="M0 6 C -5 2 -2 -6 2 -8 C 4 -3 4 1 1 6 z M0 6 C -1 2 1 2 3 6 z" fill="#444950" stroke="none"/>' },
      { name: 'TEMPO', sub: 'traces', y: 84, icon: '<path d="M-6 0 Q -3 -6 0 0 T 6 0"/>' },
      { name: 'MIMIR', sub: 'metrics', y: 148, icon: '<line x1="-5" y1="6" x2="-5" y2="-2"/><line x1="0" y1="6" x2="0" y2="-5"/><line x1="5" y1="6" x2="5" y2="0"/>' },
      { name: 'KIBANA', sub: 'error views', y: 212, icon: '<circle cx="0" cy="-2" r="5"/><line x1="3.5" y1="1.5" x2="7" y2="5"/>' }
    ];
    var html = '<svg viewBox="0 0 720 340" role="img" aria-label="Observability stack diagram" style="width:100%">' +
      '<defs><marker id="sh-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#444950"/></marker>' +
      '<marker id="sh-arrow-red" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="#fb565b"/></marker></defs>' +
      '<g transform="translate(32 0)">' +
      '<rect x="16" y="134" width="118" height="56" rx="3" fill="#202123" stroke="#444950" stroke-width="1.2"/>' +
      '<text x="30" y="158" font-family="Spline Sans Mono, monospace" font-size="10" letter-spacing="0.08em" fill="#e3e3e3">APPS · AGENTS</text>' +
      '<text x="30" y="174" font-family="Spline Sans Mono, monospace" font-size="10" letter-spacing="0.08em" fill="#bec3c9">PORTALS · CRAWL4AI</text>';
    collectors.forEach(function (c) {
      html += '<rect x="206" y="' + c.y + '" width="112" height="46" rx="3" fill="#202123" stroke="#444950" stroke-width="1.2"/>' +
        '<text x="220" y="' + (c.y + 21) + '" font-family="Spline Sans Mono, monospace" font-size="10" letter-spacing="0.1em" fill="#e3e3e3">' + c.name + '</text>' +
        '<text x="220" y="' + (c.y + 36) + '" font-family="Spline Sans Mono, monospace" font-size="8" letter-spacing="0.1em" fill="#bec3c9">' + c.sub + '</text>' +
        '<g transform="translate(' + (206 + 86) + ' ' + (c.y + 23) + ')" stroke="#444950" stroke-width="1.2" fill="none">' + c.icon + '</g>';
    });
    html += '<g stroke="#444950" stroke-width="1.2" fill="none">' +
      '<path d="M134 148 L 204 46" marker-end="url(#sh-arrow)"/><path d="M134 162 L 204 108" marker-end="url(#sh-arrow)"/>' +
      '<path d="M134 166 L 204 172" marker-end="url(#sh-arrow)"/><path d="M134 180 L 204 236" marker-end="url(#sh-arrow)"/></g>' +
      '<rect x="470" y="96" width="170" height="58" rx="3" fill="#202123" stroke="#e3e3e3" stroke-width="1.4"/>' +
      '<text x="484" y="121" font-family="Spline Sans Mono, monospace" font-size="10" letter-spacing="0.1em" fill="#e3e3e3">GRAFANA</text>' +
      '<text x="484" y="137" font-family="Spline Sans Mono, monospace" font-size="8" letter-spacing="0.1em" fill="#bec3c9">the glass</text>' +
      '<path d="M602 108 C 597 104 597 96 602 94 C 606 96 606 102 602 108 z" fill="#e3e3e3"/>' +
      '<rect x="470" y="168" width="170" height="48" rx="3" fill="#202123" stroke="#444950" stroke-width="1.2"/>' +
      '<text x="484" y="189" font-family="Spline Sans Mono, monospace" font-size="10" letter-spacing="0.1em" fill="#e3e3e3">DATADOG</text>' +
      '<text x="484" y="204" font-family="Spline Sans Mono, monospace" font-size="8" letter-spacing="0.1em" fill="#bec3c9">cost · tokens · apm</text>' +
      '<polygon points="576,100 584,105 584,113 576,118 568,113 568,105" transform="translate(32 6)" fill="none" stroke="#444950" stroke-width="1.2"/>' +
      '<rect x="470" y="20" width="170" height="48" rx="3" fill="#202123" stroke="#fb565b" stroke-width="1.4"/>' +
      '<text x="484" y="41" font-family="Spline Sans Mono, monospace" font-size="10" letter-spacing="0.1em" fill="#fb565b">DYNATRACE</text>' +
      '<text x="484" y="56" font-family="Spline Sans Mono, monospace" font-size="8" letter-spacing="0.1em" fill="#bec3c9">ai problem detection</text>' +
      '<g transform="translate(614 44)" stroke="#fb565b" stroke-width="1.1" fill="none"><circle r="9"/><circle r="5.5"/><circle r="2.5" fill="#fb565b" stroke="none"/><line x1="-9" y1="0" x2="9" y2="0"/></g>' +
      '<g stroke="#444950" stroke-width="1.2" fill="none">' +
      '<path d="M318 46 Q 390 40 474 110" marker-end="url(#sh-arrow)"/><path d="M318 110 Q 390 96 474 124" marker-end="url(#sh-arrow)"/>' +
      '<path d="M318 172 Q 390 150 474 138" marker-end="url(#sh-arrow)"/><path d="M318 236 Q 390 220 474 190" marker-end="url(#sh-arrow)"/></g>' +
      '<g stroke="#fb565b" stroke-width="1.2" fill="none" stroke-dasharray="4 3">' +
      '<path d="M318 46 Q 420 10 474 34" marker-end="url(#sh-arrow-red)"/><path d="M318 236 Q 410 250 474 200" marker-end="url(#sh-arrow-red)"/></g>' +
      '<rect x="16" y="282" width="624" height="20" rx="3" fill="none" stroke="#333538" stroke-width="1.2"/>' +
      '<text x="30" y="296" font-family="Spline Sans Mono, monospace" font-size="9" letter-spacing="0.12em" fill="#bec3c9">PIPELINE: CRAWL4AI → EXTRACT → INDEX → MONITOR → TUNE · MTTR 8 MIN</text>' +
      '<rect x="16" y="306" width="624" height="20" rx="3" fill="none" stroke="#333538" stroke-width="1.2"/>' +
      '<text x="30" y="320" font-family="Spline Sans Mono, monospace" font-size="9" letter-spacing="0.12em" fill="#bec3c9">INFRA: OPENSTACK · K8S · DOCKER · LINUX · TERRAFORM · NO ALERT FATIGUE</text>' +
      '</g></svg>';
    return html;
  }
};
})();
