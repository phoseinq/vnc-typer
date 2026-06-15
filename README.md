# VNC Typer

Chrome extension that **types** passwords or commands into web VNC sessions
(noVNC, Guacamole, Proxmox/oVirt console…) where clipboard paste doesn't work.
It sends real keyboard key-events, one character at a time.

## Install
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder

## Use
1. Open your VNC page and **click inside the screen** to focus it.
2. Click the extension icon, type your text.
   `Enter` sends it · `Shift+Enter` adds a new line.
3. Tick **Send Enter at end** to run a command. Hit **Type into VNC**.

## Options
- **Speed** – Slow / Normal / Fast / Instant (lower it if characters get dropped).
- **Start delay** – rotary dial; countdown before typing starts.
- **Method**
  - `Debugger` – uses Chrome DevTools protocol for trusted key events (most reliable).
  - `Synthetic` – dispatches key events in the page (no debugging banner).

The typed text is never stored.
