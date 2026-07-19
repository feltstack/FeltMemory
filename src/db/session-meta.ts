/** Session kind + stakes presets — pure helpers so the start screen stays dumb. */

export const SESSION_KINDS = ['Live', 'Online', 'Home Game'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const DEFAULT_SESSION_KIND: SessionKind = 'Live';

/** Common live/online cash stakes, cheapest first. */
export const STAKES_PRESETS = [
  '$0.05/$0.10',
  '$0.10/$0.25',
  '$0.25/$0.50',
  '$0.50/$1',
  '$1/$2',
  '$1/$3',
  '$2/$3',
  '$2/$5',
  '$5/$5',
  '$5/$10',
  '$10/$20',
  '$10/$25',
  '$25/$50',
] as const;

/** Venue.stakes is a comma-joined history string; split it back into entries. */
export function parseVenueStakes(joined: string | undefined | null): string[] {
  if (!joined) return [];
  return joined
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '—');
}

/**
 * Options for the stakes dropdown: presets first, then anything previously
 * used at any venue (or currently selected) that isn't already a preset.
 * De-duplicated case-insensitively, order stable.
 */
export function stakesOptions(used: string[] = [], current = ''): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    const key = v.trim().toLowerCase();
    if (!v.trim() || key === '—' || seen.has(key)) return;
    seen.add(key);
    out.push(v.trim());
  };
  STAKES_PRESETS.forEach(push);
  used.forEach(push);
  push(current);
  return out;
}

/** True when the string isn't one of the offered options (→ needs custom input). */
export function isCustomStakes(value: string, options: string[]): boolean {
  if (!value.trim()) return false;
  return !options.some((o) => o.toLowerCase() === value.trim().toLowerCase());
}

/** Short badge text for a session, or '' when it's a plain Live session. */
export function sessionBadge(kind: SessionKind, isTest: boolean): string {
  const parts: string[] = [];
  if (isTest) parts.push('TEST');
  if (kind !== 'Live') parts.push(kind === 'Home Game' ? 'HOME' : kind.toUpperCase());
  return parts.join(' · ');
}

/** Test sessions are practice data — hide them unless explicitly included. */
export function filterTestSessions<T extends { isTest?: boolean }>(
  rows: T[],
  includeTest: boolean,
): T[] {
  return includeTest ? rows : rows.filter((r) => !r.isTest);
}
