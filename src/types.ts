import type { SessionKind } from './db/session-meta';

/** Core domain types for FeltMemory. */

/** Starting archetype taxonomy — user-extendable via Settings (stored in meta). */
export const DEFAULT_TAGS = ['TAG', 'LAG', 'Loose Passive', 'Tight Passive'];

/** A player-specific tendency to exploit. `tag` is the axis id (== its level-1 name). */
export interface Exploit {
  tag: string;
  level: 1 | 2; // 1 = on, 2 = "!" (extreme)
  confirmations?: number; // showdown-confirmed reads ("×N")
  lastChangedHand?: number; // session hand # when its level last changed (for note stamping)
}
/** An exploit axis: a level-1 label (also the id) and its level-2 ("!") label. */
export interface ExploitAxis {
  l1: string;
  l2: string;
}
export const DEFAULT_EXPLOIT_AXES: ExploitAxis[] = [
  { l1: 'Folds', l2: 'Folds!' },
  { l1: 'Calls', l2: 'Station!' },
  { l1: 'Bluffs', l2: 'Bluffs!' },
  { l1: 'Value', l2: 'Value!' },
  { l1: 'Merges', l2: 'Merges!' },
  { l1: 'SizeTell', l2: 'SizeTell!' },
];

export interface Note {
  t: string; // "YYYY-MM-DD HH:mm"
  text: string;
  h?: number; // hand # of THIS villain's sample when the note was taken
  pinned?: boolean; // at most one pinned note per player
  exploits?: { tag: string; level: 1 | 2 }[]; // snapshot: exploits changed the same hand
  fromName?: boolean; // auto-created to preserve a custom name a pin now hides
  sid?: number; // session this note was taken in (session-scoped views)
  sh?: number; // session hand # when it was taken (orders notes within a session)
}

/**
 * Real stat counters (numerators/denominators), not nudged percentages.
 * VPIP% = vpip/dealt · PFR% = pfr/dealt · 3Bet% = threeBet/threeBetOpp
 */
export interface StatCounters {
  dealt: number; // hands dealt in while seated
  vpip: number; // hands voluntarily put money in pot
  pfr: number; // hands with any preflop raise
  threeBet: number; // hands where they made a 3-bet (re-raise vs one raise)
  threeBetOpp: number; // hands where they had the chance to 3-bet
}

export const emptyCounters = (): StatCounters => ({
  dealt: 0,
  vpip: 0,
  pfr: 0,
  threeBet: 0,
  threeBetOpp: 0,
});

/**
 * Persistent population record — the single source of truth per opponent.
 * Seat UI and Players/Venues/Population screens all read/write this record.
 */
export interface Player {
  id?: number;
  name: string;
  nameLower: string; // unique index (case-insensitive identity)
  tag: string; // '' = untagged (archetype — single)
  exploits: Exploit[]; // player-specific tendencies (multiple); see db/exploits.ts
  notes: Note[];
  venues: Record<string, number>; // venueName -> sessions seen there
  sessions: number;
  counters: StatCounters;
  lastSeen: string; // ISO date
  createdAt: string;
  /**
   * Read tracking. archHand = how many hands we had OBSERVED THIS PLAYER
   * (counters.dealt) when the archetype was first assigned — a
   * session-independent proxy for "how fast can we read this archetype".
   * (The mockup used the session hand number; observed-hands is the same
   * idea made meaningful across sessions.)
   */
  archHand: number | null;
  verified: boolean;
  verifiedHand: number | null;
}

export interface Venue {
  id?: number;
  name: string;
  nameLower: string;
  stakes: string;
  lastVisited: string;
}

export interface Session {
  id?: number;
  venueName: string;
  stakes: string;
  /** Live (default) / Online / Home Game */
  kind?: SessionKind;
  /** practice run — excluded from stats views that opt out */
  isTest?: boolean;
  startedAt: string; // ISO datetime
  endedAt: string | null;
  handCount: number;
  /** total ms spent on breaks (excluded from session duration) */
  breakMs?: number;
  tableSize: number;
  /** players already counted toward sessions/venue tallies this session */
  playerIds: number[];
}

/** A tapped preflop action within the current hand. */
export interface HandEntry {
  seatNo: number;
  playerId: number | null; // null = hero (not population-tracked)
  action: 'limp' | 'call' | 'raise';
  /** 0 for calls/limps; 1 = open raise, 2 = 3-bet, 3 = 4-bet, … */
  raiseLevel: number;
  order: number; // tap order within the hand
}

/** Committed hand — kept so stats stay auditable/recomputable and future
 *  analytics (position, straddle, per-venue) have raw material. */
export interface HandRecord {
  id?: number;
  sessionId: number;
  handNo: number;
  ts: string;
  btnSeat: number;
  noSB: boolean;
  straddle: boolean;
  entries: HandEntry[];
  dealtPlayerIds: number[];
  /** Seat snapshot at commit time. Required to REPLAY the hand: acting order and
   *  3-bet opportunities depend on who sat where, which entries alone can't give. */
  seats?: Seat[];
}

export interface Seat {
  seatNo: number;
  playerId: number | null; // null + !hero + !open shouldn't occur
  hero: boolean;
  open: boolean;
  stack: string; // free text, e.g. "450"
  pos: string;
  dealer: boolean;
  sittingOut?: boolean; // grayed, no position, skipped by rotation & dealt-counts
}

/** Ephemeral-but-persisted live table state (survives refresh mid-session). */
export interface LiveState {
  sessionId: number | null;
  venueName: string;
  stakes: string;
  kind?: SessionKind;
  isTest?: boolean;
  /** break clock — see db/breaks.ts */
  pausedAt?: string | null;
  breakMs?: number;
  breakMins?: number | null;
  tableSize: number;
  seats: Seat[];
  btnSeat: number;
  heroSeat: number;
  handNo: number;
  noSB: boolean;
  straddle: boolean;
  mustStraddle: boolean;
  currentEntries: HandEntry[];
  startedAt: string | null;
}

export interface Settings {
  theme: 'dark' | 'light';
  glare: boolean;
  defaultView: 'table' | 'list';
  compactRows: boolean;
  tags: string[];
  exploitAxes: ExploitAxis[];
}

export const defaultSettings = (): Settings => ({
  theme: 'dark',
  glare: false,
  defaultView: 'list',
  compactRows: true,
  tags: [...DEFAULT_TAGS],
  exploitAxes: [...DEFAULT_EXPLOIT_AXES],
});

/* ---------- small shared helpers ---------- */

export const pct = (num: number, den: number): number | null =>
  den > 0 ? Math.round((100 * num) / den) : null;

export const fmt = (v: number | null | undefined): string =>
  v === null || v === undefined ? '–' : String(v);

export const tagSlug = (tag: string): string => (tag || '').replace(/\s+/g, '');

export const nowStamp = (): string =>
  new Date().toISOString().slice(0, 16).replace('T', ' ');

export const today = (): string => new Date().toISOString().slice(0, 10);

/** Canonical mockup colors for the starting 4 tags + palette for user-added tags. */
const TAG_COLORS: Record<string, string> = {
  TAG: 'var(--green)',
  LAG: 'var(--red)',
  'Loose Passive': '#c084fc',
  'Tight Passive': 'var(--blue)',
};
const EXTRA_PALETTE = ['#f472b6', '#facc15', '#2dd4bf', '#fb923c', '#a3e635'];

export function tagColor(tag: string, allTags: string[]): string {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag];
  const extras = allTags.filter((t) => !TAG_COLORS[t]);
  const i = extras.indexOf(tag);
  return EXTRA_PALETTE[(i >= 0 ? i : 0) % EXTRA_PALETTE.length];
}
