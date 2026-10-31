// Profile: theme, automatic cloud backup and restore, and a backup file export.
import { exportBackup, importBackup, getSettings, saveSettings, count } from '../db/db.js';
import { backupFileName } from '../db/schema.js';
import { backupStatus } from '../lib/backup.js';
import { getCloud, connect, disconnect, listBackups, fetchBackup, backupNow, markBackedUp } from '../cloud.js';
import { esc, toast, fmtBytes, versionLine } from '../ui.js';

const THEMES = [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']];

export async function render(root) {
  const [settings, sessions, backup] = await Promise.all([getSettings(), count('sessions'), exportBackup()]);
  // Built before the tap: iOS only allows the share sheet straight from a user gesture.
  const file = new File([JSON.stringify(backup, null, 1)], backupFileName(Date.now()), { type: 'application/json' });
  const cloud = getCloud();
  const status = backupStatus(settings, sessions, Date.now(), cloud.lastAt);
  const theme = globalThis.gymlogTheme?.get() || 'auto';

  root.innerHTML = `
    <div class="screen">
      <h1 class="title">Profile</h1>

      <div class="eyebrow">Appearance</div>
      <div class="segmented" role="group" aria-label="Theme">
        ${THEMES.map(([id, label]) => `<button type="button" data-theme-pick="${id}" aria-pressed="${id === theme}">${label}</button>`).join('')}
      </div>

      <div class="eyebrow">Backup</div>
      <div class="banner ${status.overdue ? 'warn' : 'ok'}">
        <div class="dot"></div>
        <div>
          <div class="banner-title">${esc(status.title)}</div>
          <div class="banner-sub">${esc(status.sub)}</div>
        </div>
      </div>

      ${cloud.key ? `
      <div class="list">
        <div class="list-row"><div>Last upload</div><div>${cloud.lastAt ? esc(whenText(cloud.lastAt)) : 'Not yet'}</div></div>
        <div class="list-row"><div>Copies stored</div><div data-copies>…</div></div>
      </div>
      ${cloud.error ? `<div class="note warn-text">${esc(cloud.error)}</div>` : ''}
      <div class="stack">
        <button type="button" class="btn btn-primary" data-act="backup-now">Back up now</button>
        <button type="button" class="btn btn-secondary" data-act="show-copies">Restore a cloud copy</button>
        <div class="list" data-restore hidden></div>
      </div>` : `
      <div class="lead">Your training data lives only on this phone. Turn on automatic backup so a lost phone or cleared storage never costs you your history.</div>
      <div class="stack">
        <label class="field">
          <span class="field-label">Backup key</span>
          <input class="text-input" name="key" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx">
        </label>
        <button type="button" class="btn btn-primary" data-act="connect">Turn on automatic backup</button>
        <div class="note">Keep the key in the Passwords app: it is all you need to restore everything on a new phone.</div>
      </div>`}

      <button type="button" class="text-btn" data-act="export">Save a backup file to Files</button>
      ${cloud.key ? '<button type="button" class="text-btn" data-act="disconnect">Turn off automatic backup on this phone</button>' : ''}
      <div class="note">Log workouts in the installed home-screen app. The same page opened in Safari keeps its own separate data.</div>
      ${versionLine()}
    </div>`;

  const rerender = () => {
    window.dispatchEvent(new Event('gymlog:backup-changed')); // lets the shell update the tab's overdue dot
    return render(root);
  };

  root.querySelector('.segmented').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-theme-pick]');
    if (!btn) return;
    globalThis.gymlogTheme?.set(btn.dataset.themePick);
    for (const b of root.querySelectorAll('[data-theme-pick]')) b.setAttribute('aria-pressed', String(b === btn));
  });

  root.querySelector('[data-act=export]').addEventListener('click', async () => {
    const saved = await saveFile(file);
    if (!saved) return;
    await saveSettings({ lastBackupAt: Date.now() });
    toast('Backup file saved.');
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
        <div><div>${esc(whenText(c.at))}</div><div class="note">${c.sessions} session${c.sessions === 1 ? '' : 's'} · ${c.sets ?? 0} sets · ${fmtBytes(c.bytes)}</div></div>
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
    const copy = await fetchBackup(id);
    // Keep what is on this phone as its own cloud copy first, so a restore never loses anything.
    if (cloud.key && sessions) {
      await backupNow({ force: true }).catch(() => {
        if (!confirm('Could not save the current data to the cloud first. Restore anyway?')) throw new Error('Restore cancelled.');
      });
    }
    const result = await importBackup(copy);
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
