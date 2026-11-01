// Food: one tap logs a saved meal (calories are its running average), quick entries cover the rest.
// Calories are estimates from eating out, so totals show a range. A day with nothing logged is
// "not logged", never 0 kcal.
import { getAll, put, remove, getSettings } from '../db/db.js';
import { dateInputValue, shiftDays, parseAmount, relativeDay } from '../lib/history.js';
import {
  PORTIONS, mealAverage, entryFromMeal, quickEntry, dayTotal, recentAverage, mealsByUse, copyDay, fmtKcal,
} from '../lib/food.js';
import { esc, toast } from '../ui.js';

const noon = (day) => new Date(`${day}T12:00:00`).getTime();
const nextDay = (day, n) => dateInputValue(shiftDays(noon(day), n));
const num = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '');

export async function render(root) {
  const today = () => dateInputValue(Date.now());
  let day = today();
  let portion = 1;
  let form = null; // the meal being added or edited, or null
  let confirmId = null; // entry waiting for a second tap to remove
  let data = { meals: [], log: [], settings: {} };

  async function load() {
    const [meals, log, settings] = await Promise.all([getAll('meals'), getAll('foodLog'), getSettings()]);
    data = { meals, log, settings };
  }

  /** When an entry for `day` is made: right now for today, otherwise late morning of that day, in order. */
  const stamp = () => (day === today() ? Date.now() : noon(day) + data.log.filter((e) => e.day === day).length);

  function dayLabel() {
    if (day === today()) return 'Today';
    return relativeDay(noon(day), Date.now()).replace(/^./, (c) => c.toUpperCase());
  }

  function draw() {
    const { meals, log, settings } = data;
    const entries = log.filter((e) => e.day === day).sort((a, b) => a.at - b.at);
    const total = dayTotal(day, log, meals);
    const avg = recentAverage(log, today(), 7);
    const target = settings.calorieTarget;
    const proteinTarget = settings.proteinTarget;
    const list = mealsByUse(meals, log);
    const yesterday = nextDay(day, -1);
    const canCopy = !entries.length && log.some((e) => e.day === yesterday);

    const totalBlock = total.count ? `
      <div class="card">
        <div class="food-total">
          <span class="big-kcal">${fmtKcal(total, { showRange: false })}</span><span class="muted"> kcal</span>
        </div>
        ${total.high - total.low >= 100 ? `<div class="note">Estimated range ${total.low.toLocaleString('en-GB')}–${total.high.toLocaleString('en-GB')}</div>` : ''}
        ${target ? `
          <div class="muscle-track"><div class="muscle-bar" style="width:${Math.min(100, Math.round((total.kcal / target) * 100))}%"></div></div>
          <div class="note">${total.kcal <= target ? `${(target - total.kcal).toLocaleString('en-GB')} left of ${target.toLocaleString('en-GB')}` : `${(total.kcal - target).toLocaleString('en-GB')} over ${target.toLocaleString('en-GB')}`}</div>` : ''}
        ${total.protein ? `<div class="kv"><div>Protein</div><div>${total.protein} g${proteinTarget ? ` of ${proteinTarget}` : ''}</div></div>` : ''}
      </div>` : `
      <div class="card">
        <div class="lead">${day === today() ? 'Nothing logged yet today.' : 'Nothing logged this day.'} Tap a meal below.</div>
        ${canCopy ? '<button type="button" class="btn btn-secondary" data-act="copy">Same as yesterday</button>' : ''}
      </div>`;

    const entryRows = entries.map((e) => `
      <div class="food-row">
        <div class="food-main">
          <div class="food-name">${esc(e.name)}${e.portion !== 1 ? ` <span class="muted">· ${e.portion < 1 ? 'smaller' : 'bigger'}</span>` : ''}</div>
          ${e.mealId ? '' : '<button type="button" class="text-btn food-save" data-act="save-as-meal" data-id="' + esc(e.id) + '">Save as meal</button>'}
        </div>
        <div class="food-kcal">${e.kcal.toLocaleString('en-GB')}</div>
        <button type="button" class="text-btn${confirmId === e.id ? ' danger' : ''}" data-act="del" data-id="${esc(e.id)}" aria-label="Remove ${esc(e.name)}">${confirmId === e.id ? 'Remove?' : '×'}</button>
      </div>`).join('');

    const mealRows = list.map((m) => {
      const a = mealAverage(m, log);
      const range = a.high - a.low >= 100 ? ` (${a.low}–${a.high})` : '';
      return `
        <div class="food-row">
          <button type="button" class="food-meal" data-act="log" data-id="${esc(m.id)}">
            <span class="food-name">${esc(m.name)}</span>
            <span class="muted">${a.kcal} kcal${range}${a.n > 1 ? ` · avg of ${a.n}` : ''}</span>
          </button>
          <button type="button" class="text-btn" data-act="edit" data-id="${esc(m.id)}" aria-label="Edit ${esc(m.name)}">Edit</button>
        </div>`;
    }).join('');

    const field = (name, label, value, opts = {}) => `
      <div class="field">
        <label class="field-label" for="mf-${name}">${label}</label>
        <input class="text-input" id="mf-${name}" data-field="${name}" type="text" ${opts.text ? 'autocapitalize="sentences"' : 'inputmode="decimal"'} autocomplete="off" value="${esc(value)}"${opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : ''}>
      </div>`;

    const formBlock = form ? `
      <div class="card">
        <div class="eyebrow">${form.id ? 'Edit meal' : 'New meal'}</div>
        ${field('name', 'Name', form.name, { text: true, placeholder: 'Burger and chips, hotel bar' })}
        ${field('kcal', 'Typical calories', num(form.kcal))}
        <div class="tiles">
          ${field('low', 'Low <span class="muted">optional</span>', num(form.low))}
          ${field('high', 'High <span class="muted">optional</span>', num(form.high))}
        </div>
        ${field('protein', 'Protein, grams <span class="muted">optional</span>', num(form.protein))}
        <div class="note">Once you've logged it a few times, the average of what you logged is used instead of the typical figure.</div>
        <button type="button" class="btn btn-primary" data-act="save-meal">Save meal</button>
        <button type="button" class="btn btn-secondary" data-act="cancel-meal">Cancel</button>
        ${form.id ? '<button type="button" class="text-btn danger" data-act="hide-meal">Hide this meal</button>' : ''}
      </div>` : '';

    root.innerHTML = `
      <div class="screen food">
        <div>
          <a class="text-btn" href="#home">‹ Home</a>
          <h1 class="title">Food</h1>
        </div>
        <div class="day-nav">
          <button type="button" class="chip-btn" data-act="prev" aria-label="Previous day">‹</button>
          <div class="day-label">${esc(dayLabel())}</div>
          <button type="button" class="chip-btn" data-act="next" aria-label="Next day" ${day >= today() ? 'disabled' : ''}>›</button>
        </div>
        ${totalBlock}
        ${avg && avg.daysLogged > 1 ? `<div class="note">Last 7 days: about ${avg.kcal.toLocaleString('en-GB')} kcal a day, ${avg.daysLogged} days logged.</div>` : ''}
        ${entries.length ? `<div class="stack"><div class="eyebrow">Eaten</div><div class="list food-list">${entryRows}</div></div>` : ''}
        <div class="stack">
          <div class="eyebrow">Add a meal</div>
          <div class="segmented" role="group" aria-label="Portion">
            ${PORTIONS.map((p) => `<button type="button" data-act="portion" data-value="${p.value}" aria-pressed="${p.value === portion}">${p.label}</button>`).join('')}
          </div>
          ${list.length ? `<div class="list food-list">${mealRows}</div>` : '<div class="note">No saved meals yet. Add the places and dishes you eat most, then log them in one tap.</div>'}
          ${form ? '' : '<button type="button" class="btn btn-secondary" data-act="new-meal">+ New meal</button>'}
        </div>
        ${formBlock}
        <div class="stack">
          <div class="eyebrow">Quick entry</div>
          <div class="food-quick">
            <input class="text-input" data-field="q-name" type="text" autocomplete="off" placeholder="Lunch, pub" aria-label="What you ate">
            <input class="text-input" data-field="q-kcal" type="text" inputmode="decimal" autocomplete="off" placeholder="kcal" aria-label="Calories">
          </div>
          <button type="button" class="btn btn-secondary" data-act="quick">Add</button>
        </div>
      </div>`;
  }

  const val = (name) => root.querySelector(`[data-field="${name}"]`)?.value ?? '';

  async function logEntry(entry) {
    await put('foodLog', entry);
    confirmId = null;
    await load();
    draw();
  }

  const actions = {
    prev: () => { day = nextDay(day, -1); confirmId = null; draw(); },
    next: () => { if (day < today()) { day = nextDay(day, 1); confirmId = null; draw(); } },
    portion: (el) => { portion = Number(el.dataset.value); draw(); },
    log: async (el) => {
      const meal = data.meals.find((m) => m.id === el.dataset.id);
      if (!meal) return;
      await logEntry(entryFromMeal(meal, data.log, { portion, at: stamp(), day, id: crypto.randomUUID() }));
      toast(`Logged ${meal.name}`, 1500);
    },
    quick: async () => {
      const kcal = parseAmount(val('q-kcal'));
      if (kcal === null || kcal <= 0) { toast('Enter the calories'); return; }
      await logEntry(quickEntry({ id: crypto.randomUUID(), at: stamp(), day, name: val('q-name'), kcal }));
    },
    del: async (el) => {
      if (confirmId !== el.dataset.id) { confirmId = el.dataset.id; draw(); return; }
      await remove('foodLog', el.dataset.id);
      confirmId = null;
      await load();
      draw();
    },
    copy: async () => {
      const copies = copyDay(data.log, nextDay(day, -1), day, stamp(), () => crypto.randomUUID());
      for (const e of copies) await put('foodLog', e);
      await load();
      draw();
    },
    'new-meal': () => { form = { id: null, name: '', kcal: NaN, low: NaN, high: NaN, protein: NaN }; draw(); },
    edit: (el) => {
      const m = data.meals.find((x) => x.id === el.dataset.id);
      if (m) { form = { id: m.id, name: m.name, kcal: m.kcal, low: m.low ?? NaN, high: m.high ?? NaN, protein: m.protein ?? NaN }; draw(); }
    },
    'cancel-meal': () => { form = null; draw(); },
    'save-meal': async () => {
      const name = val('name').trim();
      const kcal = parseAmount(val('kcal'));
      if (!name) { toast('Give the meal a name'); return; }
      if (kcal === null || kcal <= 0) { toast('Enter its typical calories'); return; }
      const opt = (n) => { const v = parseAmount(val(n)); return v === null || v <= 0 ? undefined : v; };
      const old = data.meals.find((m) => m.id === form.id);
      const meal = { ...(old || { id: crypto.randomUUID(), createdAt: Date.now() }), name, kcal, low: opt('low'), high: opt('high'), protein: opt('protein') };
      for (const k of ['low', 'high', 'protein']) if (meal[k] === undefined) delete meal[k];
      await put('meals', meal);
      form = null;
      await load();
      draw();
    },
    'hide-meal': async () => {
      const m = data.meals.find((x) => x.id === form.id);
      if (m) await put('meals', { ...m, archived: true });
      form = null;
      await load();
      draw();
      toast('Meal hidden. Past entries are kept.', 2500);
    },
    'save-as-meal': async (el) => {
      const e = data.log.find((x) => x.id === el.dataset.id);
      if (!e) return;
      const meal = { id: crypto.randomUUID(), name: e.name, kcal: e.kcal, createdAt: Date.now() };
      await put('meals', meal);
      await put('foodLog', { ...e, mealId: meal.id });
      await load();
      draw();
      toast(`Saved ${meal.name}`, 1800);
    },
  };

  root.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || !actions[el.dataset.act]) return;
    try {
      await actions[el.dataset.act](el);
    } catch (err) {
      toast(err.message || String(err), 5000);
    }
  });

  await load();
  draw();
}
