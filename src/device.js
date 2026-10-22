// Phone features for the workout screen: keeping the screen on and the end-of-rest sound.

// ---------- Screen Wake Lock ----------
// iOS drops the lock whenever the app is hidden, so take it again on return.

let lock = null;
let wanted = false;

export async function keepAwake(on) {
  wanted = on;
  if (!on) {
    const l = lock;
    lock = null;
    await l?.release().catch(() => {});
    return;
  }
  if (lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch { /* not allowed right now, e.g. low power mode */ }
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible') keepAwake(true);
});

// ---------- Sound ----------
// iOS only lets Web Audio play after a tap has started it, so unlockAudio() runs on taps.
// The Vibration API does not exist on iOS, so the screen also shows a visual cue.

let ctx = null;

export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  // A silent one-sample buffer completes the unlock on older iOS.
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

/** Plays [delay s, frequency Hz, length s] notes. */
function notes(list, type = 'sine') {
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const t0 = ctx.currentTime + 0.05;
  for (const [d, freq, len] of list) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + d);
    gain.gain.exponentialRampToValueAtTime(0.7, t0 + d + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + d);
    osc.stop(t0 + d + len + 0.02);
  }
}

/** Three short high beeps. */
export function beep() {
  notes([[0, 880, 0.2], [0.28, 880, 0.2], [0.56, 880, 0.2]]);
}

/** A rising four-note fanfare for a new PR (C E G C). */
export function fanfare() {
  notes([[0, 523, 0.14], [0.12, 659, 0.14], [0.24, 784, 0.14], [0.36, 1047, 0.5]], 'triangle');
}
