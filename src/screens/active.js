// Active workout: the core screen. One exercise at a time: warm-ups, one top set, back-offs,
// prefilled from last time, with steppers, a rest timer, live e1RM and per-side plates.
import { getSettings } from '../db/db.js';
import {
  getActiveSession, getSessionDetail, getExerciseSets, listExercises, addExerciseToSession,
  removeSessionExercise, logSet, updateSet, deleteSet, finishSession, discardSession, updateExercise,
} from '../db/workout.js';
import { e1rm } from '../lib/e1rm.js';
import { platesPerSide, floorToStep } from '../lib/plates.js';
import { beats } from '../lib/suggest.js';
import { lastSessionSets, topSetOf, planFromLast, remainingPlan, buildRows, insertIndex } from '../lib/plan.js';
import { restFor, startRest, remainingSec, restProgress, extendRest, fmtClock } from '../lib/rest.js';
import { loadsPlates, barKgFor, startKgFor, detailLine, musclesLine } from '../lib/exercise.js';
import { detailFields, formAttrs, readDetails, trackMuscleOrder } from './exercise-form.js';
import { keepAwake, unlockAudio, beep } from '../device.js';
import { esc, toast, fmtKg } from '../ui.js';

// Per-workout screen state that should survive a reload: current exercise, edited plans, rest timer.
const STATE_KEY = 'gymlog_workout';
const REST_SHOWN_AFTER_END = 120; // seconds the "rest over" card stays up

function loadState(sessionId) {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY));
    if (s?.sessionId === sessionId) return { plans: {}, ...s };
  } catch { /* fall through */ }
  return { sessionId, current: null, plans: {}, rest: null };
}
function saveState(st) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch { /* storage blocked */ }
}
export function clearWorkoutState() {
  try { localStorage.removeItem(STATE_KEY); } catch { /* storage blocked */ }
}

const TYPE_LABEL = { warmup: 'Warm-up', top: 'Top set', backoff: 'Back-off' };
const TYPE_BADGE = { warmup: 'W', top: 'TOP', backoff: 'BO' };

const ICON = {
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  minus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  checkSmall: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

export async function render(root) {
  const session = await getActiveSession();
  if (!session) {
    root.innerHTML = `
      <div class="screen">
        <h1 class="title">Workout</h1>
        <div class="lead">No workout in progress.</div>
        <a class="btn btn-primary" href="#today">Back to Today</a>
      </div>`;
    return;
  }

  const settings = await getSettings();
  const st = loadState(session.id);
  let detail = await getSessionDetail(session.id);
  let exercises = await listExercises();
  const history = {}; // exerciseId -> every set of that lift
  let editor = null;  // { key, type, weightKg, reps, toFailure, set?, planIndex? }
  let sheetOpen = detail.items.length === 0;
  let editingExercise = false; // the sheet shows the current exercise's details form
  let busy = false;

  // ---------- derived data ----------

  const currentItem = () => detail.items.find((it) => it.id === st.current) || detail.items[0] || null;
  const setsOf = (it) => detail.sets.filter((s) => s.sessionExerciseId === it.id);
  const startKg = (it) => startKgFor(it.exercise, settings.barWeightKg);
  const lastSets = (it) => lastSessionSets(history[it.exerciseId] || [], session.id);

  async function prepare() {
    const it = currentItem();
    if (!it) return;
    st.current = it.id;
    if (!history[it.exerciseId]) history[it.exerciseId] = await getExerciseSets(it.exerciseId);
    if (!st.plans[it.id]) {
      const plan = planFromLast(lastSets(it), { stepKg: settings.stepKg, startKg: startKg(it) });
      st.plans[it.id] = remainingPlan(plan, setsOf(it));
    }
    saveState(st);
  }

  function rowsOf(it) {
    return buildRows(st.plans[it.id] || [], setsOf(it)).map((r) => ({
      ...r, key: r.set ? `s:${r.set.id}` : `p:${r.planIndex}`,
    }));
  }

  /** Points the editor at a row (by key), or at the first planned row. */
  function focus(key) {
    const it = currentItem();
    if (!it) { editor = null; return; }
    const rows = rowsOf(it);
    const row = rows.find((r) => r.key === key) || rows.find((r) => !r.set) || null;
    editor = row ? {
      key: row.key, type: row.type, weightKg: row.weightKg, reps: row.reps, toFailure: row.toFailure,
      set: row.set, planIndex: row.planIndex,
    } : null;
  }

  /** Writes editor changes on a planned row back into the saved plan. */
  function syncPlan() {
    const it = currentItem();
    if (!editor || editor.set || !it) return;
    const p = st.plans[it.id]?.[editor.planIndex];
    if (!p) return;
    Object.assign(p, { weightKg: editor.weightKg, reps: editor.reps, toFailure: editor.toFailure });
    saveState(st);
  }

  // ---------- markup ----------

  function header(it, index) {
    const title = it ? esc(it.exercise?.name || 'Exercise') : 'Workout';
    const sub = it ? `Exercise ${index + 1} of ${detail.items.length} · ` : '';
    return `
      <div class="wk-head">
        <a href="#today" class="wk-icon" aria-label="Back to Today">${ICON.back}</a>
        <button type="button" class="wk-title" data-act="open-sheet" aria-label="Exercises in this workout">
          <span class="wk-name">${title}</span>
          <span class="wk-sub">${sub}<span id="elapsed">${fmtClock((Date.now() - session.startedAt) / 1000)}</span></span>
        </button>
        <button type="button" class="wk-finish" data-act="finish">Finish</button>
      </div>`;
  }

  function restCard() {
    if (!st.rest) return '';
    const left = remainingSec(st.rest, Date.now());
    return `
      <div class="rest-card${left === 0 ? ' rest-done' : ''}" id="rest">
        <div class="rest-top">
          <div class="rest-read">
            <div class="rest-label" id="rest-label">${left === 0 ? 'REST OVER' : 'REST'}</div>
            <div class="rest-time" id="rest-time">${fmtClock(left)}</div>
          </div>
          <div class="rest-btns">
            <button type="button" class="chip-btn" data-act="rest-add">+30s</button>
            <button type="button" class="chip-btn" data-act="rest-skip" id="rest-skip">${left === 0 ? 'Done' : 'Skip'}</button>
          </div>
        </div>
        <div class="rest-track"><div class="rest-bar" id="rest-bar" style="width:${restProgress(st.rest, Date.now()) * 100}%"></div></div>
      </div>`;
  }

  function lastLine(it) {
    const top = topSetOf(lastSets(it));
    if (!top) return '<div class="wk-last">First time logging this lift</div>';
    return `<div class="wk-last">Last time · ${fmtKg(top.weightKg)} kg × ${top.reps} · e1RM ${Math.round(e1rm(top.weightKg, top.reps))} kg</div>`;
  }

  function detailsLine(it) {
    const ex = it.exercise;
    const muscles = musclesLine(ex);
    return `
      <button type="button" class="ex-details" data-act="edit-ex" aria-label="Edit details for ${esc(ex?.name)}">
        <span class="ex-line">${esc(detailLine(ex))}${muscles ? ` · <span class="muted">${esc(muscles)}</span>` : ''}</span>
        ${ex?.setup ? `<span class="ex-setup">${esc(ex.setup)}</span>` : ''}
        <span class="ex-edit">Edit</span>
      </button>`;
  }

  function rowLine(r) {
    const done = !!r.set;
    return `
      <div class="set-row${done ? ' done' : ''}">
        <button type="button" class="set-main" data-act="focus" data-key="${r.key}" aria-label="Edit ${TYPE_LABEL[r.type]} ${fmtKg(r.weightKg)} kg for ${r.reps}">
          <span class="badge">${TYPE_BADGE[r.type]}</span>
          <span class="set-num">${fmtKg(r.weightKg)}</span>
          <span class="set-num">${r.reps}${r.toFailure ? '<span class="fail-mark" title="To failure">F</span>' : ''}</span>
        </button>
        ${done
          ? `<span class="tick done" role="img" aria-label="Logged">${ICON.check}</span>`
          : `<button type="button" class="tick" data-act="quick" data-key="${r.key}" aria-label="Log this ${TYPE_LABEL[r.type].toLowerCase()} as shown"></button>`}
      </div>`;
  }

  function liveInfo(it) {
    const w = editor.weightKg;
    let first = '';
    if (editor.type === 'top') {
      const now = Math.round(e1rm(w, editor.reps));
      const top = topSetOf(lastSets(it));
      if (top) {
        const diff = now - Math.round(e1rm(top.weightKg, top.reps));
        first = `<div class="live-e1rm">e1RM ${now} kg · ${diff === 0 ? 'same as last' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs last`}</div>`;
      } else {
        first = `<div class="live-e1rm">e1RM ${now} kg</div>`;
      }
    }
    let plates = '';
    if (loadsPlates(it.exercise?.equipment)) {
      const bar = barKgFor(it.exercise, settings.barWeightKg);
      const p = platesPerSide(w, bar, settings.plates);
      if (w < bar) plates = `Below the ${fmtKg(bar)} kg bar`;
      else if (!p.perSide.length) plates = bar ? 'Empty bar' : 'No plates';
      else if (p.exact) plates = `Per side ${p.perSide.map(fmtKg).join(' · ')}`;
      else plates = `Closest ${fmtKg(p.loadedKg)} kg: per side ${p.perSide.map(fmtKg).join(' · ')}`;
    }
    return `${first}${plates ? `<div class="live-plates">${plates}</div>` : ''}`;
  }

  function editorCard(it) {
    const e = editor;
    const editing = !!e.set;
    const step = settings.stepKg;
    const canFail = e.type !== 'warmup';
    return `
      <div class="set-editor type-${e.type}">
        <div class="ed-top">
          <div class="ed-badge">${TYPE_LABEL[e.type].toUpperCase()}${editing ? ' · LOGGED' : ''}</div>
          ${canFail ? `<button type="button" class="fail-btn" data-act="failure" aria-pressed="${!!e.toFailure}">${e.toFailure ? ICON.checkSmall : ''}To failure</button>` : ''}
        </div>
        <div class="stepper">
          <div class="st-label">KG</div>
          <button type="button" class="st-btn" data-act="kg-" aria-label="Decrease weight by ${fmtKg(step)} kilograms">${ICON.minus}</button>
          <input class="st-val" data-field="weightKg" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="Weight in kilograms" value="${fmtKg(e.weightKg)}">
          <button type="button" class="st-btn" data-act="kg+" aria-label="Increase weight by ${fmtKg(step)} kilograms">${ICON.plus}</button>
        </div>
        <div class="stepper">
          <div class="st-label">REPS</div>
          <button type="button" class="st-btn" data-act="reps-" aria-label="Decrease reps">${ICON.minus}</button>
          <input class="st-val" data-field="reps" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" aria-label="Reps" value="${e.reps}">
          <button type="button" class="st-btn" data-act="reps+" aria-label="Increase reps">${ICON.plus}</button>
        </div>
        <div class="live" id="live">${liveInfo(it)}</div>
        ${editing
          ? `<button type="button" class="btn btn-primary" data-act="save">Save changes</button>
             <button type="button" class="text-btn danger" data-act="delete-set">Delete this set</button>`
          : `<button type="button" class="btn btn-primary" data-act="log">Log ${TYPE_LABEL[e.type].toLowerCase()}</button>
             <button type="button" class="text-btn" data-act="remove-plan">Remove from plan</button>`}
      </div>`;
  }

  function body(it, index) {
    if (!it) {
      return `
        <div class="card">
          <div class="lead">Add the first exercise to start logging.</div>
          <button type="button" class="btn btn-primary" data-act="open-sheet">Add exercise</button>
        </div>`;
    }
    const rows = rowsOf(it);
    const next = detail.items[index + 1];
    return `
      ${detailsLine(it)}
      ${lastLine(it)}
      <div class="sets">
        <div class="set-head"><span>SET</span><span>KG</span><span>REPS</span><span></span></div>
        ${rows.map((r) => (editor && r.key === editor.key ? editorCard(it) : rowLine(r))).join('')}
      </div>
      <div class="add-sets">
        <button type="button" class="chip-btn" data-act="add-warmup">+ Warm-up</button>
        <button type="button" class="chip-btn" data-act="add-backoff">+ Back-off</button>
      </div>
      ${next
        ? `<button type="button" class="wk-next" data-act="next"><span>Next: ${esc(next.exercise?.name)}</span>${ICON.next}</button>`
        : `<button type="button" class="wk-next" data-act="open-sheet"><span>Add another exercise</span>${ICON.next}</button>`}`;
  }

  function editSheet() {
    const ex = currentItem()?.exercise;
    if (!ex) return '';
    return `
      <div class="sheet-backdrop" data-act="close-sheet"></div>
      <div class="sheet" role="dialog" aria-label="Exercise details">
        <div class="sheet-head">
          <div class="eyebrow">Exercise details</div>
          <button type="button" class="text-btn" data-act="close-sheet">Cancel</button>
        </div>
        <form ${formAttrs(ex)} data-form="edit">
          ${detailFields(ex, { open: true })}
          <button type="submit" class="btn btn-primary">Save details</button>
        </form>
      </div>`;
  }

  function sheet() {
    if (editingExercise) return editSheet();
    if (!sheetOpen) return '';
    const counts = Object.fromEntries(detail.items.map((it) => [it.id, setsOf(it).length]));
    const cur = currentItem();
    return `
      <div class="sheet-backdrop" data-act="close-sheet"></div>
      <div class="sheet" role="dialog" aria-label="Exercises in this workout">
        <div class="sheet-head">
          <div class="eyebrow">This workout</div>
          <button type="button" class="text-btn" data-act="close-sheet">Done</button>
        </div>
        ${detail.items.length ? `<div class="sheet-list">${detail.items.map((it) => `
          <div class="sheet-row${cur && it.id === cur.id ? ' current' : ''}">
            <button type="button" class="sheet-jump" data-act="jump" data-se="${it.id}">
              <span>${esc(it.exercise?.name)}</span>
              <span class="muted">${counts[it.id] ? `${counts[it.id]} set${counts[it.id] > 1 ? 's' : ''}` : ''}</span>
            </button>
            ${counts[it.id] ? '' : `<button type="button" class="wk-icon" data-act="remove-exercise" data-se="${it.id}" aria-label="Remove ${esc(it.exercise?.name)}">${ICON.close}</button>`}
          </div>`).join('')}</div>` : ''}
        <form ${formAttrs()} data-form="add">
          <div class="eyebrow">Add exercise</div>
          ${detailFields({}, { names: exercises.map((e) => e.name) })}
          <div class="note">Details only apply to new exercises; edit a saved one from its card. Bar and plate-loaded lifts show the plates per side.</div>
          <button type="submit" class="btn btn-primary">Add exercise</button>
        </form>
      </div>`;
  }

  function draw() {
    const it = currentItem();
    const index = it ? detail.items.indexOf(it) : -1;
    if (it && editor === null) focus(null);
    root.innerHTML = `
      <div class="screen wk">
        ${header(it, index)}
        ${restCard()}
        ${body(it, index)}
      </div>
      ${sheet()}`;
  }

  function updateLive() {
    const it = currentItem();
    const el = root.querySelector('#live');
    if (it && editor && el) el.innerHTML = liveInfo(it);
  }

  // ---------- actions ----------

  async function refresh(keepKey) {
    detail = await getSessionDetail(session.id);
    await prepare();
    focus(keepKey ?? null);
    draw();
  }

  function startRestFor(type) {
    st.rest = { ...startRest(restFor(type, settings), Date.now()), alerted: false };
    saveState(st);
  }

  async function log(values) {
    const it = currentItem();
    const set = await logSet(it, values);
    if (values.planIndex !== undefined) st.plans[it.id].splice(values.planIndex, 1);
    startRestFor(values.type);
    if (values.type === 'top') {
      const last = topSetOf(lastSets(it));
      if (last && beats(set, last)) toast(`Beat last time: ${fmtKg(last.weightKg)} × ${last.reps} → ${fmtKg(set.weightKg)} × ${set.reps}`);
    }
    await refresh();
  }

  function addPlanned(type) {
    const it = currentItem();
    const plan = st.plans[it.id];
    const rows = rowsOf(it);
    const top = rows.find((r) => r.type === 'top');
    const ofType = rows.filter((r) => r.type === type);
    let row;
    if (ofType.length) {
      const ref = ofType.at(-1);
      row = { type, weightKg: ref.weightKg, reps: ref.reps };
    } else if (type === 'backoff') {
      row = { type, weightKg: floorToStep((top?.weightKg ?? startKg(it)) * 0.85, settings.stepKg), reps: Math.max(top?.reps ?? 5, 5) + 3 };
    } else {
      row = { type, weightKg: startKg(it), reps: 8 };
    }
    const at = insertIndex(plan, type);
    plan.splice(at, 0, row);
    saveState(st);
    focus(`p:${at}`);
    draw();
  }

  function setValue(field, raw) {
    if (!editor) return;
    if (field === 'weightKg') {
      const v = parseFloat(String(raw).replace(',', '.'));
      if (Number.isFinite(v)) editor.weightKg = Math.max(0, Math.round(v * 100) / 100);
    } else {
      const v = parseInt(raw, 10);
      if (Number.isFinite(v)) editor.reps = Math.max(0, Math.min(999, v));
    }
    syncPlan();
  }

  const actions = {
    'open-sheet': () => { sheetOpen = true; draw(); },
    'close-sheet': () => { sheetOpen = false; editingExercise = false; draw(); },
    'edit-ex': () => { editingExercise = true; draw(); },
    jump: async (el) => { st.current = el.dataset.se; sheetOpen = false; await refresh(); },
    next: async () => {
      const i = detail.items.indexOf(currentItem());
      st.current = detail.items[i + 1]?.id ?? st.current;
      await refresh();
      window.scrollTo(0, 0);
    },
    'remove-exercise': async (el) => {
      const it = detail.items.find((x) => x.id === el.dataset.se);
      if (!it) return;
      await removeSessionExercise(it);
      delete st.plans[it.id];
      if (st.current === it.id) st.current = null;
      await refresh();
    },
    focus: (el) => { focus(el.dataset.key); draw(); },
    quick: async (el) => {
      const row = rowsOf(currentItem()).find((r) => r.key === el.dataset.key);
      if (row) await log(row);
    },
    'kg-': () => { editor.weightKg = Math.max(0, Math.round((editor.weightKg - settings.stepKg) * 100) / 100); syncPlan(); draw(); },
    'kg+': () => { editor.weightKg = Math.round((editor.weightKg + settings.stepKg) * 100) / 100; syncPlan(); draw(); },
    'reps-': () => { editor.reps = Math.max(0, editor.reps - 1); syncPlan(); draw(); },
    'reps+': () => { editor.reps = Math.min(999, editor.reps + 1); syncPlan(); draw(); },
    failure: () => { editor.toFailure = !editor.toFailure; syncPlan(); draw(); },
    log: async () => { await log(editor); },
    save: async () => {
      await updateSet(editor.set, editor);
      toast('Set updated.');
      await refresh();
    },
    'delete-set': async () => {
      if (!confirm(`Delete this ${TYPE_LABEL[editor.type].toLowerCase()} (${fmtKg(editor.weightKg)} kg × ${editor.reps})?`)) return;
      await deleteSet(editor.set.id);
      await refresh();
    },
    'remove-plan': () => {
      st.plans[currentItem().id].splice(editor.planIndex, 1);
      saveState(st);
      focus(null);
      draw();
    },
    'add-warmup': () => addPlanned('warmup'),
    'add-backoff': () => addPlanned('backoff'),
    'rest-add': () => { st.rest = { ...extendRest(st.rest, 30, Date.now()), alerted: false }; saveState(st); draw(); },
    'rest-skip': () => { st.rest = null; saveState(st); draw(); },
    finish: async () => {
      if (!detail.sets.length) {
        if (!confirm('No sets logged. Discard this workout?')) return;
        await discardSession(session.id);
        toast('Workout discarded.');
      } else {
        if (!confirm(`Finish this workout? ${detail.sets.length} set${detail.sets.length > 1 ? 's' : ''} logged.`)) return;
        await finishSession(session.id);
        toast('Workout saved.');
      }
      clearWorkoutState();
      location.hash = '#today';
    },
  };

  root.addEventListener('click', async (ev) => {
    unlockAudio(); // any tap keeps iOS audio ready for the rest beep
    const el = ev.target.closest('[data-act]');
    if (!el || !root.contains(el) || busy) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    // Only saves block further taps; steppers stay instant however fast you tap.
    try {
      const pending = fn(el);
      if (pending?.then) { busy = true; await pending; }
    } catch (err) {
      toast(err.message || String(err), 5000);
    } finally {
      busy = false;
    }
  });

  root.addEventListener('input', (ev) => {
    const field = ev.target.dataset?.field;
    if (!field) return;
    setValue(field, ev.target.value);
    updateLive();
  });
  root.addEventListener('change', (ev) => {
    if (ev.target.dataset?.field) draw(); // tidy the typed value, e.g. "142,50" -> "142.5"
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.dataset?.field) ev.target.blur();
  });
  root.addEventListener('focusin', (ev) => {
    if (ev.target.dataset?.field) ev.target.select();
  });

  trackMuscleOrder(root);
  root.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    if (!['add', 'edit'].includes(form.dataset.form) || busy) return;
    busy = true;
    try {
      if (form.dataset.form === 'add') {
        const se = await addExerciseToSession(session.id, readDetails(form));
        st.current = se.id;
        sheetOpen = false;
      } else {
        await updateExercise(currentItem().exercise, readDetails(form));
        editingExercise = false;
        toast('Details saved.');
      }
      exercises = await listExercises();
      await refresh(editor?.key);
    } catch (err) {
      toast(err.message || String(err), 5000);
    } finally {
      busy = false;
    }
  });

  // ---------- clocks ----------
  // Display only: everything is computed from timestamps, so a suspended app catches up on resume.

  let mounted = false;
  const timer = setInterval(() => {
    if (!root.isConnected) {
      if (mounted) { clearInterval(timer); keepAwake(false); }
      return;
    }
    mounted = true;
    const now = Date.now();
    const elapsed = root.querySelector('#elapsed');
    if (elapsed) elapsed.textContent = fmtClock((now - session.startedAt) / 1000);
    if (!st.rest) return;
    const left = remainingSec(st.rest, now);
    if (left === 0 && (now - st.rest.endsAt) / 1000 > REST_SHOWN_AFTER_END) {
      st.rest = null;
      saveState(st);
      root.querySelector('#rest')?.remove();
      return;
    }
    if (left === 0 && !st.rest.alerted) {
      st.rest.alerted = true;
      saveState(st);
      // Only beep if we're on time; coming back from the background minutes later, the visual cue is enough.
      if (now - st.rest.endsAt < 5000) beep();
    }
    const card = root.querySelector('#rest');
    if (!card) return;
    card.classList.toggle('rest-done', left === 0);
    root.querySelector('#rest-time').textContent = fmtClock(left);
    root.querySelector('#rest-label').textContent = left === 0 ? 'REST OVER' : 'REST';
    root.querySelector('#rest-skip').textContent = left === 0 ? 'Done' : 'Skip';
    root.querySelector('#rest-bar').style.width = `${restProgress(st.rest, now) * 100}%`;
  }, 250);

  keepAwake(true);
  await prepare();
  focus(null);
  draw();
}
