import { describe, expect, it } from 'vitest';
import {
  BREAK_PRESETS,
  breakElapsedMs,
  breakIsOver,
  breakRemainingMs,
  fmtClock,
  isPaused,
  parseBreakMins,
  pauseAt,
  playedMs,
  resumeFrom,
} from './breaks';

const T0 = Date.parse('2026-07-19T18:00:00Z');
const at = (mins: number) => T0 + mins * 60000;
const iso = (mins: number) => new Date(at(mins)).toISOString();

describe('break clock', () => {
  it('offers the four presets', () => {
    expect(BREAK_PRESETS).toEqual([15, 30, 45, 60]);
  });

  it('counts plain elapsed time when never paused', () => {
    expect(playedMs(iso(0), null, {}, at(90))).toBe(90 * 60000);
  });

  it('excludes a break in progress from playing time', () => {
    const s = pauseAt(15, at(60));
    expect(isPaused(s)).toBe(true);
    // 90 min wall clock, paused at 60 → 60 min played, 30 min on break
    expect(playedMs(iso(0), null, s, at(90))).toBe(60 * 60000);
    expect(breakElapsedMs(s, at(90))).toBe(30 * 60000);
  });

  it('excludes finished breaks and keeps counting after resume', () => {
    const paused = pauseAt(15, at(60));
    const resumed = resumeFrom(paused, at(75)); // 15-minute break
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.breakMs).toBe(15 * 60000);
    expect(playedMs(iso(0), null, resumed, at(100))).toBe(85 * 60000);
  });

  it('accumulates multiple breaks', () => {
    let s = resumeFrom(pauseAt(15, at(30)), at(45)); // 15 min
    s = resumeFrom({ ...s, ...pauseAt(30, at(90)) }, at(110)); // + 20 min
    expect(s.breakMs).toBe(35 * 60000);
    expect(playedMs(iso(0), null, s, at(120))).toBe(85 * 60000);
  });

  it('counts a break down and reports when it runs over', () => {
    const s = pauseAt(15, at(60));
    expect(breakRemainingMs(s, at(65))).toBe(10 * 60000);
    expect(breakIsOver(s, at(65))).toBe(false);
    expect(breakIsOver(s, at(75))).toBe(true);
    expect(breakRemainingMs(s, at(80))).toBe(-5 * 60000);
  });

  it('has no countdown for an open-ended break', () => {
    const s = pauseAt(null, at(60));
    expect(breakRemainingMs(s, at(80))).toBeNull();
    expect(breakIsOver(s, at(80))).toBe(false);
    expect(breakElapsedMs(s, at(80))).toBe(20 * 60000);
  });

  it('freezes at session end rather than running forever', () => {
    expect(playedMs(iso(0), iso(120), {}, at(999))).toBe(120 * 60000);
  });

  it('never returns negative time', () => {
    expect(playedMs(iso(0), null, {}, at(-10))).toBe(0);
    expect(playedMs('nonsense', null, {})).toBe(0);
    expect(breakElapsedMs({ pausedAt: 'nonsense' })).toBe(0);
  });
});

describe('fmtClock', () => {
  it('formats minutes and seconds, adding hours when needed', () => {
    expect(fmtClock(65000)).toBe('1:05');
    expect(fmtClock(3750000)).toBe('1:02:30');
    expect(fmtClock(0)).toBe('0:00');
  });

  it('strips the sign so overruns render as a magnitude', () => {
    expect(fmtClock(-65000)).toBe('1:05');
  });
});

describe('parseBreakMins', () => {
  it('accepts sane minute counts', () => {
    expect(parseBreakMins('20')).toBe(20);
    expect(parseBreakMins(' 45 ')).toBe(45);
    expect(parseBreakMins('12.6')).toBe(13);
  });

  it('rejects junk and out-of-range values', () => {
    expect(parseBreakMins('')).toBeNull();
    expect(parseBreakMins('abc')).toBeNull();
    expect(parseBreakMins('0')).toBeNull();
    expect(parseBreakMins('-5')).toBeNull();
    expect(parseBreakMins('99999')).toBeNull();
  });
});
