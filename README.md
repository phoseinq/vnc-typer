# VNC Typer

<p align="center">
  <img src="screenshot.png" alt="VNC Typer popup" width="300">
</p>

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
  - `Synthetic` – dispatches key events in the page (default, no debugging banner).
  - `Debugger` – uses Chrome DevTools protocol for trusted key events (most reliable).

The typed text is never stored.

---

<div dir="rtl">

# وی‌ان‌سی تایپر

یک افزونه‌ی کروم که پسورد یا کامند را داخل صفحه‌های وب‌وی‌ان‌سی
(noVNC، Guacamole، کنسول Proxmox/oVirt و…) جایی که paste کار نمی‌کند **تایپ** می‌کند.
کاراکتر به کاراکتر، با رویدادهای واقعی کیبورد.

## نصب
۱. به `chrome://extensions` برو
۲. **Developer mode** را روشن کن
۳. روی **Load unpacked** بزن و همین پوشه را انتخاب کن

## استفاده
۱. صفحه‌ی VNC را باز کن و **داخل صفحه کلیک کن** تا فوکوس بگیرد.
۲. روی آیکون افزونه بزن و متن را وارد کن.
   `Enter` می‌فرستد · `Shift+Enter` خط جدید می‌زند.
۳. تیک **Send Enter at end** را بزن تا کامند اجرا شود. بعد **Type into VNC** را بزن.

## گزینه‌ها
- **Speed** – سرعت تایپ: Slow / Normal / Fast / Instant (اگر کاراکتر جا افتاد کمترش کن).
- **Start delay** – دایل چرخشی؛ شمارش معکوس قبل از شروع تایپ.
- **Method**
  - `Synthetic` – رویدادهای کیبورد را داخل صفحه می‌فرستد (پیش‌فرض، بدون نوار دیباگ).
  - `Debugger` – از پروتکل DevTools کروم برای رویدادهای واقعی استفاده می‌کند (مطمئن‌ترین).

متن تایپ‌شده هیچ‌وقت ذخیره نمی‌شود.

</div>
