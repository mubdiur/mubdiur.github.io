(function () {
"use strict";
var CSS = "" +
".t-image-palette-extractor .pal-drop{border:1.5px dashed rgba(141,148,158,0.35);border-radius:10px;padding:1.75rem 1rem;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;}\n" +
".t-image-palette-extractor .pal-drop:hover,.t-image-palette-extractor .pal-drop.over{border-color:rgba(83,163,249,0.6);background:rgba(83,163,249,0.06);}\n" +
".t-image-palette-extractor .pal-drop p{margin:0.35rem 0 0;font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.7);}\n" +
".t-image-palette-extractor .pal-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}\n" +
".t-image-palette-extractor .pal-preview{max-width:220px;max-height:160px;border-radius:8px;margin:0.75rem auto 0;display:block;}\n" +
".t-image-palette-extractor .pal-status{font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.7);text-align:center;padding:0.75rem 0;}\n" +
".t-image-palette-extractor .pal-hint{font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.55);text-align:center;padding:0 0 0.25rem;}\n" +
".t-image-palette-extractor .pal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.5rem;margin-top:0.5rem;}\n" +
".t-image-palette-extractor .pal-cell{border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);}\n" +
".t-image-palette-extractor .pal-chip{height:56px;}\n" +
".t-image-palette-extractor .pal-meta{display:flex;align-items:center;justify-content:space-between;gap:0.25rem;padding:0.3rem 0.4rem;background:rgba(0,0,0,0.35);font-family:var(--font-mono);font-size:11px;}\n" +
".t-image-palette-extractor .pal-pct{color:rgba(141,148,158,0.7);font-size:10px;}\n" +
".t-image-palette-extractor select{height:30px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 6px;font-family:var(--font-mono);font-size:11px;color:rgba(227,227,227,0.8);}\n" +
".t-image-palette-extractor label{font-family:var(--font-mono);font-size:10.5px;color:rgba(141,148,158,0.7);}\n";
App.registerTool("image-palette-extractor", {
css: CSS,
mount: function (root) {
var url = null;
var status = "idle";
var colors = [];
var error = null;
var runToken = 0;
var count = "8";
var wrap = App.el("div", { class: "space-y-2" });
var fileInput = App.el("input", { type: "file", accept: "image/*", class: "pal-file", "aria-label": "Choose an image" });
var drop = App.el("div", { class: "pal-drop", role: "button", tabindex: "0", "aria-label": "Upload an image" },
App.icon("upload", "", 20),
App.el("p", { text: "Drop an image here, paste from clipboard, or click to browse" }));
var hint = App.el("div", { class: "pal-hint", text: "Runs fully offline \u00b7 downscaled to 160px before sampling \u00b7 click a hex to copy" });
var statusNode = App.el("div", { class: "pal-status", "aria-live": "polite" });
var imgEl = App.el("img", { alt: "Palette source preview", class: "pal-preview hidden" });
var countSel = App.el("select", { "aria-label": "Color count" },
App.el("option", { value: "4", text: "4 colors" }),
App.el("option", { value: "6", text: "6 colors" }),
App.el("option", { value: "8", text: "8 colors" }),
App.el("option", { value: "12", text: "12 colors" }));
countSel.value = count;
var grid = App.el("div", { class: "pal-grid" });
function revoke() {
if (url) { try { URL.revokeObjectURL(url); } catch (e) { void e; } url = null; }
}
function render() {
statusNode.textContent = status === "idle" ? "No image yet \u2014 palette appears here." : status === "working" ? "Sampling\u2026" : status === "done" ? colors.length + " dominant colors \u2014 click a hex to copy." : "";
grid.innerHTML = "";
if (error) statusNode.textContent = error;
if (url) { imgEl.src = url; imgEl.classList.remove("hidden"); }
else imgEl.classList.add("hidden");
for (var i = 0; i < colors.length; i++) {
var c = colors[i];
var chip = App.el("div", { class: "pal-chip" });
chip.style.background = c.hex;
var btn = App.copyButton(c.hex, c.hex);
btn.title = "rgb(" + c.rgb + ") \u00b7 " + c.pct + "%";
var pct = App.el("span", { class: "pal-pct", text: c.pct + "%" });
var meta = App.el("div", { class: "pal-meta" }, btn, pct);
grid.appendChild(App.el("div", { class: "pal-cell" }, chip, meta));
}
}
function fail(msg) {
status = "error"; error = msg; colors = [];
render();
}
function loadFile(file) {
if (!file) return;
if (!file.type || file.type.indexOf("image/") !== 0) { fail("Not an image \u2014 drop a PNG, JPEG, GIF, SVG or WebP file."); return; }
if (file.size > 10 * 1024 * 1024) { fail("Image too large (max 10 MB)."); return; }
runToken++;
revoke();
url = URL.createObjectURL(file);
status = "working"; colors = []; error = null;
render();
sample(url, runToken);
}
function sample(objectUrl, token) {
var probe = new Image();
probe.onload = function () {
if (token !== runToken) return;
try {
var w = probe.naturalWidth, h = probe.naturalHeight;
if (!w || !h) { fail("Could not read that image file."); return; }
var cap = 160, sw = w, sh = h;
if (Math.max(w, h) > cap) { var k = cap / Math.max(w, h); sw = Math.max(1, Math.round(w * k)); sh = Math.max(1, Math.round(h * k)); }
var canvas = document.createElement("canvas"); canvas.width = sw; canvas.height = sh;
var ctx = canvas.getContext("2d", { willReadFrequently: true });
if (!ctx) { fail("Canvas 2D is unavailable in this browser."); return; }
ctx.drawImage(probe, 0, 0, sw, sh);
var px = ctx.getImageData(0, 0, sw, sh);
colors = Transforms.extractPalette(px.data, parseInt(count, 10));
status = "done"; error = null;
render();
} catch (e) { if (token !== runToken) return; fail(e instanceof Error ? e.message : String(e)); }
};
probe.onerror = function () { if (token === runToken) fail("Could not read that image file."); };
probe.src = objectUrl;
}
countSel.addEventListener("change", function () {
count = countSel.value;
if (status === "done" && url) { runToken++; status = "working"; render(); sample(url, runToken); }
});
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
});
App.onUnmount(function () { runToken++; revoke(); });
render();
wrap.appendChild(drop);
wrap.appendChild(hint);
wrap.appendChild(App.el("div", { style: { textAlign: "center" } }, App.el("label", { text: "Colors " }, countSel)));
wrap.appendChild(fileInput);
wrap.appendChild(imgEl);
wrap.appendChild(statusNode);
wrap.appendChild(grid);
root.appendChild(wrap);
}
});
})();