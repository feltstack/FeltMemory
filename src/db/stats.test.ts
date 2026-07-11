import { describe, expect, it } from 'vitest';
import {
  actingOrder,
  assignPositions,
  computeHandDeltas,
  nextButtonSeat,
  raiseCount,
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
        const [x, y] = seatXY(s, n);
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
