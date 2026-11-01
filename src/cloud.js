// Automatic backup to the Gym Log Worker (worker/), which keeps every copy forever.
// The app uploads whenever its data has changed since the last upload: on launch, on
// returning to or leaving the app, and after finishing a workout.
import { exportBackup, get, putMany } from './db/db.js';
import { backupFingerprint } from './lib/backup.js';
import { dateInputValue, shiftDays } from './lib/history.js';
import { mergeImported } from './lib/health.js';

// The local server talks to `wrangler dev` in worker/, so testing never touches real backups.
export const CLOUD_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? 'http://localhost:8787'
  : 'https://gym-log-backup.pocket-apps.workers.dev';
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
  if (!force && hash === lastHash) {
    // Nothing new, but the cloud copy is current: that still counts as backed up today.
    setCloud({ lastAt: Date.now(), error: null });
    return 'unchanged';
  }
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

let pulling;

/**
 * Brings in the Apple Health numbers the phone pushed to the Worker (POST /health) and merges them into
 * the `health` store; numbers typed by hand are never overwritten. Resolves to how many days changed, or
 * 'off' with no backup key. Throws a readable message; days with no data simply never arrive.
 */
export function pullHealth() {
  if (!pulling) pulling = pullNow().finally(() => { pulling = undefined; });
  return pulling;
}

async function pullNow() {
  const { key, healthAt } = getCloud();
  if (!key) return 'off';
  const now = Date.now();
  // First time: three months back. After that a few days back catches revised totals (steps keep growing).
  const from = dateInputValue(shiftDays(healthAt || now, healthAt ? -4 : -90));
  let res;
  try {
    res = await request(`/health?from=${from}`);
  } catch (err) {
    setCloud({ healthError: err.message });
    throw err;
  }
  const writes = [];
  for (const d of res.days || []) {
    const merged = mergeImported(await get('health', d.day), d.day, d);
    if (merged) writes.push(['health', merged]);
  }
  await putMany(writes);
  setCloud({ healthAt: now, healthError: null, healthDays: (res.days || []).length, healthChanged: writes.length });
  return writes.length;
}

/** Background version: never throws, the Health screen shows any error. */
export function autoPullHealth() {
  pullHealth().catch(() => {});
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
