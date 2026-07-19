/**
 * Session break clock. The session timer must exclude time spent on break, so
 * elapsed = (now|end - start) - completedBreakMs - (time in the CURRENT break).
 * All pure so the timer is testable without waiting on a real clock.
 */

/** Minute presets offered when starting a break. */
export const BREAK_PRESETS = [15, 30, 45, 60] as const;

export interface BreakState {
  /** ISO time the current break started; null when running. */
  pausedAt?: string | null;
  /** Total ms of breaks already finished. */
  breakMs?: number;
  /** Minutes the user said the break would last (drives the countdown). */
  breakMins?: number | null;
}

export function isPaused(s: BreakState): boolean {
  return !!s.pausedAt;
}

/** Playing time, excluding every break — including one in progress. */
export function playedMs(
  startedAt: string,
  endedAt: string | null,
  s: BreakState,
  now = Date.now(),
): number {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return 0;
  const end = endedAt ? Date.parse(endedAt) : now;
  const current = s.pausedAt ? Math.max(0, end - Date.parse(s.pausedAt)) : 0;
  return Math.max(0, end - start - (s.breakMs ?? 0) - current);
}

/** Break clock: how long the current break has been running. */
export function breakElapsedMs(s: BreakState, now = Date.now()): number {
  if (!s.pausedAt) return 0;
  const at = Date.parse(s.pausedAt);
  return Number.isFinite(at) ? Math.max(0, now - at) : 0;
}

/**
 * Time left on the break timer. Negative once it has run over (the UI shows
 * that as "+3m over" rather than hiding it — a dealer waiting is worse than a
 * stale badge).
 */
export function breakRemainingMs(s: BreakState, now = Date.now()): number | null {
  if (!s.pausedAt || s.breakMins == null) return null;
  return s.breakMins * 60000 - breakElapsedMs(s, now);
}

export function breakIsOver(s: BreakState, now = Date.now()): boolean {
  const left = breakRemainingMs(s, now);
  return left != null && left <= 0;
}

/** Fold a finished break back into the running total. */
export function resumeFrom(s: BreakState, now = Date.now()): BreakState {
  return {
    pausedAt: null,
    breakMs: (s.breakMs ?? 0) + breakElapsedMs(s, now),
    breakMins: null,
  };
}

export function pauseAt(mins: number | null, now = Date.now()): BreakState {
  return { pausedAt: new Date(now).toISOString(), breakMins: mins ?? null };
}

/** "12:05" / "1:02:30" — countdown style, sign-stripped. */
export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.round(Math.abs(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Parse a typed break length; rejects junk, zero, and absurd values. */
export function parseBreakMins(input: string): number | null {
  const n = Number(input.trim());
  if (!Number.isFinite(n)) return null;
  const mins = Math.round(n);
  if (mins < 1 || mins > 600) return null;
  return mins;
}
