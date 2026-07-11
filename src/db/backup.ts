/** JSON backup/restore + CSV export. Real actions, not toasts. */
import { db } from './db';
import { pct, type Player } from '../types';

const BACKUP_VERSION = 1;

export interface BackupFile {
  app: 'feltmemory';
  version: number;
  exportedAt: string;
  players: unknown[];
  venues: unknown[];
  sessions: unknown[];
  hands: unknown[];
  meta: unknown[];
}

export async function buildBackup(): Promise<BackupFile> {
  const [players, venues, sessions, hands, meta] = await Promise.all([
    db.players.toArray(),
    db.venues.toArray(),
    db.sessions.toArray(),
    db.hands.toArray(),
    db.meta.toArray(),
  ]);
  return {
    app: 'feltmemory',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    players,
    venues,
    sessions,
    hands,
    meta,
  };
}

function download(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportBackupJSON(): Promise<void> {
  const backup = await buildBackup();
  const date = new Date().toISOString().slice(0, 10);
  download(
    `feltmemory-backup-${date}.json`,
    JSON.stringify(backup, null, 2),
    'application/json',
  );
}

/** Replaces ALL data with the backup's contents (validated first). */
export async function importBackupJSON(text: string): Promise<string | null> {
  let data: BackupFile;
  try {
    data = JSON.parse(text) as BackupFile;
  } catch {
    return 'Not a valid JSON file';
  }
  if (data.app !== 'feltmemory' || !Array.isArray(data.players)) {
    return 'Not a FeltMemory backup file';
  }
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
      await db.players.bulkAdd(data.players as never[]);
      await db.venues.bulkAdd(data.venues as never[]);
      await db.sessions.bulkAdd(data.sessions as never[]);
      await db.hands.bulkAdd(data.hands as never[]);
      // Deliberately do NOT restore liveState (avoid resurrecting a stale table).
      const meta = (data.meta as { key: string; value: unknown }[]).filter(
        (m) => m.key !== 'liveState',
      );
      await db.meta.bulkAdd(meta as never[]);
    },
  );
  return null;
}

const csvEscape = (v: unknown): string => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportPlayersCSV(): Promise<void> {
  const players: Player[] = await db.players.toArray();
  const header = [
    'Name',
    'Archetype',
    'Verified',
    'Sessions',
    'Hands',
    'VPIP%',
    'PFR%',
    '3Bet%',
    '3Bet opps',
    'Hands at first read',
    'Hands at verification',
    'Last seen',
    'Venues',
    'Notes',
  ];
  const rows = players.map((p) => [
    p.name,
    p.tag,
    p.verified ? 'yes' : 'no',
    p.sessions,
    p.counters.dealt,
    pct(p.counters.vpip, p.counters.dealt) ?? '',
    pct(p.counters.pfr, p.counters.dealt) ?? '',
    pct(p.counters.threeBet, p.counters.threeBetOpp) ?? '',
    p.counters.threeBetOpp,
    p.archHand ?? '',
    p.verifiedHand ?? '',
    p.lastSeen,
    Object.entries(p.venues)
      .map(([v, n]) => `${v} (${n})`)
      .join('; '),
    (p.notes || []).map((n) => `[${n.t}] ${n.text}`).join(' | '),
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map(csvEscape).join(','))
    .join('\n');
  const date = new Date().toISOString().slice(0, 10);
  download(`feltmemory-players-${date}.csv`, csv, 'text/csv');
}
