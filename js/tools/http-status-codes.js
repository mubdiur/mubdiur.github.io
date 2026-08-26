/* ═══════════════════════════════════════════════════════════
   HTTP Status Codes — ported from src/components/tools/http-status-codes.tsx.
   Browse and search HTTP status codes — click a row to copy it.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

var STATUS_CODES = [
  [100, 'Continue', 'The server has received the request headers and the client should proceed to send the body.'],
  [101, 'Switching Protocols', 'The requester has asked the server to switch protocols and the server has agreed.'],
  [200, 'OK', 'Standard response for successful HTTP requests.'],
  [201, 'Created', 'The request has been fulfilled and a new resource has been created.'],
  [204, 'No Content', 'The server successfully processed the request but is not returning any content.'],
  [301, 'Moved Permanently', 'The requested resource has been permanently moved to a new URL.'],
  [302, 'Found', 'The requested resource resides temporarily under a different URL.'],
  [304, 'Not Modified', 'Indicates the resource has not been modified since the last request.'],
  [400, 'Bad Request', 'The server cannot process the request due to a client error.'],
  [401, 'Unauthorized', 'Authentication is required and has failed or has not been provided.'],
  [403, 'Forbidden', 'The request was valid but the server is refusing action.'],
  [404, 'Not Found', 'The requested resource could not be found.'],
  [405, 'Method Not Allowed', 'The request method is not supported for the requested resource.'],
  [408, 'Request Timeout', 'The server timed out waiting for the request.'],
  [409, 'Conflict', 'The request conflicts with the current state of the server.'],
  [410, 'Gone', 'The requested resource is no longer available and will not be available again.'],
  [413, 'Payload Too Large', 'The request is larger than the server is willing to process.'],
  [415, 'Unsupported Media Type', 'The request entity has a media type the server does not support.'],
  [422, 'Unprocessable Entity', 'The request was well-formed but semantic errors prevent processing.'],
  [429, 'Too Many Requests', 'The user has sent too many requests in a given time frame.'],
  [500, 'Internal Server Error', 'A generic error message returned when an unexpected condition was encountered.'],
  [501, 'Not Implemented', 'The server does not support the functionality required to fulfill the request.'],
  [502, 'Bad Gateway', 'The server received an invalid response from the upstream server.'],
  [503, 'Service Unavailable', 'The server is temporarily unable to handle the request.'],
  [504, 'Gateway Timeout', 'The upstream server failed to send a request in a timely manner.']
];

function codeClass(code) {
  if (code < 200) return 'c-1';
  if (code < 300) return 'c-2';
  if (code < 400) return 'c-3';
  if (code < 500) return 'c-4';
  return 'c-5';
}

function classLabel(code) {
  if (code < 200) return '1xx Info';
  if (code < 300) return '2xx Success';
  if (code < 400) return '3xx Redirect';
  if (code < 500) return '4xx Client Error';
  return '5xx Server Error';
}

App.registerTool('http-status-codes', {
  css: '' +
    '.t-http-status-codes .search-wrap{position:relative;}\n' +
    '.t-http-status-codes .search-wrap svg{position:absolute;left:8px;top:50%;transform:translateY(-50%);color:rgba(141,148,158,0.5);pointer-events:none;}\n' +
    '.t-http-status-codes .search{width:100%;height:32px;padding:0 8px 0 28px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);color:rgba(227,227,227,0.8);font-family:var(--font-mono);font-size:12px;border-radius:6px;outline:none;transition:border-color .2s,box-shadow .2s;}\n' +
    '.t-http-status-codes .search:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n' +
    '.t-http-status-codes .search::placeholder{color:rgba(141,148,158,0.3);}\n' +
    '.t-http-status-codes .status-list{display:flex;flex-direction:column;gap:0.25rem;max-height:400px;overflow:auto;margin-top:0.75rem;}\n' +
    '.t-http-status-codes .row{display:flex;align-items:flex-start;gap:0.75rem;padding:0.5rem;border-radius:8px;border:1px solid rgba(51,53,56,0.2);background:rgba(0,0,0,0.1);cursor:pointer;transition:background-color .2s;}\n' +
    '.t-http-status-codes .row:hover{background:rgba(0,0,0,0.2);}\n' +
    '.t-http-status-codes .code-col{display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:56px;}\n' +
    '.t-http-status-codes .code{font-size:14px;font-weight:700;font-family:var(--font-mono);}\n' +
    '.t-http-status-codes .c-1{color:rgba(83,163,249,0.8);}\n' +
    '.t-http-status-codes .c-2{color:rgba(83,163,249,0.8);}\n' +
    '.t-http-status-codes .c-3{color:rgba(230,167,0,0.9);}\n' +
    '.t-http-status-codes .c-4{color:rgba(251,86,91,0.9);}\n' +
    '.t-http-status-codes .c-5{color:rgba(250,56,62,1);}\n' +
    '.t-http-status-codes .lbl{font-size:10px;font-family:var(--font-mono);color:rgba(141,148,158,0.4);}\n' +
    '.t-http-status-codes .name{font-size:12px;font-weight:500;font-family:var(--font-mono);color:rgba(227,227,227,0.8);}\n' +
    '.t-http-status-codes .desc{font-size:10px;font-family:var(--font-mono);color:rgba(141,148,158,0.6);margin-top:2px;}\n' +
    '.t-http-status-codes .none{text-align:center;padding:1rem 0;font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.5);}\n',

  mount: function (root) {
    var search = '';

    var searchInput = App.el('input', {
      class: 'search', type: 'text', placeholder: 'Search by code or name...',
      'aria-label': 'Search status codes'
    });
    var listWrap = App.el('div', { class: 'status-list' });

    function filtered() {
      if (!search.trim()) return STATUS_CODES;
      var q = search.toLowerCase();
      return STATUS_CODES.filter(function (entry) {
        return String(entry[0]).includes(q) || entry[1].toLowerCase().includes(q);
      });
    }

    function renderList() {
      listWrap.innerHTML = '';
      var rows = filtered();
      rows.forEach(function (entry) {
        var code = entry[0], name = entry[1], desc = entry[2];
        var row = App.el('div', { class: 'row', title: 'Click to copy' },
          App.el('div', { class: 'code-col' },
            App.el('span', { class: 'code ' + codeClass(code), text: String(code) }),
            App.el('span', { class: 'lbl', text: classLabel(code) })),
          App.el('div', { class: 'min-w-0' },
            App.el('div', { class: 'name', text: name }),
            App.el('div', { class: 'desc', text: desc })));
        row.addEventListener('click', function () { App.copy(String(code) + ' ' + name, row); });
        listWrap.appendChild(row);
      });
      if (!rows.length) {
        listWrap.appendChild(App.el('div', { class: 'none', text: 'No matching status codes' }));
      }
    }

    searchInput.addEventListener('input', function () { search = searchInput.value; renderList(); });

    root.appendChild(App.el('div', { class: 'search-wrap' }, App.icon('search', '', 12), searchInput));
    root.appendChild(listWrap);
    renderList();
  }
});
})();
