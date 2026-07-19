/** Pure helpers for the seat-row rename UX + display name. */
import type { Note } from '../types';

/** True for auto-generated placeholder names ("No Name 3") — select-all on edit. */
export function isDefaultName(name: string): boolean {
  return /^No Name \d+$/i.test((name ?? '').trim());
}

/** Decide what a rename commit should do. Uniqueness is enforced later by repo.renamePlayer. */
export function resolveRename(
  current: string,
  draft: string,
): { action: 'commit' | 'revert' | 'noop'; name?: string } {
  const t = (draft ?? '').trim();
  if (t === '') return { action: 'revert' };
  if (t === current) return { action: 'noop' };
  return { action: 'commit', name: t };
}

/**
 * What shows in the row's name slot (priority):
 *   a) pinned note text · b) custom name · c) latest note (if name is default) · d) default name.
 * The sheet/card still title the record by its real name.
 */
export function rowDisplay(
  name: string,
  notes: Note[],
): { text: string; kind: 'note' | 'name'; noteIndex: number | null } {
  const pinnedIdx = notes.findIndex((n) => n.pinned);
  if (pinnedIdx >= 0) return { text: notes[pinnedIdx].text, kind: 'note', noteIndex: pinnedIdx };
  if (!isDefaultName(name)) return { text: name, kind: 'name', noteIndex: null };
  if (notes.length) {
    return { text: notes[notes.length - 1].text, kind: 'note', noteIndex: notes.length - 1 };
  }
  return { text: name, kind: 'name', noteIndex: null };
}

export function rowDisplayName(name: string, notes: Note[]): string {
  return rowDisplay(name, notes).text;
}
