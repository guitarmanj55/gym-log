// Backup: automatic cloud backup and restore, export/import JSON, storage status and the weekly reminder toggle.
import { exportBackup, importBackup, getSettings, saveSettings, count } from '../db/db.js';
import { backupFileName } from '../db/schema.js';
import { backupStatus } from '../lib/backup.js';
import { getCloud, connect, disconnect, listBackups, fetchBackup, backupNow, autoBackup, markBackedUp } from '../cloud.js';
import { esc, toast, fmtBytes, versionLine } from '../ui.js';

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
  const cloud = getCloud();
  const status = backupStatus(settings, sessions, Date.now(), cloud.lastAt);

  root.innerHTML = `
    <div class="screen">
      <h1 class="title">Backup</h1>
      <div class="lead">${cloud.key
    ? 'Every change is backed up automatically to your own cloud storage, and every copy is kept for good.'
    : 'Your training data lives only on this phone. Turn on automatic backup so a lost phone or cleared storage never costs you your history.'}</div>

      <div class="banner ${status.overdue ? 'warn' : 'ok'}">
        <div class="dot"></div>
        <div>
          <div class="banner-title">${esc(status.title)}</div>
          <div class="banner-sub">${esc(status.sub)}</div>
        </div>
      </div>

      ${cloud.key ? `
      <div class="list">
        <div class="list-row"><div>Automatic backup</div><div>On</div></div>
        <div class="list-row"><div>Last upload</div><div>${cloud.lastAt ? esc(whenText(cloud.lastAt)) : 'Not yet'}</div></div>
        <div class="list-row"><div>Copies stored</div><div data-copies>…</div></div>
      </div>
      ${cloud.error ? `<div class="note warn-text">${esc(cloud.error)}</div>` : ''}
      <div class="stack">
        <button type="button" class="btn btn-primary" data-act="backup-now">Back up now</button>
        <button type="button" class="btn btn-secondary" data-act="show-copies">Restore a cloud copy</button>
        <div class="list" data-restore hidden></div>
      </div>` : `
      <div class="stack">
        <label class="field">
          <span class="field-label">Backup key</span>
          <input class="text-input" name="key" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx">
        </label>
        <button type="button" class="btn btn-primary" data-act="connect">Turn on automatic backup</button>
        <div class="note">Keep the key in the Passwords app: it is all you need to restore everything on a new phone.</div>
      </div>`}

      <div class="eyebrow">Backup file</div>
      <div class="stack">
        <button type="button" class="btn btn-secondary" data-act="export">${DOWNLOAD_ICON}Export backup</button>
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
      ${cloud.key ? '<button type="button" class="text-btn" data-act="disconnect">Turn off automatic backup on this phone</button>' : ''}
      ${versionLine()}
    </div>`;

  const input = root.querySelector('input[type=file]');
  const rerender = () => {
    window.dispatchEvent(new Event('gymlog:backup-changed')); // lets the shell update the tab's overdue dot
    return render(root);
  };

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
      autoBackup();
      rerender();
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message, 5000);
    }
  });

  root.querySelector('[data-act=reminder]').addEventListener('click', async () => {
    await saveSettings({ backupReminder: !settings.backupReminder });
    rerender();
  });

  const on = (act, fn) => root.querySelector(`[data-act=${act}]`)?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    try { await fn(); } catch (err) { toast(err.message, 5000); } finally { btn.disabled = false; }
  });

  on('connect', async () => {
    const key = root.querySelector('input[name=key]').value;
    if (!key.trim()) { toast('Paste your backup key first.'); return; }
    const copies = await connect(key);
    if (!sessions && copies.length) {
      // A fresh phone: offer the newest copy straight away.
      const latest = copies[0];
      if (confirm(`Automatic backup is on. Restore the newest copy from ${whenText(latest.at)} (${latest.sessions} sessions)?`)) {
        await restore(latest.id);
        return;
      }
    }
    const result = await backupNow({ force: true });
    toast(result === 'uploaded' ? 'Automatic backup is on. First copy saved.' : 'Automatic backup is on.');
    rerender();
  });

  on('backup-now', async () => {
    const result = await backupNow({ force: true });
    toast(result === 'empty' ? 'Nothing to back up yet.' : 'Backed up.');
    rerender();
  });

  on('disconnect', async () => {
    if (!confirm('Stop backing up from this phone? Copies already in the cloud are kept.')) return;
    disconnect();
    rerender();
  });

  const restoreList = root.querySelector('[data-restore]');
  on('show-copies', async () => {
    restoreList.hidden = !restoreList.hidden;
    if (restoreList.hidden) return;
    restoreList.innerHTML = '<div class="list-row"><div>Loading…</div></div>';
    const copies = await listBackups();
    restoreList.innerHTML = copies.length ? copies.map((c) => `
      <div class="list-row">
        <div><div>${esc(whenText(c.at))}</div><div class="note">${c.sessions} session${c.sessions === 1 ? '' : 's'} · ${fmtBytes(c.bytes)}</div></div>
        <button type="button" class="text-btn" data-restore-id="${esc(c.id)}" data-when="${esc(whenText(c.at))}">Restore</button>
      </div>`).join('') : '<div class="list-row"><div>No copies yet</div></div>';
  });
  restoreList?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-restore-id]');
    if (!btn || btn.disabled) return;
    if (!confirm(`Replace everything on this phone with the copy from ${btn.dataset.when}?`)) return;
    btn.disabled = true;
    try { await restore(btn.dataset.restoreId); } catch (err) { toast(err.message, 5000); btn.disabled = false; }
  });

  async function restore(id) {
    const result = await importBackup(await fetchBackup(id));
    toast(`Restored ${result.sessions} sessions and ${result.sets} sets.`);
    await markBackedUp();
    rerender();
  }

  // The copy count needs the network, so it fills in after the screen is shown.
  const copiesCell = root.querySelector('[data-copies]');
  if (copiesCell) {
    listBackups().then((c) => { copiesCell.textContent = c.length; }).catch(() => { copiesCell.textContent = 'Offline'; });
  }
}

function whenText(ms) {
  return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
