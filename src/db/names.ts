/** Pure helpers for the seat-row rename UX. */

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
