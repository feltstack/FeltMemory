import { describe, it, expect } from 'vitest';
import {
  SESSION_KINDS,
  STAKES_PRESETS,
  parseVenueStakes,
  stakesOptions,
  isCustomStakes,
  sessionBadge,
  filterTestSessions,
} from './session-meta';

describe('session-meta', () => {
  it('offers the three session kinds', () => {
    expect(SESSION_KINDS).toEqual(['Live', 'Online', 'Home Game']);
  });

  it('splits a venue stakes history string', () => {
    expect(parseVenueStakes('$1/$3, $2/$5')).toEqual(['$1/$3', '$2/$5']);
    expect(parseVenueStakes('')).toEqual([]);
    expect(parseVenueStakes('—')).toEqual([]);
    expect(parseVenueStakes(null)).toEqual([]);
  });

  it('lists presets first, then used stakes, de-duplicated', () => {
    const opts = stakesOptions(['$2/$5', '$1/$3 PLO'], '');
    expect(opts.slice(0, STAKES_PRESETS.length)).toEqual([...STAKES_PRESETS]);
    expect(opts.filter((o) => o === '$2/$5')).toHaveLength(1);
    expect(opts).toContain('$1/$3 PLO');
  });

  it('de-dupes case-insensitively and includes the current value', () => {
    const opts = stakesOptions(['$1/$2', '$1/$2 '], '£1/£2');
    expect(opts.filter((o) => o.toLowerCase() === '$1/$2')).toHaveLength(1);
    expect(opts).toContain('£1/£2');
  });

  it('detects custom stakes', () => {
    const opts = stakesOptions();
    expect(isCustomStakes('$1/$3', opts)).toBe(false);
    expect(isCustomStakes('$3/$5/$10', opts)).toBe(true);
    expect(isCustomStakes('', opts)).toBe(false);
  });

  it('builds a badge only when notable', () => {
    expect(sessionBadge('Live', false)).toBe('');
    expect(sessionBadge('Live', true)).toBe('TEST');
    expect(sessionBadge('Online', false)).toBe('ONLINE');
    expect(sessionBadge('Home Game', true)).toBe('TEST · HOME');
  });

  it('filters test sessions unless included', () => {
    const rows = [{ isTest: true }, { isTest: false }, {}];
    expect(filterTestSessions(rows, false)).toHaveLength(2);
    expect(filterTestSessions(rows, true)).toHaveLength(3);
  });
});
