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


/** Toggle the pin on note[index]; pinning one unpins any other (uniqueness). */
export function togglePin(notes: Note[], index: number): Note[] {
  const turningOn = !notes[index]?.pinned;
  return notes.map((n, i) => {
    if (i === index) return { ...n, pinned: turningOn };
    return n.pinned ? { ...n, pinned: false } : n;
  });
}

/** Display order with original indices: pinned first, then newest → oldest. */
export function orderedNotes(notes: Note[]): { note: Note; index: number }[] {
  const withIdx = notes.map((note, index) => ({ note, index }));
  const pinned = withIdx.filter((x) => x.note.pinned);
  const rest = withIdx.filter((x) => !x.note.pinned).reverse();
  return [...pinned, ...rest];
}
