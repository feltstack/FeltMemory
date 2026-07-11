/**
 * Pure stat + table math. No DB, no React — unit-testable.
 *
 * Capture model ("minimal preflop taps"):
 *   - Per hand you tap Call or Raise only for players who voluntarily enter
 *     the pot. Folds are implicit. Save Hand counts a dealt hand for every
 *     occupied seat and advances the button.
 *   - Raise taps are leveled by tap order: 1st raise = open (PFR),
 *     2nd = 3-bet, 3rd = 4-bet, …
 *   - Call taps are auto-labeled: limp (no raise yet) vs call.
 *
 * 3-bet opportunity (denominator) is derived from position order:
 *   once an open exists, every player whose turn comes after the opener had
 *   the chance to 3-bet — until a 3-bet actually happens, after which later
 *   players face a 4-bet decision instead (no 3-bet opp). Players who acted
 *   BEFORE the open only get an opportunity if they had already limped
 *   (action returns to them — the limp-reraise chance).
 */

import type { HandEntry, Seat, StatCounters } from '../types';

/* ---------------- seat layout ---------------- */

/**
 * Table geometry. Hero always sits at the bottom-center of the felt. The human
 * dealer is a FIXED reference — a non-player marker between the highest seat and
 * seat 1: seat 1 immediately to the dealer's (screen) left, the highest seat
 * immediately to its right, seat numbers increasing CLOCKWISE (standard casino
 * convention). The whole layout is a rigid ring rotated so Hero lands at the
 * bottom — nothing is mirrored, so "the player two seats to my left" is always
 * really on the left.
 *
 * Ring has one slot per seat plus one for the dealer (n + 1 slots). Clockwise
 * order is DEALER, seat 1, seat 2, …, seat n; slot index == seat number, dealer
 * == slot 0. We rotate so Hero (heroSeat) sits at 180° (bottom-center).
 */
const RING_R = 40;

function slotAngleDeg(slot: number, heroSeat: number, n: number): number {
  const step = 360 / (n + 1);
  return slot * step + (180 - heroSeat * step);
}

function angleToXY(angleDeg: number, r = RING_R): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [50 + r * Math.sin(rad), 50 - r * Math.cos(rad)];
}

/** [x%, y%] for a seat chip, given which seat Hero occupies (Hero pinned bottom). */
export function seatXY(seatNo: number, heroSeat: number, n: number): [number, number] {
  return angleToXY(slotAngleDeg(seatNo, heroSeat, n));
}

/** [x%, y%] for the fixed human-dealer marker (ring slot 0, between seat n and seat 1). */
export function dealerXY(heroSeat: number, n: number, r = RING_R): [number, number] {
  return angleToXY(slotAngleDeg(0, heroSeat, n), r);
}

/** Normalized [0,360) screen angle of a seat (0=top, 90=right, 180=bottom). Test helper. */
export function seatAngle(seatNo: number, heroSeat: number, n: number): number {
  return ((slotAngleDeg(seatNo, heroSeat, n) % 360) + 360) % 360;
}

/* ---- seat edit mode (reorder / remove with auto-renumber) ---- */

/** Seats sorted by seatNo (ascending). */
function bySeatNo(seats: Seat[]): Seat[] {
  return [...seats].sort((a, b) => a.seatNo - b.seatNo);
}

/**
 * Reorder occupants: pull the seat at `fromSeat` and re-insert it at the slot
 * currently holding `toSeat` (insert-shift). Returns the ORIGINAL seat objects
 * in their new order (seatNo NOT yet renumbered — call reindexSeats).
 */
export function reorderSeats(seats: Seat[], fromSeat: number, toSeat: number): Seat[] {
  const arr = bySeatNo(seats);
  const fi = arr.findIndex((s) => s.seatNo === fromSeat);
  const ti = arr.findIndex((s) => s.seatNo === toSeat);
  if (fi < 0 || ti < 0) return arr;
  const [moved] = arr.splice(fi, 1);
  arr.splice(ti, 0, moved);
  return arr;
}

/** Drop a seat; returns remaining ORIGINAL objects in order (not yet renumbered). */
export function removeSeatAt(seats: Seat[], seatNo: number): Seat[] {
  return bySeatNo(seats).filter((s) => s.seatNo !== seatNo);
}

/** Renumber seatNo = position (1-based), preserving array order. */
export function reindexSeats(seats: Seat[]): Seat[] {
  return seats.map((s, i) => ({ ...s, seatNo: i + 1 }));
}

/** Seats in clockwise rotation order starting from (and including) fromSeat. */
function rotationFrom(occupied: Seat[], fromSeat: number): Seat[] {
  const sorted = [...occupied].sort((a, b) => a.seatNo - b.seatNo);
  const i = sorted.findIndex((s) => s.seatNo === fromSeat);
  if (i < 0) return sorted;
  return [...sorted.slice(i), ...sorted.slice(0, i)];
}

const EARLY_HEAD = ['UTG', 'UTG+1', 'UTG+2', 'UTG+3', 'UTG+4', 'UTG+5'];
const EARLY_TAIL = ['LJ', 'HJ', 'CO'];

function earlyLabels(count: number): string[] {
  if (count <= 0) return [];
  const tail = EARLY_TAIL.slice(Math.max(0, 3 - count));
  const head = EARLY_HEAD.slice(0, count - tail.length);
  return [...head, ...tail];
}

/**
 * Assign position labels + dealer flag, mutating copies (returns new array).
 * BTN → SB → BB → UTG…CO clockwise; supports 2–11 max, open seats skipped,
 * optional no-SB (dead small blind) games.
 */
export function assignPositions(
  seats: Seat[],
  btnSeat: number,
  noSB: boolean,
): Seat[] {
  const out = seats.map((s) => ({ ...s, pos: '', dealer: false }));
  const occupied = out.filter((s) => !s.open && !s.sittingOut);
  if (occupied.length < 2) {
    const btn = occupied.find((s) => s.seatNo === btnSeat) ?? occupied[0];
    if (btn) {
      btn.pos = 'BTN';
      btn.dealer = true;
    }
    return out;
  }
  const rot = rotationFrom(occupied, btnSeat);
  if (rot.length === 2) {
    rot[0].pos = 'BTN/SB';
    rot[0].dealer = true;
    rot[1].pos = 'BB';
    return out;
  }
  rot[0].pos = 'BTN';
  rot[0].dealer = true;
  let next = 1;
  if (!noSB) {
    rot[next].pos = 'SB';
    next++;
  }
  rot[next].pos = 'BB';
  next++;
  const labels = earlyLabels(rot.length - next);
  for (let k = 0; k < labels.length; k++) rot[next + k].pos = labels[k];
  return out;
}

/** Next occupied seat clockwise from current button (skips open seats). */
export function nextButtonSeat(seats: Seat[], btnSeat: number): number {
  const occupied = seats.filter((s) => !s.open && !s.sittingOut);
  if (occupied.length === 0) return btnSeat;
  const rot = rotationFrom(occupied, btnSeat);
  const cur = rot.findIndex((s) => s.seatNo === btnSeat);
  return rot[(Math.max(cur, 0) + 1) % rot.length].seatNo;
}

/**
 * Preflop acting order as seat numbers: UTG…CO, BTN, SB, BB (blinds last).
 * Heads-up: BTN/SB first, BB last. Open seats excluded.
 */
export function actingOrder(
  seats: Seat[],
  btnSeat: number,
  noSB: boolean,
): number[] {
  const occupied = seats.filter((s) => !s.open && !s.sittingOut);
  const rot = rotationFrom(occupied, btnSeat).map((s) => s.seatNo);
  if (rot.length <= 2) return rot; // HU: BTN acts first preflop
  const blinds = noSB ? 2 : 3; // BTN(+SB)+BB at the head of rotation
  return [...rot.slice(blinds), ...rot.slice(0, blinds)];
}

/* ---------------- hand commit math ---------------- */

export interface HandDelta {
  dealt: number;
  vpip: number;
  pfr: number;
  threeBet: number;
  threeBetOpp: number;
}

/** Per-playerId stat deltas for one committed hand. Hero (playerId null) skipped. */
export function computeHandDeltas(
  seats: Seat[],
  entries: HandEntry[],
  btnSeat: number,
  noSB: boolean,
): Map<number, HandDelta> {
  const deltas = new Map<number, HandDelta>();
  const seatToPlayer = new Map<number, number | null>();
  for (const s of seats) seatToPlayer.set(s.seatNo, s.playerId);

  const blank = (): HandDelta => ({
    dealt: 0,
    vpip: 0,
    pfr: 0,
    threeBet: 0,
    threeBetOpp: 0,
  });
  const get = (pid: number): HandDelta => {
    let d = deltas.get(pid);
    if (!d) {
      d = blank();
      deltas.set(pid, d);
    }
    return d;
  };

  // Everyone seated (non-open, non-hero) was dealt in.
  for (const s of seats) {
    if (!s.open && !s.sittingOut && !s.hero && s.playerId != null)
      get(s.playerId).dealt = 1;
  }

  const ordered = [...entries].sort((a, b) => a.order - b.order);

  // VPIP / PFR / 3-bet numerators straight from taps.
  for (const e of ordered) {
    if (e.playerId == null) continue;
    const d = get(e.playerId);
    d.vpip = 1;
    if (e.action === 'raise' && e.raiseLevel >= 1) d.pfr = 1;
    if (e.action === 'raise' && e.raiseLevel === 2) {
      d.threeBet = 1;
      d.threeBetOpp = 1; // making a 3-bet implies the opportunity
    }
  }

  // 3-bet opportunities from position order.
  const open = ordered.find((e) => e.action === 'raise' && e.raiseLevel === 1);
  if (open) {
    const order = actingOrder(seats, btnSeat, noSB);
    const idxOf = (seatNo: number) => order.indexOf(seatNo);
    const openIdx = idxOf(open.seatNo);
    const threeBetEntry = ordered.find(
      (e) => e.action === 'raise' && e.raiseLevel === 2,
    );
    const tbIdx = threeBetEntry ? idxOf(threeBetEntry.seatNo) : Infinity;

    for (const seatNo of order) {
      if (seatNo === open.seatNo) continue;
      const pid = seatToPlayer.get(seatNo);
      if (pid == null) continue; // hero or unknown
      const i = idxOf(seatNo);
      let opp = false;
      if (i > openIdx) {
        // Acts after the opener — has the chance until a 3-bet lands first.
        opp = i <= tbIdx;
      } else {
        // Acted before the opener — only if they voluntarily entered first
        // (limped), so the raise comes back around to them.
        opp = ordered.some(
          (e) => e.seatNo === seatNo && e.order < open.order,
        );
      }
      if (opp) get(pid).threeBetOpp = 1;
    }
  }

  return deltas;
}

export function applyDelta(c: StatCounters, d: HandDelta): StatCounters {
  return {
    dealt: c.dealt + d.dealt,
    vpip: c.vpip + d.vpip,
    pfr: c.pfr + d.pfr,
    threeBet: c.threeBet + d.threeBet,
    threeBetOpp: c.threeBetOpp + d.threeBetOpp,
  };
}

/** Label for a Call tap given how many raises are already in: limp vs call. */
export function callLabel(raiseCount: number): 'limp' | 'call' {
  return raiseCount === 0 ? 'limp' : 'call';
}

/** Current raise count in the pending hand. */
export function raiseCount(entries: HandEntry[]): number {
  return entries.reduce(
    (m, e) => (e.action === 'raise' ? Math.max(m, e.raiseLevel) : m),
    0,
  );
}

/** Short badge for a seat's strongest pending action this hand. */
export function pendingBadge(
  entries: HandEntry[],
  seatNo: number,
): string | null {
  let best: string | null = null;
  let bestLevel = -1;
  for (const e of entries) {
    if (e.seatNo !== seatNo) continue;
    const level = e.action === 'raise' ? e.raiseLevel : 0;
    if (level > bestLevel) {
      bestLevel = level;
      best =
        e.action === 'raise'
          ? e.raiseLevel === 1
            ? 'Open'
            : `${e.raiseLevel + 1}-Bet`
          : e.action === 'limp'
            ? 'Limp'
            : 'Call';
    }
  }
  return best;
}
