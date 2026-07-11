import { describe, expect, it } from 'vitest';
import { abbrevPos, abbrevAction } from './labels';

describe('abbrevPos', () => {
  it('maps early positions and the button', () => {
    expect(abbrevPos('UTG')).toBe('EP');
    expect(abbrevPos('UTG+1')).toBe('E+1');
    expect(abbrevPos('UTG+4')).toBe('E+4');
    expect(abbrevPos('BTN')).toBe('BU');
    expect(abbrevPos('BTN/SB')).toBe('BU/SB'); // heads-up
  });
  it('leaves other positions untouched', () => {
    for (const p of ['SB', 'BB', 'LJ', 'HJ', 'CO', 'Open', '']) {
      expect(abbrevPos(p)).toBe(p);
    }
  });
});

describe('abbrevAction', () => {
  it('shortens Call/Raise, leaves the rest', () => {
    expect(abbrevAction('Call')).toBe('C');
    expect(abbrevAction('Raise')).toBe('R');
    expect(abbrevAction('Limp')).toBe('Limp');
  });
});
