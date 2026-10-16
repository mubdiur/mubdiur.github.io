(function () {
"use strict";
var CSS = "" +
".t-totp-generator .totp-secret{width:100%;height:34px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 10px;font-family:var(--font-mono);font-size:14px;color:rgba(227,227,227,0.9);outline:none;}\n" +
".t-totp-generator .totp-secret:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n" +
".t-totp-generator .totp-code{font-family:var(--font-mono);font-size:48px;font-weight:600;letter-spacing:0.12em;text-align:center;color:var(--lime);padding:0.75rem 0 0.25rem;}\n" +
".t-totp-generator .totp-meta{text-align:center;font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.75);padding-bottom:0.5rem;}\n" +
".t-totp-generator .totp-bar{height:4px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;}\n" +
".t-totp-generator .totp-bar i{display:block;height:100%;background:var(--lime);transition:width .25s linear;}\n" +
".t-totp-generator .totp-bar.low i{background:var(--ctp-red);}\n" +
".t-totp-generator .totp-row{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;}\n" +
".t-totp-generator .totp-error{color:var(--ctp-red);font-family:var(--font-mono);font-size:14px;text-align:center;padding:0.75rem 0;}\n" +
".t-totp-generator select{height:30px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 6px;font-family:var(--font-mono);font-size:12px;color:rgba(227,227,227,0.8);}\n" +
".t-totp-generator label{font-family:var(--font-mono);font-size:12px;color:rgba(141,148,158,0.7);}\n";
App.registerTool("totp-generator", {
css: CSS,
mount: function (root) {
var secret = "";
var lastCode = null;
var digits = "6";
var period = "30";
var codeNode = App.el("div", { class: "totp-code", text: "······" });
var metaNode = App.el("div", { class: "totp-meta", text: "Enter a Base32 secret to start." });
var barWrap = App.el("div", { class: "totp-bar" }, App.el("i", { style: { width: "0%" } }));
var barFill = barWrap.firstChild;
var errorNode = App.el("div", { class: "totp-error hidden" });
var secretInput = App.el("input", { class: "totp-secret", type: "password", autocomplete: "off", spellcheck: "false", placeholder: "Base32 secret — e.g. JBSWY3DPEHPK3PXP", "aria-label": "Base32 secret" });
var digitsSel = App.el("select", { "aria-label": "Digits" },
App.el("option", { value: "6", text: "6 digits" }),
App.el("option", { value: "7", text: "7 digits" }),
App.el("option", { value: "8", text: "8 digits" }));
var periodSel = App.el("select", { "aria-label": "Period" },
App.el("option", { value: "30", text: "30s period" }),
App.el("option", { value: "60", text: "60s period" }));
digitsSel.value = digits;
periodSel.value = period;
var copyBtn = App.copyButton("", "Copy code");
copyBtn.classList.add("hidden");
var uriBtn = App.copyButton("", "Copy otpauth URI");
uriBtn.classList.add("hidden");
function currentOtpauth() {
var clean = secret.replace(/[\s=]/g, "").toUpperCase();
return "otpauth://totp/dev-arsenal?secret=" + clean + "&digits=" + digits + "&period=" + period;
}
function refresh() {
if (!secret.trim()) {
codeNode.textContent = "······";
metaNode.textContent = "Enter a Base32 secret to start.";
barFill.style.width = "0%";
barWrap.classList.remove("low");
errorNode.classList.add("hidden");
copyBtn.classList.add("hidden");
uriBtn.classList.add("hidden");
lastCode = null;
return;
}
var out;
try {
out = Transforms.totp(secret, Date.now(), digits, period);
} catch (e) {
codeNode.textContent = "······";
metaNode.textContent = "";
barFill.style.width = "0%";
errorNode.textContent = e instanceof Error ? e.message : String(e);
errorNode.classList.remove("hidden");
copyBtn.classList.add("hidden");
uriBtn.classList.add("hidden");
lastCode = null;
return;
}
errorNode.classList.add("hidden");
var pretty = out.code.length > 7 ? out.code.slice(0, 4) + " " + out.code.slice(4) : out.code.slice(0, 3) + " " + out.code.slice(3);
codeNode.textContent = pretty;
metaNode.textContent = "Refreshes in " + out.validFor + "s · " + digits + " digits / " + period + "s";
var frac = Math.max(0, Math.min(1, out.validFor / parseInt(period, 10)));
barFill.style.width = Math.round(frac * 100) + "%";
barWrap.classList.toggle("low", out.validFor <= 5);
copyBtn.classList.remove("hidden");
uriBtn.classList.remove("hidden");
if (out.code !== lastCode) {
lastCode = out.code;
var freshCopy = App.copyButton(out.code, "Copy code");
copyBtn.parentNode.replaceChild(freshCopy, copyBtn);
copyBtn = freshCopy;
var freshUri = App.copyButton(currentOtpauth(), "Copy otpauth URI");
uriBtn.parentNode.replaceChild(freshUri, uriBtn);
uriBtn = freshUri;
}
}
secretInput.addEventListener("input", App.debounce(function () { secret = secretInput.value; refresh(); }, 150));
digitsSel.addEventListener("change", function () { digits = digitsSel.value; refresh(); });
periodSel.addEventListener("change", function () { period = periodSel.value; refresh(); });
App.interval(refresh, 250);
refresh();
root.appendChild(secretInput);
root.appendChild(App.el("div", { class: "totp-row", style: { marginTop: "0.5rem" } },
App.el("label", { text: "Digits " }, digitsSel),
App.el("label", { text: "Period " }, periodSel)));
root.appendChild(codeNode);
root.appendChild(metaNode);
root.appendChild(barWrap);
root.appendChild(errorNode);
root.appendChild(App.el("div", { class: "totp-row", style: { marginTop: "0.5rem" } }, copyBtn, uriBtn));
}
});
})();
