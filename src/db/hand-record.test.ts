import { describe, expect, it } from 'vitest';
import { buildHandRecord, normalizePostflop } from './hand-record';
import { reducer } from '../state/AppContext';
import type { HandEntry, LiveState, Seat } from '../types';

function seats(): Seat[] {
  return [1, 2, 3].map((n) => ({
    seatNo: n,
    playerId: n === 1 ? null : 100 + n,
    hero: n === 1,
    open: false,
    stack: '',
    pos: '',
    dealer: false,
  }));
}

const entries: HandEntry[] = [
  { seatNo: 2, playerId: 102, action: 'raise', raiseLevel: 1, order: 0 },
];

function live(over: Partial<LiveState> = {}): LiveState {
  return {
    sessionId: 7,
    venueName: 'MD Live',
    stakes: '$1/$3',
    tableSize: 3,
    seats: seats(),
    btnSeat: 1,
    heroSeat: 1,
    handNo: 12,
    noSB: false,
    straddle: false,
    mustStraddle: false,
    currentEntries: entries,
    startedAt: '2026-07-20T18:00:00Z',
    ...over,
  } as LiveState;
}

describe('postflop text on the committed hand', () => {
  it('lands on the hand record as entered', () => {
    const rec = buildHandRecord(live({ postflop: 'K87sds B,c,c T:2x B,F,C' }), [102, 103]);
    expect(rec.postflop).toBe('K87sds B,c,c T:2x B,F,C');
    expect(rec.handNo).toBe(12);
    expect(rec.entries).toEqual(entries);
    expect(rec.dealtPlayerIds).toEqual([102, 103]);
  });

  it('is trimmed, and omitted entirely when blank', () => {
    expect(buildHandRecord(live({ postflop: '  K87  ' }), []).postflop).toBe('K87');
    expect(buildHandRecord(live({ postflop: '   ' }), []).postflop).toBeUndefined();
    expect(buildHandRecord(live({ postflop: undefined }), []).postflop).toBeUndefined();
    expect('postflop' in buildHandRecord(live(), [])).toBe(false);
  });

  it('normalizePostflop handles the empty cases', () => {
    expect(normalizePostflop(' x ')).toBe('x');
    expect(normalizePostflop('')).toBeUndefined();
    expect(normalizePostflop(null)).toBeUndefined();
  });

  it('snapshots seats alongside the text so the hand stays replayable', () => {
    const rec = buildHandRecord(live({ postflop: 'K87' }), [102]);
    expect(rec.seats).toHaveLength(3);
    expect(rec.seats).not.toBe(live().seats); // copied, not aliased
  });
});

describe('postflop input lifecycle', () => {
  it('SET_POSTFLOP stores the raw text', () => {
    const next = reducer(live({ postflop: '' }), { type: 'SET_POSTFLOP', text: 'K87sds B,c' });
    expect(next.postflop).toBe('K87sds B,c');
  });

  it('clears on commit so the next hand starts blank', () => {
    const next = reducer(live({ postflop: 'K87sds B,c' }), { type: 'HAND_COMMITTED', nextBtn: 2 });
    expect(next.postflop).toBe('');
    expect(next.handNo).toBe(13);
    expect(next.currentEntries).toEqual([]);
  });

  it('survives clearing or undoing the hand — only ✓ or manual clear wipes it', () => {
    const withText = live({ postflop: 'K87sds B,c' });
    expect(reducer(withText, { type: 'CLEAR_HAND' }).postflop).toBe('K87sds B,c');
    expect(reducer(withText, { type: 'UNDO_TAP' }).postflop).toBe('K87sds B,c');
    expect(reducer(withText, { type: 'SET_POSTFLOP', text: '' }).postflop).toBe('');
  });
});
