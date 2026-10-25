// Automatic backup to the Gym Log Worker (worker/), which keeps every copy forever.
// The app uploads whenever its data has changed since the last upload: on launch, on
// returning to or leaving the app, and after finishing a workout.
import { exportBackup } from './db/db.js';
import { backupFingerprint } from './lib/backup.js';

// The local server talks to `wrangler dev` in worker/, so testing never touches real backups.
export const CLOUD_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:8787'
  : 'https://gym-log-backup.t212-pocket.workers.dev';
const STORE_KEY = 'gymlog_cloud'; // localStorage: { key, lastAt, lastHash, error }

export function getCloud() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}

function setCloud(patch) {
  const next = { ...getCloud(), ...patch };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('gymlog:backup-changed'));
  return next;
}

async function request(path, init = {}, key = getCloud().key) {
  let res;
  try {
    res = await fetch(CLOUD_URL + path, { ...init, cache: 'no-store', headers: { Authorization: `Bearer ${key}`, ...init.headers } });
  } catch {
    throw new Error('Offline: will back up when there is signal.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Backup server error ${res.status}.`);
  }
  return res.json();
}

/** Saves the key if the server accepts it. Resolves to the stored backups, newest first. */
export async function connect(key) {
  key = key.trim().toLowerCase();
  const list = await request('/backups', {}, key);
  setCloud({ key, error: null, lastHash: null });
  return list.backups;
}

export function disconnect() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('gymlog:backup-changed'));
}

export async function listBackups() {
  return (await request('/backups')).backups;
}

export function fetchBackup(id) {
  return request(`/backups/${encodeURIComponent(id)}`);
}

let running;

/**
 * Uploads a backup if anything changed since the last one (or always, with force).
 * Resolves to 'uploaded', 'unchanged', 'empty', 'in-workout' or 'off'; throws with a readable message.
 * An empty database is never uploaded, so a fresh phone can't bury the real backups.
 */
export function backupNow({ force = false } = {}) {
  if (!running) running = run(force).finally(() => { running = undefined; });
  return running;
}

async function run(force) {
  const { key, lastHash } = getCloud();
  if (!key) return 'off';
  const backup = await exportBackup();
  if (!backup.sessions.length) return 'empty';
  // Mid-workout the phone locks between sets; finishing uploads once instead of a copy per set.
  if (!force && backup.sessions.some((s) => !s.endedAt)) return 'in-workout';
  const hash = await sha256(backupFingerprint(backup));
  if (!force && hash === lastHash) return 'unchanged';
  try {
    await request('/backups', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backup) });
  } catch (err) {
    setCloud({ error: err.message });
    throw err;
  }
  setCloud({ lastAt: Date.now(), lastHash: hash, error: null });
  return 'uploaded';
}

/** After restoring a cloud copy: the data already matches it, so don't upload it again. */
export async function markBackedUp() {
  setCloud({ lastHash: await sha256(backupFingerprint(await exportBackup())), error: null });
}

/** Background version: never throws, the Backup screen shows any error. */
export function autoBackup() {
  backupNow().catch(() => {});
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
