// Home: the landing page. One card per section (Gym, Food, Health), each with a one-line status.
// A section with nothing logged says so; it never shows "0".
import { loadAll } from '../db/workout.js';
import { getSettings, getAll } from '../db/db.js';
import { dateInputValue, relativeDay } from '../lib/history.js';
import { nextSplit, splitLabel } from '../lib/profile.js';
import { dayTotal, fmtKcal } from '../lib/food.js';
import { latestWeight, recentWeight } from '../lib/health.js';
import { esc, longDate, versionLine } from '../ui.js';

export async function render(root) {
  const [all, settings, meals, foodLog, health] = await Promise.all([
    loadAll(), getSettings(), getAll('meals'), getAll('foodLog'), getAll('health'),
  ]);
  const now = Date.now();
  const today = dateInputValue(now);
  const active = all.sessions.filter((s) => !s.endedAt).sort((a, b) => b.startedAt - a.startedAt)[0];

  const next = active ? null : nextSplit(settings.splits, all.sets, all.exercises, now);
  const lastWorkout = all.finished[0];
  const gym = active ? 'Workout in progress'
    : next ? `Train next: ${splitLabel(next.split)}`
    : lastWorkout ? `Last workout ${relativeDay(lastWorkout.startedAt, now)}`
    : 'Start your first workout';

  const eaten = dayTotal(today, foodLog, meals);
  const target = settings.calorieTarget;
  const foodTitle = eaten.count ? `${fmtKcal(eaten, { showRange: false })} kcal today` : 'Nothing logged today';
  const foodSub = eaten.count && target
    ? (eaten.kcal <= target ? `${(target - eaten.kcal).toLocaleString('en-GB')} left of ${target.toLocaleString('en-GB')}` : `${(eaten.kcal - target).toLocaleString('en-GB')} over ${target.toLocaleString('en-GB')}`)
    : 'Meals and calories';

  const avg = recentWeight(health, today, 7);
  const last = latestWeight(health);
  const healthTitle = avg ? `${avg.kg} kg this week` : last ? `${last.kg} kg, ${relativeDay(new Date(`${last.day}T12:00:00`).getTime(), now)}` : 'No weight logged yet';

  root.innerHTML = `
    <div class="screen home">
      <div>
        <div class="date">${settings.name ? `${esc(settings.name)} · ` : ''}${esc(longDate(now))}</div>
        <h1 class="title">Home</h1>
        ${settings.goal ? `<div class="note">Goal: ${esc(settings.goal)}</div>` : ''}
      </div>
      ${active ? `
      <a class="banner ok" href="#active">
        <div class="dot"></div>
        <div>
          <div class="banner-title">Workout in progress</div>
          <div class="banner-sub">${esc(active.name || 'Workout')} · tap to resume</div>
        </div>
      </a>` : ''}
      <a class="home-card" href="#today">
        <div class="home-name">Gym</div>
        <div class="home-status">${esc(gym)}</div>
        <div class="home-sub">Workouts, lifts, history, library</div>
      </a>
      <a class="home-card" href="#food">
        <div class="home-name">Food</div>
        <div class="home-status">${esc(foodTitle)}</div>
        <div class="home-sub">${esc(foodSub)}</div>
      </a>
      <a class="home-card" href="#health">
        <div class="home-name">Health</div>
        <div class="home-status">${esc(healthTitle)}</div>
        <div class="home-sub">Weight · steps, sleep and more with Apple Health</div>
      </a>
      <a class="text-btn" href="#profile">Profile and backup</a>
      ${versionLine()}
    </div>`;
}
