// Workout summary: shown after Finish (and from History). Each lift's best set, e1RM change and PRs,
// the totals, and a Share button that sends the summary as text.
import { loadAll } from '../db/workout.js';
import { sessionSummary, summaryText, fmtChange } from '../lib/feedback.js';
import { shortDate, fmtDuration, fmtSet } from '../lib/history.js';
import { esc, toast, versionLine } from '../ui.js';

const SHARE_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/></svg>';

export async function render(root) {
  const all = await loadAll();
  const id = location.hash.split('/')[1];
  const session = all.finished.find((s) => s.id === id) || all.finished[0];
  if (!session) {
    root.innerHTML = `
      <div class="screen">
        <h1 class="title">Summary</h1>
        <div class="lead">Finish a workout to see its summary here.</div>
        <a class="btn btn-primary" href="#today">Back to Today</a>
      </div>`;
    return;
  }

  const sum = sessionSummary(session, all.bySession.get(session.id) || [], all.sets);
  // Built before the tap: iOS only opens the share sheet straight from a user gesture.
  const text = summaryText(sum);
  const justNow = Date.now() - session.endedAt < 60 * 60 * 1000;

  root.innerHTML = `
    <div class="screen">
      <div>
        <div class="date">${esc(shortDate(session.startedAt))}</div>
        <h1 class="title">${justNow ? 'Workout done' : 'Workout'}</h1>
      </div>
      ${sum.prCount ? `
        <div class="banner ok">
          <div class="dot"></div>
          <div class="banner-title">${sum.prCount === 1 ? 'New PR' : `${sum.prCount} new PRs`}</div>
        </div>` : ''}
      <div class="tiles">
        <div class="tile"><div class="tile-label">Time</div><div class="tile-val">${fmtDuration(sum.durationMs)}</div></div>
        <div class="tile"><div class="tile-label">Sets</div><div class="tile-val">${sum.sets}</div></div>
        <div class="tile"><div class="tile-label">Volume kg</div><div class="tile-val">${sum.volumeKg.toLocaleString('en-GB')}</div></div>
      </div>
      <div class="recent">
        <div class="eyebrow">Best set per lift · e1RM vs last time</div>
        ${sum.lifts.map((l) => `
          <div class="recent-row">
            <div class="hist-ex"><span class="recent-name">${esc(l.name)}</span>${l.pr ? '<span class="pr">PR</span>' : ''}</div>
            <div class="recent-vals">
              ${l.e1rm !== null && l.equipment !== 'bodyweight' ? `<span class="muted">${l.e1rm}${l.change !== null ? ` · <span class="${l.change > 0 ? 'accent' : ''}">${fmtChange(l.change)}</span>` : ''}</span>` : ''}
              <span>${l.headline ? fmtSet(l.headline, l.equipment) : ''}</span>
            </div>
          </div>`).join('')}
      </div>
      <div class="stack">
        <button type="button" class="btn btn-primary" data-act="share">${SHARE_ICON}Share summary</button>
        <a class="btn btn-secondary" href="#today">Done</a>
      </div>
      <div class="note">Volume counts top and back-off sets (kg × reps).</div>
      ${versionLine()}
    </div>`;

  root.querySelector('[data-act=share]').addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        // NotAllowedError etc.: fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Summary copied.');
    } catch {
      toast('Sharing is not available here.', 4000);
    }
  });
}
