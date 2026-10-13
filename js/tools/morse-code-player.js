(function () {
"use strict";
var MAX_TOTAL = 60;
App.registerTool("morse-code-player", {
css: "" +
".t-morse-code-player .morse-text{width:100%;min-height:70px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 10px;font-family:var(--font-mono);font-size:12px;color:rgba(227,227,227,0.9);outline:none;resize:vertical;}\n" +
".t-morse-code-player .morse-text:focus{border-color:rgba(83,163,249,0.4);box-shadow:0 0 0 1px rgba(83,163,249,0.3);}\n" +
".t-morse-code-player .morse-row{display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;margin-top:0.5rem;}\n" +
".t-morse-code-player select{height:34px;border:1px solid rgba(51,53,56,0.4);background:rgba(0,0,0,0.3);border-radius:6px;padding:0 6px;font-family:var(--font-mono);font-size:11px;color:rgba(227,227,227,0.8);}\n" +
".t-morse-code-player label{font-family:var(--font-mono);font-size:10.5px;color:rgba(141,148,158,0.7);}\n" +
".t-morse-code-player .play-btn{height:34px;padding:0 18px;border:none;border-radius:6px;background:rgba(83,163,249,0.2);color:rgba(180,210,250,0.95);font-family:var(--font-mono);font-size:12px;cursor:pointer;}\n" +
".t-morse-code-player .play-btn:hover{background:rgba(83,163,249,0.32);}\n" +
".t-morse-code-player .play-btn:disabled{opacity:0.45;cursor:default;}\n" +
".t-morse-code-player .morse-status{font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.7);text-align:center;padding:0.75rem 0 0.25rem;}\n" +
".t-morse-code-player .morse-hint{font-family:var(--font-mono);font-size:11px;color:rgba(141,148,158,0.55);text-align:center;padding:0 0 0.25rem;}\n" +
".t-morse-code-player .morse-out{font-family:var(--font-mono);font-size:14px;line-height:2;text-align:center;letter-spacing:0.08em;}\n" +
".t-morse-code-player .morse-out .sym{padding:2px 5px;border-radius:5px;color:rgba(227,227,227,0.75);}\n" +
".t-morse-code-player .morse-out .sym.on{background:rgba(83,163,249,0.3);color:#fff;}\n" +
".t-morse-code-player .morse-out .sym.dim{color:rgba(141,148,158,0.4);}\n",
mount: function (root) {
var runToken = 0;
var status = "idle";
var error = null;
var meta = "";
var ctx = null;
var spans = [];
var wrap = App.el("div", { class: "space-y-2" });
var input = App.el("textarea", { class: "morse-text", rows: "3", spellcheck: "false", placeholder: "Type text to play as Morse code", "aria-label": "Text to play" });
var wpmSel = App.el("select", { "aria-label": "Speed in words per minute" },
App.el("option", { value: "5", text: "5 WPM" }),
App.el("option", { value: "12", text: "12 WPM" }),
App.el("option", { value: "20", text: "20 WPM" }),
App.el("option", { value: "30", text: "30 WPM" }));
wpmSel.value = "12";
var freqSel = App.el("select", { "aria-label": "Tone frequency" },
App.el("option", { value: "400", text: "400 Hz" }),
App.el("option", { value: "600", text: "600 Hz" }),
App.el("option", { value: "800", text: "800 Hz" }));
freqSel.value = "600";
var playBtn = App.el("button", { class: "play-btn", type: "button", text: "Play" });
var statusNode = App.el("div", { class: "morse-status", "aria-live": "polite" });
var hint = App.el("div", { class: "morse-hint", text: "Pick a tone \u00b7 <SOS> <AR> prosigns play run-together \u00b7 max 300 characters" });
var out = App.el("div", { class: "morse-out" });
function render() {
statusNode.textContent = status === "idle" ? (error || "Encoded symbols appear here — press Play.") : status === "playing" ? meta : status === "error" ? error : "";
playBtn.textContent = status === "playing" ? "Stop" : "Play";
}
function stop(silent) {
runToken++;
if (ctx) { try { ctx.close(); } catch (e) { void e; } ctx = null; }
for (var i = 0; i < spans.length; i++) spans[i].classList.remove("on");
if (!silent) { status = "idle"; render(); }
}
function clearActive() {
for (var i = 0; i < spans.length; i++) spans[i].classList.remove("on");
}
function play() {
if (status === "playing") { stop(); return; }
var tl;
try {
tl = Transforms.morseTimeline(input.value, wpmSel.value);
if (tl.total > MAX_TOTAL) throw new Error("Too long for playback (" + Math.round(tl.total) + "s) — shorten the text or raise WPM.");
} catch (e) { status = "error"; error = e instanceof Error ? e.message : String(e); render(); return; }
if (!tl.events.length) { status = "error"; error = "Nothing playable — use letters, digits or punctuation."; render(); return; }
var AC = window.AudioContext || window.webkitAudioContext;
if (!AC) { status = "error"; error = "WebAudio is unavailable in this browser."; render(); return; }
stop(true);
var token = ++runToken;
try { ctx = new AC(); } catch (e) { void e; status = "error"; error = "Could not start audio."; render(); return; }
if (ctx.state === "suspended") { try { ctx.resume(); } catch (e2) { void e2; } }
out.innerHTML = "";
spans = [];
tl.encoded.split(" ").forEach(function (tk) {
var sp = App.el("span", { class: "sym" + (tk === "/" || tk.indexOf("?") >= 0 ? " dim" : ""), text: tk });
spans.push(sp);
out.appendChild(sp);
out.appendChild(document.createTextNode(" "));
});
var t0 = ctx.currentTime + 0.06;
var gain = ctx.createGain();
gain.gain.value = 0.0001;
gain.connect(ctx.destination);
tl.events.forEach(function (ev) {
var osc = ctx.createOscillator();
osc.type = "sine";
osc.frequency.value = parseInt(freqSel.value, 10) || 600;
osc.connect(gain);
var a = t0 + ev.t0, b = t0 + ev.t1;
gain.gain.setValueAtTime(0.0001, a);
gain.gain.exponentialRampToValueAtTime(0.25, a + 0.008);
gain.gain.setValueAtTime(0.25, Math.max(a + 0.008, b - 0.008));
gain.gain.exponentialRampToValueAtTime(0.0001, b);
osc.start(a);
osc.stop(b + 0.02);
});
status = "playing";
error = null;
meta = "Playing " + tl.events.length + " symbols · " + tl.total.toFixed(1) + "s at " + wpmSel.value + " WPM";
render();
App.interval(function () {
if (token !== runToken || !ctx) return;
var now = ctx.currentTime - t0;
var active = -1;
for (var i = 0; i < tl.events.length; i++) {
if (now >= tl.events[i].t0 && now < tl.events[i].t1) { active = tl.events[i].li; break; }
if (tl.events[i].t0 > now) break;
}
clearActive();
if (active >= 0 && spans[active]) spans[active].classList.add("on");
if (now > tl.total + 0.15) stop();
}, 60);
}
playBtn.addEventListener("click", play);
App.onUnmount(function () { runToken++; if (ctx) { try { ctx.close(); } catch (e) { void e; } ctx = null; } });
render();
wrap.appendChild(input);
wrap.appendChild(App.el("div", { class: "morse-row" }, App.el("label", { text: "Speed " }, wpmSel), App.el("label", { text: "Tone " }, freqSel), playBtn));
wrap.appendChild(hint);
wrap.appendChild(statusNode);
wrap.appendChild(out);
root.appendChild(wrap);
}
});
})();