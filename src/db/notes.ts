/** Pure note helpers — no DB/React, unit-tested. */
import type { Note } from '../types';
import { isDefaultName } from './names';

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

/**
 * When a pin starts hiding a CUSTOM name in the row display, preserve that name
 * as a regular "from name" note so reads embedded in names stay visible.
 * Idempotent — created once per name (never duplicated, never renames the record).
 */
export function preserveCustomName(notes: Note[], name: string, stamp: string): Note[] {
  if (!notes.some((n) => n.pinned)) return notes; // only when a pin is present
  if (isDefaultName(name)) return notes; // only custom names
  if (notes.some((n) => n.fromName && n.text === name)) return notes; // once only
  return [...notes, { t: stamp, text: name, fromName: true }];
}
