import { describe, expect, it } from 'vitest';
import { removeNoteAt, toggleDeleteConfirm } from './notes';
import type { Note } from '../types';

const N = (text: string): Note => ({ t: '2026-07-11 12:00', text });

describe('note deletion', () => {
  it('removeNoteAt drops exactly the indexed note, keeps order', () => {
    const notes = [N('a'), N('b'), N('c')];
    expect(removeNoteAt(notes, 1).map((n) => n.text)).toEqual(['a', 'c']);
    expect(removeNoteAt(notes, 0).map((n) => n.text)).toEqual(['b', 'c']);
    expect(removeNoteAt(notes, 2).map((n) => n.text)).toEqual(['a', 'b']);
    expect(removeNoteAt(notes, 9)).toHaveLength(3); // out of range = no-op
    expect(notes).toHaveLength(3); // input untouched
  });
});

describe('two-tap delete confirm', () => {
  it('first tap arms, second tap on same key deletes, other key re-arms', () => {
    let cur: number | null = null;
    let r = toggleDeleteConfirm(cur, 2); // arm note 2
    expect(r).toEqual({ confirm: 2, doDelete: false });
    cur = r.confirm;
    r = toggleDeleteConfirm(cur, 2); // confirm delete
    expect(r).toEqual({ confirm: null, doDelete: true });

    cur = 2;
    r = toggleDeleteConfirm(cur, 5); // tap a different note → move the arm
    expect(r).toEqual({ confirm: 5, doDelete: false });
  });

  it('works with string keys (card pid:index)', () => {
    expect(toggleDeleteConfirm('7:3', '7:3')).toEqual({ confirm: null, doDelete: true });
    expect(toggleDeleteConfirm(null, '7:3')).toEqual({ confirm: '7:3', doDelete: false });
  });
});
