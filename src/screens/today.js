// Today: what's up next (or the workout in progress), this week's training days and recent top sets.
import { loadAll, startSession } from '../db/workout.js';
import { getSettings } from '../db/db.js';
import { e1rm } from '../lib/e1rm.js';
import { suggestNext } from '../lib/suggest.js';
import { lastSessionSets, topSetOf } from '../lib/plan.js';
import { weekStrip, shortDate, fmtSet, recentTopSets, nextTemplate } from '../lib/history.js';
import { unlockAudio } from '../device.js';
import { esc, longDate, toast, fmtKg, versionLine } from '../ui.js';

const timeOf = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function render(root) {
  const [all, settings] = await Promise.all([loadAll(), getSettings()]);
  const now = Date.now();
  const active = all.sessions.filter((s) => !s.endedAt).sort((a, b) => b.startedAt - a.startedAt)[0];
  const setsOfExercise = (id) => all.sets.filter((s) => s.exerciseId === id);

  let card;
  let templateId = null;
  if (active) {
    const items = all.bySession.get(active.id) || [];
    const logged = items.reduce((n, it) => n + it.sets.length, 0);
    card = `
      <div class="card">
        <div class="eyebrow">Workout in progress</div>
        <div class="up-next">${esc(items[0]?.exercise?.name || 'Workout')}</div>
        <div class="kv"><div>Started</div><div>${timeOf(active.startedAt)}</div></div>
        <div class="kv"><div>Logged</div><div>${plural(items.length, 'exercise')} · ${plural(logged, 'set')}</div></div>
        <a class="btn btn-primary" href="#active" data-act="go">Resume workout</a>
      </div>`;
  } else {
    templateId = nextTemplate(all.finished.map((s) => ({
      id: s.id, startedAt: s.startedAt, exerciseIds: (all.bySession.get(s.id) || []).map((it) => it.se.exerciseId),
    })));
    const template = all.finished.find((s) => s.id === templateId);
    const items = templateId ? all.bySession.get(templateId) || [] : [];
    const first = items[0];
    let rows = '';
    if (first) {
      const lastTop = topSetOf(lastSessionSets(setsOfExercise(first.se.exerciseId)));
      const suggestion = suggestNext(lastTop, settings.stepKg);
      if (lastTop) {
        rows = `
          <div class="kv"><div>Last top set</div><div>${first.exercise?.equipment === 'bodyweight' ? fmtSet(lastTop, 'bodyweight') : `${fmtKg(lastTop.weightKg)} kg × ${lastTop.reps}`}</div></div>
          ${suggestion ? `<div class="kv"><div>Suggested today</div><div class="accent">${fmtKg(suggestion.addWeight.weightKg)} kg</div></div>` : ''}`;
      }
    }
    card = `
      <div class="card">
        <div class="eyebrow">${template ? `Up next · like ${esc(shortDate(template.startedAt))}` : 'Get started'}</div>
        ${first
          ? `<div class="up-next">${esc(first.exercise?.name)}</div>
             ${rows}
             <div class="note-lg">${items.map((it) => esc(it.exercise?.name)).join(' · ')}</div>`
          : '<div class="lead">Start a workout, then add your first exercise. Next time it is prefilled from this one.</div>'}
        <button type="button" class="btn btn-primary" data-act="start">Start workout</button>
      </div>`;
  }

  const strip = weekStrip(all.sessions.filter((s) => s.endedAt || s === active).map((s) => s.startedAt), now);
  const recent = recentTopSets(all.sets, 5);

  root.innerHTML = `
    <div class="screen today">
      <div>
        <div class="date">${esc(longDate(now))}</div>
        <h1 class="title">Today</h1>
      </div>
      ${card}
      <div class="stack">
        <div class="eyebrow">This week</div>
        <div class="week" role="list" aria-label="Training days this week">
          ${strip.map((d) => `
            <div class="day${d.isToday ? ' today' : ''}" role="listitem" aria-label="${d.trained ? 'Trained' : 'Rest day'}${d.isToday ? ', today' : ''}">
              <div class="dot${d.trained ? ' on' : ''}"></div>
              <div class="day-label">${d.label}</div>
            </div>`).join('')}
        </div>
      </div>
      ${recent.length ? `
        <div class="recent">
          <div class="eyebrow">Recent top sets</div>
          ${recent.map((s) => {
            const ex = all.exercises.get(s.exerciseId);
            return `
              <a class="recent-row" href="#lift/${esc(s.exerciseId)}">
                <div class="recent-name">${esc(ex?.name || 'Exercise')}</div>
                <div class="recent-vals">${ex?.equipment === 'bodyweight' ? '' : `<span class="muted">e1RM ${Math.round(e1rm(s.weightKg, s.reps))}</span>`}<span>${fmtSet(s, ex?.equipment)}</span></div>
              </a>`;
          }).join('')}
        </div>` : ''}
      ${versionLine()}
    </div>`;

  root.querySelector('[data-act=go]')?.addEventListener('click', unlockAudio);
  root.querySelector('[data-act=start]')?.addEventListener('click', async () => {
    unlockAudio(); // the tap that starts a workout also readies the rest-timer sound
    try {
      await startSession(templateId);
      location.hash = '#active';
    } catch (err) {
      toast(err.message || String(err), 5000);
    }
  });
}
