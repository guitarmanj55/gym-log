// Workout data: sessions, the exercises in them and their sets. Built on the db.js wrapper.
import { get, getAll, getAllByIndex, put, putMany, remove, removeMany } from './db.js';
import { cleanDetails, withDetails } from '../lib/exercise.js';

const uid = () => crypto.randomUUID();
const byOrder = (a, b) => a.order - b.order;

/** The session in progress (no endedAt), newest first, or null. */
export async function getActiveSession() {
  const open = (await getAll('sessions')).filter((s) => !s.endedAt);
  return open.sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}

/** The most recently started finished session, or null. */
export async function getLastFinishedSession() {
  const done = (await getAll('sessions')).filter((s) => s.endedAt);
  return done.sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}

/** Exercises of a session in order. */
export async function getSessionExercises(sessionId) {
  const list = await getAllByIndex('sessionExercises', 'sessionId', sessionId);
  const out = [];
  for (const se of list.sort(byOrder)) out.push({ ...se, exercise: await get('exercises', se.exerciseId) });
  return out;
}

/**
 * Resumes the session in progress, or starts one with the same exercises as `templateId`
 * (default: the last finished session).
 */
export async function startSession(templateId, now = Date.now()) {
  const active = await getActiveSession();
  if (active) return active;
  const session = { id: uid(), startedAt: now };
  const fromId = templateId || (await getLastFinishedSession())?.id;
  const template = fromId ? await getAllByIndex('sessionExercises', 'sessionId', fromId) : [];
  await putMany([
    ['sessions', session],
    ...template.sort(byOrder).map((se, i) => ['sessionExercises', {
      id: uid(), sessionId: session.id, exerciseId: se.exerciseId, order: i,
    }]),
  ]);
  return session;
}

/**
 * Every record, joined up for the Today and History screens. Fine for years of one person's
 * training (a few thousand sets); add paging here if it ever gets slow.
 * @returns {{exercises: Map, sessions: Array, finished: Array, sets: Array,
 *   bySession: Map<string, Array<{se, exercise, sets}>>}}  finished is newest first
 */
export async function loadAll() {
  const [exerciseList, sessions, sessionExercises, sets] = await Promise.all([
    getAll('exercises'), getAll('sessions'), getAll('sessionExercises'), getAll('sets'),
  ]);
  const exercises = new Map(exerciseList.map((e) => [e.id, e]));
  const setsBySe = new Map();
  for (const s of sets.sort((a, b) => a.completedAt - b.completedAt)) {
    if (!setsBySe.has(s.sessionExerciseId)) setsBySe.set(s.sessionExerciseId, []);
    setsBySe.get(s.sessionExerciseId).push(s);
  }
  const bySession = new Map();
  for (const se of sessionExercises.sort(byOrder)) {
    if (!bySession.has(se.sessionId)) bySession.set(se.sessionId, []);
    bySession.get(se.sessionId).push({ se, exercise: exercises.get(se.exerciseId), sets: setsBySe.get(se.id) || [] });
  }
  const finished = sessions.filter((s) => s.endedAt).sort((a, b) => b.startedAt - a.startedAt);
  return { exercises, sessions, finished, sets, bySession };
}

/** Everything the workout screen needs: the session, its exercises (with `exercise`) and its sets. */
export async function getSessionDetail(sessionId) {
  const [session, items, sets] = await Promise.all([
    get('sessions', sessionId),
    getSessionExercises(sessionId),
    getAllByIndex('sets', 'sessionId', sessionId),
  ]);
  return { session, items, sets: sets.sort((a, b) => a.completedAt - b.completedAt) };
}

/** Every set ever logged for one exercise. */
export function getExerciseSets(exerciseId) {
  return getAllByIndex('sets', 'exerciseId', exerciseId);
}

export async function listExercises() {
  return (await getAll('exercises')).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Adds an exercise to a session by name, reusing an existing exercise with the same name
 * (any case); `details` (equipment, muscles...) only apply to a new one.
 * Returns the session exercise; if the lift is already in the session, that one.
 */
export async function addExerciseToSession(sessionId, details, now = Date.now()) {
  const clean = cleanDetails(details);
  if (!clean.name) throw new Error('Give the exercise a name.');
  let exercise = (await getAll('exercises')).find((e) => e.name.toLowerCase() === clean.name.toLowerCase());
  if (!exercise) {
    exercise = { id: uid(), ...clean, createdAt: now };
    await put('exercises', exercise);
  }
  const current = await getAllByIndex('sessionExercises', 'sessionId', sessionId);
  const existing = current.find((se) => se.exerciseId === exercise.id);
  if (existing) return existing;
  const se = {
    id: uid(), sessionId, exerciseId: exercise.id,
    order: current.reduce((m, s) => Math.max(m, s.order + 1), 0),
  };
  await put('sessionExercises', se);
  return se;
}

/** Saves new details (and maybe a new name) for an exercise. Its sets and history stay with it. */
export async function updateExercise(exercise, details) {
  const next = withDetails(exercise, details);
  if (!next.name) throw new Error('Give the exercise a name.');
  const clash = (await getAll('exercises')).find((e) => e.id !== exercise.id && e.name.toLowerCase() === next.name.toLowerCase());
  if (clash) throw new Error(`There's already an exercise called ${clash.name}.`);
  return put('exercises', next);
}

/** Takes an exercise out of a session. Refuses if sets are logged against it. */
export async function removeSessionExercise(se) {
  const sets = await getAllByIndex('sets', 'sessionId', se.sessionId);
  if (sets.some((s) => s.sessionExerciseId === se.id)) throw new Error('Delete its logged sets first.');
  await remove('sessionExercises', se.id);
}

export async function logSet(se, { type, weightKg, reps, toFailure }, now = Date.now()) {
  const set = {
    id: uid(), sessionId: se.sessionId, sessionExerciseId: se.id, exerciseId: se.exerciseId,
    type, weightKg, reps, completedAt: now,
  };
  if (toFailure) set.toFailure = true;
  return put('sets', set);
}

export async function updateSet(set, { weightKg, reps, toFailure }) {
  const next = { ...set, weightKg, reps };
  if (toFailure) next.toFailure = true;
  else delete next.toFailure;
  return put('sets', next);
}

export function deleteSet(id) {
  return remove('sets', id);
}

export async function finishSession(sessionId, now = Date.now()) {
  const session = await get('sessions', sessionId);
  return put('sessions', { ...session, endedAt: now });
}

/** Deletes a session with its exercises and sets. */
export async function discardSession(sessionId) {
  const [items, sets] = await Promise.all([
    getAllByIndex('sessionExercises', 'sessionId', sessionId),
    getAllByIndex('sets', 'sessionId', sessionId),
  ]);
  await removeMany([
    ['sessions', sessionId],
    ...items.map((se) => ['sessionExercises', se.id]),
    ...sets.map((s) => ['sets', s.id]),
  ]);
}
