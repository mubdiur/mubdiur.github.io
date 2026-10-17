/* ═══════════════════════════════════════════════════════════
   Loan Calculator — CUSTOM TOOL.
   Fixed-rate amortization over Transforms.loanSchedule: monthly
   payment, total interest, a yearly breakdown table plus a full
   monthly CSV download. Pure math — numbers never leave the tab.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';
function fmtUSD(n) {
  var parts = Number(n).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '$' + parts[0] + '.' + parts[1];
}
function fileSafe(s) {
  var t = String(s).replace(/[^0-9a-zA-Z]+/g, 'p').replace(/^p+|p+$/g, '');
  return t || 'loan';
}
var CSS = '' +
'.t-loan-calculator .loan-inputs{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.6rem;}\n' +
'.t-loan-calculator .loan-flabel{font-family:var(--font-mono);font-size:10.5px;color:rgba(141,148,158,0.75);display:block;margin-bottom:0.3rem;}\n' +
'.t-loan-calculator .loan-in{width:100%;height:34px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 10px;font-family:var(--font-mono);font-size:12.5px;color:rgba(227,227,227,0.9);outline:none;}\n' +
'.t-loan-calculator .loan-in:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
'.t-loan-calculator .loan-row{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-top:0.65rem;}\n' +
'.t-loan-calculator .btn-run{background:rgba(83,163,249,0.2);border:1px solid rgba(83,163,249,0.45);color:#fff;border-radius:6px;font-family:var(--font-mono);font-size:12px;padding:0.45rem 1.1rem;cursor:pointer;}\n' +
'.t-loan-calculator .loan-status{font-family:var(--font-mono);font-size:11.5px;min-height:1.4em;margin-top:0.55rem;color:rgba(141,148,158,0.85);}\n' +
'.t-loan-calculator .loan-status.ok{color:var(--lime);}\n' +
'.t-loan-calculator .loan-status.err{color:var(--ctp-red);}\n' +
'.t-loan-calculator .loan-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0.6rem;margin-top:0.7rem;}\n' +
'.t-loan-calculator .loan-card{border:1px solid rgba(51,53,56,0.4);border-radius:6px;background:rgba(0,0,0,0.25);padding:0.6rem 0.75rem;}\n' +
'.t-loan-calculator .loan-card .k{font-family:var(--font-mono);font-size:10px;color:rgba(141,148,158,0.7);text-transform:uppercase;letter-spacing:0.06em;}\n' +
'.t-loan-calculator .loan-card .v{font-family:var(--font-mono);font-size:17px;color:#fff;margin-top:0.2rem;}\n' +
'.t-loan-calculator .loan-card.hero{border-color:rgba(83,163,249,0.45);}\n' +
'.t-loan-calculator .loan-card.hero .v{color:var(--lime);font-size:21px;}\n' +
'.t-loan-calculator table.loan-table{width:100%;border-collapse:collapse;margin-top:0.7rem;font-family:var(--font-mono);font-size:11.5px;}\n' +
'.t-loan-calculator table.loan-table th{text-align:right;font-weight:600;color:rgba(141,148,158,0.75);font-size:10px;text-transform:uppercase;letter-spacing:0.05em;padding:0.4rem 0.5rem;border-bottom:1px solid rgba(51,53,56,0.5);}\n' +
'.t-loan-calculator table.loan-table th:first-child,.t-loan-calculator table.loan-table td:first-child{text-align:left;}\n' +
'.t-loan-calculator table.loan-table td{text-align:right;padding:0.35rem 0.5rem;border-bottom:1px solid rgba(51,53,56,0.25);color:rgba(227,227,227,0.88);}\n' +
'.t-loan-calculator table.loan-table tr:last-child td{border-bottom:0;}\n' +
'.t-loan-calculator .loan-hint{font-family:var(--font-mono);font-size:10.5px;color:rgba(141,148,158,0.6);margin-top:0.5rem;line-height:1.6;}\n';
function card(k, v, hero) {
  return App.el('div', { class: 'loan-card' + (hero ? ' hero' : '') },
    App.el('div', { class: 'k', text: k }),
    App.el('div', { class: 'v', text: v }));
}
App.registerTool('loan-calculator', {
  css: CSS,
  mount: function (root) {
    var pInput = App.el('input', { class: 'loan-in', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', value: '250000', 'aria-label': 'Loan principal' });
    var rInput = App.el('input', { class: 'loan-in', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', value: '6.5', 'aria-label': 'Annual rate percent' });
    var yInput = App.el('input', { class: 'loan-in', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', value: '30', 'aria-label': 'Term in years' });
    var runBtn = App.el('button', { class: 'btn-run', type: 'button', text: 'Calculate' });
    var clearBtn = App.clearButton(clearAll);
    var status = App.el('div', { class: 'loan-status', role: 'status', text: 'Fixed-rate math — principal, interest and balance to the cent.' });
    var out = App.el('div', {});
    function setStatus(msg, cls) {
      status.textContent = msg;
      status.className = 'loan-status' + (cls ? ' ' + cls : '');
    }
    function clearAll() {
      pInput.value = '';
      rInput.value = '';
      yInput.value = '';
      out.innerHTML = '';
      setStatus('Cleared. Nothing is stored — close the tab and it is gone.');
      pInput.focus();
    }
    function payoffText(months) {
      var yy = Math.floor(months / 12), mm = months % 12;
      if (!yy) return mm + ' mo';
      return mm ? yy + ' yr ' + mm + ' mo' : yy + ' yr';
    }
    function run() {
      out.innerHTML = '';
      var sched;
      try {
        sched = Transforms.loanSchedule(pInput.value, rInput.value, yInput.value);
      } catch (err) {
        setStatus((err && err.message) || 'Those numbers do not make a loan.', 'err');
        return;
      }
      setStatus('Solved — ' + sched.months + ' monthly payments, paid off in ' + payoffText(sched.months) + '.', 'ok');
      out.appendChild(App.el('div', { class: 'loan-cards' },
        card('Monthly payment', fmtUSD(sched.payment), true),
        card('Total interest', fmtUSD(sched.totalInterest)),
        card('Total cost', fmtUSD(sched.totalPaid)),
        card('Payoff', payoffText(sched.months))));
      var tbody = App.el('tbody', {});
      sched.yearly.forEach(function (y) {
        tbody.appendChild(App.el('tr', {},
          [String(y.year), fmtUSD(y.principal), fmtUSD(y.interest), fmtUSD(y.balance)].map(function (t) {
            return App.el('td', { text: t });
          })));
      });
      var table = App.el('table', { class: 'loan-table', 'aria-label': 'Yearly amortization' },
        App.el('thead', {}, App.el('tr', {},
          ['Year', 'Principal', 'Interest', 'Balance'].map(function (h) { return App.el('th', { text: h }); }))),
        tbody);
      out.appendChild(table);
      var snap = sched;
      var csvName = 'loan-schedule-' + fileSafe(pInput.value) + '-' + fileSafe(rInput.value) + 'pct-' + fileSafe(yInput.value) + 'y.csv';
      var copyBtn = App.el('button', { class: 'btn-copy', type: 'button' }, App.icon('copy', '', 14), App.el('span', { text: 'Copy summary' }));
      copyBtn.addEventListener('click', function () {
        App.copy('Monthly payment: ' + fmtUSD(snap.payment) + '\nTotal interest: ' + fmtUSD(snap.totalInterest) +
          '\nTotal cost: ' + fmtUSD(snap.totalPaid) + '\nPayoff: ' + snap.months + ' monthly payments', copyBtn);
      });
      var dlBtn = App.downloadButton(function () {
        var lines = ['month,payment,principal,interest,balance'];
        snap.rows.forEach(function (rw) { lines.push(rw.join(',')); });
        App.download(csvName, lines.join('\n'), 'text/csv');
      }, 'Monthly CSV');
      out.appendChild(App.el('div', { class: 'loan-row' }, copyBtn, dlBtn, App.clearButton(clearAll)));
    }
    runBtn.addEventListener('click', run);
    [pInput, rInput, yInput].forEach(function (inp) {
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') run(); });
    });
    root.appendChild(App.el('div', {},
      App.el('div', { class: 'loan-inputs' },
        App.el('div', {}, App.el('label', { class: 'loan-flabel', text: 'Principal' }), pInput),
        App.el('div', {}, App.el('label', { class: 'loan-flabel', text: 'Annual rate %' }), rInput),
        App.el('div', {}, App.el('label', { class: 'loan-flabel', text: 'Term (years)' }), yInput)),
      App.el('div', { class: 'loan-row' }, runBtn, clearBtn),
      status, out,
      App.el('div', { class: 'loan-hint', text: 'Monthly payment uses the standard amortization formula; the schedule simulates every month to the cent, so the last payment lands exactly on zero.' })));
    run();
  }
});
})();
