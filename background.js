// VNC Typer — background service worker
// Two typing engines:
//   - "debugger":  chrome.debugger + Input.dispatchKeyEvent => REAL (trusted) key events.
//                  Most reliable; works with any canvas-based VNC client (noVNC, Guacamole...).
//   - "synthetic": dispatch KeyboardEvent in the page => no "debugging" banner, slightly less robust.

// ponytail: fixed gap between commands. The tty buffers stdin, so this only has
// to cover the client's redraw; expose it in the UI if a slow command needs more.
const LINE_DELAY = 400;

// US-layout key descriptors -------------------------------------------------
const SHIFT = {
  "!": { code: "Digit1", keyCode: 49 }, "@": { code: "Digit2", keyCode: 50 },
  "#": { code: "Digit3", keyCode: 51 }, "$": { code: "Digit4", keyCode: 52 },
  "%": { code: "Digit5", keyCode: 53 }, "^": { code: "Digit6", keyCode: 54 },
  "&": { code: "Digit7", keyCode: 55 }, "*": { code: "Digit8", keyCode: 56 },
  "(": { code: "Digit9", keyCode: 57 }, ")": { code: "Digit0", keyCode: 48 },
  "_": { code: "Minus", keyCode: 189 }, "+": { code: "Equal", keyCode: 187 },
  "{": { code: "BracketLeft", keyCode: 219 }, "}": { code: "BracketRight", keyCode: 221 },
  "|": { code: "Backslash", keyCode: 220 }, ":": { code: "Semicolon", keyCode: 186 },
  '"': { code: "Quote", keyCode: 222 }, "<": { code: "Comma", keyCode: 188 },
  ">": { code: "Period", keyCode: 190 }, "?": { code: "Slash", keyCode: 191 },
  "~": { code: "Backquote", keyCode: 192 },
};
const UNSHIFTED = {
  "`": { code: "Backquote", keyCode: 192 }, "-": { code: "Minus", keyCode: 189 },
  "=": { code: "Equal", keyCode: 187 }, "[": { code: "BracketLeft", keyCode: 219 },
  "]": { code: "BracketRight", keyCode: 221 }, "\\": { code: "Backslash", keyCode: 220 },
  ";": { code: "Semicolon", keyCode: 186 }, "'": { code: "Quote", keyCode: 222 },
  ",": { code: "Comma", keyCode: 188 }, ".": { code: "Period", keyCode: 190 },
  "/": { code: "Slash", keyCode: 191 }, " ": { code: "Space", keyCode: 32 },
};

function describeChar(ch) {
  if (ch === "\n") return { key: "Enter", code: "Enter", keyCode: 13, text: "\r", shift: false };
  if (ch === "\t") return { key: "Tab", code: "Tab", keyCode: 9, text: "\t", shift: false };
  if (ch >= "a" && ch <= "z") return { key: ch, code: "Key" + ch.toUpperCase(), keyCode: ch.charCodeAt(0) - 32, text: ch, shift: false };
  if (ch >= "A" && ch <= "Z") return { key: ch, code: "Key" + ch, keyCode: ch.charCodeAt(0), text: ch, shift: true };
  if (ch >= "0" && ch <= "9") return { key: ch, code: "Digit" + ch, keyCode: ch.charCodeAt(0), text: ch, shift: false };
  if (UNSHIFTED[ch]) return { key: ch, code: UNSHIFTED[ch].code, keyCode: UNSHIFTED[ch].keyCode, text: ch, shift: false };
  if (SHIFT[ch]) return { key: ch, code: SHIFT[ch].code, keyCode: SHIFT[ch].keyCode, text: ch, shift: true };
  // Any other unicode char: deliver as text only.
  return { key: ch, code: "", keyCode: 0, text: ch, shift: false };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
let busy = false;
let liveTabId = null;

function setBadge(text, color = "#6366f1") {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
}
function notify(msg) {
  // Best-effort; the popup only hears it while open, the in-page panel while pinned.
  chrome.runtime.sendMessage(msg).catch(() => {});
  if (liveTabId != null) chrome.tabs.sendMessage(liveTabId, msg).catch(() => {});
}

// Debugger engine -----------------------------------------------------------
function cdp(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, () => {
      const e = chrome.runtime.lastError;
      if (e) reject(new Error(e.message));
      else resolve();
    });
  });
}
function attach(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      const e = chrome.runtime.lastError;
      if (e) reject(new Error(e.message));
      else resolve();
    });
  });
}
function detach(tabId) {
  return new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => { void chrome.runtime.lastError; resolve(); });
  });
}

async function pressKeyDebugger(tabId, d) {
  const base = {
    key: d.key, code: d.code,
    windowsVirtualKeyCode: d.keyCode, nativeVirtualKeyCode: d.keyCode,
  };
  const mods = d.shift ? 8 : 0; // Shift = 8
  if (d.shift) {
    await cdp(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown", key: "Shift", code: "ShiftLeft",
      windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16, modifiers: 0,
    });
  }
  await cdp(tabId, "Input.dispatchKeyEvent", {
    ...base, type: "keyDown", modifiers: mods,
    ...(d.text ? { text: d.text, unmodifiedText: d.text } : {}),
  });
  await cdp(tabId, "Input.dispatchKeyEvent", { ...base, type: "keyUp", modifiers: mods });
  if (d.shift) {
    await cdp(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp", key: "Shift", code: "ShiftLeft",
      windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16, modifiers: 0,
    });
  }
}

// Synthetic engine (runs inside the page) -----------------------------------
// Web consoles are usually inside an iframe, so find the frame that actually
// holds the session instead of always typing into the top document.
async function pickFrame(tabId) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const ae = document.activeElement;
        const innermost = document.hasFocus() && !(ae && ae.tagName === "IFRAME");
        const console_ = !!document.querySelector("canvas, .xterm");
        return (innermost ? 2 : 0) + (console_ ? 1 : 0);
      },
    });
    let best = { frameId: 0, result: -1 };
    for (const r of res) if ((r.result ?? -1) > best.result) best = r;
    return best.frameId;
  } catch {
    return 0;
  }
}

// This function is serialized and runs in the page context.
function pageTypeFn(text, perKeyDelay) {
  const SHIFT = {
    "!": ["Digit1", 49], "@": ["Digit2", 50], "#": ["Digit3", 51], "$": ["Digit4", 52],
    "%": ["Digit5", 53], "^": ["Digit6", 54], "&": ["Digit7", 55], "*": ["Digit8", 56],
    "(": ["Digit9", 57], ")": ["Digit0", 48], "_": ["Minus", 189], "+": ["Equal", 187],
    "{": ["BracketLeft", 219], "}": ["BracketRight", 221], "|": ["Backslash", 220],
    ":": ["Semicolon", 186], '"': ["Quote", 222], "<": ["Comma", 188], ">": ["Period", 190],
    "?": ["Slash", 191], "~": ["Backquote", 192],
  };
  const UN = {
    "`": ["Backquote", 192], "-": ["Minus", 189], "=": ["Equal", 187], "[": ["BracketLeft", 219],
    "]": ["BracketRight", 221], "\\": ["Backslash", 220], ";": ["Semicolon", 186],
    "'": ["Quote", 222], ",": ["Comma", 188], ".": ["Period", 190], "/": ["Slash", 191],
    " ": ["Space", 32],
  };
  function desc(ch) {
    if (ch === "\n") return ["Enter", "Enter", 13, false];
    if (ch === "\t") return ["Tab", "Tab", 9, false];
    if (ch >= "a" && ch <= "z") return [ch, "Key" + ch.toUpperCase(), ch.charCodeAt(0) - 32, false];
    if (ch >= "A" && ch <= "Z") return [ch, "Key" + ch, ch.charCodeAt(0), true];
    if (ch >= "0" && ch <= "9") return [ch, "Digit" + ch, ch.charCodeAt(0), false];
    if (UN[ch]) return [ch, UN[ch][0], UN[ch][1], false];
    if (SHIFT[ch]) return [ch, SHIFT[ch][0], SHIFT[ch][1], true];
    return [ch, "", 0, false];
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Never type into our own pinned panel.
  const ae = document.activeElement;
  const target = ae && ae !== document.body && ae.id !== "vnc-typer-panel"
    ? ae
    : (document.querySelector("canvas, .xterm-helper-textarea, textarea") || document.body);
  const editable = target.isContentEditable
    || target.tagName === "TEXTAREA" || target.tagName === "INPUT";

  // charCode is what a real browser puts on keypress — the *character*, not the
  // virtual key code. Without it a terminal reading charCode turns "/" into junk.
  function fire(type, key, code, keyCode, shift, charCode) {
    return target.dispatchEvent(new KeyboardEvent(type, {
      key, code,
      keyCode: charCode || keyCode,
      charCode: charCode || 0,
      which: charCode || keyCode,
      shiftKey: shift, bubbles: true, cancelable: true, composed: true,
    }));
  }

  return (async () => {
    for (const ch of Array.from(text)) {
      const [key, code, keyCode, shift] = desc(ch);
      const cp = ch === "\n" ? 13 : (key.length === 1 ? ch.codePointAt(0) : 0);
      if (shift) fire("keydown", "Shift", "ShiftLeft", 16, true, 0);
      const live = fire("keydown", key, code, keyCode, shift, 0);
      if (live && cp) {
        const pressed = fire("keypress", key, code, keyCode, shift, cp);
        // Last resort for clients that only listen for input (xterm.js's hidden
        // textarea does): hand them the character directly.
        if (pressed && editable && ch !== "\n") {
          target.dispatchEvent(new InputEvent("input", {
            data: ch, inputType: "insertText", bubbles: true, composed: false,
          }));
        }
      }
      fire("keyup", key, code, keyCode, shift, 0);
      if (shift) fire("keyup", "Shift", "ShiftLeft", 16, false, 0);
      if (perKeyDelay) await sleep(perKeyDelay);
    }
  })();
}

// Job orchestration ---------------------------------------------------------
async function makeTyper(method, tabId, perKeyDelay) {
  if (method === "synthetic") {
    const frameIds = [await pickFrame(tabId)];
    return {
      type: (s) => s
        ? chrome.scripting.executeScript({
            target: { tabId, frameIds }, args: [s, perKeyDelay], func: pageTypeFn,
          })
        : Promise.resolve(),
      done: async () => {},
    };
  }
  await attach(tabId);
  return {
    type: async (s) => {
      for (const ch of Array.from(s)) {
        await pressKeyDebugger(tabId, describeChar(ch));
        if (perKeyDelay) await sleep(perKeyDelay);
      }
    },
    done: () => detach(tabId),
  };
}

// "a\nb\n" => ["a", "b"] — one command per line, no phantom trailing Enter.
function splitCommands(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

async function runJob({ text, method, perKeyDelay, startDelay, enterAtEnd }) {
  if (busy) return { ok: false, error: "A typing job is already running." };
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return { ok: false, error: "No active tab." };
  if (/^(chrome|edge|about|chrome-extension|devtools):/i.test(tab.url || "")) {
    return { ok: false, error: "This page can't be controlled (browser/internal page)." };
  }

  // Each line is its own command: type it, press Enter, let it land, next.
  const lines = splitCommands(text);
  const total = lines.reduce((n, l) => n + Array.from(l).length + 1, 0);

  busy = true;
  liveTabId = tab.id;
  let done = 0;
  try {
    // Countdown so the user can make sure the VNC canvas has focus.
    for (let s = Math.ceil(startDelay / 1000); s > 0; s--) {
      setBadge(String(s), "#0ea5e9");
      notify({ type: "progress", phase: "countdown", remaining: s });
      await sleep(Math.min(1000, startDelay));
    }
    notify({ type: "progress", phase: "typing", done: 0, total });
    setBadge("…");

    const typer = await makeTyper(method, tab.id, perKeyDelay);
    try {
      for (let i = 0; i < lines.length; i++) {
        const last = i === lines.length - 1;
        await typer.type(lines[i]);
        done += Array.from(lines[i]).length;
        if (!last || enterAtEnd) { await typer.type("\n"); done++; }
        notify({ type: "progress", phase: "typing", done, total });
        if (!last) await sleep(LINE_DELAY);
      }
    } finally {
      await typer.done();
    }

    setBadge("✓", "#16a34a");
    notify({ type: "done" });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
    return { ok: true };
  } catch (err) {
    setBadge("ERR", "#dc2626");
    notify({ type: "error", message: String(err && err.message || err) });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    busy = false;
  }
}

// Guarded so selftest.html can load this file as a plain script.
if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.action === "type") {
      runJob(msg).then(sendResponse);
      return true; // async response
    }
  });
  // Safety: if the user closes DevTools / cancels, keep our state consistent.
  chrome.debugger.onDetach.addListener(() => { /* no-op; finally handles cleanup */ });
}
