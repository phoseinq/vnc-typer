const $ = (id) => document.getElementById(id);
const SPEED_DELAY = { slow: 70, normal: 35, fast: 12, instant: 2 };

const els = {
  text: $("text"), mask: $("mask"), speed: $("speed"), enter: $("enter"),
  method: $("method"), go: $("go"), theme: $("theme"),
  dial: $("dial"), dialNum: $("dialNum"),
  dialProg: document.querySelector(".dial-prog"),
  dialHandle: document.querySelector(".dial-handle"),
  status: $("status"), bar: document.querySelector(".bar"), fill: $("fill"),
};

const DEFAULTS = { speed: "fast", method: "synthetic", delay: 500, enter: false, mask: true, theme: "dark" };

// inline Lucide-style icons
const svg = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const ICONS = {
  moon: svg(`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`),
  sun: svg(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`),
  eye: svg(`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`),
  eyeOff: svg(`<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`),
};
function setMaskIcon() {
  const masked = els.text.classList.contains("masked");
  // icon reflects current state: hidden => slashed eye, visible => open eye
  els.mask.innerHTML = masked ? ICONS.eyeOff : ICONS.eye;
}

// ---- rotary "Start delay" dial -------------------------------------------
const DELAY_MAX = 3000, DELAY_STEP = 100;
const R = 34, C = 2 * Math.PI * R, ARC = 0.75 * C; // 270° sweep
let delayVal = 500;
let numAnim = null;

function bumpNum(dir) {
  if (numAnim) numAnim.cancel();
  numAnim = els.dialNum.animate(
    [{ transform: `translateY(${dir > 0 ? 8 : -8}px)`, opacity: 0 },
     { transform: "translateY(0)", opacity: 1 }],
    { duration: 180, easing: "cubic-bezier(.2,.85,.25,1)" }
  );
}
function renderDial(animate, dir) {
  const f = delayVal / DELAY_MAX;
  els.dialProg.setAttribute("stroke-dasharray", `${(ARC * f).toFixed(2)} ${C.toFixed(2)}`);
  const phi = (135 + 270 * f) * Math.PI / 180;
  els.dialHandle.setAttribute("cx", (40 + R * Math.cos(phi)).toFixed(2));
  els.dialHandle.setAttribute("cy", (40 + R * Math.sin(phi)).toFixed(2));
  els.dialNum.textContent = delayVal;
  els.dial.setAttribute("aria-valuenow", delayVal);
  if (animate) bumpNum(dir);
}
function setDelay(v, animate) {
  v = Math.max(0, Math.min(DELAY_MAX, Math.round(v / DELAY_STEP) * DELAY_STEP));
  if (v === delayVal) return;
  const dir = v > delayVal ? 1 : -1;
  delayVal = v;
  renderDial(animate, dir);
}
function pointToDial(e) {
  const r = els.dial.getBoundingClientRect();
  let ang = Math.atan2(e.clientY - (r.top + r.height / 2),
                       e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  if (ang < 0) ang += 360;
  let d = ang - 135;
  if (d < 0) d += 360;            // distance from the start of the sweep
  const t = d <= 270 ? d / 270 : (d < 315 ? 1 : 0); // clamp inside the bottom gap
  setDelay(t * DELAY_MAX, true);
}
function dialStep(dir) { setDelay(delayVal + dir * DELAY_STEP, true); saveSettings(); }

let dragging = false;
els.dial.addEventListener("pointerdown", (e) => {
  dragging = true;
  els.dial.classList.add("dragging");
  els.dial.setPointerCapture(e.pointerId);
  pointToDial(e);
});
els.dial.addEventListener("pointermove", (e) => { if (dragging) pointToDial(e); });
function endDrag() { if (!dragging) return; dragging = false; els.dial.classList.remove("dragging"); saveSettings(); }
els.dial.addEventListener("pointerup", endDrag);
els.dial.addEventListener("pointercancel", endDrag);
els.dial.addEventListener("wheel", (e) => { e.preventDefault(); dialStep(e.deltaY < 0 ? 1 : -1); }, { passive: false });
els.dial.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowRight"].includes(e.key)) { e.preventDefault(); dialStep(1); }
  else if (["ArrowDown", "ArrowLeft"].includes(e.key)) { e.preventDefault(); dialStep(-1); }
  else if (e.key === "Home") { e.preventDefault(); setDelay(0, true); saveSettings(); }
  else if (e.key === "End") { e.preventDefault(); setDelay(DELAY_MAX, true); saveSettings(); }
});

// ---- settings persistence (text is never stored) --------------------------
chrome.storage.local.get("settings", ({ settings }) => {
  const s = { ...DEFAULTS, ...(settings || {}) };
  setSpeed(s.speed);
  els.method.value = s.method;
  delayVal = Math.max(0, Math.min(DELAY_MAX, Math.round((s.delay || 0) / DELAY_STEP) * DELAY_STEP));
  renderDial(false);
  els.enter.checked = s.enter;
  if (s.mask) els.text.classList.add("masked");
  setMaskIcon();
  applyTheme(s.theme);
  els.text.focus();
});

function currentSpeed() {
  return els.speed.querySelector("button.on")?.dataset.v || "fast";
}
function setSpeed(v) {
  els.speed.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  els.theme.innerHTML = t === "light" ? ICONS.sun : ICONS.moon;
}
function currentTheme() {
  return document.documentElement.dataset.theme || "dark";
}
function saveSettings() {
  chrome.storage.local.set({
    settings: {
      speed: currentSpeed(),
      method: els.method.value,
      delay: delayVal,
      enter: els.enter.checked,
      mask: els.text.classList.contains("masked"),
      theme: currentTheme(),
    },
  });
}

// ---- UI events ------------------------------------------------------------
els.speed.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  setSpeed(b.dataset.v);
  saveSettings();
});
els.method.addEventListener("change", saveSettings);
els.enter.addEventListener("change", saveSettings);
els.mask.addEventListener("click", () => {
  els.text.classList.toggle("masked");
  setMaskIcon();
  saveSettings();
});
els.theme.addEventListener("click", () => {
  applyTheme(currentTheme() === "light" ? "dark" : "light");
  saveSettings();
});

// Enter => send · Shift+Enter => new line
els.text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); start(); }
});
els.go.addEventListener("click", start);

// ---- start the typing job -------------------------------------------------
function setStatus(text, cls = "") {
  els.status.textContent = text;
  els.status.className = "status" + (cls ? " " + cls : "");
}

function start() {
  const text = els.text.value;
  if (!text) { setStatus("Enter some text first.", "err"); els.text.focus(); return; }

  els.go.disabled = true;
  els.bar.classList.add("show");
  els.fill.style.width = "0%";
  setStatus("Make sure the VNC screen is focused…", "run");

  chrome.runtime.sendMessage({
    action: "type",
    text,
    method: els.method.value,
    perKeyDelay: SPEED_DELAY[currentSpeed()],
    startDelay: delayVal,
    enterAtEnd: els.enter.checked,
  }).then((res) => {
    if (res && !res.ok) finish("Failed: " + res.error, "err");
  }).catch((e) => finish("Failed: " + e.message, "err"));
}

function finish(text, cls) {
  setStatus(text, cls);
  els.go.disabled = false;
  setTimeout(() => els.bar.classList.remove("show"), 600);
}

// ---- progress from background --------------------------------------------
chrome.runtime.onMessage.addListener((m) => {
  if (!m || !m.type) return;
  if (m.type === "progress" && m.phase === "countdown") {
    setStatus(`Typing in ${m.remaining}…  (focus the VNC now)`, "run");
  } else if (m.type === "progress" && m.phase === "typing") {
    const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
    els.fill.style.width = pct + "%";
    setStatus(`Typing… ${m.done}/${m.total}`, "run");
  } else if (m.type === "done") {
    els.fill.style.width = "100%";
    finish("Done ✓", "ok");
  } else if (m.type === "error") {
    finish("Failed: " + m.message, "err");
  }
});
