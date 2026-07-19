/**
 * Session-scoped stats by REPLAY, not by aggregation.
 *
 * Everything here folds stored HandRecords one hand at a time through the same
 * `computeHandDeltas` / `applyDelta` pair the live commit path uses. That makes
 * the fold over hands 1..N identical to the incremental counters by construction
 * (asserted in session-stats.test.ts), and it means a hand-by-hand replayer only
 * has to vary the range — no second stat implementation to keep in sync.
 */
import { applyDelta, computeHandDeltas } from './stats';
import { emptyCounters, type HandRecord, type Note, type Seat, type StatCounters } from '../types';

/** Inclusive hand-number window. Omit a bound to run open-ended. */
export interface HandRange {
  from?: number;
  to?: number;
}

export function inRange(handNo: number, range: HandRange = {}): boolean {
  if (range.from != null && handNo < range.from) return false;
  if (range.to != null && handNo > range.to) return false;
  return true;
}

/**
 * Seats as they were when the hand was dealt.
 *
 * Records written before v0.2.20 carry no snapshot; we rebuild what we can from
 * the entries + dealt list. Seat numbers for players who never acted are unknown,
 * so acting order is approximate and 3-bet OPPORTUNITIES may be undercounted for
 * those legacy hands. `recordIsReplayable` reports which is which.
 */
export function recordSeats(rec: HandRecord): Seat[] {
  if (rec.seats?.length) return rec.seats;
  const bySeat = new Map<number, number | null>();
  for (const e of rec.entries) bySeat.set(e.seatNo, e.playerId);
  const placed = new Set([...bySeat.values()].filter((v): v is number => v != null));
  let next = 1;
  for (const pid of rec.dealtPlayerIds) {
    if (placed.has(pid)) continue;
    while (bySeat.has(next)) next++;
    bySeat.set(next, pid);
    placed.add(pid);
  }
  return [...bySeat.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seatNo, playerId]) => ({
      seatNo,
      playerId,
      hero: playerId == null,
      open: false,
      stack: '',
      pos: '',
      dealer: false,
    }));
}

export function recordIsReplayable(rec: HandRecord): boolean {
  return !!rec.seats?.length;
}

export interface FoldResult {
  /** playerId → counters accumulated over the folded hands */
  byPlayer: Map<number, StatCounters>;
  handsFolded: number;
  /** hands lacking a seat snapshot (approximate 3-bet opportunities) */
  approxHands: number;
  lastHandNo: number;
}

/**
 * THE fold. Replays each record in hand order and accumulates per-player counters.
 * `foldHands(all)` === the live incremental counters; narrowing the range is what
 * the future hand-by-hand replayer will do.
 */
export function foldHands(hands: HandRecord[], range: HandRange = {}): FoldResult {
  const ordered = [...hands]
    .filter((h) => inRange(h.handNo, range))
    .sort((a, b) => a.handNo - b.handNo);

  const byPlayer = new Map<number, StatCounters>();
  let approxHands = 0;
  let lastHandNo = 0;

  for (const rec of ordered) {
    if (!recordIsReplayable(rec)) approxHands++;
    lastHandNo = Math.max(lastHandNo, rec.handNo);
    const deltas = computeHandDeltas(
      recordSeats(rec),
      rec.entries,
      rec.btnSeat,
      rec.noSB,
      rec.straddle ?? false,
    );
    for (const [pid, delta] of deltas) {
      byPlayer.set(pid, applyDelta(byPlayer.get(pid) ?? emptyCounters(), delta));
    }
  }

  return { byPlayer, handsFolded: ordered.length, approxHands, lastHandNo };
}

export function pct(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 100) : null;
}

export function fmtPct(num: number, den: number): string {
  const v = pct(num, den);
  return v == null ? '—' : `${v}%`;
}

export interface AvgStats {
  vpip: number | null;
  pfr: number | null;
  threeBet: number | null;
  players: number;
}

/**
 * Average opponent stats for a session: the mean of each opponent's own
 * percentage (one player, one vote) — not a pooled hand total, which would let
 * the player dealt the most hands dominate the table read.
 */
export function avgOpponentStats(byPlayer: Map<number, StatCounters>): AvgStats {
  const mean = (vals: number[]): number | null =>
    vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;

  const counters = [...byPlayer.values()];
  const dealt = counters.filter((c) => c.dealt > 0);
  return {
    vpip: mean(dealt.map((c) => (c.vpip / c.dealt) * 100)),
    pfr: mean(dealt.map((c) => (c.pfr / c.dealt) * 100)),
    threeBet: mean(
      counters.filter((c) => c.threeBetOpp > 0).map((c) => (c.threeBet / c.threeBetOpp) * 100),
    ),
    players: dealt.length,
  };
}

/**
 * Notes taken during a session. Notes stamped with `sid` are exact; older notes
 * fall back to the session's time window, which is the best the data allows.
 * Hand-stamped notes sort first in hand order, unstamped ones after by time.
 */
export function sessionNotes(
  notes: Note[] | undefined,
  sessionId: number,
  startedAt: string,
  endedAt: string | null,
): Note[] {
  const from = startedAt.slice(0, 16).replace('T', ' ');
  const to = (endedAt ?? '9999-12-31T23:59').slice(0, 16).replace('T', ' ');
  const mine = (notes ?? []).filter((n) =>
    n.sid != null ? n.sid === sessionId : n.t >= from && n.t <= to,
  );
  return mine.sort((a, b) => {
    if (a.sh != null && b.sh != null) return a.sh - b.sh;
    if (a.sh != null) return -1;
    if (b.sh != null) return 1;
    return a.t.localeCompare(b.t);
  });
}

/** "2h 41m" / "48m" / "—" while a session is still open with no elapsed time. */
export function fmtDuration(startedAt: string, endedAt: string | null, now = Date.now()): string {
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
  const mins = Math.floor((end - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** "2026-07-19 18:40" → "Jul 19, 2026" */
export function fmtSessionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
