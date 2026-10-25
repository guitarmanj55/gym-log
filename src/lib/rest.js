// Rest timer maths. Pure: no DOM or browser globals.
// The timer is an end timestamp; remaining time is always computed from the clock,
// because iOS suspends JS in the background and a counting-down interval would drift.

/**
 * @typedef {Object} Rest
 * @property {number} endsAt    epoch ms
 * @property {number} totalSec  full length, for the progress bar
 */

/** Rest after every set, in seconds. +30s on the timer covers the odd longer rest. */
export const REST_SEC = 60;

export function startRest(sec, now) {
  return { endsAt: now + sec * 1000, totalSec: sec };
}

/** Whole seconds left, rounded up so 0 means really done. */
export function remainingSec(rest, now) {
  return Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
}

/** Share of the rest already elapsed, 0..1. */
export function restProgress(rest, now) {
  const total = rest.totalSec * 1000;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (rest.endsAt - now) / total));
}

/** Adds time; if the rest already ran out, starts a fresh one of that length. */
export function extendRest(rest, sec, now) {
  if (rest.endsAt <= now) return startRest(sec, now);
  return { endsAt: rest.endsAt + sec * 1000, totalSec: rest.totalSec + sec };
}

/** 106 -> "01:46", 3725 -> "1:02:05" */
export function fmtClock(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}
