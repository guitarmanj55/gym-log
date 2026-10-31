// Exercise library: browse by training group, read how a lift is done, add it to a workout.
// #library lists, #library/<id> shows one lift. While a workout is being built (see wo-draft.js)
// adding goes straight into it; otherwise the lift goes to a saved workout you pick.
import { LIBRARY } from '../lib/library-data.js';
import { LIBRARY_GROUPS, filterLibrary, detailsFor, imagePaths, subtitle, groupLabel } from '../lib/library.js';
import { equipmentLabel } from '../lib/exercise.js';
import { findOrCreateExercise, listExercises, listWorkouts, saveWorkout } from '../db/workout.js';
import { readDraft, writeDraft } from '../lib/wo-draft.js';
import { esc, toast } from '../ui.js';

const SAVED_KEY = 'gymlib_saved'; // set once every photo has been fetched for offline use
const view = { group: '', query: '' }; // kept while the app is open, so Back returns to the same list
let chooserFor = null; // library id whose "pick a workout" list should open on arrival

const ICON = {
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
};

const byName = (list, name) => list.find((e) => e.name.toLowerCase() === name.toLowerCase());

export async function render(root) {
  const id = location.hash.split('/')[1];
  const entry = id && LIBRARY.find((e) => e.id === id);
  if (entry) return renderDetail(root, entry);
  return renderList(root);
}

/** Adds a library lift to the workout being built, or reports false if there isn't one. */
async function addToDraft(entry) {
  const draft = readDraft();
  if (!draft) return false;
  const ex = await findOrCreateExercise(detailsFor(entry));
  if (!draft.ids.includes(ex.id)) draft.ids.push(ex.id);
  writeDraft(draft);
  toast(`${entry.name} added to ${draft.name || 'your workout'}.`);
  return true;
}

function backBanner(draft) {
  if (!draft) return '';
  const href = draft.id === 'new' ? '#workout/new' : `#workout/${draft.id}`;
  return `
    <div class="lib-banner">
      <span>Adding to <b>${esc(draft.name || (draft.id === 'new' ? 'new workout' : 'workout'))}</b> · ${draft.ids.length} so far</span>
      <a class="text-btn" href="${href}">Done</a>
    </div>`;
}

async function renderList(root) {
  const draft = readDraft();
  const existing = await listExercises();
  const inDraft = (e) => {
    const ex = byName(existing, e.name);
    return Boolean(ex && readDraft()?.ids.includes(ex.id));
  };

  root.innerHTML = `
    <div class="screen">
      <h1 class="title">Library</h1>
      <div id="lib-banner">${backBanner(draft)}</div>
      <div class="search">
        <span class="search-icon">${ICON.search}</span>
        <input class="text-input" type="search" data-field="query" placeholder="Search ${LIBRARY.length} exercises" aria-label="Search the library" autocomplete="off" value="${esc(view.query)}">
      </div>
      <div class="lib-groups" id="lib-groups"></div>
      <div class="lib-list" id="lib-list"></div>
      <div class="stack" id="lib-offline"></div>
      <div class="note">Descriptions and photos from free-exercise-db (public domain).</div>
    </div>`;

  const groups = root.querySelector('#lib-groups');
  const list = root.querySelector('#lib-list');

  function draw() {
    groups.innerHTML = [['', 'All'], ...LIBRARY_GROUPS].map(([k, l]) =>
      `<button type="button" class="chip-btn" data-group="${k}" aria-pressed="${view.group === k}">${l}</button>`).join('');
    const hits = filterLibrary(LIBRARY, view);
    list.innerHTML = hits.length ? hits.map((e) => {
      const added = inDraft(e);
      return `
        <div class="lib-row">
          <a class="lib-main" href="#library/${e.id}">
            <img class="lib-thumb" src="library/${e.id}/0.jpg" alt="" loading="lazy" width="56" height="56">
            <span class="lib-name"><span>${esc(e.name)}</span><small>${esc(view.group ? subtitle(e) : `${groupLabel(e.group)} · ${equipmentLabel(e.equipment)}`)}</small></span>
          </a>
          <button type="button" class="lib-add${added ? ' done' : ''}" data-add="${e.id}" aria-label="${added ? 'Added' : 'Add'} ${esc(e.name)}">${added ? ICON.check : ICON.plus}</button>
        </div>`;
    }).join('') : '<div class="note">No match. Try a muscle or equipment, like "triceps cable".</div>';
  }
  draw();
  offlineBox(root.querySelector('#lib-offline'));

  root.addEventListener('click', async (ev) => {
    const g = ev.target.closest('[data-group]');
    if (g) { view.group = g.dataset.group; draw(); return; }
    const add = ev.target.closest('[data-add]');
    if (!add) return;
    const e = LIBRARY.find((x) => x.id === add.dataset.add);
    try {
      if (readDraft()) {
        await addToDraft(e);
        root.querySelector('#lib-banner').innerHTML = backBanner(readDraft());
        inDraftRefresh();
      } else {
        chooserFor = e.id; // nothing in progress: pick the workout on the lift's page
        location.hash = `#library/${e.id}`;
      }
    } catch (err) { toast(err.message || String(err), 5000); }
  });
  async function inDraftRefresh() {
    existing.splice(0, existing.length, ...(await listExercises()));
    draw();
  }
  root.addEventListener('input', (ev) => {
    if (ev.target.dataset?.field !== 'query') return;
    view.query = ev.target.value;
    draw();
  });
}

async function renderDetail(root, e) {
  const draft = readDraft();
  const [existing, workouts] = await Promise.all([listExercises(), listWorkouts()]);
  const ex = byName(existing, e.name);
  const photos = imagePaths(e);
  const secondary = e.secondary.length ? e.secondary.join(', ') : '';
  let added = Boolean(draft && ex && draft.ids.includes(ex.id));
  let chooser = chooserFor === e.id && !draft;
  chooserFor = null;

  root.innerHTML = `
    <div class="screen">
      <div class="lift-head">
        <h1 class="title lib-title">${esc(e.name)}</h1>
        <a class="text-btn" href="#library">Back</a>
      </div>
      ${backBanner(draft)}
      <div class="lib-photos${photos.length > 1 ? ' flip' : ''}" aria-label="Start and end position">
        ${photos.map((p, i) => `<img src="${p}" alt="${esc(e.name)}, ${i ? 'end' : 'start'} position" width="400" height="300">`).join('')}
      </div>
      <div class="card lib-facts">
        <div><span class="eyebrow">Main muscles</span><div class="lib-val">${esc(e.primary.join(', '))}</div></div>
        ${secondary ? `<div><span class="eyebrow">Also works</span><div class="lib-val">${esc(secondary)}</div></div>` : ''}
        <div><span class="eyebrow">Equipment</span><div class="lib-val">${esc(equipmentLabel(e.equipment))}${e.mechanic ? ` · ${esc(e.mechanic)}` : ''}</div></div>
      </div>
      <div class="stack">
        <div class="eyebrow">How to</div>
        <ol class="lib-steps">${e.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      </div>
      <div class="stack" id="lib-act"></div>
    </div>`;

  const act = root.querySelector('#lib-act');
  function drawAct() {
    if (draft) {
      const href = draft.id === 'new' ? '#workout/new' : `#workout/${draft.id}`;
      act.innerHTML = added
        ? `<a class="btn btn-primary" href="${href}">Added · back to workout</a>`
        : `<button type="button" class="btn btn-primary" data-act="add">Add to ${esc(draft.name || 'workout')}</button>`;
      return;
    }
    if (!chooser) { act.innerHTML = '<button type="button" class="btn btn-primary" data-act="choose">Add to workout</button>'; return; }
    act.innerHTML = `
      <div class="eyebrow">Add to which workout?</div>
      ${workouts.map((w) => `<button type="button" class="copy-row" data-act="to" data-id="${w.id}"><span>${esc(w.name)}</span><span class="muted">${w.exerciseIds.length} ${w.exerciseIds.length === 1 ? 'lift' : 'lifts'}</span></button>`).join('')}
      <button type="button" class="btn btn-secondary" data-act="new">New workout with this</button>`;
  }
  drawAct();

  act.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    try {
      if (el.dataset.act === 'choose') { chooser = true; }
      else if (el.dataset.act === 'add') { await addToDraft(e); added = true; }
      else if (el.dataset.act === 'to') {
        const w = workouts.find((x) => x.id === el.dataset.id);
        const created = await findOrCreateExercise(detailsFor(e));
        if (w.exerciseIds.includes(created.id)) { toast(`${e.name} is already in ${w.name}.`); }
        else {
          await saveWorkout({ id: w.id, name: w.name, exerciseIds: [...w.exerciseIds, created.id] });
          toast(`${e.name} added to ${w.name}.`);
        }
        chooser = false;
      } else if (el.dataset.act === 'new') {
        const created = await findOrCreateExercise(detailsFor(e));
        writeDraft({ id: 'new', name: '', ids: [created.id] });
        location.hash = '#workout/new';
        return;
      }
      drawAct();
    } catch (err) { toast(err.message || String(err), 5000); }
  });
}

/** "Save photos for offline": fetching each one lets the service worker keep it. */
function offlineBox(el) {
  let saved = false;
  try { saved = localStorage.getItem(SAVED_KEY) === '1'; } catch { /* storage blocked */ }
  if (saved || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) { el.innerHTML = ''; return; }
  el.innerHTML = '<button type="button" class="btn btn-secondary" id="lib-save">Save all photos for offline</button><div class="note">About 10 MB. Photos you open are kept automatically anyway.</div>';
  el.querySelector('#lib-save').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const urls = LIBRARY.flatMap(imagePaths);
    let done = 0, failed = 0;
    btn.disabled = true;
    const queue = [...urls];
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (queue.length) {
        try { const r = await fetch(queue.pop()); if (!r.ok) failed++; } catch { failed++; }
        btn.textContent = `Saving ${++done} of ${urls.length}`;
      }
    }));
    if (failed) { btn.disabled = false; btn.textContent = 'Save all photos for offline'; toast(`${failed} photos didn't download. Try again on wifi.`, 5000); return; }
    try { localStorage.setItem(SAVED_KEY, '1'); } catch { /* fine */ }
    el.innerHTML = '<div class="note">All photos are saved on this phone.</div>';
  });
}
