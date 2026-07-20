/**
 * Live session state: seats, button, pending hand, session lifecycle.
 * Persisted to IndexedDB (meta.liveState) on every change so a refresh or
 * phone sleep mid-session restores the table exactly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_SESSION_KIND, type SessionKind } from '../db/session-meta';
import { pauseAt, resumeFrom } from '../db/breaks';
import {
  addSeat,
  applyTap,
  assignPositions,
  nextButtonSeat,
  reindexSeats,
  removeSeatAt,
  reorderSeats,
} from '../db/stats';
import * as repo from '../db/repo';
import {
  defaultSettings,
  type LiveState,
  type Seat,
  type Settings,
} from '../types';

/* ---------------- initial / builders ---------------- */

export function buildSeats(
  tableSize: number,
  heroSeat: number,
  prev: Seat[] = [],
): Seat[] {
  const seats: Seat[] = [];
  for (let i = 1; i <= tableSize; i++) {
    const existing = prev.find((s) => s.seatNo === i);
    if (i === heroSeat) {
      seats.push({ seatNo: i, playerId: null, hero: true, open: false, stack: existing?.hero ? existing.stack : '', pos: '', dealer: false });
    } else if (existing && !existing.hero) {
      seats.push({ ...existing });
    } else {
      seats.push({ seatNo: i, playerId: null, hero: false, open: true, stack: '', pos: '', dealer: false });
    }
  }
  return seats;
}

const emptyLive = (): LiveState => ({
  sessionId: null,
  venueName: '',
  stakes: '',
  tableSize: 9,
  seats: [],
  btnSeat: 1,
  heroSeat: 5,
  handNo: 1,
  noSB: false,
  straddle: false,
  mustStraddle: false,
  currentEntries: [],
  startedAt: null,
});

/* ---------------- reducer ---------------- */

export type Action =
  | { type: 'RESTORE'; live: LiveState }
  | { type: 'SESSION_STARTED'; live: LiveState }
  | { type: 'SESSION_ENDED' }
  | { type: 'SET_TABLE_SIZE'; size: number }
  | { type: 'ASSIGN_SEAT'; seatNo: number; playerId: number }
  | { type: 'ASSIGN_SEATS_BULK'; assignments: { seatNo: number; playerId: number }[] }
  | { type: 'UNSEAT'; seatNo: number }
  | { type: 'UNSEAT_VILLAINS' }
  | { type: 'REMOVE_SEAT'; seatNo: number }
  | { type: 'MOVE_SEAT'; from: number; to: number }
  | { type: 'ADD_SEAT' }
  | { type: 'TOGGLE_SITOUT'; seatNo: number }
  | { type: 'MOVE_HERO'; seatNo: number }
  | { type: 'SET_STACK'; seatNo: number; stack: string }
  | { type: 'SET_BTN'; seatNo: number }
  | { type: 'TOGGLE'; key: 'noSB' | 'straddle' | 'mustStraddle' }
  | { type: 'TAP'; seatNo: number; playerId: number | null; action: 'call' | 'raise' }
  | { type: 'UNDO_TAP' }
  | { type: 'CLEAR_HAND' }
  | { type: 'SET_POSTFLOP'; text: string }
  | { type: 'PAUSE'; mins: number | null }
  | { type: 'RESUME' }
  | { type: 'HAND_COMMITTED'; nextBtn: number };

function withPositions(live: LiveState): LiveState {
  return {
    ...live,
    seats: assignPositions(live.seats, live.btnSeat, live.noSB, live.straddle),
  };
}

export function reducer(live: LiveState, a: Action): LiveState {
  switch (a.type) {
    case 'RESTORE':
      return withPositions(a.live);
    case 'SESSION_STARTED':
      return withPositions(a.live);
    case 'SESSION_ENDED':
      return emptyLive();
    case 'SET_TABLE_SIZE': {
      const size = Math.max(2, Math.min(11, a.size));
      const heroSeat = Math.min(live.heroSeat, size);
      const seats = buildSeats(size, heroSeat, live.seats);
      const btnSeat = seats.some((s) => s.seatNo === live.btnSeat && !s.open)
        ? live.btnSeat
        : (seats.find((s) => !s.open)?.seatNo ?? 1);
      return withPositions({ ...live, tableSize: size, heroSeat, seats, btnSeat });
    }
    case 'ADD_SEAT': {
      const seats = addSeat(live.seats);
      if (seats.length === live.seats.length) return live; // at the cap
      // Button, seated players, sit-outs and pending taps all carry over; only
      // the seat count and the derived position labels change.
      return withPositions({ ...live, seats, tableSize: seats.length });
    }
    case 'ASSIGN_SEAT': {
      const seats = live.seats.map((s) =>
        s.seatNo === a.seatNo
          ? { ...s, playerId: a.playerId, open: false, hero: false }
          : s,
      );
      return withPositions({ ...live, seats });
    }
    case 'ASSIGN_SEATS_BULK': {
      const map = new Map(a.assignments.map((x) => [x.seatNo, x.playerId]));
      const seats = live.seats.map((s) =>
        map.has(s.seatNo) && s.open
          ? { ...s, playerId: map.get(s.seatNo)!, open: false, hero: false }
          : s,
      );
      return withPositions({ ...live, seats });
    }
    case 'UNSEAT_VILLAINS': {
      const seats = live.seats.map((s) =>
        s.hero ? s : { ...s, playerId: null, open: true, stack: '' },
      );
      return withPositions({
        ...live,
        seats,
        currentEntries: [],
        btnSeat: live.heroSeat,
      });
    }
    case 'UNSEAT': {
      const seats = live.seats.map((s) =>
        s.seatNo === a.seatNo && !s.hero
          ? { ...s, playerId: null, open: true, stack: '' }
          : s,
      );
      // Drop pending taps for the vacated seat.
      const currentEntries = live.currentEntries.filter(
        (e) => e.seatNo !== a.seatNo,
      );
      const btnSeat = seats.some((s) => s.seatNo === live.btnSeat && !s.open)
        ? live.btnSeat
        : nextButtonSeat(seats, live.btnSeat);
      return withPositions({ ...live, seats, currentEntries, btnSeat });
    }
    case 'REMOVE_SEAT': {
      const target = live.seats.find((s) => s.seatNo === a.seatNo);
      if (!target || target.hero || live.seats.length <= 2) return live;
      const remaining = removeSeatAt(live.seats, a.seatNo);
      const btnIdx = remaining.findIndex((s) => s.seatNo === live.btnSeat);
      const seats = reindexSeats(remaining);
      const heroSeat = seats.find((s) => s.hero)?.seatNo ?? 1;
      let btnSeat = btnIdx >= 0 ? btnIdx + 1 : seats.find((s) => !s.open)?.seatNo ?? 1;
      if (!seats.some((s) => s.seatNo === btnSeat && !s.open)) {
        btnSeat = nextButtonSeat(seats, btnSeat);
      }
      return withPositions({
        ...live,
        tableSize: seats.length,
        seats,
        heroSeat,
        btnSeat,
        currentEntries: [],
      });
    }
    case 'MOVE_SEAT': {
      if (a.from === a.to) return live;
      const reordered = reorderSeats(live.seats, a.from, a.to);
      const btnIdx = reordered.findIndex((s) => s.seatNo === live.btnSeat);
      const seats = reindexSeats(reordered);
      const heroSeat = seats.find((s) => s.hero)?.seatNo ?? live.heroSeat;
      let btnSeat = btnIdx >= 0 ? btnIdx + 1 : live.btnSeat;
      if (!seats.some((s) => s.seatNo === btnSeat && !s.open)) {
        btnSeat = nextButtonSeat(seats, btnSeat);
      }
      return withPositions({ ...live, seats, heroSeat, btnSeat, currentEntries: [] });
    }
    case 'TOGGLE_SITOUT': {
      const target = live.seats.find((s) => s.seatNo === a.seatNo);
      if (!target || target.open) return live; // only occupied seats sit out
      const sittingOut = !target.sittingOut;
      const seats = live.seats.map((s) =>
        s.seatNo === a.seatNo ? { ...s, sittingOut } : s,
      );
      // A player going out drops their pending taps this hand.
      const currentEntries = sittingOut
        ? live.currentEntries.filter((e) => e.seatNo !== a.seatNo)
        : live.currentEntries;
      // Never leave the button on someone who just sat out.
      let btnSeat = live.btnSeat;
      if (!seats.some((s) => s.seatNo === btnSeat && !s.open && !s.sittingOut)) {
        btnSeat = nextButtonSeat(seats, btnSeat);
      }
      return withPositions({ ...live, seats, currentEntries, btnSeat });
    }
    case 'MOVE_HERO': {
      const target = live.seats.find((s) => s.seatNo === a.seatNo);
      if (!target || !target.open) return live; // only into open seats
      const seats = live.seats.map((s) => {
        if (s.seatNo === a.seatNo) return { ...s, open: false, hero: true, playerId: null };
        if (s.hero) return { ...s, hero: false, open: true, playerId: null, stack: '' };
        return s;
      });
      return withPositions({ ...live, seats, heroSeat: a.seatNo });
    }
    case 'SET_STACK': {
      const seats = live.seats.map((s) =>
        s.seatNo === a.seatNo ? { ...s, stack: a.stack } : s,
      );
      return { ...live, seats };
    }
    case 'SET_BTN':
      return withPositions({ ...live, btnSeat: a.seatNo });
    case 'TOGGLE': {
      const next = { ...live, [a.key]: !live[a.key] } as LiveState;
      return a.key === 'noSB' || a.key === 'straddle' ? withPositions(next) : next;
    }
    case 'PAUSE':
      return { ...live, ...pauseAt(a.mins) };
    case 'RESUME':
      return { ...live, ...resumeFrom(live) };
    case 'TAP':
      return {
        ...live,
        currentEntries: applyTap(live.currentEntries, a.seatNo, a.playerId, a.action),
      };
    case 'UNDO_TAP':
      return { ...live, currentEntries: live.currentEntries.slice(0, -1) };
    case 'CLEAR_HAND':
      return { ...live, currentEntries: [] };
    case 'SET_POSTFLOP':
      return { ...live, postflop: a.text };
    case 'HAND_COMMITTED':
      return withPositions({
        ...live,
        btnSeat: a.nextBtn,
        handNo: live.handNo + 1,
        currentEntries: [],
        // the note described THIS hand — the next one starts blank
        postflop: '',
        straddle: live.mustStraddle ? live.straddle : false,
      });
    default:
      return live;
  }
}

/* ---------------- context ---------------- */

interface AppCtx {
  live: LiveState;
  dispatch: (a: Action) => void;
  ready: boolean;
  sessionActive: boolean;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  startSession: (venue: string, stakes: string, tableSize: number, heroSeat: number, btnSeat: number, kind?: SessionKind, isTest?: boolean) => Promise<void>;
  pauseSession: (mins: number | null) => void;
  resumeSession: () => void;
  endSession: () => Promise<void>;
  saveHand: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [live, dispatch] = useReducer(reducer, undefined, emptyLive);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const committing = useRef(false);

  // Restore persisted live session + settings on boot.
  useEffect(() => {
    (async () => {
      const [savedLive, savedSettings] = await Promise.all([
        repo.loadLiveState(),
        repo.loadSettings(),
      ]);
      if (savedLive && savedLive.sessionId) {
        dispatch({ type: 'RESTORE', live: savedLive });
      }
      setSettings(savedSettings);
      setReady(true);
    })();
  }, []);

  // Persist live state on every change (post-boot).
  useEffect(() => {
    if (!ready) return;
    void repo.saveLiveState(live.sessionId ? live : null);
  }, [live, ready]);

  // Apply theme attributes.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.setAttribute('data-glare', String(settings.glare));
  }, [settings.theme, settings.glare]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void repo.saveSettings(next);
      return next;
    });
  }, []);

  const startSession = useCallback(
    async (
      venue: string,
      stakes: string,
      tableSize: number,
      heroSeat: number,
      btnSeat: number,
      kind: SessionKind = DEFAULT_SESSION_KIND,
      isTest = false,
    ) => {
      const session = await repo.startSession(venue, stakes, tableSize, kind, isTest);
      const liveNext: LiveState = {
        ...emptyLive(),
        sessionId: session.id!,
        venueName: venue,
        stakes,
        kind,
        isTest,
        tableSize,
        heroSeat,
        btnSeat,
        seats: buildSeats(tableSize, heroSeat),
        startedAt: session.startedAt,
      };
      dispatch({ type: 'SESSION_STARTED', live: liveNext });
    },
    [],
  );

  const pauseSession = useCallback((mins: number | null) => dispatch({ type: 'PAUSE', mins }), []);
  const resumeSession = useCallback(() => dispatch({ type: 'RESUME' }), []);

  const endSession = useCallback(async () => {
    if (live.sessionId) {
      const finished = resumeFrom(live); // close any break still open
      await repo.endSession(live.sessionId, finished.breakMs ?? 0);
    }
    await repo.saveLiveState(null);
    dispatch({ type: 'SESSION_ENDED' });
  }, [live.sessionId]);

  const saveHand = useCallback(async () => {
    if (!live.sessionId || committing.current) return;
    committing.current = true;
    try {
      const nextBtn = await repo.commitHand(live);
      dispatch({ type: 'HAND_COMMITTED', nextBtn });
    } finally {
      committing.current = false;
    }
  }, [live]);

  const value: AppCtx = {
    live,
    dispatch,
    ready,
    sessionActive: live.sessionId != null,
    settings,
    updateSettings,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    saveHand,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}
