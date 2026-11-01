// Health: weight typed by hand for now. Steps, sleep, active energy and resting heart rate arrive with
// Apple Health sync; until then (and any time there's no watch data) they simply don't show.
import { getAll, get, put, remove } from '../db/db.js';
import { dateInputValue, parseAmount, shortDate, relativeDay } from '../lib/history.js';
import {
  latestWeight, weightRows, recentWeight, weightChange, withManualWeight, withoutWeight, latestMetric, fmtSleep,
} from '../lib/health.js';
import { getCloud, pullHealth } from '../cloud.js';
import { esc, toast } from '../ui.js';

const noon = (day) => new Date(`${day}T12:00:00`).getTime();

// The Apple Health numbers, each shown only when there is a reading in the last two weeks.
const METRIC_TILES = [
  ['steps', 'Steps', (v) => Math.round(v).toLocaleString('en-GB')],
  ['sleepMin', 'Sleep', fmtSleep],
  ['activeKcal', 'Active energy', (v) => `${Math.round(v).toLocaleString('en-GB')} kcal`],
  ['restingHr', 'Resting heart rate', (v) => `${Math.round(v)} bpm`],
];

export async function render(root) {
  const today = () => dateInputValue(Date.now());
  let days = [];
  let confirmDay = null; // weight waiting for a second tap to remove
  let showDetails = false; // the sync readout: for checking what the phone's Shortcut sent

  async function load() { days = await getAll('health'); }

  function draw() {
    const now = today();
    const avg = recentWeight(days, now, 7);
    const change = weightChange(days, now, 7);
    const last = latestWeight(days);
    const rows = weightRows(days, 14);
    const tiles = METRIC_TILES.map(([key, label, fmt]) => {
      const m = latestMetric(days, key, now, 14);
      return m ? `<div class="tile"><div class="tile-label">${label} · ${esc(relativeDay(noon(m.day), Date.now()))}</div><div class="tile-val">${esc(fmt(m.value))}</div></div>` : '';
    }).filter(Boolean);
    const cloud = getCloud();
    const debug = showDetails;
    const syncLine = !cloud.key
      ? 'Apple Health sync uses the backup key. Turn on automatic backup in Profile, then set up the sync.'
      : cloud.healthError ? `Sync problem: ${cloud.healthError}`
      : cloud.healthAt ? `Last checked for Apple Health numbers ${new Date(cloud.healthAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`
      : 'Not checked yet.';
    const changeText = change === null ? '' : change === 0 ? 'No change from the week before' : `${change > 0 ? '+' : '−'}${Math.abs(change)} kg on the week before`;

    root.innerHTML = `
      <div class="screen health">
        <div>
          <a class="text-btn" href="#home">‹ Home</a>
          <h1 class="title">Health</h1>
        </div>
        <div class="card">
          <div class="eyebrow">Weight</div>
          ${avg ? `
            <div class="food-total"><span class="big-kcal">${avg.kg}</span><span class="muted"> kg · ${avg.daysLogged === 1 ? 'last 7 days' : `average of ${avg.daysLogged} weigh-ins this week`}</span></div>
            ${changeText ? `<div class="note">${changeText}</div>` : ''}`
          : last ? `<div class="lead">Last weighed ${esc(shortDate(noon(last.day)))}: ${last.kg} kg. Nothing in the last 7 days.</div>`
          : '<div class="lead">No weight logged yet.</div>'}
          <div class="food-quick">
            <input class="text-input" data-field="date" type="date" max="${now}" value="${now}" aria-label="Date">
            <input class="text-input" data-field="kg" type="text" inputmode="decimal" autocomplete="off" placeholder="kg" aria-label="Weight in kilograms">
          </div>
          <button type="button" class="btn btn-primary" data-act="save">Save weight</button>
        </div>
        ${tiles.length ? `<div class="tiles tiles-wrap">${tiles.join('')}</div>` : ''}
        ${rows.length ? `
        <div class="stack">
          <div class="eyebrow">Recent weigh-ins</div>
          <div class="list food-list">
            ${rows.map((r) => `
              <div class="food-row">
                <div class="food-main"><div class="food-name">${esc(shortDate(noon(r.day)))}</div></div>
                <div class="food-kcal">${r.kg}</div>
                <button type="button" class="text-btn${confirmDay === r.day ? ' danger' : ''}" data-act="del" data-day="${esc(r.day)}" aria-label="Remove weight for ${esc(r.day)}">${confirmDay === r.day ? 'Remove?' : '×'}</button>
              </div>`).join('')}
          </div>
        </div>` : ''}
        <div class="note">${tiles.length ? 'Showing the latest reading of each in the last two weeks. ' : 'Steps, sleep, active energy and resting heart rate show here once Apple Health sync is set up. '}Days without data stay blank, so the app works fine without a watch.</div>
        <div class="note">${esc(syncLine)}</div>
        <button type="button" class="text-btn" data-act="details">${showDetails ? 'Hide' : 'Show'} sync details</button>
        ${debug ? `<pre class="note debug">${esc(JSON.stringify({ ...cloud, key: cloud.key ? 'set' : null, imported: days.filter((d) => Object.values(d.src || {}).includes('import')).length, days: days.length, newestDay: [...days].sort((a, b) => b.id.localeCompare(a.id))[0] || null }, null, 1))}</pre>` : ''}
      </div>`;
  }

  root.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    try {
      if (el.dataset.act === 'save') {
        const kg = parseAmount(root.querySelector('[data-field=kg]').value);
        const day = root.querySelector('[data-field=date]').value;
        if (kg === null || kg < 20 || kg > 400) { toast('Enter your weight in kg'); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today()) { toast('Pick today or an earlier day'); return; }
        await put('health', withManualWeight(await get('health', day), day, Math.round(kg * 10) / 10));
        await load();
        draw();
        toast('Weight saved', 1500);
      } else if (el.dataset.act === 'details') {
        showDetails = !showDetails;
        draw();
      } else if (el.dataset.act === 'del') {
        if (confirmDay !== el.dataset.day) { confirmDay = el.dataset.day; draw(); return; }
        const kept = withoutWeight(await get('health', el.dataset.day));
        if (kept) await put('health', kept); else await remove('health', el.dataset.day);
        confirmDay = null;
        await load();
        draw();
      }
    } catch (err) {
      toast(err.message || String(err), 5000);
    }
  });

  await load();
  draw();
  // Fetch whatever the phone has pushed since; redraw only if something changed and nobody is typing.
  const idle = () => !root.querySelector('[data-field=kg]')?.value;
  pullHealth().then(async (changed) => {
    if (changed === 'off') return;
    if (changed > 0) await load();
    if (idle()) draw(); // also refreshes the "last checked" line
  }).catch(() => { if (idle()) draw(); }); // the error shows in the sync line
}
