(function () {
"use strict";
var CSS = "" +
".t-qr-code-decoder .qr-drop{border:1.5px dashed rgba(141,148,158,0.35);border-radius:10px;padding:1.75rem 1rem;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;}\n" +
".t-qr-code-decoder .qr-drop:hover,.t-qr-code-decoder .qr-drop.over{border-color:rgba(83,163,249,0.6);background:rgba(83,163,249,0.06);}\n" +
".t-qr-code-decoder .qr-drop p{margin:0.35rem 0 0;font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.7);}\n" +
".t-qr-code-decoder .qr-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}\n" +
".t-qr-code-decoder .qr-preview{max-width:220px;max-height:220px;border-radius:8px;background:#fff;padding:8px;margin:0.75rem auto 0;display:block;}\n" +
".t-qr-code-decoder .qr-status{font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.7);text-align:center;padding:0.75rem 0;}\n" +
".t-qr-code-decoder .qr-hint{font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.55);text-align:center;padding:0 0 0.25rem;}\n";
App.registerTool("qr-code-decoder", {
css: CSS,
mount: function (root) {
var url = null;
var status = "idle";
var result = "";
var error = null;
var runToken = 0;
var wrap = App.el("div", { class: "space-y-2" });
var fileInput = App.el("input", { type: "file", accept: "image/*", class: "qr-file", "aria-label": "Choose a QR image" });
var drop = App.el("div", { class: "qr-drop", role: "button", tabindex: "0", "aria-label": "Upload a QR code image" },
App.icon("upload", "", 20),
App.el("p", { text: "Drop a QR image here, paste from clipboard, or click to browse" }));
var statusNode = App.el("div", { class: "qr-status", "aria-live": "polite" });
var imgEl = App.el("img", { alt: "QR preview", class: "qr-preview hidden" });
var outputBox = App.el("div");
var meta = "";
var hint = App.el("div", { class: "qr-hint", text: "Straight-on screenshots work best \u00b7 versions 1\u20136 \u00b7 kanji/ECI not decoded" });
function revoke() {
if (url) { try { URL.revokeObjectURL(url); } catch {} url = null; }
}
function render() {
statusNode.textContent = status === "idle" ? "No image yet — decoded text appears here." : status === "scanning" ? "Scanning…" : status === "done" ? meta : "";
outputBox.innerHTML = "";
if (result || error) outputBox.appendChild(App.outputBox(result, error, "Decoded text", clear, result && !error ? function () { App.download("qr-code-decoder-output.txt", result, "text/plain"); } : null));
if (url) { imgEl.src = url; imgEl.classList.remove("hidden"); }
else imgEl.classList.add("hidden");
}
function clear() {
runToken++;
revoke();
fileInput.value = "";
status = "idle"; result = ""; error = null; meta = "";
render();
}
function fail(msg) {
status = "error"; error = msg; result = "";
render();
}
function loadFile(file) {
if (!file) return;
if (!file.type || file.type.indexOf("image/") !== 0) { fail("Not an image — drop a PNG, JPEG, GIF or WebP screenshot of the QR code."); return; }
if (file.size > 10 * 1024 * 1024) { fail("Image too large (max 10 MB)."); return; }
runToken++;
revoke();
url = URL.createObjectURL(file);
status = "scanning"; result = ""; error = null;
render();
scan(url, runToken);
}
function scan(objectUrl, token) {
if (!window.QrDecode) { if (token !== runToken) return; fail("QR engine still loading \u2014 retry in a moment."); return; }
var probe = new Image();
probe.onload = function () {
if (token !== runToken) return;
try {
var w = probe.naturalWidth, h = probe.naturalHeight;
if (!w || !h) { fail("Could not read that image file."); return; }
var cap = 1200, sw = w, sh = h;
if (Math.max(w, h) > cap) { var k = cap / Math.max(w, h); sw = Math.max(29, Math.round(w * k)); sh = Math.max(29, Math.round(h * k)); }
var canvas = document.createElement("canvas"); canvas.width = sw; canvas.height = sh;
var ctx = canvas.getContext("2d", { willReadFrequently: true });
if (!ctx) { fail("Canvas 2D is unavailable in this browser."); return; }
ctx.drawImage(probe, 0, 0, sw, sh);
var px = ctx.getImageData(0, 0, sw, sh);
var out = window.QrDecode.decode(px);
if (token !== runToken) return;
if (!out || !out.text) { fail("No QR code found \u2014 try a sharper crop with quiet margins intact."); return; }
status = "done"; result = out.text; error = null; meta = "v" + out.version + "-" + out.ecl + " \u00b7 mask " + out.mask;
render();
} catch (e) { if (token !== runToken) return; fail(e instanceof Error ? e.message : String(e)); }
};
probe.onerror = function () { if (token === runToken) fail("Could not read that image file."); };
probe.src = objectUrl;
}
App.on(drop, "click", function () { fileInput.click(); });
App.on(drop, "keydown", function (e) {
if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});
var depth = 0;
App.on(drop, "dragenter", function (e) { e.preventDefault(); depth++; drop.classList.add("over"); });
App.on(drop, "dragover", function (e) { e.preventDefault(); });
App.on(drop, "dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove("over"); });
App.on(drop, "drop", function (e) {
e.preventDefault();
depth = 0;
drop.classList.remove("over");
var files = e.dataTransfer && e.dataTransfer.files;
if (files && files.length) loadFile(files[0]);
});
App.on(fileInput, "change", function () {
if (fileInput.files && fileInput.files.length) loadFile(fileInput.files[0]);
});
App.on(window, "paste", function (e) {
var cd = e.clipboardData;
var items = cd && cd.items;
if (items) {
for (var i = 0; i < items.length; i++) {
if (items[i].type && items[i].type.indexOf("image/") === 0) {
var f = items[i].getAsFile();
if (f) { loadFile(f); return; }
}
}
}
var files = cd && cd.files;
if (files) {
for (var j = 0; j < files.length; j++) {
if (files[j].type && files[j].type.indexOf("image/") === 0) { loadFile(files[j]); return; }
}
}
if (root.contains(document.activeElement)) {
statusNode.textContent = "Clipboard holds no image \u2014 copy a screenshot first, then paste.";
App.timer(render, 1800);
}
});
App.onUnmount(function () { runToken++; revoke(); });
render();
wrap.appendChild(drop);
wrap.appendChild(hint);
wrap.appendChild(fileInput);
wrap.appendChild(imgEl);
wrap.appendChild(statusNode);
wrap.appendChild(outputBox);
root.appendChild(wrap);
}
});
})();
