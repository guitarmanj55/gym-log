// The exercise details form, shared by "Add exercise" in a workout and "Edit details" on a lift.
import { EQUIPMENT, MUSCLES, POSITIONS, GRIPS, WIDTHS, ATTACHMENTS, loadsPlates } from '../lib/exercise.js';
import { esc, fmtKg } from '../ui.js';

function chips(name, list, selected, { multi = false, none = false } = {}) {
  const type = multi ? 'checkbox' : 'radio';
  const has = (k) => (multi ? (selected || []).includes(k) : selected === k);
  const items = none ? [['', 'Any'], ...list] : list;
  return `<div class="equip" role="${multi ? 'group' : 'radiogroup'}">
    ${items.map(([k, l]) => `<label class="equip-chip"><input type="${type}" name="${name}" value="${k}"${has(k) || (none && !k && !selected) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}
  </div>`;
}

/** Attributes for the <form> around detailFields(): remembers the saved muscle order. */
export function formAttrs(ex = {}) {
  return `class="ex-form" data-muscles="${esc((ex.muscles || []).join(','))}"`;
}

/**
 * Form fields for an exercise. With `withName`, starts with the name box (and the datalist of
 * existing names, if given). Details sit in a fold so adding a lift stays one tap.
 */
export function detailFields(ex = {}, { withName = true, names = [], open = false } = {}) {
  const eq = ex.equipment || 'barbell';
  return `
    ${withName ? `
      <input class="text-input" name="name" ${names.length ? 'list="exercise-names"' : ''} placeholder="Exercise name, e.g. Incline DB press" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Exercise name" value="${esc(ex.name || '')}">
      ${names.length ? `<datalist id="exercise-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>` : ''}` : ''}
    <div class="field-label">Equipment</div>
    ${chips('equipment', EQUIPMENT, eq)}
    <details class="more"${open ? ' open' : ''}>
      <summary>Muscles, angle, grip and setup</summary>
      <div class="more-body">
        <div class="field-label">Target muscles <span class="muted">· tap the main one first</span></div>
        ${chips('muscles', MUSCLES, ex.muscles, { multi: true })}
        <div class="field-label">Angle or position</div>
        ${chips('position', POSITIONS, ex.position, { none: true })}
        <div class="field-label">Grip</div>
        ${chips('grip', GRIPS, ex.grip, { none: true })}
        ${chips('width', WIDTHS, ex.width, { none: true })}
        <div class="only-cable">
          <div class="field-label">Cable attachment</div>
          ${chips('attachment', ATTACHMENTS, ex.attachment, { none: true })}
        </div>
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
 * Muscles in the order they were ticked, so the first tap is the primary muscle. Call once on
 * the form's root; it records tick order in a data attribute that readDetails() uses.
 */
export function trackMuscleOrder(root) {
  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.name !== 'muscles') return;
    const form = t.form;
    const order = (form.dataset.muscles || '').split(',').filter(Boolean).filter((m) => m !== t.value);
    if (t.checked) order.push(t.value);
    form.dataset.muscles = order.join(',');
  });
}

/** The details typed into a form made with detailFields(). Cleaned later by cleanDetails(). */
export function readDetails(form) {
  const el = form.elements;
  const val = (n) => form.querySelector(`[name="${n}"]:checked`)?.value || '';
  const ticked = [...form.querySelectorAll('[name="muscles"]:checked')].map((i) => i.value);
  // Keep the order they were ticked in (primary first); muscles already saved come first.
  const order = (form.dataset.muscles || '').split(',').filter(Boolean);
  const muscles = [...ticked.filter((m) => !order.includes(m)), ...order.filter((m) => ticked.includes(m))];
  return {
    name: el.name?.value,
    equipment: val('equipment'),
    muscles,
    position: val('position'),
    grip: val('grip'),
    width: val('width'),
    attachment: val('attachment'),
    unilateral: el.unilateral.checked,
    barKg: el.barKg.value,
    setup: el.setup.value,
  };
}
