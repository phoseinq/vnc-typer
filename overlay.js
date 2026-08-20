// VNC Typer — pinned in-page panel.
// Injected on demand from the popup; stays until the ✕ is clicked, so you can
// type command after command without reopening the extension.
(() => {
  if (document.getElementById("vnc-typer-panel")) return;

  const SPEED_DELAY = { slow: 70, normal: 35, fast: 12, instant: 2 };
  const DEFAULTS = { speed: "fast", method: "synthetic", delay: 100, enter: true };

  const host = document.createElement("div");
  host.id = "vnc-typer-panel";
  Object.assign(host.style, {
    position: "fixed", top: "16px", right: "16px", zIndex: "2147483647",
    width: "300px", colorScheme: "dark",
  });
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
      .p { background:#12131a; color:#e6e7ee; border:1px solid #2a2c3a; border-radius:12px;
           box-shadow:0 12px 40px rgba(0,0,0,.55); overflow:hidden; }
      .hd { display:flex; align-items:center; gap:8px; padding:7px 9px; cursor:move;
            background:#191b25; border-bottom:1px solid #2a2c3a; user-select:none; }
      .hd b { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#a5a8bd; font-weight:600; }
      .logo { color:#6366f1; font-weight:700; font-size:12px; }
      .sp { flex:1; }
      .x { all:unset; cursor:pointer; color:#7d8098; font-size:15px; line-height:1; padding:2px 5px; border-radius:6px; }
      .x:hover { background:#2a2c3a; color:#fff; }
      .bd { padding:9px; display:flex; flex-direction:column; gap:8px; }
      textarea { width:100%; min-height:82px; max-height:220px; resize:vertical; padding:8px;
                 background:#0b0c12; color:#e6e7ee; border:1px solid #2a2c3a; border-radius:8px;
                 font-size:12.5px; line-height:1.5; outline:none; }
      textarea:focus { border-color:#6366f1; }
      .rw { display:flex; align-items:center; gap:8px; }
      .ck { display:flex; align-items:center; gap:5px; font-size:11px; color:#a5a8bd; cursor:pointer; user-select:none; }
      .ck input { accent-color:#6366f1; margin:0; }
      .go { all:unset; cursor:pointer; margin-left:auto; padding:6px 14px; border-radius:8px;
            background:#6366f1; color:#fff; font-size:12px; font-weight:600; }
      .go:hover { background:#767aff; }
      .st { font-size:10.5px; color:#7d8098; min-height:13px; white-space:nowrap;
            overflow:hidden; text-overflow:ellipsis; }
      .st.ok { color:#4ade80; } .st.err { color:#f87171; } .st.run { color:#7dd3fc; }
    </style>
    <div class="p">
      <div class="hd"><span class="logo">&gt;_</span><b>VNC Typer</b><span class="sp"></span>
        <button class="x" title="Close">&#10005;</button></div>
      <div class="bd">
        <textarea spellcheck="false" autocomplete="off"
          placeholder="One command per line&#10;Enter = send · Shift+Enter = new line"></textarea>
        <div class="rw">
          <label class="ck"><input type="checkbox" class="en" /> Enter at end</label>
          <button class="go">Type</button>
        </div>
        <div class="st"></div>
      </div>
    </div>`;
  document.documentElement.appendChild(host);

  const $ = (s) => root.querySelector(s);
  const ta = $("textarea"), go = $(".go"), en = $(".en"), st = $(".st"), hd = $(".hd");

  let cfg = { ...DEFAULTS };
  chrome.storage.local.get("settings", ({ settings }) => {
    cfg = { ...DEFAULTS, ...(settings || {}) };
    en.checked = cfg.enter;
  });
  en.addEventListener("change", () => {
    cfg.enter = en.checked;
    chrome.storage.local.get("settings", ({ settings }) =>
      chrome.storage.local.set({ settings: { ...settings, enter: en.checked } }));
  });

  // Where the keystrokes should land once we give focus back.
  let lastTarget = document.querySelector("canvas, .xterm-helper-textarea");
  document.addEventListener("focusin", (e) => {
    if (e.target !== host) lastTarget = e.target;
  }, true);

  function setStatus(text, cls = "") { st.textContent = text; st.className = "st " + cls; }

  function send() {
    const text = ta.value;
    if (!text.trim()) { ta.focus(); return; }
    ta.blur();
    if (lastTarget && lastTarget.isConnected) lastTarget.focus();
    setStatus("Typing…", "run");
    chrome.runtime.sendMessage({
      action: "type", text,
      method: cfg.method,
      perKeyDelay: SPEED_DELAY[cfg.speed] ?? SPEED_DELAY.fast,
      startDelay: cfg.delay,
      enterAtEnd: en.checked,
    }).then((res) => {
      if (res && !res.ok) setStatus("Failed: " + res.error, "err");
    }).catch((e) => setStatus("Failed: " + e.message, "err"));
  }

  go.addEventListener("click", send);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    e.stopPropagation(); // keep the console underneath from seeing our typing
  });
  $(".x").addEventListener("click", () => { host.remove(); });

  // drag by the header
  hd.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".x")) return;
    const r = host.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    hd.setPointerCapture(e.pointerId);
    const move = (ev) => {
      host.style.right = "auto";
      host.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - dx)) + "px";
      host.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy)) + "px";
    };
    const up = () => { hd.removeEventListener("pointermove", move); hd.removeEventListener("pointerup", up); };
    hd.addEventListener("pointermove", move);
    hd.addEventListener("pointerup", up);
  });

  chrome.runtime.onMessage.addListener((m) => {
    if (!m || !m.type || !host.isConnected) return;
    if (m.type === "progress" && m.phase === "countdown") setStatus(`Typing in ${m.remaining}…`, "run");
    else if (m.type === "progress") setStatus(`Typing… ${m.done}/${m.total}`, "run");
    else if (m.type === "done") { ta.value = ""; setStatus("Done ✓", "ok"); }
    else if (m.type === "error") setStatus("Failed: " + m.message, "err");
    else if (m.type === "seed") { ta.value = m.text; ta.focus(); }
  });

  ta.focus();
})();
