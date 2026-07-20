/**
 * Building the stored HandRecord from live state — pure, so what gets written on
 * commit is testable without touching IndexedDB.
 */
import type { HandEntry, HandRecord, LiveState, Seat } from '../types';

/** Free-text postflop note, normalized: trimmed, and omitted when empty. */
export function normalizePostflop(text: string | undefined | null): string | undefined {
  const t = (text ?? '').trim();
  return t ? t : undefined;
}

/**
 * The record commitHand persists. Seats are snapshotted (see session-stats.ts —
 * replay needs them) and the postflop free text rides along with the hand it
 * describes.
 */
export function buildHandRecord(
  live: Pick<
    LiveState,
    'sessionId' | 'handNo' | 'btnSeat' | 'noSB' | 'straddle' | 'seats' | 'currentEntries' | 'postflop'
  >,
  dealtPlayerIds: number[],
  ts = new Date().toISOString(),
): HandRecord {
  const rec: HandRecord = {
    sessionId: live.sessionId!,
    handNo: live.handNo,
    ts,
    btnSeat: live.btnSeat,
    noSB: live.noSB,
    straddle: live.straddle,
    entries: live.currentEntries as HandEntry[],
    dealtPlayerIds,
    seats: live.seats.map((s: Seat) => ({ ...s })),
  };
  const postflop = normalizePostflop(live.postflop);
  if (postflop) rec.postflop = postflop;
  return rec;
}
