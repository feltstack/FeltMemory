import { describe, expect, it } from 'vitest';
import { isDefaultName, resolveRename } from './names';

describe('isDefaultName (select-all rule)', () => {
  it('matches No Name placeholders only', () => {
    expect(isDefaultName('No Name 1')).toBe(true);
    expect(isDefaultName('no name 42')).toBe(true);
    expect(isDefaultName('  No Name 7 ')).toBe(true);
    expect(isDefaultName('750 OR Q9s LP Sticky')).toBe(false);
    expect(isDefaultName('No Name')).toBe(false);
    expect(isDefaultName('')).toBe(false);
  });
});

describe('resolveRename (commit / cancel paths)', () => {
  it('commits a changed non-empty name (trimmed)', () => {
    expect(resolveRename('No Name 3', '  Villain A ')).toEqual({ action: 'commit', name: 'Villain A' });
  });
  it('reverts on empty', () => {
    expect(resolveRename('Bob', '   ')).toEqual({ action: 'revert' });
  });
  it('no-ops when unchanged', () => {
    expect(resolveRename('Bob', 'Bob')).toEqual({ action: 'noop' });
  });
});
