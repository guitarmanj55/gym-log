// Exercise library: browse curated lifts by training group and turn one into a saved exercise.
// Pure: no DOM or browser globals. The data (descriptions, muscles) is in library-data.js.
import { equipmentLabel } from './exercise.js';

// The six ways the user splits training: one main group and one supporting group per session.
export const LIBRARY_GROUPS = [
  ['chest', 'Chest'],
  ['biceps', 'Biceps'],
  ['triceps', 'Triceps'],
  ['shoulders', 'Shoulders'],
  ['back', 'Back'],
  ['legs', 'Legs'],
];

// Library group -> the broad muscle group stored on an exercise (schema 3 has one "arms").
export const STORED_MUSCLE ={ chest: 'chest', biceps: 'arms', triceps: 'arms', shoulders: 'shoulders', back: 'back', legs: 'legs' };

export const groupLabel = (id) => LIBRARY_GROUPS.find(([k]) => k === id)?.[1] || '';

/** Photo paths for a library entry, relative to the app root. */
export function imagePaths(entry) {
  return Array.from({ length: entry.images || 0 }, (_, i) => `library/${entry.id}/${i}.jpg`);
}

/** Entries in one group (or all), narrowed by a search over name, muscles and equipment. */
export function filterLibrary(library, { group = '', query = '' } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return library.filter((e) => {
    if (group && e.group !== group) return false;
    if (!words.length) return true;
    const hay = [e.name, equipmentLabel(e.equipment), ...e.primary, ...e.secondary].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Details to hand to findOrCreateExercise for a library entry. */
export function detailsFor(entry) {
  return { name: entry.name, equipment: entry.equipment, muscles: [STORED_MUSCLE[entry.group]] };
}

/** "Chest · Barbell" for a card subtitle. */
export function subtitle(entry) {
  return [entry.primary.join(', '), equipmentLabel(entry.equipment)].filter(Boolean).join(' · ');
}
