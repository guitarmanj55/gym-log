// Exercise details: equipment, muscle group, angle, grip and setup. Pure: no DOM or browser globals.
// Ids are what gets saved; labels are only for display, so they can be reworded freely.

export const EQUIPMENT = [
  ['barbell', 'Barbell'],
  ['dumbbell', 'Dumbbell'],
  ['ezbar', 'EZ bar'],
  ['trapbar', 'Trap bar'],
  ['smith', 'Smith machine'],
  ['cable', 'Cable'],
  ['machine', 'Machine (stack)'],
  ['plate-loaded', 'Plate-loaded'],
  ['kettlebell', 'Kettlebell'],
  ['bodyweight', 'Bodyweight'],
  ['band', 'Band'],
];

// Muscle groups (schema 3). Kept broad on purpose so picking one is a single tap.
export const MUSCLES = [
  ['chest', 'Chest'],
  ['back', 'Back'],
  ['shoulders', 'Shoulders'],
  ['arms', 'Arms'],
  ['legs', 'Legs'],
  ['core', 'Core'],
];

// Schema 2's detailed muscles and the group each one became. Frozen: only the migrations use them.
const MUSCLES_V2 = [
  ['upper-chest', 'Upper chest', 'chest'], ['mid-chest', 'Mid chest', 'chest'], ['lower-chest', 'Lower chest', 'chest'],
  ['front-delts', 'Front delts', 'shoulders'], ['side-delts', 'Side delts', 'shoulders'], ['rear-delts', 'Rear delts', 'shoulders'],
  ['lats', 'Lats', 'back'], ['upper-back', 'Upper back', 'back'], ['traps', 'Traps', 'back'], ['lower-back', 'Lower back', 'back'],
  ['biceps', 'Biceps', 'arms'], ['triceps', 'Triceps', 'arms'], ['forearms', 'Forearms', 'arms'],
  ['abs', 'Abs', 'core'], ['obliques', 'Obliques', 'core'],
  ['glutes', 'Glutes', 'legs'], ['quads', 'Quads', 'legs'], ['hamstrings', 'Hamstrings', 'legs'],
  ['adductors', 'Adductors', 'legs'], ['abductors', 'Abductors', 'legs'], ['calves', 'Calves', 'legs'],
];

export const POSITIONS = [
  ['flat', 'Flat'], ['incline', 'Incline'], ['decline', 'Decline'], ['seated', 'Seated'],
  ['standing', 'Standing'], ['lying', 'Lying'], ['kneeling', 'Kneeling'], ['bent-over', 'Bent over'],
];

export const GRIPS = [
  ['overhand', 'Overhand'], ['underhand', 'Underhand'], ['neutral', 'Neutral'], ['mixed', 'Mixed'],
];

export const WIDTHS = [['close', 'Close'], ['shoulder', 'Shoulder width'], ['wide', 'Wide']];

export const ATTACHMENTS = [
  ['rope', 'Rope'], ['straight-bar', 'Straight bar'], ['ez-attachment', 'EZ attachment'],
  ['v-handle', 'V-handle'], ['single-handle', 'Single handle'], ['lat-bar', 'Lat bar'], ['ankle-strap', 'Ankle strap'],
];

const label = (list, id) => list.find(([k]) => k === id)?.[1] || '';
export const equipmentLabel = (id) => label(EQUIPMENT, id || 'barbell');
export const muscleLabel = (id) => label(MUSCLES, id);

// Equipment you load with plates on both sides, and what its bar weighs unless the exercise says otherwise.
// null means "use the bar weight from Settings".
const BAR_KG = { barbell: null, ezbar: 10, trapbar: 25, smith: 15, 'plate-loaded': 0 };

/** True if the lift is loaded with plates per side, so the plate maths applies. */
export function loadsPlates(equipment) {
  return Object.hasOwn(BAR_KG, equipment || 'barbell');
}

/** Empty-bar (or empty-machine) weight for a plate-loaded lift, or 0 if it doesn't take plates. */
export function barKgFor(exercise, settingsBarKg) {
  const eq = exercise?.equipment || 'barbell';
  if (!loadsPlates(eq)) return 0;
  if (Number.isFinite(exercise?.barKg)) return exercise.barKg;
  return BAR_KG[eq] ?? settingsBarKg;
}

/** Starting weight for a lift with no history: the empty bar, nothing for bodyweight, else 10 kg. */
export function startKgFor(exercise, settingsBarKg) {
  const eq = exercise?.equipment || 'barbell';
  if (eq === 'bodyweight' || eq === 'band') return 0;
  if (loadsPlates(eq)) return barKgFor(exercise, settingsBarKg) || 20;
  return 10;
}

/** "Incline · Dumbbell · Neutral grip · One side at a time" */
export function detailLine(exercise) {
  if (!exercise) return '';
  const parts = [
    label(POSITIONS, exercise.position),
    equipmentLabel(exercise.equipment),
    exercise.equipment === 'cable' ? label(ATTACHMENTS, exercise.attachment) : '',
    label(WIDTHS, exercise.width) && `${label(WIDTHS, exercise.width)} grip`,
    label(GRIPS, exercise.grip) && `${label(GRIPS, exercise.grip)} grip`,
    exercise.unilateral ? 'One side at a time' : '',
  ];
  // "Close grip · Neutral grip" reads oddly; join width and grip into one phrase.
  if (parts[3] && parts[4]) { parts[3] = `${label(WIDTHS, exercise.width)} ${parts[4].toLowerCase()}`; parts[4] = ''; }
  return parts.filter(Boolean).join(' · ');
}

/** "Upper chest, Front delts, Triceps" (primary first). */
export function musclesLine(exercise) {
  return (exercise?.muscles || []).map(muscleLabel).filter(Boolean).join(', ');
}

/** Everything searchable about a lift, for the History search. */
export function searchText(exercise) {
  return [exercise?.name, detailLine(exercise), musclesLine(exercise)].join(' ');
}

// Words in a lift's name that give its equipment away, checked in order.
const EQUIPMENT_WORDS = [
  [/\bsmith\b/, 'smith'], [/\bez\b|\bez[- ]?bar\b/, 'ezbar'], [/\btrap[- ]?bar\b|\bhex\b/, 'trapbar'],
  [/\bcable\b|\bpush[- ]?down\b|\bpull[- ]?down\b|\bface pull\b/, 'cable'],
  [/\bdumbbells?\b|\bdb\b/, 'dumbbell'], [/\bkettlebells?\b|\bkb\b/, 'kettlebell'],
  [/\bmachine\b|\bpec deck?\b|\bleg (press|extension|curl)\b/, 'machine'],
  [/\b(pull|chin|push)[- ]?ups?\b|\bdips?\b|\bplank\b/, 'bodyweight'],
  [/\bband(ed)?\b/, 'band'],
];

/** Equipment for a lift nobody picked one for, guessed from its name; barbell if nothing matches. */
export function guessEquipment(name) {
  const n = String(name ?? '').toLowerCase();
  return EQUIPMENT_WORDS.find(([re]) => re.test(n))?.[1] || 'barbell';
}

const pick = (list, v) => (list.some(([k]) => k === v) ? v : undefined);

/**
 * Cleans the detail fields from a form (or a backup) into what gets saved. Unknown ids are
 * dropped, empty fields are left out, the name is tidied. Doesn't touch id or createdAt.
 */
export function cleanDetails(input) {
  const out = {};
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (name) out.name = name;
  out.equipment = pick(EQUIPMENT, input.equipment) || guessEquipment(name);
  const muscles = [...new Set((input.muscles || []).filter((m) => pick(MUSCLES, m)))];
  if (muscles.length) out.muscles = muscles;
  for (const [key, list] of [['position', POSITIONS], ['grip', GRIPS], ['width', WIDTHS], ['attachment', ATTACHMENTS]]) {
    const v = pick(list, input[key]);
    if (v) out[key] = v;
  }
  if (out.equipment !== 'cable') delete out.attachment;
  if (input.unilateral) out.unilateral = true;
  const bar = parseFloat(String(input.barKg ?? '').replace(',', '.'));
  if (loadsPlates(out.equipment) && Number.isFinite(bar) && bar >= 0) out.barKg = Math.round(bar * 100) / 100;
  const setup = String(input.setup ?? '').trim();
  if (setup) out.setup = setup.slice(0, 200);
  return out;
}

/** Exercise with its details replaced by `details` (all detail fields not given are cleared). */
export function withDetails(exercise, details) {
  const keep = { id: exercise.id, name: exercise.name, createdAt: exercise.createdAt };
  return { ...keep, ...cleanDetails({ name: exercise.name, ...details }) };
}

/**
 * Schema 2 migration for one exercise record: the never-used free-text `muscleGroup` becomes
 * `muscles` when it names a known muscle, otherwise it's kept in `setup` so nothing is lost.
 */
export function migrateExerciseV2(e) {
  const out = { ...e };
  if (typeof e.muscleGroup === 'string' && e.muscleGroup.trim()) {
    const text = e.muscleGroup.trim();
    const hit = MUSCLES_V2.find(([id, l]) => id === text.toLowerCase() || l.toLowerCase() === text.toLowerCase());
    if (hit) out.muscles = [hit[0]];
    else out.setup = [e.setup, text].filter(Boolean).join(' · ');
  }
  delete out.muscleGroup;
  return out;
}

/**
 * Schema 3 migration for one exercise record: the detailed muscles become muscle groups, in the
 * same order (primary first) with repeats dropped. Ids that are already groups are kept.
 */
export function migrateExerciseV3(e) {
  if (!Array.isArray(e.muscles)) return { ...e };
  const groups = e.muscles.map((m) => (pick(MUSCLES, m) || MUSCLES_V2.find(([id]) => id === m)?.[2])).filter(Boolean);
  const out = { ...e, muscles: [...new Set(groups)] };
  if (!out.muscles.length) delete out.muscles;
  return out;
}
