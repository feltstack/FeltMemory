import Dexie, { type Table } from 'dexie';
import type {
  HandRecord,
  Player,
  Session,
  Venue,
} from '../types';

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * IndexedDB via Dexie — the on-device source of truth (offline-first).
 * A future sync layer (Supabase/Firebase) can hang off these same tables;
 * that's why every record is a plain serializable object.
 */
export class FeltMemoryDB extends Dexie {
  players!: Table<Player, number>;
  venues!: Table<Venue, number>;
  sessions!: Table<Session, number>;
  hands!: Table<HandRecord, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('feltmemory');
    this.version(1).stores({
      players: '++id, &nameLower, tag, lastSeen',
      venues: '++id, &nameLower',
      sessions: '++id, venueName, startedAt, endedAt',
      hands: '++id, sessionId, handNo',
      meta: '&key',
    });
  }
}

export const db = new FeltMemoryDB();
