// Small promise wrapper around IndexedDB. Stores and migrations live in schema.js.
import {
  DB_NAME, DB_VERSION, BACKUP_SCHEMA, STORES, createStores, normaliseSettings, migrateBackup,
} from './schema.js';

let dbPromise;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => createStores(req.result, e.oldVersion);
      req.onsuccess = () => {
        const db = req.result;
        // Another tab opened a newer version: close so its upgrade can run, then reload.
        db.onversionchange = () => { db.close(); location.reload(); };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Close other Gym Log tabs to finish updating.'));
    });
    dbPromise.catch(() => { dbPromise = undefined; });
  }
  return dbPromise;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const finished = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
});

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(storeName, id) {
  return done((await store(storeName)).get(id));
}

export async function getAll(storeName) {
  return done((await store(storeName)).getAll());
}

/** All records whose index matches `query` (a key or an IDBKeyRange). */
export async function getAllByIndex(storeName, indexName, query) {
  return done((await store(storeName)).index(indexName).getAll(query));
}

export async function count(storeName) {
  return done((await store(storeName)).count());
}

export async function put(storeName, record) {
  const s = await store(storeName, 'readwrite');
  const ok = finished(s.transaction);
  s.put(record);
  await ok;
  return record;
}

/** Writes several records to one or more stores in one transaction: [[storeName, record], ...]. */
export async function putMany(entries) {
  const names = [...new Set(entries.map(([n]) => n))];
  if (!names.length) return;
  const db = await openDB();
  const tx = db.transaction(names, 'readwrite');
  for (const [n, r] of entries) tx.objectStore(n).put(r);
  await finished(tx);
}

export async function remove(storeName, id) {
  const s = await store(storeName, 'readwrite');
  const ok = finished(s.transaction);
  s.delete(id);
  await ok;
}

/** Deletes several records from one or more stores in one transaction: [[storeName, id], ...]. */
export async function removeMany(entries) {
  const names = [...new Set(entries.map(([n]) => n))];
  if (!names.length) return;
  const db = await openDB();
  const tx = db.transaction(names, 'readwrite');
  for (const [n, id] of entries) tx.objectStore(n).delete(id);
  await finished(tx);
}

// ---------- Settings ----------

export async function getSettings() {
  return normaliseSettings(await get('settings', 'settings'));
}

export async function saveSettings(patch) {
  return put('settings', normaliseSettings({ ...(await getSettings()), ...patch }));
}

// ---------- Backup ----------

/** Everything in the database as a BackupFile object. */
export async function exportBackup() {
  const db = await openDB();
  const names = Object.keys(STORES);
  const tx = db.transaction(names, 'readonly');
  const all = await Promise.all(names.map((n) => done(tx.objectStore(n).getAll())));
  const data = Object.fromEntries(names.map((n, i) => [n, all[i]]));
  return {
    schema: BACKUP_SCHEMA,
    exportedAt: Date.now(),
    exercises: data.exercises,
    sessions: data.sessions,
    sessionExercises: data.sessionExercises,
    sets: data.sets,
    settings: normaliseSettings(data.settings[0]),
  };
}

/**
 * Replaces all data with a backup (a parsed JSON object). The file is migrated and validated
 * first, and the swap is a single transaction, so a bad file leaves the current data untouched.
 */
export async function importBackup(file) {
  const data = migrateBackup(file);
  const db = await openDB();
  const names = Object.keys(STORES);
  const tx = db.transaction(names, 'readwrite');
  for (const n of names) tx.objectStore(n).clear();
  for (const n of ['exercises', 'sessions', 'sessionExercises', 'sets']) {
    const s = tx.objectStore(n);
    for (const r of data[n]) s.put(r);
  }
  tx.objectStore('settings').put(data.settings);
  await finished(tx);
  return { sessions: data.sessions.length, sets: data.sets.length };
}
