// IndexedDB schema for Gym Log. Plain JS, no dependencies.
// Changing a store, index or field meaning needs a DB_VERSION bump and a migration in createStores().
import { migrateExerciseV2 } from '../lib/exercise.js';

export const DB_NAME = 'gymlog';
export const DB_VERSION = 2;
export const BACKUP_SCHEMA = 2;

export const SET_TYPES = ['warmup', 'top', 'backoff'];
// Equipment, muscles and the other exercise detail lists live in src/lib/exercise.js.

/**
 * @typedef {Object} Exercise
 * @property {string} id            crypto.randomUUID(); permanent, never reused
 * @property {string} name
 * @property {string=} equipment    an EQUIPMENT id from lib/exercise.js; missing means barbell
 * @property {string[]=} muscles    MUSCLES ids, primary first (schema 2; replaced muscleGroup)
 * @property {string=} position     POSITIONS id: flat, incline, seated...
 * @property {string=} grip         GRIPS id: overhand, underhand, neutral, mixed
 * @property {string=} width        WIDTHS id: close, shoulder, wide
 * @property {string=} attachment   ATTACHMENTS id, cable only
 * @property {boolean=} unilateral  one arm or leg at a time
 * @property {number=} barKg        empty bar or sled weight, plate-loaded equipment only
 * @property {string=} setup        free text, e.g. "Seat 4, pad 2"
 * @property {number} createdAt     epoch ms
 *
 * @typedef {Object} Session
 * @property {string} id
 * @property {number} startedAt
 * @property {number=} endedAt
 * @property {string=} name         e.g. "Session A"
 * @property {string=} notes
 *
 * @typedef {Object} SessionExercise
 * @property {string} id
 * @property {string} sessionId
 * @property {string} exerciseId
 * @property {number} order
 * @property {string=} notes
 *
 * @typedef {Object} SetEntry
 * @property {string} id
 * @property {string} sessionId          denormalised for fast queries
 * @property {string} sessionExerciseId
 * @property {string} exerciseId         denormalised for per-lift history
 * @property {'warmup'|'top'|'backoff'} type
 * @property {number} weightKg
 * @property {number} reps
 * @property {boolean=} toFailure
 * @property {number=} rir               reps in reserve, optional
 * @property {number} completedAt
 *
 * @typedef {Object} Settings            single row, id 'settings'
 * @property {'settings'} id
 * @property {number} barWeightKg
 * @property {number[]} plates
 * @property {number} stepKg
 * @property {{warmup:number, top:number, backoff:number}} restSeconds
 * @property {number=} lastBackupAt
 * @property {boolean} backupReminder
 *
 * @typedef {Object} BackupFile
 * @property {number} schema             BACKUP_SCHEMA at export time
 * @property {number} exportedAt
 * @property {Exercise[]} exercises
 * @property {Session[]} sessions
 * @property {SessionExercise[]} sessionExercises
 * @property {SetEntry[]} sets
 * @property {Settings} settings
 */

export const DEFAULT_SETTINGS = {
  id: 'settings',
  barWeightKg: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  stepKg: 2.5,
  restSeconds: { warmup: 60, top: 240, backoff: 150 },
  backupReminder: true,
};

// store name -> { keyPath, indexes: [[indexName, keyPath, options?]] }
export const STORES = {
  exercises: { keyPath: 'id', indexes: [['name', 'name']] },
  sessions: { keyPath: 'id', indexes: [['startedAt', 'startedAt']] },
  sessionExercises: {
    keyPath: 'id',
    indexes: [['sessionId', 'sessionId'], ['exerciseId', 'exerciseId']],
  },
  sets: {
    keyPath: 'id',
    indexes: [
      ['sessionId', 'sessionId'],
      ['exerciseId', 'exerciseId'],
      ['completedAt', 'completedAt'],
      ['exerciseId_completedAt', ['exerciseId', 'completedAt']],
    ],
  },
  settings: { keyPath: 'id', indexes: [] },
};

/**
 * Called from indexedDB.open(...).onupgradeneeded with the upgrade transaction.
 * Add a step per DB_VERSION; never edit old steps.
 */
export function createStores(db, oldVersion, tx) {
  if (oldVersion < 1) {
    for (const [name, def] of Object.entries(STORES)) {
      const store = db.createObjectStore(name, { keyPath: def.keyPath });
      for (const [indexName, keyPath, options] of def.indexes) {
        store.createIndex(indexName, keyPath, options);
      }
    }
  }
  if (oldVersion >= 1 && oldVersion < 2) {
    // Exercise details: muscleGroup (free text, never set by the UI) becomes muscles.
    const req = tx.objectStore('exercises').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if ('muscleGroup' in cursor.value) cursor.update(migrateExerciseV2(cursor.value));
      cursor.continue();
    };
  }
  // if (oldVersion < 3) { ...migration for DB_VERSION 3... }
}

// ---------- Backups ----------

const DATA_STORES = ['exercises', 'sessions', 'sessionExercises', 'sets'];

/** Settings from storage or a backup, with any missing fields filled from DEFAULT_SETTINGS. */
export function normaliseSettings(s) {
  const out = { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}), id: 'settings' };
  out.restSeconds = { ...DEFAULT_SETTINGS.restSeconds, ...(s?.restSeconds || {}) };
  return out;
}

/**
 * Brings a parsed backup file up to BACKUP_SCHEMA. Mirrors createStores(): add a step per
 * schema bump that rewrites old records the same way the DB migration does; never edit old steps.
 * Returns a new object; throws an Error with a readable message if the file can't be used.
 */
export function migrateBackup(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('Not a Gym Log backup file.');
  const schema = file.schema;
  if (!Number.isInteger(schema) || schema < 1) throw new Error('Not a Gym Log backup file (no schema number).');
  if (schema > BACKUP_SCHEMA) throw new Error('This backup was made by a newer version of Gym Log. Update the app first.');

  const data = { schema, exportedAt: file.exportedAt, settings: file.settings };
  for (const name of DATA_STORES) data[name] = Array.isArray(file[name]) ? file[name].map((r) => ({ ...r })) : [];
  if (data.schema < 2) { data.exercises = data.exercises.map(migrateExerciseV2); data.schema = 2; }
  // if (data.schema < 3) { ...rewrite records for schema 3...; data.schema = 3; }

  data.schema = BACKUP_SCHEMA;
  data.settings = normaliseSettings(data.settings);
  validateBackup(data);
  return data;
}

/** Throws if a (migrated) backup has records the app can't read. */
export function validateBackup(data) {
  const fail = (msg) => { throw new Error(`Backup is damaged: ${msg}`); };
  const isId = (v) => typeof v === 'string' && v.length > 0;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  for (const name of DATA_STORES) {
    if (!Array.isArray(data[name])) fail(`${name} is missing.`);
    const seen = new Set();
    for (const r of data[name]) {
      if (!r || typeof r !== 'object' || !isId(r.id)) fail(`a record in ${name} has no id.`);
      if (seen.has(r.id)) fail(`${name} has a duplicate id.`);
      seen.add(r.id);
    }
  }
  for (const e of data.exercises) {
    if (typeof e.name !== 'string' || !e.name.trim()) fail('an exercise has no name.');
    if (e.muscles !== undefined && !Array.isArray(e.muscles)) fail(`${e.name} has a bad muscle list.`);
  }
  for (const s of data.sessions) {
    if (!isNum(s.startedAt)) fail('a session has no start time.');
  }
  for (const se of data.sessionExercises) {
    if (!isId(se.sessionId) || !isId(se.exerciseId)) fail('a session exercise is missing its links.');
  }
  for (const s of data.sets) {
    if (!SET_TYPES.includes(s.type)) fail(`a set has an unknown type "${s.type}".`);
    if (!isNum(s.weightKg) || s.weightKg < 0) fail('a set has an invalid weight.');
    if (!Number.isInteger(s.reps) || s.reps < 0) fail('a set has an invalid rep count.');
    if (!isNum(s.completedAt)) fail('a set has no time.');
    if (!isId(s.sessionId) || !isId(s.exerciseId) || !isId(s.sessionExerciseId)) fail('a set is missing its links.');
  }
  return data;
}

/** Backup filename for a given time, e.g. gym-log-backup-2026-10-21.json (matches .gitignore). */
export function backupFileName(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `gym-log-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
