import { describe, expect, it } from 'vitest';
import { tagStateAfter } from './tags';

describe('archetype tag state', () => {
  it('untagging clears tag, archHand, and verification', () => {
    expect(tagStateAfter('', 40)).toEqual({
      tag: '',
      archHand: null,
      verified: false,
      verifiedHand: null,
    });
  });
  it('tagging stamps archHand at current hands-observed and resets verification', () => {
    expect(tagStateAfter('TAG', 40)).toEqual({
      tag: 'TAG',
      archHand: 40,
      verified: false,
      verifiedHand: null,
    });
  });
});
