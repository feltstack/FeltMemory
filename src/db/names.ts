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
export function rowDisplayName(name: string, notes: Note[]): string {
  const pinned = notes.find((n) => n.pinned);
  if (pinned) return pinned.text;
  if (!isDefaultName(name)) return name;
  const latest = notes.length ? notes[notes.length - 1].text : '';
  return latest || name;
}
