// App shell: hash router, service worker, persistent storage and the update toast.
import { openDB } from './db/db.js';
import { toast } from './ui.js';
import * as today from './screens/today.js';
import * as history from './screens/history.js';
import * as lift from './screens/lift.js';
import * as backup from './screens/backup.js';

const SCREENS = { today, history, lift, backup };
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
  root.replaceChildren(view);
  root.scrollTop = 0;
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

await openDB().catch((err) => console.error('IndexedDB failed to open', err));
route();
askPersist();
announceUpdate();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
