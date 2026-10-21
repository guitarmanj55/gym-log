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

/** Three short high beeps. */
export function beep() {
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const t0 = ctx.currentTime + 0.05;
  for (const d of [0, 0.28, 0.56]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t0 + d);
    gain.gain.exponentialRampToValueAtTime(0.7, t0 + d + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + d);
    osc.stop(t0 + d + 0.22);
  }
}
