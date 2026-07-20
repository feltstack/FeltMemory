import { describe, expect, it } from 'vitest';
import {
  MAX_SEATS,
  actingOrder,
  addSeat,
  applyTap,
  assignPositions,
  canAddSeat,
  computeHandDeltas,
  potWayLabel,
  dealerXY,
  nextButtonSeat,
  raiseCount,
  reindexSeats,
  removeSeatAt,
  reorderSeats,
  seatAngle,
  seatXY,
} from './stats';
import type { HandEntry, Seat } from '../types';

/** 9-max table: hero seat 5, open seat 9, players 101..107 elsewhere. */
function table9(): Seat[] {
  const seats: Seat[] = [];
  let pid = 101;
  for (let i = 1; i <= 9; i++) {
    if (i === 5) {
      seats.push({ seatNo: i, playerId: null, hero: true, open: false, stack: '', pos: '', dealer: false });
    } else if (i === 9) {
      seats.push({ seatNo: i, playerId: null, hero: false, open: true, stack: '', pos: '', dealer: false });
    } else {
      seats.push({ seatNo: i, playerId: pid++, hero: false, open: false, stack: '', pos: '', dealer: false });
    }
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

describe('positions & rotation', () => {
  it('assigns BTN/SB/BB then early labels ending in LJ/HJ/CO', () => {
    const seats = assignPositions(table9(), 1, false);
    const pos = (n: number) => seats.find((s) => s.seatNo === n)!.pos;
    expect(pos(1)).toBe('BTN');
    expect(pos(2)).toBe('SB');
    expect(pos(3)).toBe('BB');
    expect(pos(4)).toBe('UTG');
    expect(pos(5)).toBe('UTG+1'); // hero
    expect(pos(6)).toBe('LJ');
    expect(pos(7)).toBe('HJ');
    expect(pos(8)).toBe('CO');
    expect(pos(9)).toBe(''); // open seat unlabeled
    expect(seats.find((s) => s.seatNo === 1)!.dealer).toBe(true);
  });

  it('skips SB when noSB is on', () => {
    const seats = assignPositions(table9(), 1, true);
    const pos = (n: number) => seats.find((s) => s.seatNo === n)!.pos;
    expect(pos(1)).toBe('BTN');
    expect(pos(2)).toBe('BB');
    expect(pos(3)).toBe('UTG');
  });

  it('handles heads-up as BTN/SB vs BB', () => {
    const seats: Seat[] = [
      { seatNo: 1, playerId: 1, hero: false, open: false, stack: '', pos: '', dealer: false },
      { seatNo: 2, playerId: null, hero: true, open: false, stack: '', pos: '', dealer: false },
    ];
    const out = assignPositions(seats, 1, false);
    expect(out[0].pos).toBe('BTN/SB');
    expect(out[1].pos).toBe('BB');
  });

  it('advances the button clockwise, skipping open seats', () => {
    const seats = table9();
    expect(nextButtonSeat(seats, 1)).toBe(2);
    expect(nextButtonSeat(seats, 8)).toBe(1); // seat 9 is open → wraps
  });

  it('orders preflop action UTG→CO then BTN, SB, BB', () => {
    const order = actingOrder(table9(), 1, false);
    expect(order).toEqual([4, 5, 6, 7, 8, 1, 2, 3]);
  });

  it('keeps seat layout inside the felt bounds', () => {
    for (let n = 2; n <= 11; n++) {
      for (let s = 1; s <= n; s++) {
        const [x, y] = seatXY(s, 1, n);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('computeHandDeltas', () => {
  // BTN seat 1 → acting order: 4(UTG),5(hero),6(LJ),7(HJ),8(CO),1(BTN),2(SB),3(BB)
  const seats = table9();

  it('counts a dealt hand for every seated opponent even with no taps', () => {
    const d = computeHandDeltas(seats, [], 1, false);
    expect(d.size).toBe(7); // 9 seats − hero − open
    for (const delta of d.values()) {
      expect(delta).toEqual({ dealt: 1, vpip: 0, pfr: 0, threeBet: 0, threeBetOpp: 0 });
    }
  });

  // Seat→pid map (hero seat 5, open seat 9 skipped):
  // seat1=101, seat2=102, seat3=103, seat4=104, seat6=105, seat7=106, seat8=107.

  it('open raise → PFR + VPIP for raiser; 3-bet opps for everyone after', () => {
    // UTG (seat 4, pid 104) opens.
    const entries = [entry(4, 104, 'raise', 1, 1)];
    const d = computeHandDeltas(seats, entries, 1, false);
    expect(d.get(104)).toMatchObject({ vpip: 1, pfr: 1, threeBet: 0, threeBetOpp: 0 });
    // Everyone acting after UTG (LJ, HJ, CO, BTN, SB, BB) had a 3-bet opportunity.
    for (const pid of [105, 106, 107, 101, 102, 103]) {
      expect(d.get(pid)!.threeBetOpp).toBe(1);
    }
  });

  it('3-bet credits maker; later players face 4-bet (no 3-bet opp)', () => {
    // UTG opens, CO (seat 8, pid 107) 3-bets. BTN/SB/BB face a 3-bet → no opp.
    const entries = [entry(4, 104, 'raise', 1, 1), entry(8, 107, 'raise', 2, 2)];
    const d = computeHandDeltas(seats, entries, 1, false);
    expect(d.get(107)).toMatchObject({ threeBet: 1, threeBetOpp: 1, pfr: 1 });
    expect(d.get(105)!.threeBetOpp).toBe(1); // LJ acted between open and 3-bet
    expect(d.get(106)!.threeBetOpp).toBe(1); // HJ acted between open and 3-bet
    for (const pid of [101, 102, 103]) {
      expect(d.get(pid)!.threeBetOpp).toBe(0); // BTN, SB, BB face the 3-bet
    }
    expect(d.get(104)!.threeBetOpp).toBe(0); // opener can't 3-bet himself
  });

  it('limp before the open earns a 3-bet opportunity (limp-reraise chance)', () => {
    // UTG (pid 103) limps, HJ (seat 7, pid 104... wait: seat6=103? recheck below) opens.
    // Seat→pid map: 1→101, 2→102, 3→103? No — pids assigned in seat order skipping hero seat 5:
    // seat1=101, seat2=102, seat3=103, seat4=104, seat6=105, seat7=106, seat8=107.
    const entries = [
      entry(4, 104, 'limp', 0, 1), // UTG limps
      entry(7, 106, 'raise', 1, 2), // HJ opens
    ];
    const d = computeHandDeltas(seats, entries, 1, false);
    expect(d.get(104)).toMatchObject({ vpip: 1, pfr: 0, threeBetOpp: 1 });
    // LJ (seat 6) acted before the open without entering → no opp.
    expect(d.get(105)!.threeBetOpp).toBe(0);
    // CO, BTN, SB, BB act after the open → opp.
    for (const pid of [107, 101, 102, 103]) {
      expect(d.get(pid)!.threeBetOpp).toBe(1);
    }
  });

  it('cold call after open = VPIP only; no raise → nobody gets 3-bet opps', () => {
    const noRaise = computeHandDeltas(seats, [entry(4, 104, 'limp', 0, 1)], 1, false);
    for (const delta of noRaise.values()) expect(delta.threeBetOpp).toBe(0);

    const entries = [entry(4, 104, 'raise', 1, 1), entry(8, 107, 'call', 0, 2)];
    const d = computeHandDeltas(seats, entries, 1, false);
    expect(d.get(107)).toMatchObject({ vpip: 1, pfr: 0, threeBet: 0, threeBetOpp: 1 });
  });

  it('hero actions are ignored for population stats', () => {
    const entries = [entry(5, null, 'raise', 1, 1)];
    const d = computeHandDeltas(seats, entries, 1, false);
    expect([...d.values()].every((x) => x.pfr === 0 && x.vpip === 0)).toBe(true);
    // But opponents after hero still get 3-bet opps
    expect(d.get(105)!.threeBetOpp).toBe(1);
  });

  it('raiseCount tracks the highest raise level', () => {
    expect(raiseCount([])).toBe(0);
    expect(raiseCount([entry(4, 104, 'raise', 1, 1)])).toBe(1);
    expect(raiseCount([entry(4, 104, 'raise', 1, 1), entry(8, 107, 'raise', 2, 2)])).toBe(2);
  });
});

describe('seat layout (Hero pinned bottom, dealer beside seat 1)', () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

  it('puts Hero at bottom-center whatever seat Hero is in', () => {
    for (const [hero, n] of [[1, 8], [5, 9], [3, 6], [10, 10]] as const) {
      const [x, y] = seatXY(hero, hero, n);
      expect(near(x, 50)).toBe(true); // horizontally centered
      expect(y).toBeGreaterThan(50); // bottom half
    }
  });

  it('matches Connor case: Hero seat 1 (8 seats) → dealer middle-right, seat 8 to its right', () => {
    expect(near(seatAngle(1, 1, 8), 180)).toBe(true); // Hero bottom
    expect(near(seatAngle(0 + 0, 1, 8), 0)).toBe(false); // sanity
    // dealer sits clockwise before seat 1 (lower-right); seat 8 further clockwise-before (upper-right)
    const [dx, dy] = dealerXY(1, 8);
    expect(dx).toBeGreaterThan(50); // right of center
    expect(dy).toBeGreaterThan(50); // lower half → "middle right"
    const [s8x] = seatXY(8, 1, 8);
    expect(s8x).toBeGreaterThan(50); // seat 8 on the right, to the dealer's right
  });

  it('numbers seats clockwise: seat k+1 is clockwise of seat k', () => {
    // Clockwise = increasing screen angle. seat1=180, seat2 should be ~220.
    expect(near(seatAngle(2, 1, 8), 220)).toBe(true);
  });

  it('keeps every seat and the dealer inside the felt', () => {
    for (let n = 2; n <= 11; n++) {
      for (let hero = 1; hero <= n; hero++) {
        for (let s = 1; s <= n; s++) {
          const [x, y] = seatXY(s, hero, n);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(100);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(100);
        }
        const [dxx, dyy] = dealerXY(hero, n);
        expect(dxx).toBeGreaterThanOrEqual(0);
        expect(dxx).toBeLessThanOrEqual(100);
        expect(dyy).toBeGreaterThanOrEqual(0);
        expect(dyy).toBeLessThanOrEqual(100);
      }
    }
  });
});


describe('seat edit helpers (reorder / remove + renumber)', () => {
  const mk = (nos: number[]) =>
    nos.map((n) => ({ seatNo: n, playerId: n === 2 ? null : 100 + n, hero: n === 2, open: false, stack: '', pos: '', dealer: false }));

  it('reorderSeats moves a seat and reindexSeats renumbers 1..n', () => {
    const seats = mk([1, 2, 3, 4]);
    // move seat 4 to where seat 1 is → order becomes [4,1,2,3]
    const out = reindexSeats(reorderSeats(seats, 4, 1));
    expect(out.map((s) => s.seatNo)).toEqual([1, 2, 3, 4]);
    expect(out.map((s) => s.playerId)).toEqual([104, 101, null, 103]);
  });

  it('reorder preserves the hero flag on the moved-around player', () => {
    const seats = mk([1, 2, 3, 4]); // hero is the seat-2 player (playerId null)
    const out = reindexSeats(reorderSeats(seats, 2, 4));
    const heroSeat = out.find((s) => s.hero);
    expect(heroSeat?.seatNo).toBe(4);
  });

  it('removeSeatAt drops a seat and renumbers the rest', () => {
    const seats = mk([1, 2, 3, 4, 5]);
    const out = reindexSeats(removeSeatAt(seats, 3));
    expect(out.map((s) => s.seatNo)).toEqual([1, 2, 3, 4]);
    expect(out.map((s) => s.playerId)).toEqual([101, null, 104, 105]);
    expect(out.length).toBe(4);
  });
});


describe('sitting out (skipped by positions, rotation, dealt-counts)', () => {
  const seat = (n: number, opts: Partial<Seat> = {}): Seat => ({
    seatNo: n, playerId: 100 + n, hero: false, open: false, stack: '', pos: '', dealer: false, ...opts,
  });

  it('assignPositions skips a sitting-out seat', () => {
    const seats = [seat(1), seat(2, { sittingOut: true }), seat(3), seat(4)];
    const out = assignPositions(seats, 1, false);
    const pos = Object.fromEntries(out.map((s) => [s.seatNo, s.pos]));
    expect(pos[2]).toBe(''); // no position while out
    expect(pos[1]).toBe('BTN');
    expect(pos[3]).toBe('SB'); // blinds skip the empty chair
    expect(pos[4]).toBe('BB');
  });

  it('nextButtonSeat hops over a sitting-out seat', () => {
    const seats = [seat(1), seat(2, { sittingOut: true }), seat(3)];
    expect(nextButtonSeat(seats, 1)).toBe(3);
  });

  it('computeHandDeltas does not deal a sitting-out player', () => {
    const seats = [seat(1), seat(2, { sittingOut: true }), seat(3)];
    const d = computeHandDeltas(seats, [], 1, false);
    expect(d.get(102)).toBeUndefined();
    expect(d.get(101)?.dealt).toBe(1);
    expect(d.get(103)?.dealt).toBe(1);
  });
});


describe('straddle (UTG posts a 3rd blind and acts last)', () => {
  it('labels the UTG seat STR and shifts the new UTG one seat left', () => {
    const withStr = assignPositions(table9(), 1, false, true);
    const p = Object.fromEntries(withStr.filter((s) => !s.open).map((s) => [s.seatNo, s.pos]));
    expect(p[3]).toBe('BB');
    expect(p[4]).toBe('STR');
    expect(p[5]).toBe('UTG'); // seat left of the straddle is the new first-to-act
    const noStr = assignPositions(table9(), 1, false, false);
    const p2 = Object.fromEntries(noStr.filter((s) => !s.open).map((s) => [s.seatNo, s.pos]));
    expect(p2[4]).toBe('UTG'); // without straddle, seat 4 is UTG
  });

  it('acting order puts the straddler last; first to act is the seat after it', () => {
    const order = actingOrder(table9(), 1, false, true);
    expect(order[order.length - 1]).toBe(4); // straddler (UTG seat) acts last
    expect(order[0]).toBe(5);
    const base = actingOrder(table9(), 1, false, false);
    expect(base[base.length - 1]).toBe(3); // normally BB acts last
    expect(base[0]).toBe(4);
  });
});


describe('applyTap (re-tap toggles the action off; no escalation)', () => {
  it('repeated raise taps on one seat stay a single raise (no stacking to 5-bet)', () => {
    let e = applyTap([], 3, 103, 'raise');
    expect(e.filter((x) => x.seatNo === 3 && x.action === 'raise')).toHaveLength(1);
    e = applyTap(e, 3, 103, 'raise'); // re-tap → removes it
    expect(e.filter((x) => x.seatNo === 3)).toHaveLength(0);
  });
  it('re-tapping call removes it', () => {
    let e = applyTap([], 4, 104, 'call');
    expect(e).toHaveLength(1);
    e = applyTap(e, 4, 104, 'call');
    expect(e).toHaveLength(0);
  });
  it('raise levels track distinct seats in order and re-rank after a removal', () => {
    let e = applyTap([], 2, 102, 'raise');
    e = applyTap(e, 3, 103, 'raise');
    e = applyTap(e, 4, 104, 'raise');
    expect(Object.fromEntries(e.map((x) => [x.seatNo, x.raiseLevel]))).toEqual({ 2: 1, 3: 2, 4: 3 });
    e = applyTap(e, 3, 103, 'raise'); // remove the middle raise
    expect(
      Object.fromEntries(e.filter((x) => x.action === 'raise').map((x) => [x.seatNo, x.raiseLevel])),
    ).toEqual({ 2: 1, 4: 2 });
  });
  it('limp then raise keeps both (limp-reraise)', () => {
    let e = applyTap([], 5, 105, 'call');
    e = applyTap(e, 5, 105, 'raise');
    expect(e.filter((x) => x.seatNo === 5)).toHaveLength(2);
    expect(e.find((x) => x.action === 'limp')?.seatNo).toBe(5);
    expect(e.find((x) => x.action === 'raise')?.seatNo).toBe(5);
  });
});

describe('potWayLabel', () => {
  const mk = (seats: number[]) =>
    seats.map((sn, i) => ({ seatNo: sn, playerId: 100 + sn, action: 'call' as const, raiseLevel: 0, order: i }));
  it('reports pot participation by distinct seats', () => {
    expect(potWayLabel(mk([]))).toBe('');
    expect(potWayLabel(mk([2]))).toBe('1 in');
    expect(potWayLabel(mk([2, 3]))).toBe('Heads-up');
    expect(potWayLabel(mk([2, 3, 4]))).toBe('3-way');
    expect(potWayLabel(mk([2, 2, 3]))).toBe('Heads-up');
  });
});

describe('addSeat (grow the table mid-session)', () => {
  it('appends one open seat at the next number', () => {
    const seats = addSeat(table9());
    expect(seats).toHaveLength(10);
    const added = seats[9];
    expect(added.seatNo).toBe(10);
    expect(added.open).toBe(true);
    expect(added.playerId).toBeNull();
    expect(added.hero).toBe(false);
  });

  it('preserves every existing seat exactly — players, hero, seat numbers', () => {
    const before = table9();
    const after = addSeat(before);
    expect(after.slice(0, 9)).toEqual(before);
  });

  it('preserves sit-outs and stacks on the seats already there', () => {
    const before = table9().map((s) =>
      s.seatNo === 3 ? { ...s, sittingOut: true, stack: '450' } : s,
    );
    const after = addSeat(before);
    const seat3 = after.find((s) => s.seatNo === 3)!;
    expect(seat3.sittingOut).toBe(true);
    expect(seat3.stack).toBe('450');
  });

  it('keeps the button where it was and extends the rotation', () => {
    const before = table9();
    const btn = 4;
    const orderBefore = actingOrder(before, btn, false);
    const after = addSeat(before);
    // the button seat still exists and is unchanged
    expect(after.find((s) => s.seatNo === btn)).toEqual(before.find((s) => s.seatNo === btn));
    // the new seat is open, so it does not join the rotation until someone sits
    expect(actingOrder(after, btn, false)).toEqual(orderBefore);

    // seat someone in it and the rotation grows by exactly that seat
    const seated = after.map((s) => (s.seatNo === 10 ? { ...s, open: false, playerId: 999 } : s));
    const orderAfter = actingOrder(seated, btn, false);
    expect(orderAfter).toHaveLength(orderBefore.length + 1);
    expect(orderAfter).toContain(10);
  });

  it('re-flows position labels to include the newly seated player', () => {
    const grown = addSeat(table9()).map((s) =>
      s.seatNo === 10 ? { ...s, open: false, playerId: 999 } : s,
    );
    const positions = assignPositions(grown, 1, false);
    expect(positions.find((s) => s.seatNo === 1)!.pos).toBe('BTN');
    expect(positions.find((s) => s.seatNo === 10)!.pos).toBeTruthy();
    // every non-open, non-sitting-out seat gets a label
    const labelled = positions.filter((s) => !s.open && !s.sittingOut);
    expect(labelled.every((s) => s.pos !== '')).toBe(true);
  });

  it('stops at the seat cap', () => {
    let seats = table9();
    while (canAddSeat(seats)) seats = addSeat(seats);
    expect(seats).toHaveLength(MAX_SEATS);
    expect(canAddSeat(seats)).toBe(false);
    expect(addSeat(seats)).toHaveLength(MAX_SEATS);
  });

  it('grows a small table one seat at a time', () => {
    const heads = table9().slice(0, 2);
    const three = addSeat(heads);
    expect(three.map((s) => s.seatNo)).toEqual([1, 2, 3]);
  });
});
