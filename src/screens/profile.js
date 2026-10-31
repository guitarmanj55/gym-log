// Profile: you, lifetime stats, training split and settings, theme, and backup (automatic cloud
// backup and restore, plus a backup file export).
import { exportBackup, importBackup, getSettings, saveSettings, count } from '../db/db.js';
import { loadAll } from '../db/workout.js';
import { backupFileName, SPLIT_GROUPS } from '../db/schema.js';
import { backupStatus } from '../lib/backup.js';
import { groupLabel } from '../lib/library.js';
import {
  BAR_OPTIONS, STEP_OPTIONS, REST_OPTIONS, PLATE_CHOICES, withCurrent, togglePlate, fmtRest, fmtVolume,
  lifetimeStats, splitLabel,
} from '../lib/profile.js';
import { unlockAudio, beep, setSoundOn } from '../device.js';
import { getCloud, connect, disconnect, listBackups, fetchBackup, backupNow, markBackedUp } from '../cloud.js';
import { esc, toast, fmtBytes, versionLine } from '../ui.js';

const THEMES = [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']];
const fmtNum = (n) => String(Math.round(n * 100) / 100);
const longDay = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** A row of single-choice buttons that saves `key` straight away. */
function choice(label, key, options, current, fmt = fmtNum) {
  return `
    <div class="field">
      <span class="field-label">${label}</span>
      <div class="segmented" role="group" aria-label="${label}">
        ${withCurrent(options, current).map((v) => `<button type="button" data-set="${key}" data-val="${v}" aria-pressed="${v === current}">${fmt(v)}</button>`).join('')}
      </div>
    </div>`;
}

export async function render(root) {
  const [settings, sessions, backup, all] = await Promise.all([getSettings(), count('sessions'), exportBackup(), loadAll()]);
  const stats = lifetimeStats(all.finished, all.sets, all.exercises, Date.now());
  const plateList = [...new Set([...PLATE_CHOICES, ...settings.plates])].sort((a, b) => b - a);
  // Built before the tap: iOS only allows the share sheet straight from a user gesture.
  const file = new File([JSON.stringify(backup, null, 1)], backupFileName(Date.now()), { type: 'application/json' });
  const cloud = getCloud();
  const status = backupStatus(settings, sessions, Date.now(), cloud.lastAt);
  const theme = globalThis.gymlogTheme?.get() || 'auto';

  root.innerHTML = `
    <div class="screen">
      <h1 class="title">Profile</h1>

      <div class="eyebrow">You</div>
      <div class="stack">
        <label class="field">
          <span class="field-label">Name</span>
          <input class="text-input" name="name" type="text" maxlength="30" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="Your name" value="${esc(settings.name)}">
        </label>
        <label class="field">
          <span class="field-label">Goal</span>
          <input class="text-input" name="goal" type="text" maxlength="80" autocomplete="off" enterkeyhint="done" placeholder="e.g. Bench 100 kg by March" value="${esc(settings.goal)}">
        </label>
      </div>

      <div class="eyebrow">Lifetime</div>
      ${stats.sessions ? `
      <div class="tiles">
        <div class="tile"><div class="tile-label">Workouts</div><div class="tile-val">${stats.sessions}</div></div>
        <div class="tile"><div class="tile-label">Lifted</div><div class="tile-val">${fmtVolume(stats.volumeKg)}</div></div>
        <div class="tile"><div class="tile-label">Week streak</div><div class="tile-val">${stats.streak}</div></div>
      </div>
      ${stats.bestLifts.length ? `<div class="list">
        ${stats.bestLifts.map((l) => `<a class="list-row" href="#lift/${esc(l.id)}"><div>${esc(l.name)}</div><div>e1RM ${l.e1rm} kg</div></a>`).join('')}
      </div>` : ''}
      <div class="note">${stats.workSets} hard sets since ${esc(longDay(stats.since))}. The streak counts weeks in a row with at least one workout.</div>` : `
      <div class="note">Finish a workout and your totals, streak and best lifts show up here.</div>`}

      <div class="eyebrow">Training split</div>
      <div class="stack">
        ${settings.splits.length ? `<div class="list">
          ${settings.splits.map((p, i) => `<div class="list-row"><div>${esc(splitLabel(p))}</div><button type="button" class="text-btn" data-split-remove="${i}" aria-label="Remove ${esc(splitLabel(p))}">Remove</button></div>`).join('')}
        </div>` : ''}
        <div class="split-add">
          <select class="text-input" name="split-main" aria-label="Main group">${SPLIT_GROUPS.map((g) => `<option value="${g}">${groupLabel(g)}</option>`).join('')}</select>
          <span class="muted">+</span>
          <select class="text-input" name="split-support" aria-label="Supporting group">${SPLIT_GROUPS.map((g) => `<option value="${g}"${g === 'triceps' ? ' selected' : ''}>${groupLabel(g)}</option>`).join('')}</select>
        </div>
        <button type="button" class="btn btn-secondary" data-act="split-add">Add pairing</button>
        <div class="note">The pairings you train, like Chest + Triceps. Today suggests the one whose main group has waited longest.</div>
      </div>

      <div class="eyebrow">Training</div>
      <div class="stack">
        ${choice('Bar weight (kg)', 'barWeightKg', BAR_OPTIONS, settings.barWeightKg)}
        ${choice('Weight step (kg)', 'stepKg', STEP_OPTIONS, settings.stepKg)}
        ${choice('Rest timer', 'restSec', REST_OPTIONS, settings.restSec, fmtRest)}
        <div class="field">
          <span class="field-label">Plates you have (kg)</span>
          <div class="lib-groups">
            ${plateList.map((p) => `<button type="button" class="chip-btn" data-plate="${p}" aria-pressed="${settings.plates.includes(p)}">${fmtNum(p)}</button>`).join('')}
          </div>
        </div>
        <div class="toggle-row">
          <div>Rest timer sound</div>
          <button type="button" class="switch" role="switch" aria-checked="${settings.sound}" aria-label="Rest timer sound" data-act="sound"><span></span></button>
        </div>
      </div>

      <div class="eyebrow">Appearance</div>
      <div class="segmented" role="group" aria-label="Theme" data-theme-group>
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

  const rerender = async () => {
    window.dispatchEvent(new Event('gymlog:backup-changed')); // lets the shell update the tab's overdue dot
    const y = window.scrollY;
    await render(root);
    window.scrollTo(0, y);
  };
  const save = async (patch) => { await saveSettings(patch); await rerender(); };

  for (const name of ['name', 'goal']) {
    root.querySelector(`input[name=${name}]`).addEventListener('change', (ev) => saveSettings({ [name]: ev.target.value }));
  }
  // On the fresh .screen, not root: root survives a re-render and would collect duplicate listeners.
  root.querySelector('.screen').addEventListener('click', (ev) => {
    const pick = ev.target.closest('[data-set]');
    if (pick) { save({ [pick.dataset.set]: Number(pick.dataset.val) }); return; }
    const plate = ev.target.closest('[data-plate]');
    if (plate) { save({ plates: togglePlate(settings.plates, Number(plate.dataset.plate)) }); return; }
    const gone = ev.target.closest('[data-split-remove]');
    if (gone) save({ splits: settings.splits.filter((_, i) => i !== Number(gone.dataset.splitRemove)) });
  });
  root.querySelector('[data-act=split-add]').addEventListener('click', () => {
    const main = root.querySelector('select[name=split-main]').value;
    const support = root.querySelector('select[name=split-support]').value;
    if (main === support) { toast('Pick two different groups.'); return; }
    if (settings.splits.some((p) => p.main === main && p.support === support)) { toast('That pairing is already there.'); return; }
    save({ splits: [...settings.splits, { main, support }] });
  });
  root.querySelector('[data-act=sound]').addEventListener('click', () => {
    const on = !settings.sound;
    setSoundOn(on);
    if (on) { unlockAudio(); beep(); } // this tap readies iOS audio, and the beep shows what it sounds like
    save({ sound: on });
  });

  root.querySelector('[data-theme-group]').addEventListener('click', (ev) => {
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
