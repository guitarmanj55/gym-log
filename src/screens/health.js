// Health: weight typed by hand for now. Steps, sleep, active energy and resting heart rate arrive with
// Apple Health sync; until then (and any time there's no watch data) they simply don't show.
import { getAll, get, put, remove } from '../db/db.js';
import { dateInputValue, parseAmount, shortDate } from '../lib/history.js';
import { latestWeight, weightRows, recentWeight, weightChange, withManualWeight, withoutWeight } from '../lib/health.js';
import { esc, toast } from '../ui.js';

const noon = (day) => new Date(`${day}T12:00:00`).getTime();

export async function render(root) {
  const today = () => dateInputValue(Date.now());
  let days = [];
  let confirmDay = null; // weight waiting for a second tap to remove

  async function load() { days = await getAll('health'); }

  function draw() {
    const now = today();
    const avg = recentWeight(days, now, 7);
    const change = weightChange(days, now, 7);
    const last = latestWeight(days);
    const rows = weightRows(days, 14);
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
        <div class="note">Steps, sleep, active energy and resting heart rate will show here once Apple Health sync is set up. Days without data stay blank, so the app works fine without a watch.</div>
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
}
