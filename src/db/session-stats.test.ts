import { describe, expect, it } from 'vitest';
import { applyDelta, computeHandDeltas } from './stats';
import {
  avgOpponentStats,
  fmtDuration,
  foldHands,
  inRange,
  recordIsReplayable,
  recordSeats,
  sessionNotes,
} from './session-stats';
import { emptyCounters, type HandEntry, type HandRecord, type Seat, type StatCounters } from '../types';

/** Same 9-max fixture the stat-engine tests use: hero seat 5, open seat 9. */
function table9(): Seat[] {
  const seats: Seat[] = [];
  let pid = 101;
  for (let i = 1; i <= 9; i++) {
    if (i === 5) seats.push({ seatNo: i, playerId: null, hero: true, open: false, stack: '', pos: '', dealer: false });
    else if (i === 9) seats.push({ seatNo: i, playerId: null, hero: false, open: true, stack: '', pos: '', dealer: false });
    else seats.push({ seatNo: i, playerId: pid++, hero: false, open: false, stack: '', pos: '', dealer: false });
  }
  return seats;
}

const entry = (
  seatNo: number,
  playerId: number | null,
  action: 'limp' | 'call' | 'raise',
  raiseLevel: number,
  order: number,
): HandEntry => ({ seatNo, playerId, action, raiseLevel, order });

const rec = (handNo: number, entries: HandEntry[], btnSeat = 1, seats = table9()): HandRecord => ({
  sessionId: 1,
  handNo,
  ts: `2026-07-19T18:${String(handNo).padStart(2, '0')}`,
  btnSeat,
  noSB: false,
  straddle: false,
  entries,
  dealtPlayerIds: seats.filter((s) => !s.open && !s.hero && s.playerId != null).map((s) => s.playerId!),
  seats,
});

/** The scenarios exercised in stats.test.ts, replayed as stored records. */
function scenarioHands(): HandRecord[] {
  return [
    // no taps — everyone just dealt in
    rec(1, []),
    // open raise from seat 2 → PFR + 3-bet opps behind
    rec(2, [entry(2, 102, 'raise', 1, 0)]),
    // open + 3-bet: later players face a 4-bet, no 3-bet opp
    rec(3, [entry(2, 102, 'raise', 1, 0), entry(6, 105, 'raise', 2, 1)]),
    // limp before the open earns a 3-bet opportunity
    rec(4, [entry(3, 103, 'limp', 0, 0), entry(7, 106, 'raise', 1, 1)]),
    // cold call after an open, no raise from anyone else
    rec(5, [entry(2, 102, 'raise', 1, 0), entry(8, 107, 'call', 0, 1)]),
    // hero taps are ignored for population stats
    rec(6, [entry(5, null, 'raise', 1, 0), entry(4, 104, 'call', 0, 1)]),
    // straddle hand with a different button
    { ...rec(7, [entry(6, 105, 'raise', 1, 0)], 4), straddle: true },
  ];
}

/** The incremental path: exactly what commitHand does, hand after hand. */
function incremental(hands: HandRecord[]): Map<number, StatCounters> {
  const acc = new Map<number, StatCounters>();
  for (const h of hands) {
    const deltas = computeHandDeltas(recordSeats(h), h.entries, h.btnSeat, h.noSB, h.straddle);
    for (const [pid, d] of deltas) acc.set(pid, applyDelta(acc.get(pid) ?? emptyCounters(), d));
  }
  return acc;
}

describe('foldHands — replay equals the incremental counters', () => {
  it('fold of ALL hands matches hand-by-hand accumulation', () => {
    const hands = scenarioHands();
    const folded = foldHands(hands).byPlayer;
    const inc = incremental(hands);
    expect([...folded.keys()].sort()).toEqual([...inc.keys()].sort());
    for (const [pid, c] of inc) expect(folded.get(pid)).toEqual(c);
  });

  it('is order-independent — shuffled records fold to the same result', () => {
    const hands = scenarioHands();
    const shuffled = [hands[4], hands[0], hands[6], hands[2], hands[5], hands[1], hands[3]];
    expect(foldHands(shuffled).byPlayer).toEqual(foldHands(hands).byPlayer);
  });

  it('splitting the range and summing equals the whole fold', () => {
    const hands = scenarioHands();
    const whole = foldHands(hands).byPlayer;
    const a = foldHands(hands, { to: 3 }).byPlayer;
    const b = foldHands(hands, { from: 4 }).byPlayer;
    for (const [pid, c] of whole) {
      const left = a.get(pid) ?? emptyCounters();
      const right = b.get(pid) ?? emptyCounters();
      expect(applyDelta(left, right)).toEqual(c);
    }
  });

  it('folds a prefix the way a replayer would — 1..N grows monotonically', () => {
    const hands = scenarioHands();
    let prev = 0;
    for (let n = 1; n <= hands.length; n++) {
      const r = foldHands(hands, { to: n });
      expect(r.handsFolded).toBe(n);
      const dealt = r.byPlayer.get(102)!.dealt;
      expect(dealt).toBeGreaterThanOrEqual(prev);
      prev = dealt;
    }
    expect(foldHands(hands, { to: hands.length }).byPlayer.get(102)!.dealt).toBe(hands.length);
  });

  it('counts dealt hands per player across the session', () => {
    const r = foldHands(scenarioHands());
    expect(r.handsFolded).toBe(7);
    expect(r.lastHandNo).toBe(7);
    expect(r.byPlayer.get(102)!.dealt).toBe(7);
    expect(r.byPlayer.get(102)!.pfr).toBe(3); // hands 2, 3, 5
    expect(r.byPlayer.get(105)!.threeBet).toBe(1); // hand 3
  });

  it('an empty range folds to nothing', () => {
    const r = foldHands(scenarioHands(), { from: 99 });
    expect(r.handsFolded).toBe(0);
    expect(r.byPlayer.size).toBe(0);
  });
});

describe('hand range', () => {
  it('bounds are inclusive and optional', () => {
    expect(inRange(5, {})).toBe(true);
    expect(inRange(5, { from: 5, to: 5 })).toBe(true);
    expect(inRange(4, { from: 5 })).toBe(false);
    expect(inRange(6, { to: 5 })).toBe(false);
  });
});

describe('legacy records without a seat snapshot', () => {
  it('flags them and still folds without throwing', () => {
    const hands = scenarioHands().map(({ seats: _seats, ...r }) => r as HandRecord);
    const r = foldHands(hands);
    expect(r.approxHands).toBe(7);
    expect(recordIsReplayable(hands[0])).toBe(false);
    expect(r.byPlayer.get(102)!.dealt).toBe(7);
  });

  it('rebuilds seats from entries and the dealt list', () => {
    const [first] = scenarioHands();
    const { seats: _s, ...legacy } = first;
    const seats = recordSeats(legacy as HandRecord);
    expect(seats.map((s) => s.playerId)).toContain(101);
    expect(seats.every((s) => !s.open)).toBe(true);
  });
});

describe('avgOpponentStats', () => {
  it('averages each opponent equally, ignoring players with no sample', () => {
    const m = new Map<number, StatCounters>([
      [1, { dealt: 10, vpip: 5, pfr: 2, threeBet: 1, threeBetOpp: 4 }], // 50 / 20 / 25
      [2, { dealt: 10, vpip: 3, pfr: 0, threeBet: 0, threeBetOpp: 0 }], // 30 / 0 / n/a
      [3, { dealt: 0, vpip: 0, pfr: 0, threeBet: 0, threeBetOpp: 0 }], // no sample
    ]);
    const a = avgOpponentStats(m);
    expect(a.players).toBe(2);
    expect(a.vpip).toBe(40);
    expect(a.pfr).toBe(10);
    expect(a.threeBet).toBe(25); // only the player who had the chance
  });

  it('returns nulls for an empty table', () => {
    expect(avgOpponentStats(new Map())).toEqual({ vpip: null, pfr: null, threeBet: null, players: 0 });
  });
});

describe('sessionNotes', () => {
  const notes = [
    { t: '2026-07-19 19:00', text: 'stamped later hand', sid: 7, sh: 12 },
    { t: '2026-07-19 18:30', text: 'stamped early hand', sid: 7, sh: 3 },
    { t: '2026-07-19 18:45', text: 'other session', sid: 8, sh: 1 },
    { t: '2026-07-19 18:50', text: 'legacy in window' },
    { t: '2026-07-18 10:00', text: 'legacy outside window' },
  ];

  it('keeps this session only, hand-stamped notes in hand order', () => {
    const out = sessionNotes(notes, 7, '2026-07-19T18:00', '2026-07-19T20:00');
    expect(out.map((n) => n.text)).toEqual([
      'stamped early hand',
      'stamped later hand',
      'legacy in window',
    ]);
  });

  it('treats an open session as running to now', () => {
    const out = sessionNotes(notes, 7, '2026-07-19T18:00', null);
    expect(out).toHaveLength(3);
  });

  it('handles a player with no notes', () => {
    expect(sessionNotes(undefined, 7, '2026-07-19T18:00', null)).toEqual([]);
  });
});

describe('fmtDuration', () => {
  it('formats hours and minutes', () => {
    expect(fmtDuration('2026-07-19T18:00:00Z', '2026-07-19T20:41:00Z')).toBe('2h 41m');
    expect(fmtDuration('2026-07-19T18:00:00Z', '2026-07-19T18:48:00Z')).toBe('48m');
  });

  it('runs an open session up to now', () => {
    const now = Date.parse('2026-07-19T19:30:00Z');
    expect(fmtDuration('2026-07-19T18:00:00Z', null, now)).toBe('1h 30m');
  });

  it('is defensive about bad input', () => {
    expect(fmtDuration('nonsense', null)).toBe('—');
  });
});
