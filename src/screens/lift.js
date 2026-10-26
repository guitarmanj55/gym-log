// Lift progress: e1RM now, its trend chart (inline SVG), stats and the top-set history for one lift.
import { getAll } from '../db/db.js';
import { e1rm } from '../lib/e1rm.js';
import { prSetIds, fmtSet } from '../lib/history.js';
import { RANGES, rangeStart, topSetPoints, changeLabel, liftStats, chartGeometry, stallInfo, repBests } from '../lib/progress.js';
import { detailLine, musclesLine } from '../lib/exercise.js';
import { updateExercise } from '../db/workout.js';
import { detailFields, formAttrs, readDetails } from './exercise-form.js';
import { esc, fmtKg, toast } from '../ui.js';

const LIFT_KEY = 'gymlog_lift';
const RANGE_KEY = 'gymlog_range';
const CHEVRON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const dayMonth = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep');

export async function render(root) {
  const [exercises, sets] = await Promise.all([getAll('exercises'), getAll('sets')]);

  // Lifts with any sets: most recently trained day first, then the one with most top sets.
  const lastDay = new Map();
  const tops = new Map();
  for (const s of sets) {
    lastDay.set(s.exerciseId, Math.max(lastDay.get(s.exerciseId) || 0, new Date(s.completedAt).setHours(0, 0, 0, 0)));
    if (s.type === 'top') tops.set(s.exerciseId, (tops.get(s.exerciseId) || 0) + 1);
  }
  const lifts = exercises.filter((e) => lastDay.has(e.id))
    .sort((a, b) => lastDay.get(b.id) - lastDay.get(a.id) || (tops.get(b.id) || 0) - (tops.get(a.id) || 0));

  if (!lifts.length) {
    root.innerHTML = `
      <div class="screen">
        <h1 class="title">Lifts</h1>
        <div class="lead">Log a workout and each lift gets its e1RM trend here.</div>
      </div>`;
    return;
  }

  const fromHash = location.hash.split('/')[1];
  let lift = lifts.find((e) => e.id === fromHash) || lifts.find((e) => e.id === recall(LIFT_KEY)) || lifts[0];
  let range = RANGES.includes(recall(RANGE_KEY)) ? recall(RANGE_KEY) : '3M';
  let sheetOpen = false;
  let editing = false;

  function chart(points, name) {
    if (!points.length) return `<div class="chart-empty">No sets in this period.</div>`;
    const g = chartGeometry(points);
    const first = Math.round(points[0].e1rm);
    const last = Math.round(points.at(-1).e1rm);
    const label = points.length > 1
      ? `Estimated one-rep max for ${name} going from ${first} to ${last} kilograms`
      : `Estimated one-rep max for ${name}: ${last} kilograms`;
    return `
      <svg class="chart" viewBox="0 0 350 150" width="100%" role="img" aria-label="${esc(label)}">
        ${g.grid.map((l) => `
          <line x1="10" y1="${l.y}" x2="340" y2="${l.y}" class="c-grid"/>
          <text x="10" y="${l.y - 5}" class="c-text">${l.label}</text>`).join('')}
        ${g.trend ? `<line x1="${g.trend.x1}" y1="${g.trend.y1}" x2="${g.trend.x2}" y2="${g.trend.y2}" class="c-trend"/>` : ''}
        ${points.length > 1 ? `<polyline points="${g.line}" class="c-line"/>` : ''}
        ${points.length <= 12 ? g.dots.slice(0, -1).map((d) => `<circle cx="${d.x}" cy="${d.y}" r="2.5" class="c-dot"/>`).join('') : ''}
        <circle cx="${g.last.x}" cy="${g.last.y}" r="5" class="c-last"/>
        ${g.xLabels.map((l) => `<text x="${l.x}" y="146" text-anchor="${l.anchor}" class="c-text">${esc(l.label)}</text>`).join('')}
      </svg>`;
  }

  function draw() {
    remember(LIFT_KEY, lift.id);
    remember(RANGE_KEY, range);
    const liftSets = sets.filter((s) => s.exerciseId === lift.id);
    const allPoints = topSetPoints(liftSets);
    const start = rangeStart(range, Date.now());
    const points = allPoints.filter((p) => p.t >= start);
    const prs = prSetIds(liftSets);
    const latest = allPoints.at(-1);
    const change = changeLabel(points, range);
    const stats = liftStats(points);
    const stall = stallInfo(allPoints);
    const bw = lift.equipment === 'bodyweight';
    const bests = repBests(liftSets).filter((r) => r.set);

    root.innerHTML = `
      <div class="screen lift">
        <div class="lift-head">
          <h1 class="title">${esc(lift.name)}</h1>
          <button type="button" class="chip-btn change-lift" data-act="pick">Change lift ${CHEVRON}</button>
        </div>
        <button type="button" class="ex-details" data-act="edit" aria-label="Edit details for ${esc(lift.name)}">
          <span class="ex-line">${esc(detailLine(lift))}${musclesLine(lift) ? ` · <span class="muted">${esc(musclesLine(lift))}</span>` : ''}</span>
          ${lift.setup ? `<span class="ex-setup">${esc(lift.setup)}</span>` : ''}
          <span class="ex-edit">Edit</span>
        </button>
        ${latest ? `
          <div class="e1rm-row">
            <div>
              <div class="eyebrow">Estimated 1RM</div>
              <div class="e1rm-big"><span>${Math.round(latest.e1rm)}</span><span class="unit">${bw ? 'kg added' : 'kg'}</span></div>
            </div>
            ${change ? `<div class="change-pill${change.diff < 0 ? ' down' : ''}">${esc(change.text)}</div>` : ''}
          </div>
          ${stall?.stalled ? `<div class="banner warn"><div class="dot"></div><div><div class="banner-title">Stalled: no new best in ${stall.sessions} sessions</div><div class="banner-sub">Best e1RM is ${stall.best} kg. Try one more rep at the same weight, or a lighter week.</div></div></div>` : ''}
          <div class="stack">
            <div class="segmented" role="group" aria-label="Time range">
              ${RANGES.map((r) => `<button type="button" data-act="range" data-range="${r}" aria-pressed="${r === range}">${r}</button>`).join('')}
            </div>
            ${chart(points, lift.name)}
          </div>
          ${stats ? `
            <div class="tiles">
              <div class="tile"><div class="tile-label">Heaviest set</div><div class="tile-val">${bw ? `+${fmtKg(stats.heaviest.weightKg)} × ${stats.heaviest.reps}` : fmtSet(stats.heaviest)}</div></div>
              <div class="tile"><div class="tile-label">Reps at ${fmtKg(stats.atKg)} kg</div><div class="tile-val">${stats.repsAt}</div></div>
              <div class="tile"><div class="tile-label">Sets</div><div class="tile-val">${stats.count}</div></div>
            </div>
            ${bests.length ? `
            <div class="recent">
              <div class="eyebrow">Rep bests · all time</div>
              ${bests.map((r) => `
                <div class="th-row">
                  <div class="th-left">
                    <span class="th-date">${r.reps}+ reps</span>
                    <span class="th-set">${fmtSet(r.set, lift.equipment)}</span>
                  </div>
                  <div class="muted">${dayMonth(r.set.completedAt)}</div>
                </div>`).join('')}
            </div>` : ''}
            <div class="recent">
              <div class="eyebrow">Best set each workout</div>
              ${[...points].reverse().map((p) => `
                <div class="th-row">
                  <div class="th-left">
                    <span class="th-date">${dayMonth(p.t)}</span>
                    <span class="th-set">${fmtSet(p.set, lift.equipment)}</span>
                    ${prs.has(p.set.id) ? '<span class="pr">PR</span>' : ''}
                  </div>
                  <div class="muted">e1RM ${Math.round(e1rm(p.set.weightKg, p.set.reps))}</div>
                </div>`).join('')}
            </div>` : ''}`
        : '<div class="lead">No sets logged for this lift yet. Its trend starts with the first one.</div>'}
      </div>
      ${sheetOpen ? `
        <div class="sheet-backdrop" data-act="close"></div>
        <div class="sheet" role="dialog" aria-label="Choose a lift">
          <div class="sheet-head"><div class="eyebrow">Lifts</div><button type="button" class="text-btn" data-act="close">Done</button></div>
          <div class="sheet-list">
            ${lifts.map((e) => {
              const p = topSetPoints(sets.filter((s) => s.exerciseId === e.id)).at(-1);
              return `
                <div class="sheet-row${e.id === lift.id ? ' current' : ''}">
                  <button type="button" class="sheet-jump" data-act="choose" data-id="${e.id}">
                    <span class="sheet-name">${esc(e.name)}<small>${esc(detailLine(e))}</small></span>
                    <span class="muted">${p ? `e1RM ${Math.round(p.e1rm)}` : ''}</span>
                  </button>
                </div>`;
            }).join('')}
          </div>
        </div>` : ''}
      ${editing ? `
        <div class="sheet-backdrop" data-act="close"></div>
        <div class="sheet" role="dialog" aria-label="Exercise details">
          <div class="sheet-head"><div class="eyebrow">Exercise details</div><button type="button" class="text-btn" data-act="close">Cancel</button></div>
          <form ${formAttrs()}>
            ${detailFields(lift, { open: true })}
            <button type="submit" class="btn btn-primary">Save details</button>
          </form>
        </div>` : ''}`;
  }

  root.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'pick') sheetOpen = true;
    else if (act === 'edit') editing = true;
    else if (act === 'close') { sheetOpen = false; editing = false; }
    else if (act === 'range') range = el.dataset.range;
    else if (act === 'choose') {
      lift = lifts.find((e) => e.id === el.dataset.id) || lift;
      sheetOpen = false;
      history.replaceState(null, '', `#lift/${lift.id}`);
      window.scrollTo(0, 0);
    }
    draw();
  });

  root.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const saved = await updateExercise(lift, readDetails(ev.target, lift));
      lifts[lifts.indexOf(lift)] = saved;
      lift = saved;
      editing = false;
      toast('Details saved.');
      draw();
    } catch (err) {
      toast(err.message || String(err), 5000);
    }
  });

  draw();
}
