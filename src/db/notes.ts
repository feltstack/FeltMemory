/** Pure note helpers — no DB/React, unit-tested. */
import type { Note } from '../types';

/** Remove the note at a given index in the stored (chronological) array. */
export function removeNoteAt(notes: Note[], index: number): Note[] {
  return notes.filter((_, i) => i !== index);
}

/**
 * Two-tap delete confirm state machine. `current` is the key currently armed
 * (or null). Tapping the same key again confirms deletion; tapping a different
 * key arms that one instead. (Tap-elsewhere cancel is handled in the view.)
 */
export function toggleDeleteConfirm<T>(
  current: T | null,
  key: T,
): { confirm: T | null; doDelete: boolean } {
  const same = current === key;
  return { confirm: same ? null : key, doDelete: same };
}
