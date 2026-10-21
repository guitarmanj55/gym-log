// Small DOM helpers shared by the screens.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

let toastTimer;
export function toast(message, ms = 3000) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/** "Wednesday 21 October" */
export function longDate(ms = Date.now()) {
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** 142.5 -> "142.5", 140 -> "140", 1.25 -> "1.25" */
export function fmtKg(kg) {
  return String(Math.round(kg * 100) / 100);
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Shared placeholder for screens that arrive in a later release. */
export function comingSoon(root, { date, title, body }) {
  root.innerHTML = `
    <div class="screen">
      <div>
        ${date ? `<div class="date">${esc(date)}</div>` : ''}
        <h1 class="title">${esc(title)}</h1>
      </div>
      <div class="card">
        <div class="eyebrow">Coming next</div>
        <div class="lead">${esc(body)}</div>
      </div>
      <div class="note">Version ${esc(globalThis.APP_VERSION)}</div>
    </div>`;
}
