// Workout editor: a saved group of exercises (Push, Legs...) that you start from Today.
// #workout/new makes one, #workout/<id> edits one.
import {
  getWorkout, saveWorkout, deleteWorkout, findOrCreateExercise, listExercises, loadAll, startSession, getActiveSession,
} from '../db/workout.js';
import { muscleLabel } from '../lib/exercise.js';
import { shortDate } from '../lib/history.js';
import { detailFields, formAttrs, readDetails } from './exercise-form.js';
import { readDraft, writeDraft, clearDraft } from '../lib/wo-draft.js';
import { unlockAudio } from '../device.js';
import { esc, toast } from '../ui.js';

const ICON = {
  up: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

export async function render(root) {
  const id = location.hash.split('/')[1];
  const isNew = !id || id === 'new';
  const workout = isNew ? null : await getWorkout(id);
  if (!isNew && !workout) {
    root.innerHTML = `
      <div class="screen">
        <h1 class="title">Workout</h1>
        <div class="lead">This workout no longer exists.</div>
        <a class="btn btn-primary" href="#today">Back to Today</a>
      </div>`;
    return;
  }

  const [all, active] = await Promise.all([loadAll(), getActiveSession()]);
  let exercises = await listExercises();
  const state = { name: workout?.name || '', ids: [...(workout?.exerciseIds || [])] };
  // Back from the library: pick up the name and lineup parked before the trip.
  const draft = readDraft();
  if (draft && draft.id === (workout?.id || 'new')) { state.name = draft.name; state.ids = draft.ids; }
  clearDraft();
  let busy = false;

  // Recent workouts with different lineups, so an existing routine can be copied in one tap.
  const past = [];
  const seen = new Set();
  for (const s of all.finished) {
    const ids = (all.bySession.get(s.id) || []).map((it) => it.se.exerciseId);
    const key = [...ids].sort().join('|');
    if (!ids.length || seen.has(key)) continue;
    seen.add(key);
    past.push({ s, ids });
    if (past.length === 4) break;
  }

  const byId = () => new Map(exercises.map((e) => [e.id, e]));

  function listHtml() {
    const map = byId();
    const rows = state.ids.filter((x) => map.has(x));
    if (!rows.length) return '<div class="note">No exercises yet. Add them below.</div>';
    return rows.map((x, i) => {
      const e = map.get(x);
      const muscle = muscleLabel(e.muscles?.[0]);
      return `
        <div class="wo-row">
          <div class="wo-row-name"><span>${esc(e.name)}</span>${muscle ? `<small>${esc(muscle)}</small>` : ''}</div>
          <button type="button" class="wk-icon" data-act="up" data-id="${x}" aria-label="Move ${esc(e.name)} up"${i === 0 ? ' disabled' : ''}>${ICON.up}</button>
          <button type="button" class="wk-icon" data-act="down" data-id="${x}" aria-label="Move ${esc(e.name)} down"${i === rows.length - 1 ? ' disabled' : ''}>${ICON.down}</button>
          <button type="button" class="wk-icon" data-act="remove" data-id="${x}" aria-label="Remove ${esc(e.name)}">${ICON.close}</button>
        </div>`;
    }).join('');
  }

  function pickHtml() {
    const map = byId();
    const left = exercises.filter((e) => !state.ids.includes(e.id));
    const copies = isNew && !state.ids.length ? past : [];
    return `
      ${copies.length ? `
        <div class="stack">
          <div class="eyebrow">Copy a past workout</div>
          ${copies.map((p, i) => `
            <button type="button" class="copy-row" data-act="copy" data-i="${i}">
              <span class="muted">${esc(shortDate(p.s.startedAt))}</span>
              <span>${p.ids.map((x) => esc(map.get(x)?.name)).filter(Boolean).join(' · ')}</span>
            </button>`).join('')}
        </div>` : ''}
      ${left.length ? `
        <div class="stack">
          <div class="eyebrow">Add your exercises</div>
          <div class="pick-list">${left.map((e) => `<button type="button" class="chip-btn" data-act="add" data-id="${e.id}">+ ${esc(e.name)}</button>`).join('')}</div>
        </div>` : ''}`;
  }

  function redraw() {
    root.querySelector('#wo-list').innerHTML = listHtml();
    root.querySelector('#wo-pick').innerHTML = pickHtml();
    root.querySelector('#wo-count').textContent = state.ids.length ? ` · ${state.ids.length}` : '';
  }

  root.innerHTML = `
    <div class="screen">
      <div class="lift-head">
        <h1 class="title">${isNew ? 'New workout' : 'Edit workout'}</h1>
        <a class="text-btn" href="#today">Cancel</a>
      </div>
      <input class="text-input" data-field="name" placeholder="Name, e.g. Push, Legs, Upper A" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Workout name" maxlength="60" value="${esc(state.name)}">
      <div class="stack">
        <div class="eyebrow">Exercises<span id="wo-count"></span></div>
        <div class="wo-list" id="wo-list"></div>
      </div>
      <div class="stack" id="wo-pick"></div>
      <button type="button" class="btn btn-secondary" data-act="library">Browse exercise library</button>
      <form ${formAttrs()} data-form="new">
        <div class="eyebrow">New exercise</div>
        ${detailFields({}, { names: exercises.map((e) => e.name) })}
        <button type="submit" class="btn btn-secondary">Add new exercise</button>
      </form>
      <div class="stack">
        ${active ? '' : '<button type="button" class="btn btn-primary" data-act="save-start">Save and start</button>'}
        <button type="button" class="btn ${active ? 'btn-primary' : 'btn-secondary'}" data-act="save">Save workout</button>
        ${isNew ? '' : '<button type="button" class="text-btn danger" data-act="delete">Delete this workout</button>'}
      </div>
    </div>`;
  redraw();

  const move = (x, by) => {
    const i = state.ids.indexOf(x);
    const j = i + by;
    if (i < 0 || j < 0 || j >= state.ids.length) return;
    [state.ids[i], state.ids[j]] = [state.ids[j], state.ids[i]];
  };

  async function save() {
    return saveWorkout({ id: workout?.id, name: state.name, exerciseIds: state.ids });
  }

  const actions = {
    up: (el) => move(el.dataset.id, -1),
    down: (el) => move(el.dataset.id, 1),
    remove: (el) => { state.ids = state.ids.filter((x) => x !== el.dataset.id); },
    add: (el) => { state.ids.push(el.dataset.id); },
    copy: (el) => { state.ids = [...past[+el.dataset.i].ids]; },
    library: () => {
      writeDraft({ id: workout?.id || 'new', name: state.name, ids: state.ids });
      location.hash = '#library';
    },
    save: async () => {
      const w = await save();
      toast(`${w.name} saved.`);
      location.hash = '#today';
    },
    'save-start': async () => {
      unlockAudio(); // this tap starts the workout, so ready the rest-timer sound
      const w = await save();
      await startSession(w.id);
      location.hash = '#active';
    },
    delete: async () => {
      if (!confirm(`Delete ${workout.name}? Workouts you've done with it stay in History.`)) return;
      await deleteWorkout(workout.id);
      toast('Workout deleted.');
      location.hash = '#today';
    },
  };

  root.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || busy || !actions[el.dataset.act]) return;
    busy = true;
    try {
      await actions[el.dataset.act](el);
      if (root.isConnected) redraw();
    } catch (err) {
      toast(err.message || String(err), 5000);
    } finally {
      busy = false;
    }
  });

  root.addEventListener('input', (ev) => {
    if (ev.target.dataset?.field === 'name') state.name = ev.target.value;
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.dataset?.field === 'name') ev.target.blur();
  });

  root.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    if (form.dataset.form !== 'new' || busy) return;
    busy = true;
    try {
      const e = await findOrCreateExercise(readDetails(form));
      if (!state.ids.includes(e.id)) state.ids.push(e.id);
      exercises = await listExercises();
      form.reset();
      form.querySelector('details')?.removeAttribute('open');
      redraw();
      toast(`${e.name} added.`);
    } catch (err) {
      toast(err.message || String(err), 5000);
    } finally {
      busy = false;
    }
  });
}
