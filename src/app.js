// App shell: hash router, service worker, persistent storage and the update toast.
import { openDB, getSettings, count } from './db/db.js';
import { backupStatus } from './lib/backup.js';
import { toast } from './ui.js';
import * as today from './screens/today.js';
import * as history from './screens/history.js';
import * as lift from './screens/lift.js';
import * as backup from './screens/backup.js';
import * as active from './screens/active.js';

const SCREENS = { today, history, lift, backup, active };
const NO_TABS = new Set(['active']); // full-screen, like the design
const DEFAULT_SCREEN = 'today';
const VERSION_KEY = 'gymlog_version';

const root = document.getElementById('screen');
let renderId = 0;

async function route() {
  const name = location.hash.slice(1).split('/')[0];
  const key = SCREENS[name] ? name : DEFAULT_SCREEN;
  for (const a of document.querySelectorAll('#tabs a')) {
    if (a.dataset.tab === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const id = ++renderId;
  const view = document.createElement('div');
  try {
    await SCREENS[key].render(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="screen"><h1 class="title">Something went wrong</h1><div class="lead"></div></div>`;
    view.querySelector('.lead').textContent = err.message || String(err);
  }
  // A slower render from an earlier tap must not replace the current screen.
  if (id !== renderId) return;
  document.body.classList.toggle('no-tabs', NO_TABS.has(key));
  root.replaceChildren(view);
  window.scrollTo(0, 0);
  markBackupTab();
}

/** Warning dot on the Backup tab while a backup is overdue (iOS web apps can't notify without a push server). */
async function markBackupTab() {
  try {
    const status = backupStatus(await getSettings(), await count('sessions'), Date.now());
    const tab = document.querySelector('#tabs a[data-tab=backup]');
    tab.classList.toggle('alert', status.overdue);
    tab.setAttribute('aria-label', status.overdue ? 'Backup, overdue' : 'Backup');
  } catch { /* storage unavailable: no dot */ }
}

async function askPersist() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* not supported: the Backup screen shows the status */ }
}

function announceUpdate() {
  try {
    const seen = localStorage.getItem(VERSION_KEY);
    if (seen && seen !== globalThis.APP_VERSION) {
      setTimeout(() => toast(`Updated to v${globalThis.APP_VERSION}: ${globalThis.APP_WHATS_NEW}`, 6000), 600);
    }
    localStorage.setItem(VERSION_KEY, globalThis.APP_VERSION);
  } catch { /* storage blocked */ }
}

window.addEventListener('hashchange', route);
window.addEventListener('gymlog:backup-changed', markBackupTab);

await openDB().catch((err) => console.error('IndexedDB failed to open', err));
route();
askPersist();
announceUpdate();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // When a new release's worker takes over, reload once so its files are used straight away.
  // Skipped on the very first install, when there was no worker before.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  }
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // The home-screen app often resumes instead of relaunching, so check for a release on return.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
}
