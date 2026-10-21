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
      ${versionLine()}
    </div>`;
  wireVersionLine(root);
}

/** "Version x · tap for display info", with a hidden readout under it. Call wireVersionLine after rendering. */
export function versionLine() {
  return `<button type="button" class="note diag-toggle" data-act="diag">Version ${esc(globalThis.APP_VERSION)} · tap for display info</button>
    <pre class="note diag" hidden></pre>`;
}

export function wireVersionLine(root) {
  root.querySelector('[data-act=diag]').addEventListener('click', () => {
    const pre = root.querySelector('.diag');
    pre.hidden = !pre.hidden;
    if (!pre.hidden) pre.textContent = displayInfo();
  });
}

/** Screen and safe-area measurements, for checking the layout on a real phone. */
function displayInfo() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe);
  const p = getComputedStyle(probe);
  const inset = [p.paddingTop, p.paddingRight, p.paddingBottom, p.paddingLeft].map((v) => Math.round(parseFloat(v))).join(' / ');
  probe.remove();
  const tabs = document.getElementById('tabs');
  const r = tabs.getBoundingClientRect();
  const r1 = (v) => Math.round(v * 10) / 10;
  return [
    `standalone: ${navigator.standalone === true || matchMedia('(display-mode: standalone)').matches}`,
    `screen: ${screen.width} x ${screen.height}`,
    `window: ${innerWidth} x ${innerHeight}`,
    `html client: ${document.documentElement.clientHeight}`,
    `page height: ${document.documentElement.scrollHeight}`,
    `visual viewport: ${r1(visualViewport?.height ?? 0)}`,
    `safe area t/r/b/l: ${inset}`,
    `tab bar: top ${r1(r.top)}, bottom ${r1(r.bottom)}, height ${r1(r.height)}`,
    `tab bar padding bottom: ${getComputedStyle(tabs).paddingBottom}`,
  ].join('\n');
}
