// History: finished workouts by week, with search. Tap a workout to see every set.
import { loadAll, discardSession } from '../db/workout.js';
import { groupLabel, shortDate, fmtDuration, fmtSet, headlineSet, prSetIds, matchesQuery } from '../lib/history.js';
import { esc, toast } from '../ui.js';

const SEARCH_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
const BADGE = { warmup: 'W', top: 'TOP', backoff: 'BO' };

let query = ''; // kept while switching tabs

export async function render(root) {
  let all = await loadAll();
  let prs = prSetIds(all.sets);
  const open = new Set();

  const sessionText = (s) => [shortDate(s.startedAt), ...(all.bySession.get(s.id) || []).map((it) => it.exercise?.name || '')].join(' ');

  function card(s) {
    const items = (all.bySession.get(s.id) || []).filter((it) => it.sets.length);
    const title = `${shortDate(s.startedAt)}${items[0] ? ` · ${items[0].exercise?.name}` : ''}`;
    const expanded = open.has(s.id);
    return `
      <div class="hist-card${expanded ? ' open' : ''}">
        <button type="button" class="hist-main" data-act="toggle" data-id="${s.id}" aria-expanded="${expanded}">
          <div class="hist-head"><div class="hist-title">${esc(title)}</div><div class="muted">${fmtDuration(s.endedAt - s.startedAt)}</div></div>
          ${items.map((it) => {
            const head = headlineSet(it.sets);
            const pr = it.sets.some((x) => prs.has(x.id));
            return `
              <div class="hist-row">
                <div class="hist-ex"><span>${esc(it.exercise?.name)}</span>${pr ? '<span class="pr">PR</span>' : ''}</div>
                <div class="hist-set">${head ? fmtSet(head, it.exercise?.equipment) : ''}</div>
              </div>
              ${expanded ? `<div class="hist-sets">${it.sets.map((x) => `<span><b>${BADGE[x.type]}</b> ${fmtSet(x, it.exercise?.equipment)}${x.toFailure ? ' F' : ''}</span>`).join('')}</div>` : ''}`;
          }).join('')}
        </button>
        ${expanded ? `<button type="button" class="text-btn danger" data-act="delete" data-id="${s.id}">Delete this workout</button>` : ''}
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

  root.innerHTML = `
    <div class="screen hist">
      <h1 class="title">History</h1>
      <div class="search">
        ${SEARCH_ICON}
        <input type="search" class="text-input" placeholder="Search lifts or sessions" aria-label="Search lifts or sessions" autocomplete="off" enterkeyhint="search" value="${esc(query)}">
      </div>
      <div class="hist-list">${list()}</div>
    </div>`;

  const listEl = root.querySelector('.hist-list');
  const redraw = () => { listEl.innerHTML = list(); };

  root.querySelector('input[type=search]').addEventListener('input', (ev) => {
    query = ev.target.value;
    redraw();
  });
  root.querySelector('input[type=search]').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') ev.target.blur();
  });

  listEl.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const id = el.dataset.id;
    if (el.dataset.act === 'toggle') {
      if (open.has(id)) open.delete(id); else open.add(id);
      redraw();
    } else if (el.dataset.act === 'delete') {
      const s = all.finished.find((x) => x.id === id);
      if (!confirm(`Delete the workout from ${shortDate(s.startedAt)}? This can't be undone.`)) return;
      await discardSession(id);
      all = await loadAll();
      prs = prSetIds(all.sets);
      toast('Workout deleted.');
      redraw();
    }
  });
}
