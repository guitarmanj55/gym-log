// The exercise form, shared by "Add exercise" (in a workout or a saved workout) and "Edit details".
// Kept short on purpose: a name and a muscle group. Equipment is guessed from the name unless picked.
import { EQUIPMENT, MUSCLES, loadsPlates } from '../lib/exercise.js';
import { esc, fmtKg } from '../ui.js';

function chips(name, list, selected, { none = '' } = {}) {
  const items = none ? [['', none], ...list] : list;
  return `<div class="equip" role="radiogroup">
    ${items.map(([k, l]) => `<label class="equip-chip"><input type="radio" name="${name}" value="${k}"${selected === k || (!selected && !k) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}
  </div>`;
}

/** Attributes for the <form> around detailFields(). */
export function formAttrs() {
  return 'class="ex-form"';
}

/**
 * Form fields for an exercise. With `withName`, starts with the name box (and the datalist of
 * existing names, if given). Equipment and setup sit in a fold so adding a lift stays quick.
 */
export function detailFields(ex = {}, { withName = true, names = [], open = false } = {}) {
  const eq = ex.equipment || '';
  return `
    ${withName ? `
      <input class="text-input" name="name" ${names.length ? 'list="exercise-names"' : ''} placeholder="Exercise name, e.g. Incline DB press" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Exercise name" value="${esc(ex.name || '')}">
      ${names.length ? `<datalist id="exercise-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>` : ''}` : ''}
    <div class="field-label">Muscle group</div>
    ${chips('muscle', MUSCLES, ex.muscles?.[0], { none: 'None' })}
    <div class="field-label">Equipment</div>
    ${chips('equipment', EQUIPMENT, eq, { none: eq ? '' : 'From the name' })}
    <details class="more"${open ? ' open' : ''}>
      <summary>Setup</summary>
      <div class="more-body">
        <label class="check-row"><input type="checkbox" name="unilateral"${ex.unilateral ? ' checked' : ''}><span>One arm or leg at a time</span></label>
        <label class="only-plates field">
          <span class="field-label">Empty bar or sled (kg)</span>
          <input class="text-input" name="barKg" type="text" inputmode="decimal" autocomplete="off" placeholder="Usual bar weight" value="${Number.isFinite(ex.barKg) && loadsPlates(eq) ? fmtKg(ex.barKg) : ''}">
        </label>
        <label class="field">
          <span class="field-label">Setup notes</span>
          <input class="text-input" name="setup" maxlength="200" autocomplete="off" autocapitalize="sentences" placeholder="Seat 4, pad 2, bench notch 3" value="${esc(ex.setup || '')}">
        </label>
      </div>
    </details>`;
}

/**
 * The details typed into a form made with detailFields(). Cleaned later by cleanDetails().
 * Angle, grip, width and attachment are no longer asked for; pass the exercise being edited
 * so the ones it already has are kept.
 */
export function readDetails(form, ex = {}) {
  const el = form.elements;
  const val = (n) => form.querySelector(`[name="${n}"]:checked`)?.value || '';
  const muscle = val('muscle');
  return {
    name: el.name?.value,
    equipment: val('equipment'),
    // An older lift can list several groups; keep them unless the main one was changed.
    muscles: muscle && muscle === ex.muscles?.[0] ? ex.muscles : muscle ? [muscle] : [],
    position: ex.position, grip: ex.grip, width: ex.width, attachment: ex.attachment,
    unilateral: el.unilateral.checked,
    barKg: el.barKg.value,
    setup: el.setup.value,
  };
}
