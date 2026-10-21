// Today: next session, week strip and recent top sets. Placeholder until the workout screen lands.
import { comingSoon, longDate } from '../ui.js';

export async function render(root) {
  comingSoon(root, {
    date: longDate(),
    title: 'Today',
    body: 'Logging workouts arrives in the next update: warm-ups, your top set, a back-off, the rest timer and plate maths.',
  });
}
