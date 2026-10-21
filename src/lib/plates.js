// Plate maths for a barbell. Pure: no DOM or browser globals.

// Work in whole units of 10 g so 1.25 kg plates add up without float drift.
const UNIT = 100; // units per kg
const toUnits = (kg) => Math.round(kg * UNIT);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * Plates to load on EACH side for a target total, using the fewest plates.
 * Unlimited pairs of every plate size are assumed.
 * @param {number} totalKg
 * @param {number} barKg
 * @param {number[]} plates  available plate sizes in kg
 * @returns {{perSide: number[], loadedKg: number, remainderKg: number, exact: boolean}}
 *   perSide is heaviest first; loadedKg is the heaviest total at or below the target.
 */
export function platesPerSide(totalKg, barKg, plates) {
  const sizes = [...new Set(plates.map(toUnits).filter((p) => p > 0))].sort((a, b) => b - a);
  const target = Math.floor((toUnits(totalKg) - toUnits(barKg)) / 2);
  if (target <= 0 || !sizes.length) {
    return { perSide: [], loadedKg: barKg, remainderKg: round(totalKg - barKg), exact: round(totalKg) === round(barKg) };
  }

  // Coin-change DP on a grid of the plates' greatest common divisor (125 units for the default set).
  const step = sizes.reduce(gcd);
  const n = Math.floor(target / step);
  const fewest = new Array(n + 1).fill(Infinity);
  const last = new Array(n + 1).fill(-1);
  fewest[0] = 0;
  for (let i = 1; i <= n; i++) {
    for (const p of sizes) {
      const k = p / step;
      // Strictly fewer only, and heavier plates are tried first, so ties keep the heavier plate.
      if (k <= i && fewest[i - k] + 1 < fewest[i]) {
        fewest[i] = fewest[i - k] + 1;
        last[i] = p;
      }
    }
  }
  let i = n;
  while (i > 0 && fewest[i] === Infinity) i--;
  const perSide = [];
  for (let j = i; j > 0; j -= last[j] / step) perSide.push(last[j] / UNIT);
  perSide.sort((a, b) => b - a);

  const loadedKg = round(barKg + 2 * (i * step) / UNIT);
  return { perSide, loadedKg, remainderKg: round(totalKg - loadedKg), exact: loadedKg === round(totalKg) };
}

/** Nearest weight at or below `kg` that is a multiple of `stepKg`. */
export function floorToStep(kg, stepKg) {
  const s = toUnits(stepKg);
  return s > 0 ? round(Math.floor(toUnits(kg) / s) * s / UNIT) : kg;
}

const round = (kg) => Math.round(kg * UNIT) / UNIT;
