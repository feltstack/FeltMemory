import { describe, expect, it } from 'vitest';
import { removeNoteAt, toggleDeleteConfirm, togglePin, orderedNotes, preserveCustomName, setNoteText, rowNote, applyNoteEdit } from './notes';
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


describe('pinned notes (exactly one)', () => {
  const P = (text: string, pinned = false): Note => ({ t: 't', text, pinned });
  it('pinning one note unpins any other', () => {
    let notes = [P('a'), P('b', true), P('c')];
    notes = togglePin(notes, 2); // pin c → unpins b
    expect(notes.filter((n) => n.pinned).map((n) => n.text)).toEqual(['c']);
  });
  it('never allows two pinned no matter the sequence', () => {
    let notes = [P('a'), P('b'), P('c')];
    notes = togglePin(notes, 0);
    notes = togglePin(notes, 1);
    notes = togglePin(notes, 2);
    expect(notes.filter((n) => n.pinned)).toHaveLength(1);
    expect(notes[2].pinned).toBe(true);
  });
  it('tapping the pinned note again unpins it (zero pinned)', () => {
    let notes = [P('a', true), P('b')];
    notes = togglePin(notes, 0);
    expect(notes.filter((n) => n.pinned)).toHaveLength(0);
  });
  it('orderedNotes puts the pinned note first, rest newest→oldest, with original indices', () => {
    const notes = [P('a'), P('b', true), P('c'), P('d')];
    expect(orderedNotes(notes).map((x) => [x.note.text, x.index])).toEqual([
      ['b', 1], ['d', 3], ['c', 2], ['a', 0],
    ]);
  });
});

describe('preserveCustomName (name→note, once-only)', () => {
  const N = (text: string, opts: Partial<Note> = {}): Note => ({ t: 't', text, ...opts });
  it('adds a from-name note when a pin hides a custom name', () => {
    const out = preserveCustomName([N('PIN', { pinned: true })], '1600 Loose', 'ts');
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ t: 'ts', text: '1600 Loose', fromName: true });
  });
  it('never duplicates on repeat calls (once only)', () => {
    let out = preserveCustomName([N('PIN', { pinned: true })], '1600 Loose', 'ts');
    out = preserveCustomName(out, '1600 Loose', 'ts2');
    expect(out.filter((n) => n.fromName)).toHaveLength(1);
  });
  it('no-op for default names', () => {
    expect(preserveCustomName([N('PIN', { pinned: true })], 'No Name 3', 'ts')).toHaveLength(1);
  });
  it('no-op when nothing is pinned', () => {
    expect(preserveCustomName([N('a read')], 'KoleStaley', 'ts')).toHaveLength(1);
  });
});

describe('setNoteText', () => {
  const N = (text: string): Note => ({ t: 't', text });
  it('edits only the indexed note and trims', () => {
    const out = setNoteText([N('a'), N('b')], 1, '  edited ');
    expect(out.map((n) => n.text)).toEqual(['a', 'edited']);
  });
  it('keeps other fields (pin/hand) intact', () => {
    const out = setNoteText([{ t: 't', text: 'x', pinned: true, h: 4 }], 0, 'y');
    expect(out[0]).toEqual({ t: 't', text: 'y', pinned: true, h: 4 });
  });
  it('empty text is a no-op', () => {
    const notes = [N('a')];
    expect(setNoteText(notes, 0, '   ')).toEqual(notes);
  });
});

describe('rowNote (row note zone)', () => {
  const N = (text: string, opts: Partial<Note> = {}): Note => ({ t: 't', text, ...opts });
  it('prefers the pinned note and reports its index', () => {
    expect(rowNote([N('a'), N('PIN', { pinned: true }), N('c')])).toEqual({ text: 'PIN', index: 1 });
  });
  it('falls back to the latest note', () => {
    expect(rowNote([N('a'), N('latest')])).toEqual({ text: 'latest', index: 1 });
  });
  it('null when there are no notes', () => {
    expect(rowNote([])).toBeNull();
  });
});

describe('applyNoteEdit (empty edit deletes)', () => {
  const N = (text: string): Note => ({ t: 't', text });
  it('clearing the text deletes that note', () => {
    expect(applyNoteEdit([N('a'), N('b')], 0, '   ').map((n) => n.text)).toEqual(['b']);
    expect(applyNoteEdit([N('only')], 0, '')).toEqual([]);
  });
  it('non-empty text updates in place', () => {
    expect(applyNoteEdit([N('a'), N('b')], 1, ' new ').map((n) => n.text)).toEqual(['a', 'new']);
  });
});
