// Today: start or resume a workout. The week strip and recent top sets come in the next step.
import { getActiveSession, getLastFinishedSession, getSessionExercises, getSessionDetail, startSession } from '../db/workout.js';
import { unlockAudio } from '../device.js';
import { esc, longDate, toast, versionLine } from '../ui.js';

const timeOf = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export async function render(root) {
  const active = await getActiveSession();
  let card;
  if (active) {
    const { items, sets } = await getSessionDetail(active.id);
    card = `
      <div class="card">
        <div class="eyebrow">Workout in progress</div>
        <div class="lead">Started ${timeOf(active.startedAt)} · ${items.length} exercise${items.length === 1 ? '' : 's'} · ${sets.length} set${sets.length === 1 ? '' : 's'} logged</div>
        <a class="btn btn-primary" href="#active" data-act="go">Resume workout</a>
      </div>`;
  } else {
    const last = await getLastFinishedSession();
    const items = last ? await getSessionExercises(last.id) : [];
    const names = items.map((it) => it.exercise?.name).filter(Boolean);
    card = `
      <div class="card">
        <div class="eyebrow">${names.length ? 'Up next' : 'Get started'}</div>
        ${names.length
          ? `<div class="up-next">${esc(names[0])}</div>
             <div class="note-lg">${names.map(esc).join(' · ')}</div>`
          : '<div class="lead">Start a workout, then add your first exercise. Next time it is prefilled from this one.</div>'}
        <button type="button" class="btn btn-primary" data-act="start">Start workout</button>
      </div>`;
  }

  root.innerHTML = `
    <div class="screen">
      <div>
        <div class="date">${esc(longDate())}</div>
        <h1 class="title">Today</h1>
      </div>
      ${card}
      <div class="note">Your week and recent top sets arrive in the next update.</div>
      ${versionLine()}
    </div>`;

  root.querySelector('[data-act=go]')?.addEventListener('click', unlockAudio);
  root.querySelector('[data-act=start]')?.addEventListener('click', async () => {
    unlockAudio(); // the tap that starts a workout also readies the rest-timer sound
    try {
      await startSession();
      location.hash = '#active';
    } catch (err) {
      toast(err.message || String(err), 5000);
    }
  });
}
