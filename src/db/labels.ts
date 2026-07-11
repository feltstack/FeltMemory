/**
 * Single source of truth for short display labels on the compact surfaces
 * (felt / list / cards). Display-only — the underlying position/action values
 * from the reducer are unchanged (e.g. s.pos stays 'BTN' for logic).
 */

/** Position abbreviations: UTG→EP, UTG+n→E+n, BTN→BU (heads-up BTN/SB→BU/SB). */
export function abbrevPos(pos: string): string {
  if (pos === 'BTN') return 'BU';
  if (pos === 'BTN/SB') return 'BU/SB';
  if (pos === 'UTG') return 'EP';
  const m = /^UTG\+(\d+)$/.exec(pos);
  if (m) return `E+${m[1]}`;
  return pos; // SB, BB, LJ, HJ, CO, Open, … unchanged
}

/** Action abbreviations for compact buttons: Call→C, Raise→R. */
export function abbrevAction(action: string): string {
  if (action === 'Call') return 'C';
  if (action === 'Raise') return 'R';
  return action;
}
