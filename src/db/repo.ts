/**
 * Data access layer. All mutations go through here so the seat UI and the
 * Players/Venues/Population screens always operate on the same records.
 */
import { db } from './db';
import {
  applyDelta,
  computeHandDeltas,
  nextButtonSeat,
} from './stats';
import {
  defaultSettings,
  emptyCounters,
  nowStamp,
  today,
  type HandRecord,
  type LiveState,
  type Note,
  type Player,
  type Session,
  type Settings,
  type Venue,
} from '../types';

/* ---------------- players ---------------- */

export async function findPlayerByName(name: string): Promise<Player | undefined> {
  return db.players.where('nameLower').equals(name.trim().toLowerCase()).first();
}

export async function findOrCreatePlayer(
  name: string,
  seedTag = '',
): Promise<Player> {
  const existing = await findPlayerByName(name);
  if (existing) return existing;
  const p: Player = {
    name: name.trim(),
    nameLower: name.trim().toLowerCase(),
    tag: seedTag,
    notes: [],
    venues: {},
    sessions: 0,
    counters: emptyCounters(),
    lastSeen: today(),
    createdAt: new Date().toISOString(),
    archHand: seedTag ? 0 : null,
    verified: false,
    verifiedHand: null,
  };
  p.id = await db.players.add(p);
  return p;
}

export async function renamePlayer(id: number, newName: string): Promise<string | null> {
  const name = newName.trim();
  if (!name) return 'Name cannot be empty';
  const clash = await findPlayerByName(name);
  if (clash && clash.id !== id) return `"${clash.name}" already exists`;
  await db.players.update(id, { name, nameLower: name.toLowerCase() });
  return null;
}

/**
 * Archetype assignment with read-tracking (per handoff):
 * re-selecting the SAME tag is a no-op; a DIFFERENT tag re-stamps archHand
 * to hands-observed-so-far and resets verification.
 */
export async function setPlayerTag(id: number, tag: string): Promise<void> {
  const p = await db.players.get(id);
  if (!p || p.tag === tag) return;
  await db.players.update(id, {
    tag,
    archHand: tag ? p.counters.dealt : null,
    verified: false,
    verifiedHand: null,
  });
}

export async function toggleVerified(id: number): Promise<void> {
  const p = await db.players.get(id);
  if (!p) return;
  const verified = !p.verified;
  await db.players.update(id, {
    verified,
    verifiedHand: verified ? p.counters.dealt : null,
  });
}

export async function addPlayerNote(id: number, text: string): Promise<void> {
  const p = await db.players.get(id);
  if (!p) return;
  // Tag the note with the hand # of THIS villain's sample (observed hands + the
  // one in progress) — shown on the note's date line, not mixed into the text.
  const h = (p.counters?.dealt ?? 0) + 1;
  const notes: Note[] = [...(p.notes || []), { t: nowStamp(), text, h }];
  await db.players.update(id, { notes });
}

export async function deletePlayer(id: number): Promise<void> {
  await db.players.delete(id);
}

/**
 * Bulk-create sequential "No Name N" villains for one-tap seat filling
 * (Pokeri-style "Fill All Open Seats"). Numbered because population records
 * are keyed by name — two different unknowns must never merge into one
 * record. Rename them from the player sheet once you have a read.
 */
export async function createNoNamePlayers(count: number): Promise<Player[]> {
  const out: Player[] = [];
  if (count <= 0) return out;
  await db.transaction('rw', db.players, async () => {
    const existing = await db.players.toArray();
    let maxN = 0;
    for (const p of existing) {
      const m = /^no name (\d+)$/i.exec(p.name.trim());
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    for (let i = 1; i <= count; i++) {
      const name = `No Name ${maxN + i}`;
      const p: Player = {
        name,
        nameLower: name.toLowerCase(),
        tag: '',
        notes: [],
        venues: {},
        sessions: 0,
        counters: emptyCounters(),
        lastSeen: today(),
        createdAt: new Date().toISOString(),
        archHand: null,
        verified: false,
        verifiedHand: null,
      };
      p.id = await db.players.add(p);
      out.push(p);
    }
  });
  return out;
}

/* ---------------- venues ---------------- */

export async function upsertVenue(name: string, stakes: string): Promise<Venue> {
  const nameLower = name.trim().toLowerCase();
  const existing = await db.venues.where('nameLower').equals(nameLower).first();
  if (existing) {
    const merged: Partial<Venue> = { lastVisited: today() };
    if (stakes && !existing.stakes.includes(stakes)) {
      merged.stakes = existing.stakes ? `${existing.stakes}, ${stakes}` : stakes;
    }
    await db.venues.update(existing.id!, merged);
    return { ...existing, ...merged };
  }
  const v: Venue = { name: name.trim(), nameLower, stakes, lastVisited: today() };
  v.id = await db.venues.add(v);
  return v;
}

/* ---------------- sessions ---------------- */

export async function startSession(
  venueName: string,
  stakes: string,
  tableSize: number,
): Promise<Session> {
  await upsertVenue(venueName, stakes);
  const s: Session = {
    venueName,
    stakes,
    startedAt: new Date().toISOString(),
    endedAt: null,
    handCount: 0,
    tableSize,
    playerIds: [],
  };
  s.id = await db.sessions.add(s);
  return s;
}

export async function endSession(sessionId: number): Promise<void> {
  await db.sessions.update(sessionId, { endedAt: new Date().toISOString() });
}

/* ---------------- hand commit (the core transaction) ---------------- */

/**
 * Commits the pending hand atomically:
 *  - per-player counters updated from real numerators/denominators
 *  - raw HandRecord stored (auditable / recomputable)
 *  - first time a player is dealt in this session: sessions + venue tallies
 *  - session hand count bumped
 * Returns the next button seat (rotation happens in app state).
 */
export async function commitHand(live: LiveState): Promise<number> {
  const next = nextButtonSeat(live.seats, live.btnSeat);
  if (!live.sessionId) return next;

  const deltas = computeHandDeltas(
    live.seats,
    live.currentEntries,
    live.btnSeat,
    live.noSB,
  );

  await db.transaction('rw', [db.players, db.sessions, db.hands], async () => {
    const session = await db.sessions.get(live.sessionId!);
    const newIds: number[] = [];

    for (const [pid, delta] of deltas) {
      const p = await db.players.get(pid);
      if (!p) continue;
      const counters = applyDelta(p.counters, delta);
      const patch: Partial<Player> = { counters, lastSeen: today() };
      if (session && !session.playerIds.includes(pid)) {
        newIds.push(pid);
        patch.sessions = p.sessions + 1;
        patch.venues = {
          ...p.venues,
          [live.venueName]: (p.venues[live.venueName] || 0) + 1,
        };
      }
      await db.players.update(pid, patch);
    }

    if (session) {
      await db.sessions.update(session.id!, {
        handCount: session.handCount + 1,
        playerIds: [...session.playerIds, ...newIds],
      });
    }

    const rec: HandRecord = {
      sessionId: live.sessionId!,
      handNo: live.handNo,
      ts: new Date().toISOString(),
      btnSeat: live.btnSeat,
      noSB: live.noSB,
      straddle: live.straddle,
      entries: live.currentEntries,
      dealtPlayerIds: [...deltas.keys()],
    };
    await db.hands.add(rec);
  });

  return next;
}

/* ---------------- live-state + settings persistence ---------------- */

const LIVE_KEY = 'liveState';
const SETTINGS_KEY = 'settings';

export async function saveLiveState(live: LiveState | null): Promise<void> {
  await db.meta.put({ key: LIVE_KEY, value: live });
}

export async function loadLiveState(): Promise<LiveState | null> {
  const row = await db.meta.get(LIVE_KEY);
  return (row?.value as LiveState) ?? null;
}

export async function saveSettings(s: Settings): Promise<void> {
  await db.meta.put({ key: SETTINGS_KEY, value: s });
}

export async function loadSettings(): Promise<Settings> {
  const row = await db.meta.get(SETTINGS_KEY);
  return { ...defaultSettings(), ...((row?.value as Settings) ?? {}) };
}

export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.players, db.venues, db.sessions, db.hands, db.meta],
    async () => {
      await Promise.all([
        db.players.clear(),
        db.venues.clear(),
        db.sessions.clear(),
        db.hands.clear(),
        db.meta.clear(),
      ]);
    },
  );
}
