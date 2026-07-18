import { describe, expect, it } from 'vitest';
import { isDefaultName, resolveRename, rowDisplayName } from './names';
import type { Note } from '../types';

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

describe('rowDisplayName priority', () => {
  const N = (text: string, opts: Partial<Note> = {}): Note => ({ t: 't', text, ...opts });
  it('a) pinned note wins over everything', () => {
    expect(rowDisplayName('KoleStaley', [N('a read'), N('PIN', { pinned: true })])).toBe('PIN');
    expect(rowDisplayName('No Name 3', [N('PIN', { pinned: true })])).toBe('PIN');
  });
  it('b) custom name beats the latest note (no pin)', () => {
    expect(rowDisplayName('KoleStaley', [N('a read')])).toBe('KoleStaley');
  });
  it('c) default name → latest note if present', () => {
    expect(rowDisplayName('No Name 3', [N('first'), N('1600 Loose')])).toBe('1600 Loose');
  });
  it('d) default name → default when no notes', () => {
    expect(rowDisplayName('No Name 3', [])).toBe('No Name 3');
  });
});
