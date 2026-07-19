import { describe, expect, it } from 'vitest';
import { isDefaultName, resolveRename, rowDisplayName, rowDisplay } from './names';
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

describe('rowDisplay (what the tap should edit)', () => {
  const N = (text: string, opts: Partial<Note> = {}): Note => ({ t: 't', text, ...opts });
  it('pinned note → edits that note, with its index', () => {
    const r = rowDisplay('KoleStaley', [N('a'), N('PIN', { pinned: true })]);
    expect(r).toEqual({ text: 'PIN', kind: 'note', noteIndex: 1 });
  });
  it('custom name → edits the name', () => {
    expect(rowDisplay('KoleStaley', [N('a')])).toEqual({ text: 'KoleStaley', kind: 'name', noteIndex: null });
  });
  it('default name with notes → edits the latest note', () => {
    const r = rowDisplay('No Name 3', [N('first'), N('latest')]);
    expect(r).toEqual({ text: 'latest', kind: 'note', noteIndex: 1 });
  });
  it('default name, no notes → edits the name', () => {
    expect(rowDisplay('No Name 3', [])).toEqual({ text: 'No Name 3', kind: 'name', noteIndex: null });
  });
});
