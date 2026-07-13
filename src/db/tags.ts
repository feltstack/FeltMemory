/** Pure archetype-tag state transition — no DB/React, unit-tested. */

/**
 * The player fields after setting (or clearing) the archetype tag.
 * Untagging (newTag === '') resets archHand + verification; tagging stamps
 * archHand at the current hands-observed count.
 */
export function tagStateAfter(
  newTag: string,
  handsObserved: number,
): { tag: string; archHand: number | null; verified: boolean; verifiedHand: number | null } {
  return {
    tag: newTag,
    archHand: newTag ? handsObserved : null,
    verified: false,
    verifiedHand: null,
  };
}
