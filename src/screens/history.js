// History: finished workouts by week, with search. Tap a workout to see every set.
import { loadAll, discardSession, updateSet, deleteSet, moveSession, renameSession } from '../db/workout.js';
import { searchText } from '../lib/exercise.js';
import { groupLabel, shortDate, fmtDuration, fmtSet, headlineSet, prSetIds, matchesQuery, dateInputValue, dayDiff, parseAmount } from '../lib/history.js';
import { esc, toast, fmtKg } from '../ui.js';

const SEARCH_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
const BADGE = { warmup: 'W', top: 'SET', backoff: 'BO' };

let query = ''; // kept while switching tabs

export async function render(root) {
  let all = await loadAll();
  let prs = prSetIds(all.sets);
  const open = new Set();
  let sheet = null; // { kind: 'set', id } or { kind: 'date', id }

  const sessionText = (s) => [shortDate(s.startedAt), s.name || '', ...(all.bySession.get(s.id) || []).map((it) => searchText(it.exercise))].join(' ');

  function card(s) {
    const items = (all.bySession.get(s.id) || []).filter((it) => it.sets.length);
    const label = s.name || items[0]?.exercise?.name;
    const title = `${shortDate(s.startedAt)}${label ? ` · ${label}` : ''}`;
    const expanded = open.has(s.id);
    return `
      <div class="hist-card${expanded ? ' open' : ''}">
        <button type="button" class="hist-main" data-act="toggle" data-id="${s.id}" aria-expanded="${expanded}">
          <div class="hist-head"><div class="hist-title">${esc(title)}</div><div class="muted">${fmtDuration(s.endedAt - s.startedAt)}</div></div>
          ${expanded ? '' : items.map((it) => {
            const head = headlineSet(it.sets);
            const pr = it.sets.some((x) => prs.has(x.id));
            return `
              <div class="hist-row">
                <div class="hist-ex"><span>${esc(it.exercise?.name)}</span>${pr ? '<span class="pr">PR</span>' : ''}</div>
                <div class="hist-set">${head ? fmtSet(head, it.exercise?.equipment) : ''}</div>
              </div>`;
          }).join('')}
        </button>
        ${expanded ? `<div class="hist-detail">${items.map((it) => `
          <div class="hist-row">
            <div class="hist-ex"><span>${esc(it.exercise?.name)}</span>${it.sets.some((x) => prs.has(x.id)) ? '<span class="pr">PR</span>' : ''}</div>
          </div>
          <div class="hist-sets">${it.sets.map((x) => `<button type="button" class="set-chip" data-act="edit-set" data-id="${x.id}" aria-label="Edit ${esc(BADGE[x.type])} ${esc(fmtSet(x, it.exercise?.equipment))}"><b>${BADGE[x.type]}</b> ${fmtSet(x, it.exercise?.equipment)}${x.toFailure ? ' F' : ''}</button>`).join('')}</div>`).join('')}
          <div class="note">Tap a set to fix or delete it.</div></div>` : ''}
        ${expanded ? `<div class="hist-actions">
          <a class="text-btn" href="#summary/${s.id}">Summary &amp; share</a>
          <button type="button" class="text-btn" data-act="edit-name" data-id="${s.id}">Rename</button>
          <button type="button" class="text-btn" data-act="edit-date" data-id="${s.id}">Change date</button>
          <button type="button" class="text-btn danger" data-act="delete" data-id="${s.id}">Delete this workout</button>
        </div>` : ''}
      </div>`;
  }

  function list() {
    const shown = all.finished.filter((s) => matchesQuery(sessionText(s), query));
    if (!all.finished.length) return '<div class="lead">No workouts yet. Finished workouts show up here.</div>';
    if (!shown.length) return `<div class="lead">Nothing matches “${esc(query)}”.</div>`;
    const now = Date.now();
    const groups = [];
    for (const s of shown) {
      const label = groupLabel(s.startedAt, now);
      if (groups.at(-1)?.label !== label) groups.push({ label, sessions: [] });
      groups.at(-1).sessions.push(s);
    }
    return groups.map((g) => `
      <div class="stack">
        <div class="eyebrow">${esc(g.label)}</div>
        ${g.sessions.map(card).join('')}
      </div>`).join('');
  }

  const sheetHtml = () => {
    if (!sheet) return '';
    if (sheet.kind === 'name') {
      const s = all.finished.find((x) => x.id === sheet.id);
      return `
        <div class="sheet-backdrop" data-act="close"></div>
        <div class="sheet" role="dialog" aria-label="Rename workout">
          <div class="sheet-head"><div class="eyebrow">Rename workout</div><button type="button" class="text-btn" data-act="close">Cancel</button></div>
          <label class="field"><span class="field-label">Title</span>
            <input class="text-input" name="title" type="text" maxlength="60" autocomplete="off" enterkeyhint="done" value="${esc(s.name || '')}" placeholder="${esc((all.bySession.get(s.id) || [])[0]?.exercise?.name || 'Workout')}"></label>
          <div class="note">Leave it empty to use the first lift's name.</div>
          <button type="button" class="btn btn-primary" data-act="save-name">Save title</button>
        </div>`;
    }
    if (sheet.kind === 'date') {
      const s = all.finished.find((x) => x.id === sheet.id);
      return `
        <div class="sheet-backdrop" data-act="close"></div>
        <div class="sheet" role="dialog" aria-label="Change date">
          <div class="sheet-head"><div class="eyebrow">Change date</div><button type="button" class="text-btn" data-act="close">Cancel</button></div>
          <label class="field"><span class="field-label">Workout day</span>
            <input class="text-input" type="date" name="day" value="${dateInputValue(s.startedAt)}" max="${dateInputValue(Date.now())}"></label>
          <button type="button" class="btn btn-primary" data-act="save-date">Save date</button>
        </div>`;
    }
    const x = all.sets.find((y) => y.id === sheet.id);
    const ex = all.exercises.get(x.exerciseId);
    return `
      <div class="sheet-backdrop" data-act="close"></div>
      <div class="sheet" role="dialog" aria-label="Edit set">
        <div class="sheet-head"><div class="eyebrow">${esc(ex?.name)} · ${esc(BADGE[x.type])}</div><button type="button" class="text-btn" data-act="close">Cancel</button></div>
        <label class="field"><span class="field-label">KG</span>
          <input class="text-input" name="weightKg" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="${fmtKg(x.weightKg)}"></label>
        <label class="field"><span class="field-label">REPS</span>
          <input class="text-input" name="reps" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done" value="${x.reps}"></label>
        ${x.type === 'warmup' ? '' : `<label class="check-row"><input type="checkbox" name="toFailure"${x.toFailure ? ' checked' : ''}> To failure</label>`}
        <button type="button" class="btn btn-primary" data-act="save-set">Save changes</button>
        <button type="button" class="text-btn danger" data-act="delete-set">Delete this set</button>
      </div>`;
  };

  root.innerHTML = `
    <div class="screen hist">
      <h1 class="title">History</h1>
      <div class="search">
        ${SEARCH_ICON}
        <input type="search" class="text-input" placeholder="Search lifts or sessions" aria-label="Search lifts or sessions" autocomplete="off" enterkeyhint="search" value="${esc(query)}">
      </div>
      <div class="hist-list">${list()}</div>
      <div class="hist-sheet"></div>
    </div>`;

  const listEl = root.querySelector('.hist-list');
  const sheetEl = root.querySelector('.hist-sheet');
  const redraw = () => { listEl.innerHTML = list(); sheetEl.innerHTML = sheetHtml(); };
  const reload = async () => {
    all = await loadAll();
    prs = prSetIds(all.sets);
    sheet = null;
    redraw();
  };
  const field = (name) => sheetEl.querySelector(`[name=${name}]`);

  root.querySelector('input[type=search]').addEventListener('input', (ev) => {
    query = ev.target.value;
    redraw();
  });
  root.querySelector('input[type=search]').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') ev.target.blur();
  });

  root.querySelector('.hist').addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const id = el.dataset.id;
    const act = el.dataset.act;
    try {
      if (act === 'toggle') {
        if (open.has(id)) open.delete(id); else open.add(id);
        redraw();
      } else if (act === 'delete') {
        const s = all.finished.find((x) => x.id === id);
        if (!confirm(`Delete the workout from ${shortDate(s.startedAt)}? This can't be undone.`)) return;
        await discardSession(id);
        await reload();
        toast('Workout deleted.');
      } else if (act === 'edit-set') {
        sheet = { kind: 'set', id };
        redraw();
      } else if (act === 'edit-name') {
        sheet = { kind: 'name', id };
        redraw();
      } else if (act === 'save-name') {
        await renameSession(sheet.id, field('title').value);
        await reload();
        toast('Title saved.');
      } else if (act === 'edit-date') {
        sheet = { kind: 'date', id };
        redraw();
      } else if (act === 'close') {
        sheet = null;
        redraw();
      } else if (act === 'save-set') {
        const x = all.sets.find((y) => y.id === sheet.id);
        const weightKg = parseAmount(field('weightKg').value);
        const reps = parseAmount(field('reps').value);
        if (weightKg === null || reps === null || !Number.isInteger(reps) || reps < 1 || reps > 999) { toast('Enter a weight and whole reps (1 or more).'); return; }
        await updateSet(x, { weightKg, reps, toFailure: field('toFailure')?.checked });
        await reload();
        toast('Set updated.');
      } else if (act === 'delete-set') {
        const x = all.sets.find((y) => y.id === sheet.id);
        if (!confirm(`Delete this set (${fmtKg(x.weightKg)} kg × ${x.reps})?`)) return;
        await deleteSet(x.id);
        await reload();
        toast('Set deleted.');
      } else if (act === 'save-date') {
        const s = all.finished.find((x) => x.id === sheet.id);
        const days = dayDiff(s.startedAt, field('day').value);
        if (days === null) { toast('Pick a date.'); return; }
        if (field('day').value > dateInputValue(Date.now())) { toast("A workout can't be in the future."); return; }
        await moveSession(s.id, days);
        await reload();
        toast(days ? 'Date changed.' : 'Date unchanged.');
      }
    } catch (err) {
      toast(err.message || String(err), 5000);
    }
  });
}
