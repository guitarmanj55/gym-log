// Backup: export/import JSON, storage status and the weekly reminder toggle.
import { exportBackup, importBackup, getSettings, saveSettings, count } from '../db/db.js';
import { backupFileName } from '../db/schema.js';
import { backupStatus } from '../lib/backup.js';
import { esc, toast, fmtBytes } from '../ui.js';

const DOWNLOAD_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>';

async function persistedText() {
  try {
    if (!navigator.storage?.persisted) return 'Not supported';
    return (await navigator.storage.persisted()) ? 'Granted' : 'Not granted';
  } catch { return 'Unknown'; }
}

export async function render(root) {
  const [settings, sessions, persisted, backup] = await Promise.all([
    getSettings(), count('sessions'), persistedText(), exportBackup(),
  ]);
  // Built before the tap: iOS only allows the share sheet straight from a user gesture.
  const json = JSON.stringify(backup, null, 1);
  const file = new File([json], backupFileName(Date.now()), { type: 'application/json' });
  const status = backupStatus(settings, sessions, Date.now());

  root.innerHTML = `
    <div class="screen">
      <h1 class="title">Backup</h1>
      <div class="lead">Your training data lives only on this phone. Export a backup regularly so clearing storage never costs you your history.</div>

      <div class="banner ${status.overdue ? 'warn' : 'ok'}">
        <div class="dot"></div>
        <div>
          <div class="banner-title">${esc(status.title)}</div>
          <div class="banner-sub">${esc(status.sub)}</div>
        </div>
      </div>

      <div class="stack">
        <button type="button" class="btn btn-primary" data-act="export">${DOWNLOAD_ICON}Export backup</button>
        <button type="button" class="btn btn-secondary" data-act="import">Import backup</button>
        <input type="file" accept="application/json,.json" hidden>
        <div class="note center">Saves a JSON file to the Files app</div>
      </div>

      <div class="list">
        <div class="list-row"><div>Persistent storage</div><div>${esc(persisted)}</div></div>
        <div class="list-row"><div>Sessions stored</div><div>${sessions}</div></div>
        <div class="list-row"><div>Data size</div><div>${fmtBytes(file.size)}</div></div>
      </div>

      <div class="toggle-row">
        <div>Weekly backup reminder</div>
        <button type="button" class="switch" role="switch" aria-checked="${settings.backupReminder}" aria-label="Weekly backup reminder" data-act="reminder"><span></span></button>
      </div>

      <div class="note">Log workouts in the installed home-screen app. The same page opened in Safari keeps its own separate data.</div>
      <button type="button" class="note diag-toggle" data-act="diag">Version ${esc(globalThis.APP_VERSION)} · tap for display info</button>
      <pre class="note diag" hidden></pre>
    </div>`;

  const input = root.querySelector('input[type=file]');
  const rerender = () => render(root);

  root.querySelector('[data-act=export]').addEventListener('click', async () => {
    const saved = await saveFile(file);
    if (!saved) return;
    await saveSettings({ lastBackupAt: Date.now() });
    toast('Backup exported.');
    rerender();
  });

  root.querySelector('[data-act=import]').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    try {
      const data = JSON.parse(await picked.text());
      const when = Number.isFinite(data?.exportedAt)
        ? new Date(data.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'an unknown date';
      const n = Array.isArray(data?.sessions) ? data.sessions.length : 0;
      if (!confirm(`Replace everything on this phone with the backup from ${when} (${n} sessions)? Export first if you want to keep what's here.`)) return;
      const result = await importBackup(data);
      toast(`Imported ${result.sessions} sessions and ${result.sets} sets.`);
      rerender();
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message, 5000);
    }
  });

  root.querySelector('[data-act=diag]').addEventListener('click', () => {
    const pre = root.querySelector('.diag');
    pre.hidden = !pre.hidden;
    if (!pre.hidden) pre.textContent = displayInfo();
  });

  root.querySelector('[data-act=reminder]').addEventListener('click', async () => {
    await saveSettings({ backupReminder: !settings.backupReminder });
    rerender();
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
    `visual viewport: ${r1(visualViewport?.height ?? 0)}`,
    `safe area t/r/b/l: ${inset}`,
    `tab bar: top ${r1(r.top)}, bottom ${r1(r.bottom)}, height ${r1(r.height)}`,
    `tab bar padding bottom: ${getComputedStyle(tabs).paddingBottom}`,
  ].join('\n');
}

/** Share sheet where it can take files (iOS: Save to Files), otherwise a download. Resolves false if cancelled. */
async function saveFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
      // NotAllowedError etc.: fall through to a plain download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
