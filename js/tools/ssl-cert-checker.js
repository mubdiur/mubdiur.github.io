/* ═══════════════════════════════════════════════════════════
   SSL Certificate Inspector.
   The original tool performed a live TLS handshake on the server
   (node:tls) — impossible in a static site. This port keeps the
   full X.509 dissection, 100% client-side: paste any PEM/DER
   certificate and get validity, fingerprints, SANs, key usage,
   extensions, raw DER — all parsed by the WebAssembly ASN.1 core.
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

App.registerTool('ssl-cert-checker', {
  css: '' +
    '.t-ssl-cert-checker .cert-input{width:100%;min-height:140px;border:1px solid rgba(80,73,69,0.4);background:rgba(0,0,0,0.3);border-radius:8px;padding:10px 12px;font-family:var(--font-mono);font-size:12px;color:rgba(235,219,178,0.9);resize:vertical;outline:none;}\n' +
    '.t-ssl-cert-checker .cert-input:focus{border-color:rgba(142,192,124,0.4);box-shadow:0 0 0 1px rgba(142,192,124,0.3);}\n' +
    '.t-ssl-cert-checker .cert-input::placeholder{color:rgba(189,174,147,0.3);}\n' +
    '.t-ssl-cert-checker .cert-status{display:flex;flex-direction:column;gap:0.75rem;border-radius:8px;border:1px solid rgba(80,73,69,0.4);padding:0.875rem;}\n' +
    '.t-ssl-cert-checker .cert-status.valid{border-color:rgba(184,187,38,0.3);background:rgba(184,187,38,0.08);}\n' +
    '.t-ssl-cert-checker .cert-status.expired{border-color:rgba(255,133,120,0.3);background:rgba(255,133,120,0.08);}\n' +
    '.t-ssl-cert-checker .cert-status.pending{border-color:rgba(250,189,47,0.3);background:rgba(250,189,47,0.08);}\n' +
    '.t-ssl-cert-checker .status-badge{font-family:var(--font-mono);font-size:16px;font-weight:700;}\n' +
    '.t-ssl-cert-checker .valid .status-badge{color:var(--ctp-green);}\n' +
    '.t-ssl-cert-checker .expired .status-badge{color:var(--ctp-red);}\n' +
    '.t-ssl-cert-checker .pending .status-badge{color:var(--ctp-yellow);}\n' +
    '.t-ssl-cert-checker .cert-section{border:1px solid rgba(80,73,69,0.4);border-radius:8px;overflow:hidden;}\n' +
    '.t-ssl-cert-checker .cert-section > h4{font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:rgba(189,174,147,0.8);border-bottom:1px solid rgba(80,73,69,0.4);padding:0.5rem 0.75rem;background:rgba(60,56,54,0.4);display:flex;align-items:center;justify-content:space-between;gap:0.5rem;}\n' +
    '.t-ssl-cert-checker .cert-section .body{padding:0.75rem;display:flex;flex-direction:column;gap:0.375rem;}\n' +
    '.t-ssl-cert-checker .kv{display:flex;flex-wrap:wrap;gap:0.25rem 0.75rem;font-family:var(--font-mono);font-size:12px;color:rgba(235,219,178,0.9);}\n' +
    '.t-ssl-cert-checker .kv .k{color:rgba(189,174,147,0.6);font-size:10px;min-width:7.5rem;text-transform:uppercase;letter-spacing:0.08em;padding-top:1px;}\n' +
    '.t-ssl-cert-checker .kv .v{word-break:break-all;}\n' +
    '.t-ssl-cert-checker .ext-table{width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:11px;}\n' +
    '.t-ssl-cert-checker .ext-table td{border-bottom:1px solid rgba(80,73,69,0.3);padding:0.375rem 0.5rem;vertical-align:top;}\n' +
    '.t-ssl-cert-checker .ext-table td:first-child{color:rgba(142,192,124,0.9);white-space:nowrap;}\n' +
    '.t-ssl-cert-checker .ext-table td:last-child{color:rgba(189,174,147,0.8);word-break:break-all;}\n' +
    '.t-ssl-cert-checker .progress{height:6px;border-radius:999px;background:rgba(0,0,0,0.4);overflow:hidden;}\n' +
    '.t-ssl-cert-checker .progress > div{height:100%;border-radius:999px;}\n' +
    '.t-ssl-cert-checker .valid .progress > div{background:rgba(184,187,38,0.8);}\n' +
    '.t-ssl-cert-checker .expired .progress > div{background:rgba(255,133,120,0.8);}\n' +
    '.t-ssl-cert-checker .pending .progress > div{background:rgba(250,189,47,0.8);}\n' +
    '.t-ssl-cert-checker .chip{display:inline-block;padding:0.125rem 0.375rem;border-radius:4px;font-family:var(--font-mono);font-size:10px;border:1px solid rgba(255,133,120,0.3);color:var(--ctp-red);}\n' +
    '.t-ssl-cert-checker .pill{display:inline-block;padding:0.125rem 0.5rem;border-radius:999px;border:1px solid rgba(142,192,124,0.25);color:rgba(142,192,124,0.9);font-family:var(--font-mono);font-size:10px;}\n' +
    '.t-ssl-cert-checker .cert-err{color:var(--ctp-red);font-family:var(--font-mono);font-size:12px;padding:1.5rem 0;}\n' +
    '.t-ssl-cert-checker .timegrid{display:grid;grid-template-columns:1fr;gap:0.375rem;}\n' +
    '@media(min-width:640px){.t-ssl-cert-checker .timegrid{grid-template-columns:1fr 1fr;}}\n' +
    '.t-ssl-cert-checker .timeblock{border:1px solid rgba(80,73,69,0.4);border-radius:6px;padding:0.5rem 0.75rem;}\n' +
    '.t-ssl-cert-checker .timeblock .lbl{font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--ctp-green);}\n' +
    '.t-ssl-cert-checker .timeblock .big{font-family:var(--font-mono);font-size:12px;color:rgba(235,219,178,0.9);margin-top:0.25rem;}\n' +
    '.t-ssl-cert-checker .timeblock .sub{font-family:var(--font-mono);font-size:10px;color:rgba(189,174,147,0.5);margin-top:0.125rem;}\n' +
    '.t-ssl-cert-checker .note{font-family:var(--font-mono);font-size:10px;color:rgba(189,174,147,0.5);line-height:1.6;}\n',

  mount: function (root) {
    var output = App.el('div', { class: 'flex flex-col', style: { gap: '0.75rem' } });
    var textarea = App.el('textarea', {
      class: 'cert-input', spellcheck: 'false',
      placeholder: 'Paste a PEM certificate here (-----BEGIN CERTIFICATE----- ...) — or raw DER (base64).\n\nLive TLS checking needs a server; this inspector decodes and dissects any certificate entirely in your browser via the WebAssembly ASN.1 core.'
    });

    var sampleBtn = App.el('button', { class: 'btn-ghost-sm', type: 'button', text: 'Load sample cert' });
    var clearBtn = App.el('button', { class: 'btn-ghost-sm', type: 'button' }, App.icon('rotate-ccw', '', 14), App.el('span', { text: 'Clear' }));

    function clear() {
      textarea.value = '';
      output.innerHTML = '';
    }
    clearBtn.addEventListener('click', clear);

    var SAMPLE =     '-----BEGIN CERTIFICATE-----\n' +
    'MIIEADCCAuigAwIBAgIUer/uH5jSI6ZuFbAtyTGnzHozTgwwDQYJKoZIhvcNAQEL\n' +
    'BQAwYTEVMBMGA1UEAwwMRXhhbXBsZSBDZXJ0MQswCQYDVQQGEwJVUzETMBEGA1UE\n' +
    'CAwKQ2FsaWZvcm5pYTEUMBIGA1UEBwwLTG9zIEFuZ2VsZXMxEDAOBgNVBAoMB0V4\n' +
    'YW1wbGUwHhcNMjYwODIxMjExNDA0WhcNMjYwOTIwMjExNDA0WjBhMRUwEwYDVQQD\n' +
    'DAxFeGFtcGxlIENlcnQxCzAJBgNVBAYTAlVTMRMwEQYDVQQIDApDYWxpZm9ybmlh\n' +
    'MRQwEgYDVQQHDAtMb3MgQW5nZWxlczEQMA4GA1UECgwHRXhhbXBsZTCCASIwDQYJ\n' +
    'KoZIhvcNAQEBBQADggEPADCCAQoCggEBAKyWNDXrtp/jU7y51VrC898FA4Zqq0tY\n' +
    'gsnw0j4q7ua5vAk/mSFjCCNBTtz6FcnuYk9/qmvPpdjfWSHzQxgdMQ4JMb9l/ELr\n' +
    'LOehM4T20d34L88k4542nefcLdsZcJb9eAjYRENktUWRNvD9Xj047FtN52GMPPUn\n' +
    'D+2E2PgwAshRu1ECCTwf1UMwpqC0LdlvPxCMspb3nMzaQbDoSC4QOcd/j6kCZJWa\n' +
    'lZvUtiCFyYTNSuzkPK4ZGkBjJB6Xy9E3KVYxD3ELPwK5G3nZ5LiqB6s0c/xZsOQZ\n' +
    'Zu76jwfRyLOZjAW/v5zPF2Uv6Bni8elONsw044sgMJs/YPwKz0/rG48CAwEAAaOB\n' +
    'rzCBrDAdBgNVHQ4EFgQU4czpWwQwqhCZz/3HI8L6YdvNykUwHwYDVR0jBBgwFoAU\n' +
    '4czpWwQwqhCZz/3HI8L6YdvNykUwDwYDVR0TAQH/BAUwAwEB/zAtBgNVHREEJjAk\n' +
    'ggtleGFtcGxlLmNvbYIPd3d3LmV4YW1wbGUuY29thwR/AAABMAsGA1UdDwQEAwIF\n' +
    'oDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwDQYJKoZIhvcNAQELBQAD\n' +
    'ggEBAD4pFEs32rf4CwNe/5cqitSBGWNLWnmCxLbhh6ZrmXd7SZceL/496zVNc3bZ\n' +
    'f9m5pQMjIlEiBfZnuctKxSVCvyUhQK9ePn/MyzfJrcTxHtDhI+z4Hk1ElkHDbXx6\n' +
    'BnEcw3N3HCdK9aLP+6+XUlKyu8hH6WkClVd0PQ06xYEUPxb9+8v7ZbcQm0Yqxrn/\n' +
    'ECysiryIrKJ0e0j5cw5ulOCR1nNfYRTKbDnZ2Qpo/ASTOxNuPz+NqFXL8dVA5RXY\n' +
    'UNptR1YWtUJx5f/Wkf50QOyYcmQhvhDjDASHxJVRIhBmFiBWE49vrnTl0GLbhijw\n' +
    '/DM5iKfewE3hsruL9cNQ0BpZBlY=\n' +
    '-----END CERTIFICATE-----\n';

    sampleBtn.addEventListener('click', function () {
      textarea.value = SAMPLE;
      parseCert(SAMPLE);
    });

    function parseCert(pemText) {
      var text = pemText.trim();
      if (!text) { output.innerHTML = ''; return; }
      try {
        var der;
        var isPem = text.indexOf('BEGIN CERTIFICATE') >= 0 || text.indexOf('BEGIN X509') >= 0;
        if (isPem) {
          var b64 = text.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
          der = base64ToBytes(b64);
        } else {
          der = base64ToBytes(text.replace(/\s+/g, ''));
        }
        var tree = Core.asn1Parse(der);
        renderReport(tree, der);
      } catch (e) {
        output.innerHTML = '';
        output.appendChild(App.el('div', { class: 'cert-err', text: 'Could not parse certificate: ' + (e instanceof Error ? e.message : String(e)) }));
      }
    }

    textarea.addEventListener('input', function () { parseCert(textarea.value); });

    /* ── tree helpers ── */
    function children(n) { return (n && Array.isArray(n.v)) ? n.v : []; }
    function findFirst(node, pred) {
      var stack = [node];
      while (stack.length) {
        var n = stack.pop();
        if (n && n !== node && pred(n)) return n;
        if (n && Array.isArray(n.v)) for (var i = n.v.length - 1; i >= 0; i--) stack.push(n.v[i]);
      }
      return null;
    }
    function findAll(node, pred) {
      var out = [];
      var stack = [node];
      while (stack.length) {
        var n = stack.pop();
        if (n && n !== node && pred(n)) out.push(n);
        if (n && Array.isArray(n.v)) for (var i = n.v.length - 1; i >= 0; i--) stack.push(n.v[i]);
      }
      return out;
    }
    function byName(n, name) {
      if (!n || !Array.isArray(n.v)) return null;
      return n.v.find(function (c) { return c && c.n === name; }) || null;
    }
    function firstChild(n, tag) {
      if (!n || !Array.isArray(n.v)) return null;
      return n.v.find(function (c) { return c && c.t === tag; }) || null;
    }
    function strVal(n) { return n && typeof n.v === 'string' ? n.v : ''; }
    function hexVal(n) { return n && typeof n.v === 'string' && /^[0-9A-F]*$/.test(n.v) ? n.v : ''; }

    function rdnEntries(nameNode) {
      var out = [];
      (children(nameNode) || []).forEach(function (setNode) {
        children(setNode).forEach(function (seqNode) {
          var oidNode = firstChild(seqNode, 'OID');
          var valNode = (children(seqNode) || [])[1];
          if (oidNode && valNode) {
            out.push({ key: oidNode.n || oidNode.v, value: strVal(valNode) || hexVal(valNode) });
          }
        });
      });
      return out;
    }
    function rdnString(nameNode) {
      return rdnEntries(nameNode).map(function (e) { return e.key + '=' + e.value; }).join(', ');
    }

    function parseAsn1Time(s) {
      // UTCTime: YYMMDDHHMMSSZ ; GeneralizedTime: YYYYMMDDHHMMSSZ
      var m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
      var g = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
      if (m) {
        var yy = parseInt(m[1], 10);
        var yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
        return new Date(Date.UTC(yyyy, parseInt(m[2], 10) - 1, parseInt(m[3], 10), parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10)));
      }
      if (g) {
        return new Date(Date.UTC(parseInt(g[1], 10), parseInt(g[2], 10) - 1, parseInt(g[3], 10), parseInt(g[4], 10), parseInt(g[5], 10), parseInt(g[6], 10)));
      }
      return null;
    }

    function humanDuration(ms) {
      var abs = Math.abs(ms);
      var d = Math.floor(abs / 86400000);
      var h = Math.floor((abs % 86400000) / 3600000);
      var m = Math.floor((abs % 3600000) / 60000);
      var s = Math.floor((abs % 60000) / 1000);
      var parts = [];
      if (d) parts.push(d + 'd');
      if (h) parts.push(h + 'h');
      if (m) parts.push(m + 'm');
      if (s || !parts.length) parts.push(s + 's');
      return parts.join(' ');
    }

    /* ── report rendering ── */
    function renderReport(tree, der) {
      var tbs = firstChild(tree, 'SEQUENCE') || findFirst(tree, function (n) { return n.t === 'SEQUENCE' && (children(n) || []).some(function (c) { return c.t === '[0]'; }); });
      var versionNode = tbs ? findFirst(tbs, function (n) { return n.t === '[0]' && n.cls === 2; }) : null;
      var serialNode = tbs ? firstChild(tbs, 'INTEGER') : null;
      var sigAlgNode = tbs ? (children(tbs) || []).find(function (n) { return n.t === 'SEQUENCE' && byName(n, 'sha256WithRSAEncryption'); }) || null : null;
      // signature algorithm: first SEQUENCE in tbs after serial... simplest: find the OID node directly under tbs
      var tbsChildren = tbs ? children(tbs) : [];
      var serialIdx = tbsChildren.findIndex(function (n) { return n.t === 'INTEGER'; });
      var sigAlgOid = serialIdx >= 0 ? tbsChildren[serialIdx + 1] : null;
      if (sigAlgOid && sigAlgOid.t !== 'SEQUENCE') sigAlgOid = null;
      var issuerNode = tbsChildren.find(function (n) { return n.t === 'SEQUENCE' && children(n).every(function (c) { return c.t === 'SET'; }); });
      // validity: SEQUENCE of two time nodes
      var validityNode = tbsChildren.find(function (n) { return n.t === 'SEQUENCE' && (children(n) || []).some(function (c) { return c.t === 'UTCTIME' || c.t === 'GENERALIZEDTIME'; }); });
      var timeNodes = validityNode ? children(validityNode).filter(function (c) { return c.t === 'UTCTIME' || c.t === 'GENERALIZEDTIME'; }) : [];
      var subjectNode = tbsChildren.find(function (n) { return n.t === 'SEQUENCE' && (children(n) || []).some(function (c) { return c.t === 'SET'; }); });
      // public key info: SEQUENCE containing OID rsaEncryption/ecPublicKey + BIT STRING
      var spkiNode = tbsChildren.find(function (n) { return n.t === 'SEQUENCE' && (children(n) || []).some(function (c) { return c.t === 'BIT STRING'; }); });
      // extensions [3]
      var extContainer = tbs ? findFirst(tbs, function (n) { return n.t === '[3]' && n.cls === 2; }) : null;
      var extSeq = extContainer ? findFirst(extContainer, function (n) { return n.t === 'SEQUENCE'; }) : null;
      var extNodes = extSeq ? children(extSeq) : [];
      // outer signature value
      var sigValueNode = findFirst(tree, function (n) { return n.t === 'BIT STRING'; }) || findFirst(tree, function (n) { return n.t === 'BIT STRING'; });

      var now = Date.now();
      var nb = timeNodes[0] ? parseAsn1Time(strVal(timeNodes[0])) : null;
      var na = timeNodes[1] ? parseAsn1Time(strVal(timeNodes[1])) : null;
      var status = 'pending';
      if (nb && na) {
        if (now < nb.getTime()) status = 'pending';
        else if (now > na.getTime()) status = 'expired';
        else status = 'valid';
      }
      var lifetimeMs = nb && na ? na.getTime() - nb.getTime() : 1;
      var elapsedMs = nb ? Math.max(0, now - nb.getTime()) : 0;
      var pct = Math.min(100, Math.max(0, (elapsedMs / lifetimeMs) * 100));
      var statusLabel = status === 'valid' ? 'VALID' : status === 'expired' ? 'EXPIRED' : 'NOT YET VALID';
      var subj = subjectNode ? rdnString(subjectNode) : '';
      var iss = issuerNode ? rdnString(issuerNode) : '';

      var f256 = Core.sha256Bytes(der);
      var f1 = Core.sha1Bytes(der);
      var f512 = Core.sha512Bytes(der);

      var serialHex = serialNode ? hexVal(serialNode) : '';

      // SANs
      function extContentBytes(ext) {
        var oct = firstChild(ext, 'OCTET STRING');
        return oct ? hexToBytes(hexVal(oct)) : null;
      }
      function hexToText(hex) {
        try {
          return new TextDecoder().decode(hexToBytes(hex));
        } catch (e) { return hex; }
      }
      var sans = [];
      var sanExt = extNodes.find(function (n) { return byName(n, 'subjectAltName'); });
      if (sanExt) {
        var sanDer = extContentBytes(sanExt);
        if (sanDer) {
          try {
            var sanTree = Core.asn1Parse(sanDer);
            children(sanTree).forEach(function (c) {
              var hex = hexVal(c);
              if (c.t === '[2]') sans.push({ type: 'DNS', value: hexToText(hex) });
              else if (c.t === '[7]') sans.push({ type: 'IP', value: ipFromHex(hex) });
              else if (c.t === '[1]') sans.push({ type: 'RFC822', value: hexToText(hex) });
              else if (c.t === '[4]') sans.push({ type: 'URI', value: hexToText(hex) });
              else sans.push({ type: c.t, value: hex });
            });
          } catch (e) {}
        }
      }

      // key usage
      var keyUsage = [];
      var kuExt = extNodes.find(function (n) { return byName(n, 'keyUsage'); });
      if (kuExt) {
        var kuDer = extContentBytes(kuExt);
        var bits = 0;
        if (kuDer) {
          try {
            var kuTree = Core.asn1Parse(kuDer);
            var kuBit = kuTree && kuTree.t === 'BIT STRING' ? kuTree : findFirst(kuTree, function (n) { return n.t === 'BIT STRING'; });
            if (kuBit) {
              var kuBytes = hexToBytes(hexVal(kuBit));
              bits = kuBytes.length ? kuBytes[0] : 0;
            }
          } catch (e) {}
        }
        if (bits || kuDer) {
          var kuNames = ['digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign', 'encipherOnly', 'decipherOnly'];
          kuNames.forEach(function (name, i) {
            if (bits & (0x80 >> i)) keyUsage.push(name);
          });
        }
      }

      // extended key usage
      var EKU_NAMES = {
        '1.3.6.1.5.5.7.3.1': 'serverAuth', '1.3.6.1.5.5.7.3.2': 'clientAuth',
        '1.3.6.1.5.5.7.3.3': 'codeSigning', '1.3.6.1.5.5.7.3.4': 'emailProtection',
        '1.3.6.1.5.5.7.3.8': 'timeStamping', '1.3.6.1.5.5.7.3.9': 'ocspSigning'
      };
      var eku = [];
      var ekuExt = extNodes.find(function (n) { return byName(n, 'extKeyUsage'); });
      if (ekuExt) {
        var ekuOct = firstChild(ekuExt, 'OCTET STRING');
        if (ekuOct) {
          try {
            var ekuTree = Core.asn1Parse(hexToBytes(hexVal(ekuOct)));
            children(ekuTree).forEach(function (c) { eku.push(EKU_NAMES[c.v] || c.n || c.v); });
          } catch (e) {}
        }
      }

      // basic constraints
      var bc = null;
      var bcExt = extNodes.find(function (n) { return byName(n, 'basicConstraints'); });
      if (bcExt) {
        var bcOct = firstChild(bcExt, 'OCTET STRING');
        if (bcOct) {
          try {
            var bcTree = Core.asn1Parse(hexToBytes(hexVal(bcOct)));
            var caNode = findFirst(bcTree, function (n) { return n.t === 'BOOLEAN'; });
            bc = { ca: caNode ? caNode.v === 1 : false };
          } catch (e) {}
        }
      }

      /* build DOM */
      output.innerHTML = '';

      var statusBox = App.el('div', { class: 'cert-status ' + status },
        App.el('div', { class: 'flex items-center gap-2.5 flex-wrap' },
          App.icon(status === 'valid' ? 'shield-check' : 'shield-alert', '', 20),
          App.el('div', {},
            App.el('div', { class: 'status-badge', text: statusLabel }),
            App.el('div', { class: 'note', style: { marginTop: '2px' },
              text: nb && na
                ? (status === 'valid' ? 'expires in ' + humanDuration(na.getTime() - now) + ' (' + na.toISOString().slice(0, 10) + ')' :
                    status === 'expired' ? 'expired ' + humanDuration(now - na.getTime()) + ' ago (' + na.toISOString().slice(0, 10) + ')' :
                    'starts in ' + humanDuration(nb.getTime() - now))
                : '' })),
          App.el('div', { class: 'flex-1', style: { minWidth: '160px' } },
            App.el('div', { class: 'progress' }, App.el('div', { style: { width: pct + '%' } })),
            App.el('div', { class: 'note', style: { display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' },
              html: '<span>' + (nb ? nb.toISOString().slice(0, 10) : '—') + '</span><span>' + (na ? na.toISOString().slice(0, 10) : '—') + '</span>' })),
          App.el('span', { class: 'pill', text: 'wasm · asn.1' })));

      output.appendChild(statusBox);

      /* validity */
      output.appendChild(App.el('div', { class: 'cert-section' },
        App.el('h4', {}, App.el('span', { text: 'Validity' }), App.el('span', { class: 'pill', text: statusLabel })),
        App.el('div', { class: 'body' },
          App.el('div', { class: 'timegrid' },
            App.el('div', { class: 'timeblock' },
              App.el('div', { class: 'lbl', text: 'notBefore' }),
              App.el('div', { class: 'big', text: nb ? nb.toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—' }),
              App.el('div', { class: 'sub', text: nb ? 'epoch ' + nb.getTime() : '' })),
            App.el('div', { class: 'timeblock' },
              App.el('div', { class: 'lbl', text: 'notAfter' }),
              App.el('div', { class: 'big', text: na ? na.toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—' }),
              App.el('div', { class: 'sub', text: na ? 'epoch ' + na.getTime() : '' }))),
          App.el('div', { class: 'note', text: 'Lifetime ' + humanDuration(lifetimeMs) + ' · elapsed ' + Math.round(pct) + '% · millisecond precision' }))));

      /* fingerprints */
      output.appendChild(App.el('div', { class: 'cert-section' },
        App.el('h4', {}, App.el('span', { text: 'Fingerprints — WebAssembly SHA' }), App.el('span', { class: 'pill', text: 'of raw DER' })),
        App.el('div', { class: 'body' },
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'SHA-256' }), App.el('span', { class: 'v', text: f256 })),
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'SHA-1' }), App.el('span', { class: 'v', text: f1 })),
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'SHA-512' }), App.el('span', { class: 'v', text: f512 })))));

      /* identity */
      output.appendChild(App.el('div', { class: 'cert-section' },
        App.el('h4', { text: 'Identity' }),
        App.el('div', { class: 'body' },
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'Subject' }), App.el('span', { class: 'v', text: subj || '—' })),
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'Issuer' }), App.el('span', { class: 'v', text: iss || '—' })),
          serialNode ? App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'Serial' }), App.el('span', { class: 'v', text: serialHex })) : null,
          versionNode ? App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'Version' }), App.el('span', { class: 'v', text: 'v' + (versionNode && versionNode.v && versionNode.v[0] && versionNode.v[0].v ? (parseInt(versionNode.v[0].v, 16) + 1) : '3') })) : null,
          sigAlgOid ? App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'Sig. alg' }), App.el('span', { class: 'v', text: (findFirst(sigAlgOid, function (n) { return n.t === 'OID'; }) || {}).n || '—' })) : null,
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'Subject alt names' }),
            App.el('span', { class: 'v', text: sans.length ? sans.map(function (s) { return s.value; }).join(', ') : '—' })))));

      /* public key */
      var pubKeyOid = spkiNode ? findFirst(spkiNode, function (n) { return n.t === 'OID'; }) : null;
      output.appendChild(App.el('div', { class: 'cert-section' },
        App.el('h4', { text: 'Public Key' }),
        App.el('div', { class: 'body' },
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'Algorithm' }), App.el('span', { class: 'v', text: (pubKeyOid && pubKeyOid.n) || '—' })),
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'Key usage' }), App.el('span', { class: 'v', text: keyUsage.length ? keyUsage.join(', ') : '—' })),
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'Ext. key usage' }), App.el('span', { class: 'v', text: eku.length ? eku.join(', ') : '—' })),
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'CA' }), App.el('span', { class: 'v', text: bc ? (bc.ca ? 'true' : 'false') : '—' })))));

      /* extensions */
      if (extNodes.length) {
        output.appendChild(App.el('div', { class: 'cert-section' },
          App.el('h4', {}, App.el('span', { text: 'Extensions (' + extNodes.length + ')' }), App.el('span', { class: 'pill', text: 'ASN.1 parsed in wasm' })),
          App.el('div', { class: 'body', style: { padding: '0' } },
            App.el('table', { class: 'ext-table' },
              App.el('tbody', {}, extNodes.map(function (ext) {
                var oidNode = firstChild(ext, 'OID');
                var oct = firstChild(ext, 'OCTET STRING');
                var name = (oidNode && oidNode.n) || (oidNode && oidNode.v) || ext.t;
                var critical = (children(ext) || []).some(function (c) { return c.t === 'BOOLEAN' && c.v === 1; });
                var value = oct ? shortHex(hexVal(oct)) : '—';
                return App.el('tr', {},
                  App.el('td', {}, App.el('span', { text: name }), critical ? App.el('span', { class: 'chip', style: { marginLeft: '0.375rem' }, text: 'critical' }) : null),
                  App.el('td', { text: value }));
              }))))));
      }

      /* raw DER */
      var derB64 = bytesToBase64(der);
      var derHex = bytesToHex(der);
      var dlBtn = App.el('button', { class: 'btn-ghost-sm', type: 'button' }, App.icon('download', '', 14), App.el('span', { text: 'Download DER' }));
      dlBtn.addEventListener('click', function () {
        App.download('certificate.der', new Blob([new Uint8Array(der)], { type: 'application/pkix-cert' }));
      });
      output.appendChild(App.el('div', { class: 'cert-section' },
        App.el('h4', {}, App.el('span', { text: 'Raw DER' }), App.el('span', { class: 'pill', text: der.length + ' bytes' })),
        App.el('div', { class: 'body' },
          App.el('div', { class: 'kv' }, App.el('span', { class: 'k', text: 'DER' }), App.el('span', { class: 'v', text: shortHex(derHex, 500) })),
          App.el('div', { class: 'flex', style: { gap: '0.5rem', marginTop: '0.5rem' } },
            App.copyButton(derB64, 'Copy base64'),
            dlBtn))));
    }

    /* bytes helpers */
    function base64ToBytes(b64) {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    function bytesToHex(bytes) {
      var out = '';
      for (var i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
      return out;
    }
    function hexToBytes(hex) {
      var bytes = new Uint8Array(hex.length / 2);
      for (var i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
      return bytes;
    }
    function bytesToBase64(bytes) {
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    function shortHex(hex, max) {
      if (!hex) return '—';
      if (!max || hex.length <= max) return hex;
      return hex.slice(0, max) + '… (' + hex.length + ' hex chars)';
    }
    function ipFromHex(hex) {
      if (hex.length === 8) {
        return parseInt(hex.slice(0, 2), 16) + '.' + parseInt(hex.slice(2, 4), 16) + '.' + parseInt(hex.slice(4, 6), 16) + '.' + parseInt(hex.slice(6, 8), 16);
      }
      return hex;
    }

    root.appendChild(App.el('div', { class: 'flex flex-col', style: { gap: '0.75rem' } },
      App.el('div', { class: 'flex items-center gap-2 flex-wrap' },
        App.el('span', { class: 'text-[10px] font-mono', style: { color: 'rgba(189,174,147,0.6)' }, text: 'PEM or DER certificate — parsed entirely in-browser (WebAssembly ASN.1 + SHA). Nothing is sent anywhere.' }),
        App.el('div', { class: 'flex', style: { marginLeft: 'auto', gap: '0.5rem' } }, sampleBtn, clearBtn)),
      textarea,
      output));
  }
});
})();
