// The workout being built in the editor, parked in sessionStorage while the user browses the
// library, so the name and lineup survive the trip. Cleared as soon as the editor reads it back.
const KEY = 'gymlog_wo_draft';

/** @returns {{id: string, name: string, ids: string[]} | null}  id is a workout id or 'new' */
export function readDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(KEY));
    return d && typeof d.id === 'string' && Array.isArray(d.ids) ? d : null;
  } catch { return null; }
}

export function writeDraft(draft) {
  try { sessionStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* private mode: the trip just won't carry over */ }
}

export function clearDraft() {
  try { sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
