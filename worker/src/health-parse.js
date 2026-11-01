// Turns what an iPhone sends into per-day health records. Pure: no Worker or DOM globals.
// Two shapes are accepted:
//   1. Simple, from an iOS Shortcut:  { date: '2026-11-01', weightKg, steps, sleepHours | sleepMin, activeKcal, restingHr }
//      (or { days: [ ...those ] }); any field may be left out.
//   2. Health Auto Export's JSON:     { data: { metrics: [ { name, units, data: [ { date, qty, ... } ] } ] } }
// Anything unknown, malformed or out of range is skipped, never stored as zero.

const LB_TO_KG = 0.45359237;
const KJ_TO_KCAL = 1 / 4.184;
const DAY = 24 * 60 * 60 * 1000;

// field -> [min, max] a believable day can hold
const RANGES = {
  weightKg: [20, 400],
  steps: [0, 200000],
  sleepMin: [0, 1440],
  activeKcal: [0, 20000],
  restingHr: [20, 250],
};

// Numbers may arrive as text, and a Shortcut in a UK locale can write "84,2".
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(',', '.')) : NaN);

function clean(field, value) {
  const v = num(value);
  if (!Number.isFinite(v)) return undefined;
  const [lo, hi] = RANGES[field];
  if (v < lo || v > hi) return undefined;
  return field === 'weightKg' ? Math.round(v * 10) / 10 : Math.round(v);
}

/** 'YYYY-MM-DD' from "2026-11-01", "2026-11-01 07:30:00 +0000" or an ISO string; null if it isn't a real date. */
export function dayOf(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : null;
}

function simpleDay(o) {
  const day = dayOf(o?.date);
  if (!day) return null;
  const sleepMin = Number.isFinite(num(o.sleepMin)) ? num(o.sleepMin) : Number.isFinite(num(o.sleepHours)) ? num(o.sleepHours) * 60 : NaN;
  return { day, fields: { weightKg: o.weightKg, steps: o.steps, sleepMin, activeKcal: o.activeKcal, restingHr: o.restingHr } };
}

/** Metric name (Health Auto Export spells them in snake_case) -> our field. */
const HAE_FIELD = {
  weight_body_mass: 'weightKg',
  step_count: 'steps',
  active_energy: 'activeKcal',
  resting_heart_rate: 'restingHr',
  sleep_analysis: 'sleepMin',
};

function haeValue(field, units, sample) {
  const u = String(units || '').toLowerCase();
  if (field === 'weightKg') {
    const q = num(sample.qty);
    return /^(lb|lbs|pound)/.test(u) ? q * LB_TO_KG : /^st/.test(u) ? q * 6.35029318 : q;
  }
  if (field === 'activeKcal') {
    const q = num(sample.qty);
    return /kj/.test(u) ? q * KJ_TO_KCAL : q;
  }
  if (field === 'sleepMin') {
    // A night's sleep, in hours unless the export says minutes.
    const q = num(sample.totalSleep ?? sample.asleep ?? sample.qty);
    return /^min/.test(u) ? q : q * 60;
  }
  return num(sample.qty);
}

/**
 * Samples add up for steps and active energy, sleep adds up per day, and weight and resting heart rate
 * take the latest reading of the day.
 */
const COMBINE = { steps: 'sum', activeKcal: 'sum', sleepMin: 'sum', weightKg: 'last', restingHr: 'last' };

function fromHae(body) {
  const metrics = body?.data?.metrics;
  if (!Array.isArray(metrics)) return [];
  const perDay = new Map(); // day -> field -> { sum, last, lastAt }
  for (const metric of metrics) {
    const field = HAE_FIELD[String(metric?.name || '').toLowerCase()];
    if (!field || !Array.isArray(metric.data)) continue;
    for (const sample of metric.data) {
      const day = dayOf(sample?.date);
      const value = haeValue(field, metric.units, sample || {});
      if (!day || !Number.isFinite(value)) continue;
      const slot = perDay.get(day) || {};
      const cur = slot[field] || { sum: 0, last: NaN, lastAt: '' };
      const at = String(sample.date);
      cur.sum += value;
      if (at >= cur.lastAt) { cur.last = value; cur.lastAt = at; }
      slot[field] = cur;
      perDay.set(day, slot);
    }
  }
  return [...perDay].map(([day, slot]) => ({
    day,
    fields: Object.fromEntries(Object.entries(slot).map(([f, c]) => [f, COMBINE[f] === 'sum' ? c.sum : c.last])),
  }));
}

/**
 * @param {unknown} body  the parsed JSON a phone sent
 * @param {number} now    epoch ms; days more than a day ahead are refused (clock and time-zone slack)
 * @returns {{days: Record<string, Record<string, number>>, skipped: number}}
 *   `days` holds only the fields that passed; `skipped` counts days or values that were dropped.
 */
export function parseHealth(body, now = Date.now()) {
  const rows = [];
  if (Array.isArray(body?.days)) for (const d of body.days) rows.push(simpleDay(d));
  else if (body?.data?.metrics) rows.push(...fromHae(body));
  else rows.push(simpleDay(body));

  const days = {};
  let skipped = 0;
  const latest = now + DAY;
  for (const row of rows) {
    if (!row || Date.parse(`${row.day}T00:00:00Z`) > latest) { skipped++; continue; }
    const kept = {};
    for (const [field, value] of Object.entries(row.fields)) {
      if (value === undefined || value === null || (typeof value === 'number' && Number.isNaN(value))) continue;
      const v = clean(field, value);
      if (v === undefined) { skipped++; continue; }
      kept[field] = v;
    }
    if (Object.keys(kept).length) days[row.day] = { ...(days[row.day] || {}), ...kept };
  }
  return { days, skipped };
}

/** Merges new values over what is stored for a day: fields not sent stay as they were. */
export function mergeDay(stored, incoming, at) {
  return { ...(stored || {}), ...incoming, at };
}
