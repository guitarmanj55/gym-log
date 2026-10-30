// All-lifts overview for the Lifts tab: one weekly line across every lift, and the lifts ranked under it.
import { RANGES, topSetPoints, chartGeometry } from '../lib/progress.js';
import { overview, METRICS } from '../lib/overview.js';
import { esc } from '../ui.js';

const LABELS = { progress: 'Progress', effort: 'Effort' };
const SIGN = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;

function chart(series, metric) {
  if (series.length < 2) return `<div class="chart-empty">Not enough weeks of data in this period.</div>`;
  const g = chartGeometry(series);
  const suffix = metric === 'effort' ? '%' : '';
  const label = metric === 'effort'
    ? `Average effort across all lifts, from ${Math.round(series[0].e1rm)} to ${Math.round(series.at(-1).e1rm)} percent of best`
    : `Strength index across all lifts, from ${Math.round(series[0].e1rm)} to ${Math.round(series.at(-1).e1rm)}`;
  return `
    <svg class="chart" viewBox="0 0 350 150" width="100%" role="img" aria-label="${esc(label)}">
      ${g.grid.map((l) => `
        <line x1="10" y1="${l.y}" x2="340" y2="${l.y}" class="c-grid"/>
        <text x="10" y="${l.y - 5}" class="c-text">${l.label}${suffix}</text>`).join('')}
      <polyline points="${g.line}" class="c-line"/>
      <circle cx="${g.last.x}" cy="${g.last.y}" r="5" class="c-last"/>
      ${g.xLabels.map((l) => `<text x="${l.x}" y="146" text-anchor="${l.anchor}" class="c-text">${esc(l.label)}</text>`).join('')}
    </svg>`;
}

/** HTML for the All lifts view. Bodyweight lifts are left out: their e1RM is added kg. */
export function overviewHtml({ lifts, sets, range, metric }) {
  const input = lifts.filter((e) => e.equipment !== 'bodyweight')
    .map((e) => ({ id: e.id, name: e.name, points: topSetPoints(sets.filter((s) => s.exerciseId === e.id)) }));
  const o = overview(input, range, Date.now(), metric);
  const progress = metric === 'progress';
  const down = progress && o.headline < 0;

  return `
    <div class="segmented" role="group" aria-label="Measure">
      ${METRICS.map((m) => `<button type="button" data-act="metric" data-metric="${m}" aria-pressed="${m === metric}">${LABELS[m]}</button>`).join('')}
    </div>
    <div class="lead">${progress
      ? 'Every lift starts at 100 at the beginning of the period. The line is the weekly average, so a lift in the gym counts the same as a curl.'
      : 'How close each session\'s top set was to that lift\'s all-time best e1RM, averaged by week. 100% is a PR day.'}</div>
    ${o.headline === null ? `
      <div class="chart-empty">${progress ? 'Needs lifts with 2+ sessions in this period.' : 'No sessions in this period.'}</div>` : `
      <div class="e1rm-row">
        <div>
          <div class="eyebrow">${progress ? 'Strength index' : 'Average effort'}</div>
          <div class="e1rm-big"><span>${progress ? SIGN(o.headline) : `${Math.round(o.headline)}%`}</span><span class="unit">${progress ? 'this period' : 'of best'}</span></div>
        </div>
        ${progress ? `<div class="change-pill${down ? ' down' : ''}">${o.rows.filter((r) => r.pct > 0).length} of ${o.rows.length} lifts up</div>` : ''}
      </div>`}
    <div class="stack">
      <div class="segmented" role="group" aria-label="Time range">
        ${RANGES.map((r) => `<button type="button" data-act="range" data-range="${r}" aria-pressed="${r === range}">${r}</button>`).join('')}
      </div>
      ${o.headline === null ? '' : chart(o.series, metric)}
    </div>
    ${o.rows.length ? `
      <div class="recent">
        <div class="eyebrow">${progress ? 'Change by lift' : 'Average effort by lift'}</div>
        ${o.rows.map((r) => `
          <button type="button" class="th-row ov-row" data-act="open" data-id="${esc(r.id)}">
            <span class="ov-name">
              <span class="th-set">${esc(r.name)}${r.stalled ? ' <span class="ov-stall">stalled</span>' : ''}</span>
              <span class="muted">${progress ? `${r.sessions} sessions · e1RM ${r.from} → ${r.to}` : `${r.sessions} sessions · best ${r.best}`}</span>
            </span>
            <span class="change-pill ov-pill${progress && r.pct < 0 ? ' down' : ''}">${progress ? SIGN(r.pct) : `${Math.round(r.pct)}%`}</span>
          </button>`).join('')}
      </div>` : ''}
    ${o.hidden ? `<div class="muted ov-note">${o.hidden} ${o.hidden === 1 ? 'lift' : 'lifts'} left out: ${progress ? 'fewer than 2 sessions' : 'no sessions'} in this period.</div>` : ''}`;
}
