// Today: your saved workouts (tap one to start it), the workout in progress, this week's training
// days, sets per muscle group and recent sets.
import { loadAll, startSession, listWorkouts } from '../db/workout.js';
import { getSettings } from '../db/db.js';
import { e1rm } from '../lib/e1rm.js';
import { weekStrip, relativeDay, fmtSet, recentTopSets, weeklyCounts } from '../lib/history.js';
import { backupStatus } from '../lib/backup.js';
import { weeklyMuscleSets, fmtSetCount, staleLifts, stalledLifts } from '../lib/feedback.js';
import { nextSplit, splitLabel, upNextWorkout } from '../lib/profile.js';
import { groupLabel } from '../lib/library.js';
import { unlockAudio } from '../device.js';
import { getCloud } from '../cloud.js';
import { esc, longDate, toast, trainHead, versionLine } from '../ui.js';

const timeOf = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function render(root) {
  const [all, settings, workouts] = await Promise.all([loadAll(), getSettings(), listWorkouts()]);
  const now = Date.now();
  const active = all.sessions.filter((s) => !s.endedAt).sort((a, b) => b.startedAt - a.startedAt)[0];

  let resume = '';
  if (active) {
    const items = all.bySession.get(active.id) || [];
    const logged = items.reduce((n, it) => n + it.sets.length, 0);
    resume = `
      <div class="card">
        <div class="eyebrow">Workout in progress</div>
        <div class="up-next">${esc(active.name || items[0]?.exercise?.name || 'Workout')}</div>
        <div class="kv"><div>Started</div><div>${timeOf(active.startedAt)}</div></div>
        <div class="kv"><div>Logged</div><div>${plural(items.length, 'exercise')} · ${plural(logged, 'set')}</div></div>
        <a class="btn btn-primary" href="#active" data-act="go">Resume workout</a>
      </div>`;
  }

  const lastDone = new Map(); // workoutId -> startedAt of the latest finished session (finished is newest first)
  for (const s of all.finished) if (s.workoutId && !lastDone.has(s.workoutId)) lastDone.set(s.workoutId, s.startedAt);

  const lastText = (w) => (lastDone.has(w.id) ? `Last done ${relativeDay(lastDone.get(w.id), now)}` : 'Not done yet');

  // One workout gets the big card and the only lime button; the rest are quiet rows.
  const next = active ? null : nextSplit(settings.splits, all.sets, all.exercises, now);
  const upNext = active ? null : upNextWorkout(workouts, lastDone, next?.split);
  const why = next && upNext && splitLabel(next.split).toLowerCase().replace(/\s/g, '') === upNext.name.toLowerCase().replace(/\s/g, '')
    ? (next.days === null ? `No ${groupLabel(next.split.main).toLowerCase()} logged yet` : `${groupLabel(next.split.main)} last trained ${next.days === 1 ? 'yesterday' : `${next.days} days ago`}`)
    : lastText(upNext || {});
  const upNextCard = upNext ? (() => {
    const names = upNext.exerciseIds.map((id) => all.exercises.get(id)?.name).filter(Boolean);
    return `
      <div class="card up-card">
        <div class="wo-head">
          <div class="note">Up next · ${esc(why)}</div>
          <a class="text-btn" href="#workout/${esc(upNext.id)}" aria-label="Edit ${esc(upNext.name)}">Edit</a>
        </div>
        <div class="wo-name">${esc(upNext.name)}</div>
        <div class="wo-ex">${names.length ? esc(names.join(', ')) : 'No exercises yet'}</div>
        <button type="button" class="btn btn-primary" data-act="start" data-id="${esc(upNext.id)}">Start workout</button>
      </div>`;
  })() : '';

  const others = workouts.filter((w) => w !== upNext);
  const otherRows = others.map((w) => `
    <div class="wo-line">
      <a class="wo-line-main" href="#workout/${esc(w.id)}" aria-label="Edit ${esc(w.name)}">
        <span class="wo-line-name">${esc(w.name)}</span>
        <small>${esc(lastText(w))}</small>
      </a>
      ${active ? '' : `<button type="button" class="chip-btn" data-act="start" data-id="${esc(w.id)}">Start</button>`}
    </div>`).join('');

  const workoutBlock = `
    ${upNextCard}
    <div class="stack">
      ${others.length ? `<div class="eyebrow">${upNext ? 'Other workouts' : 'Your workouts'}</div><div class="list">${otherRows}</div>` : ''}
      ${workouts.length ? '' : `
        <div class="card">
          <div class="lead">Make a workout for each kind of day you train, like Chest + Triceps or Back + Biceps. Pick its exercises once, then start it with one tap every time.</div>
        </div>`}
      <a class="btn ${workouts.length ? 'btn-secondary' : 'btn-primary'}" href="#workout/new">+ New workout</a>
      ${active ? '' : '<button type="button" class="text-btn" data-act="start-empty">Or start an empty workout</button>'}
    </div>`;

  const cloud = getCloud();
  const backup = backupStatus(settings, all.finished.length, now, cloud.lastAt);
  // With automatic backup on, only a failing upload is worth a warning (same rule as the tab dot).
  const needsBackup = cloud.key ? Boolean(cloud.error) : backup.overdue;
  const reminder = needsBackup && !active ? `
    <a class="banner warn" href="#profile">
      <div class="dot"></div>
      <div>
        <div class="banner-title">${esc(cloud.key ? 'Automatic backup is failing' : backup.title)}</div>
        <div class="banner-sub">${esc(cloud.key ? cloud.error : `${backup.sub}. Turn on automatic backup in You.`)}</div>
      </div>
    </a>` : '';

  const strip = weekStrip(all.sessions.filter((s) => s.endedAt || s === active).map((s) => s.startedAt), now);
  const weeks = weeklyCounts(all.sessions.filter((s) => s.endedAt || s === active).map((s) => s.startedAt), now, 8);
  const weekMax = Math.max(1, ...weeks.map((w) => w.count));
  const recent = recentTopSets(all.sets, 5);
  const muscles = weeklyMuscleSets(all.sets, all.exercises, now);
  const most = muscles.rows[0]?.sets || 1;
  const stale = staleLifts(all.sets, all.exercises, now).slice(0, 4);
  const stalled = stalledLifts(all.sets, all.exercises, now).slice(0, 4);

  const muscleBlock = muscles.rows.length || muscles.unassigned ? `
    <div class="stack">
      <div class="eyebrow">Hard sets this week</div>
      ${muscles.rows.length ? `<div class="muscles">
        ${muscles.rows.map((r) => `
          <div class="muscle-row">
            <div class="muscle-name">${esc(r.label)}</div>
            <div class="muscle-track"><div class="muscle-bar" style="width:${Math.round((r.sets / most) * 100)}%"></div></div>
            <div class="muscle-n">${fmtSetCount(r.sets)}</div>
          </div>`).join('')}
      </div>` : ''}
      <div class="note">Sets and back-offs, not warm-ups.${muscles.unassigned
        ? ` ${plural(muscles.unassigned, 'set')} on lifts with no muscle group; tap Edit on the lift in a workout to add one.` : ''}</div>
    </div>` : '';

  const staleBlock = stale.length ? `
    <div class="recent">
      <div class="eyebrow">Not trained lately</div>
      ${stale.map((x) => `
        <a class="recent-row" href="#lift/${esc(x.exercise.id)}">
          <div class="recent-name">${esc(x.exercise.name)}</div>
          <div class="recent-vals"><span class="muted">${x.days} days ago</span></div>
        </a>`).join('')}
    </div>` : '';

  const stalledBlock = stalled.length ? `
    <div class="recent">
      <div class="eyebrow">No new best lately</div>
      ${stalled.map((x) => `
        <a class="recent-row" href="#lift/${esc(x.exercise.id)}">
          <div class="recent-name">${esc(x.exercise.name)}</div>
          <div class="recent-vals"><span class="stall">Stalled</span><span class="muted">${x.sessions} sessions</span></div>
        </a>`).join('')}
      <div class="note">e1RM hasn't beaten its best in the last 3+ sessions. Try one more rep at the same weight, or a lighter week.</div>
    </div>` : '';

  root.innerHTML = `
    <div class="screen today">
      ${trainHead('today', { date: `${settings.name ? `${settings.name}, ` : ''}${longDate(now)}` })}
      ${settings.goal ? `<div class="note">Goal: ${esc(settings.goal)}</div>` : ''}
      ${reminder}
      ${resume}
      ${workoutBlock}
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
      ${weeks.some((w) => w.count) ? `
      <div class="stack">
        <div class="eyebrow">Workouts per week</div>
        <div class="weeks" role="img" aria-label="Workouts per week, last 8 weeks: ${weeks.map((w) => w.count).join(', ')}">
          ${weeks.map((w, i) => `
            <div class="wk-col">
              <div class="wk-n">${w.count || ''}</div>
              <div class="wk-bar${i === weeks.length - 1 ? ' now' : ''}" style="height:${Math.max(4, Math.round((w.count / weekMax) * 56))}px"></div>
            </div>`).join('')}
        </div>
        <div class="note">Last 8 weeks, this week on the right.</div>
      </div>` : ''}
      ${muscleBlock}
      ${stalledBlock}
      ${staleBlock}
      ${recent.length ? `
        <div class="recent">
          <div class="eyebrow">Recent best sets</div>
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
  root.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act=start],[data-act=start-empty]');
    if (!el) return;
    unlockAudio(); // the tap that starts a workout also readies the rest-timer sound
    try {
      await startSession(el.dataset.id || null);
      location.hash = '#active';
    } catch (err) {
      toast(err.message || String(err), 5000);
    }
  });
}
