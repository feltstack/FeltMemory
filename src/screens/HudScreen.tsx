/** Live HUD: session setup → felt/list views, tap logging, blind toggles. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import * as repo from '../db/repo';
import { dealerXY, pendingBadge, potWayLabel, seatXY } from '../db/stats';
import { confidenceLabel, exploitLabel } from '../db/exploits';
import {
  DEFAULT_SESSION_KIND,
  SESSION_KINDS,
  parseVenueStakes,
  sessionBadge,
  stakesOptions,
  type SessionKind,
} from '../db/session-meta';
import { orderedNotes, rowNote, toggleDeleteConfirm } from '../db/notes';
import { isDefaultName, resolveRename } from '../db/names';
import { abbrevAction, abbrevPos } from '../db/labels';
import { useApp } from '../state/AppContext';
import { useUi } from '../state/UiContext';
import { Icon } from '../components/Icons';
import { Switch, anchorOf, initialsOf } from '../components/Bits';
import { ExploitChips } from '../components/ExploitChips';
import { fmt, pct, tagColor, type Player, type Seat } from '../types';

/** Map of playerId -> Player for all seated players (live). */
function useSeatedPlayers(): Map<number, Player> {
  const { live } = useApp();
  const ids = live.seats.filter((s) => s.playerId != null).map((s) => s.playerId!);
  const key = ids.join(',');
  const players = useLiveQuery(
    () => db.players.where('id').anyOf(ids).toArray(),
    [key],
  );
  return useMemo(() => {
    const m = new Map<number, Player>();
    for (const p of players ?? []) m.set(p.id!, p);
    return m;
  }, [players]);
}

export default function HudScreen() {
  const { sessionActive } = useApp();
  const { editMode } = useUi();
  // Table view is hidden for now (v0.2.21) — the felt renderer stays in the tree so
  // it can be switched back on without a rebuild of this screen.
  const view = 'list' as 'table' | 'list';
  const [btnMode, setBtnMode] = useState(false);
  const [wide, setWide] = useState(window.innerWidth >= 900);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!sessionActive) return <SessionSetup />;

  // Editing always shows the list — drag-to-reorder and remove live there.
  const effectiveView = editMode ? 'list' : view;
  const showCompanion = wide && effectiveView === 'table' && !editMode;
  return (
    <div className="screen">
      {editMode && (
        <div className="edit-hint">Drag ≡ to reorder · tap − to remove a seat · Done when finished</div>
      )}
      <div className={showCompanion ? 'hud-grid' : ''}>
        <div>
          {effectiveView === 'table' ? (
            <Felt btnMode={btnMode} setBtnMode={setBtnMode} />
          ) : (
            <SeatList editing={editMode} />
          )}
        </div>
        {showCompanion && (
          <div>
            <SeatList />
          </div>
        )}
      </div>
      {!editMode && effectiveView === 'table' && (
        <div className="btn-row" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <button
            className={`btn ${btnMode ? 'primary' : ''}`}
            onClick={() => setBtnMode((v) => !v)}
          >
            {btnMode ? 'Tap a seat to place the button…' : 'Move dealer button'}
          </button>
        </div>
      )}
      <UndoBar />
      <BlindToggles />
      {!editMode && <PlayerCards />}
    </div>
  );
}

/* ================= session setup ================= */

function SessionSetup() {
  const { startSession } = useApp();
  const { toast } = useUi();
  const venues = useLiveQuery(() => db.venues.toArray(), []) ?? [];
  const [venueChoice, setVenueChoice] = useState('');
  const [newVenue, setNewVenue] = useState('');
  const [stakes, setStakes] = useState('');
  const [customStakes, setCustomStakes] = useState(false);
  const [kind, setKind] = useState<SessionKind>(DEFAULT_SESSION_KIND);
  const [isTest, setIsTest] = useState(false);
  const [tableSize, setTableSize] = useState(9);
  const [heroSeat, setHeroSeat] = useState(5);
  const [btnSeat, setBtnSeat] = useState(1);

  const venueName = venueChoice === '__new__' || venues.length === 0 ? newVenue.trim() : venueChoice;

  // presets + every stake previously logged at any venue
  const stakeChoices = useMemo(
    () => stakesOptions(venues.flatMap((v) => parseVenueStakes(v.stakes))),
    [venues],
  );

  const start = async () => {
    if (!venueName) {
      toast('Pick or add a venue first');
      return;
    }
    await startSession(venueName, stakes.trim() || '—', tableSize, Math.min(heroSeat, tableSize), Math.min(btnSeat, tableSize), kind, isTest);
  };

  const seatOptions = Array.from({ length: tableSize }, (_, i) => i + 1);

  return (
    <div className="screen">
      <div className="section-title">Start a session</div>
      <div className="card">
        <div className="field">
          <label>Venue</label>
          {venues.length > 0 && (
            <select value={venueChoice} onChange={(e) => setVenueChoice(e.target.value)}>
              <option value="">— choose venue —</option>
              {venues.map((v) => (
                <option key={v.id} value={v.name}>
                  {v.name}
                </option>
              ))}
              <option value="__new__">＋ New venue…</option>
            </select>
          )}
          {(venueChoice === '__new__' || venues.length === 0) && (
            <input
              style={{ marginTop: venues.length ? 8 : 0 }}
              placeholder="e.g. Maryland Live!"
              value={newVenue}
              onChange={(e) => setNewVenue(e.target.value)}
            />
          )}
        </div>
        <div className="field">
          <label>Stakes</label>
          {!customStakes && (
            <select
              value={stakes}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCustomStakes(true);
                  setStakes('');
                } else setStakes(e.target.value);
              }}
            >
              <option value="">— choose stakes —</option>
              {stakeChoices.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
              <option value="__custom__">＋ Custom…</option>
            </select>
          )}
          {customStakes && (
            <div className="stakes-custom">
              <input
                autoFocus
                placeholder="e.g. $1/$3 NL Hold'em"
                value={stakes}
                onChange={(e) => setStakes(e.target.value)}
              />
              <button
                className="btn ghost"
                onClick={() => {
                  setCustomStakes(false);
                  setStakes('');
                }}
              >
                List
              </button>
            </div>
          )}
        </div>
        <div className="field">
          <label>Session type</label>
          <div className="seg">
            {SESSION_KINDS.map((k) => (
              <button
                key={k}
                className={`seg-btn${kind === k ? ' on' : ''}`}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <button
            className={`test-toggle${isTest ? ' on' : ''}`}
            onClick={() => setIsTest(!isTest)}
            aria-pressed={isTest}
          >
            <span className="test-box">{isTest ? '✓' : ''}</span>
            <span className="test-label">
              Test session
              <span className="hint">Practice run — flagged so you can keep it out of your real data</span>
            </span>
          </button>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Table size</label>
            <select value={tableSize} onChange={(e) => setTableSize(parseInt(e.target.value, 10))}>
              {Array.from({ length: 10 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n}-max
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Your seat</label>
            <select value={Math.min(heroSeat, tableSize)} onChange={(e) => setHeroSeat(parseInt(e.target.value, 10))}>
              {seatOptions.map((n) => (
                <option key={n} value={n}>
                  Seat {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Button at</label>
            <select value={Math.min(btnSeat, tableSize)} onChange={(e) => setBtnSeat(parseInt(e.target.value, 10))}>
              {seatOptions.map((n) => (
                <option key={n} value={n}>
                  Seat {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn primary block" onClick={start}>
          Start session
        </button>
        <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
          <div className="hint">
            Seats start open — tap ＋ on a seat to add opponents as they settle in. You can
            move the button and change table size any time.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= felt (table view) ================= */

function Felt({ btnMode, setBtnMode }: { btnMode: boolean; setBtnMode: (v: boolean) => void }) {
  const { live, dispatch, settings } = useApp();
  const { openPlayer, openAssign, toast } = useUi();
  const playersById = useSeatedPlayers();

  // Hero is pinned to the bottom-center. The human dealer is a fixed marker
  // between the highest seat and seat 1 (seat 1 to its screen-left). Where it
  // lands depends only on which seat Hero occupies.
  const n = live.seats.length;
  const heroSeat = live.seats.find((s) => s.hero)?.seatNo ?? 1;
  const posOf = (seatNo: number): [number, number] => seatXY(seatNo, heroSeat, n);
  const [dealerX, dealerY] = dealerXY(heroSeat, n);
  const compactDealer = n >= 10;

  const tapSeat = (s: Seat, e: React.MouseEvent) => {
    if (btnMode) {
      if (s.open) {
        toast('Button must be on an occupied seat');
        return;
      }
      dispatch({ type: 'SET_BTN', seatNo: s.seatNo });
      setBtnMode(false);
      return;
    }
    if (s.open) {
      openAssign(s.seatNo);
      return;
    }
    if (s.hero) {
      toast("That's you — Hero isn't tracked like an opponent");
      return;
    }
    if (s.playerId != null) openPlayer(s.playerId, s.seatNo, anchorOf(e));
  };

  return (
    <div className="felt-wrap">
      <div className="felt" />
      <div
        className={`dealer-gap${compactDealer ? ' compact' : ''}`}
        style={{ left: `${dealerX}%`, top: `${dealerY}%` }}
        title="Dealer (house)"
      >
        <Icon name="cards" />
      </div>
      <div className="felt-center">
        <div className="stakes">
          {live.stakes}
          {sessionBadge(live.kind ?? DEFAULT_SESSION_KIND, !!live.isTest) && (
            <span className={`sess-badge${live.isTest ? ' test' : ''}`}>
              {sessionBadge(live.kind ?? DEFAULT_SESSION_KIND, !!live.isTest)}
            </span>
          )}
        </div>
        <div className="venue">
          {live.venueName} · Hand #{live.handNo}
        </div>
      </div>
      {live.seats.map((s) => {
        const [x, y] = posOf(s.seatNo);
        if (s.open) {
          return (
            <div
              key={s.seatNo}
              className={`seat-chip open ${btnMode ? '' : ''}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={(e) => tapSeat(s, e)}
            >
              <div className="num">{s.seatNo}</div>
              <div className="initials">＋</div>
              <div className="pos">Open</div>
            </div>
          );
        }
        const p = s.playerId != null ? playersById.get(s.playerId) : undefined;
        const ring = p?.tag ? tagColor(p.tag, settings.tags) : undefined;
        const badge = pendingBadge(live.currentEntries, s.seatNo);
        const hasNote = (p?.notes?.length ?? 0) > 0;
        return (
          <div key={s.seatNo}>
            <div
              className={`seat-chip ${s.hero ? 'hero' : ''} ${btnMode ? 'btn-target' : ''} ${s.sittingOut ? 'sitting-out' : ''}`}
              style={{ left: `${x}%`, top: `${y}%`, ...(ring && !s.hero ? { borderColor: ring } : {}) }}
              onClick={(e) => tapSeat(s, e)}
            >
              <div className="num">{s.seatNo}</div>
              <div className="initials">{s.hero ? 'YOU' : initialsOf(p?.name ?? '?')}</div>
              <div className="pos">{abbrevPos(s.pos)}</div>
              {badge && <div className="act-tag">{badge}</div>}
              {hasNote && !badge && <div className="note-dot">📝</div>}
              {s.stack && <div className="stack-tag">${s.stack}</div>}
            </div>
            {s.dealer &&
              (() => {
                const dx = x - 50,
                  dy = y - 50;
                const len = Math.hypot(dx, dy) || 1;
                return (
                  <div
                    className="dealer-btn"
                    style={{ left: `${x + (dx / len) * 8}%`, top: `${y + (dy / len) * 8}%` }}
                  >
                    D
                  </div>
                );
              })()}
          </div>
        );
      })}
    </div>
  );
}

/* ================= seat list ================= */

function SeatList({ editing = false }: { editing?: boolean }) {
  const { live, dispatch, settings } = useApp();
  const compact = settings.compactRows !== false;
  const { openPlayer, openAssign, toast } = useUi();
  const playersById = useSeatedPlayers();
  // Inline note editor: tapping a row's note zone opens it right under the row —
  // no popup, autofocused, Enter saves, Esc closes.
  const [noteSeat, setNoteSeat] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editNoteIdx, setEditNoteIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [renameSeat, setRenameSeat] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameCancel = useRef(false);
  const startRename = (seatNo: number, name: string) => {
    setRenameSeat(seatNo);
    setRenameDraft(name);
  };
  const commitRename = async (playerId: number, current: string) => {
    const r = resolveRename(current, renameDraft);
    if (r.action === 'commit') {
      const err = await repo.renamePlayer(playerId, r.name!);
      toast(err ?? 'Renamed');
    }
    setRenameSeat(null);
  };

  // Drag-to-reorder (pointer events → works on touch and mouse).
  const [dragSeat, setDragSeat] = useState<number | null>(null);
  const [overSeat, setOverSeat] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const setRowRef = (seatNo: number) => (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(seatNo, el);
    else rowRefs.current.delete(seatNo);
  };
  const rowClass = (seatNo: number, base: string) =>
    `${base}${dragSeat === seatNo ? ' dragging' : ''}` +
    `${overSeat === seatNo && dragSeat != null && dragSeat !== seatNo ? ' drag-over' : ''}`;
  const onHandleDown = (seatNo: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragSeat(seatNo);
    setOverSeat(seatNo);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragSeat == null) return;
    let target = dragSeat;
    for (const [sn, el] of rowRefs.current) {
      const r = el.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        target = sn;
        break;
      }
    }
    setOverSeat(target);
  };
  const onHandleUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (dragSeat != null && overSeat != null && dragSeat !== overSeat) {
      dispatch({ type: 'MOVE_SEAT', from: dragSeat, to: overSeat });
    }
    setDragSeat(null);
    setOverSeat(null);
  };
  const removeSeat = (seatNo: number, hero: boolean) => {
    if (hero) return toast("That's your seat — move yourself first, then remove it");
    if (live.seats.length <= 2) return toast('Keep at least 2 seats');
    dispatch({ type: 'REMOVE_SEAT', seatNo });
  };
  const RmBtn = ({ seatNo, hero }: { seatNo: number; hero: boolean }) =>
    editing ? (
      <button
        className="rm-seat"
        title="Remove this seat"
        onClick={(e) => {
          e.stopPropagation();
          removeSeat(seatNo, hero);
        }}
      >
        −
      </button>
    ) : null;
  const Handle = ({ seatNo }: { seatNo: number }) =>
    editing ? (
      <div
        className="drag-handle"
        title="Drag to reorder"
        onPointerDown={onHandleDown(seatNo)}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onClick={(e) => e.stopPropagation()}
      >
        ≡
      </div>
    ) : null;

  const saveQuickNote = (playerId: number, name: string) => {
    const text = noteDraft.trim();
    if (!text) {
      setNoteSeat(null);
      return;
    }
    void repo.addPlayerNote(playerId, text, live.handNo, live.sessionId);
    toast(`Note saved on ${name}`);
    setNoteDraft('');
    setNoteSeat(null);
  };

  const saveNoteEdit = (playerId: number, idx: number) => {
    // Empty text deletes the note; either way Save closes the panel.
    const t = editDraft.trim();
    void repo.updatePlayerNote(playerId, idx, editDraft);
    toast(t ? 'Note updated' : 'Note deleted');
    setEditNoteIdx(null);
    setNoteSeat(null);
  };

  const addNoName = async (seatNo: number) => {
    const [np] = await repo.createNoNamePlayers(1);
    if (np?.id != null) {
      dispatch({ type: 'ASSIGN_SEAT', seatNo, playerId: np.id });
      toast(`Added ${np.name}`);
    }
  };

  return (
    <div
      className={`seat-list${settings.compactRows !== false ? ' compact' : ''}${
        editing ? ' editing' : ''
      }`}
    >
      {live.seats.map((s) => {
        if (s.open) {
          return (
            <div
              className={rowClass(s.seatNo, 'seat-row open')}
              key={s.seatNo}
              ref={setRowRef(s.seatNo)}
            >
              <RmBtn seatNo={s.seatNo} hero={false} />
              <span className="sr-seat">{s.seatNo}</span>
              <div className="row-main">
                <div className="row-name">Open Seat</div>
              </div>
              <button
                className="mini-btn enabled seat-add"
                title="Add a No Name villain"
                onClick={() => void addNoName(s.seatNo)}
              >
                ＋
              </button>
              <button
                className="mini-btn seat-add"
                title="Seat a known player from your database"
                onClick={() => openAssign(s.seatNo)}
              >
                <Icon name="players" style={{ width: 18, height: 18 }} />
              </button>
              <button
                className="mini-btn"
                title="Move yourself to this seat"
                onClick={() => {
                  dispatch({ type: 'MOVE_HERO', seatNo: s.seatNo });
                  toast(`You moved to seat ${s.seatNo}`);
                }}
              >
                Sit here
              </button>
              <Handle seatNo={s.seatNo} />
            </div>
          );
        }
        const p = s.playerId != null ? playersById.get(s.playerId) : undefined;
        const c = p?.counters;
        const ring = p?.tag ? tagColor(p.tag, settings.tags) : undefined;
        const badge = pendingBadge(live.currentEntries, s.seatNo);
        const rn = rowNote(p?.notes ?? []);
        return (
          <div key={s.seatNo}>
          <div
            className={rowClass(s.seatNo, s.sittingOut ? 'seat-row sitting-out' : 'seat-row')}
            ref={setRowRef(s.seatNo)}
            style={{ borderLeftColor: s.hero ? 'var(--accent)' : ring ?? 'transparent' }}
          >
            <RmBtn seatNo={s.seatNo} hero={s.hero} />
            <button
              className="sr-seat"
              title="Open player card"
              onClick={(e) => {
                e.stopPropagation();
                if (s.hero) toast("That's you — Hero isn't tracked like an opponent");
                else if (s.playerId != null) openPlayer(s.playerId, s.seatNo, anchorOf(e));
              }}
            >
              {s.seatNo}
            </button>
            {renameSeat === s.seatNo && s.playerId != null ? (
              <input
                className="sr-rename"
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onFocus={(e) => {
                  if (isDefaultName(p?.name ?? '')) e.target.select();
                  else e.target.setSelectionRange(e.target.value.length, e.target.value.length);
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  else if (e.key === 'Escape') {
                    renameCancel.current = true;
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  if (renameCancel.current) {
                    renameCancel.current = false;
                    setRenameSeat(null);
                  } else void commitRename(s.playerId!, p?.name ?? '');
                }}
              />
            ) : (
              <button
                className="sr-name"
                title={s.hero ? '' : 'Tap to rename'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (s.hero) toast("That's you — Hero isn't tracked like an opponent");
                  else if (s.playerId != null) startRename(s.seatNo, p?.name ?? '');
                }}
              >
                {s.hero ? 'Hero' : p?.name ?? '?'}
              </button>
            )}
            {badge && <span className="pending-chip">{badge}</span>}
            {s.hero ? (
              <span className="sr-note" />
            ) : (
              <button
                className="sr-note"
                title="Tap to edit notes"
                onClick={(e) => {
                  e.stopPropagation();
                  if (s.playerId == null) return;
                  setNoteSeat(s.seatNo);
                  if (rn) {
                    setEditNoteIdx(rn.index);
                    setEditDraft(rn.text);
                  } else {
                    setEditNoteIdx(null);
                    setNoteDraft('');
                  }
                }}
              >
                {rn ? rn.text : <span className="sr-note-ph">＋ note</span>}
              </button>
            )}
            <div className="sr-pill">
              <span>{s.hero ? '–' : fmt(pct(c?.vpip ?? 0, c?.dealt ?? 0))}</span>
              <span>{s.hero ? '–' : fmt(pct(c?.pfr ?? 0, c?.dealt ?? 0))}</span>
              <span>{s.hero ? '–' : fmt(pct(c?.threeBet ?? 0, c?.threeBetOpp ?? 0))}</span>
              <span className="sep">·</span>
              <span>{s.hero ? '–' : c?.dealt ?? 0}</span>
            </div>
            {s.sittingOut ? (
              <span className="pos-badge out">OUT</span>
            ) : (
              s.pos && (
                <span
                  className={`pos-badge clickable${s.dealer ? ' btn' : ''}`}
                  title="Set this seat as the button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'SET_BTN', seatNo: s.seatNo });
                  }}
                >
                  {abbrevPos(s.pos)}
                </span>
              )
            )}
            <div className="row-actions">
              <button
                className={`mini-btn enabled ${badge && badge !== 'Open' && !badge.includes('Bet') ? 'tapped' : ''}`}
                disabled={s.sittingOut}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'TAP', seatNo: s.seatNo, playerId: s.playerId, action: 'call' });
                }}
              >
                {compact ? abbrevAction('Call') : 'Call'}
              </button>
              <button
                className={`mini-btn enabled ${badge && (badge === 'Open' || badge.includes('Bet')) ? 'tapped' : ''}`}
                disabled={s.sittingOut}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'TAP', seatNo: s.seatNo, playerId: s.playerId, action: 'raise' });
                }}
              >
                {compact ? abbrevAction('Raise') : 'Raise'}
              </button>
            </div>
            <Handle seatNo={s.seatNo} />
          </div>
          {noteSeat === s.seatNo && s.playerId != null && p && (
            <div className="note-panel">
              {orderedNotes(p.notes ?? []).map(({ note: n, index: idx }) =>
                editNoteIdx === idx ? (
                  <div className="np-row" key={idx}>
                    <input
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveNoteEdit(s.playerId!, idx);
                        if (e.key === 'Escape') setEditNoteIdx(null);
                      }}
                    />
                    <button
                      className="mini-btn enabled"
                      onClick={() => saveNoteEdit(s.playerId!, idx)}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    className="np-note"
                    key={idx}
                    onClick={() => {
                      setEditNoteIdx(idx);
                      setEditDraft(n.text);
                    }}
                  >
                    {n.pinned ? '📌 ' : ''}
                    {n.text}
                  </button>
                ),
              )}
              <div className="np-row">
                <input
                  value={noteDraft}
                  placeholder="Add a note… Enter saves"
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveQuickNote(s.playerId!, p?.name ?? 'player');
                    if (e.key === 'Escape') setNoteSeat(null);
                  }}
                />
                <button
                  className="mini-btn enabled"
                  onClick={() => saveQuickNote(s.playerId!, p?.name ?? 'player')}
                >
                  Add
                </button>
              </div>
            </div>
          )}
          </div>
        );
      })}
    </div>
  );
}

/* ================= undo bar + toggles ================= */

function UndoBar() {
  const { live, dispatch } = useApp();
  const last = live.currentEntries[live.currentEntries.length - 1];
  if (!last) return null;
  const label =
    last.action === 'raise'
      ? last.raiseLevel === 1
        ? 'open'
        : `${last.raiseLevel + 1}-bet`
      : last.action;
  const way = potWayLabel(live.currentEntries);
  return (
    <div className="undo-bar">
      <div className="ub-info">
        <b>{live.currentEntries.length}</b> action{live.currentEntries.length === 1 ? '' : 's'} · seat{' '}
        {last.seatNo} {label}
      </div>
      {way && <div className="ub-way">{way}</div>}
      <div className="undo-actions">
        <button className="mini-btn" onClick={() => dispatch({ type: 'CLEAR_HAND' })}>
          Clear
        </button>
        <button className="mini-btn enabled" onClick={() => dispatch({ type: 'UNDO_TAP' })}>
          Undo
        </button>
      </div>
    </div>
  );
}

/* ================= player cards (between-hands reading surface) ================= */

/**
 * One card per OCCUPIED, non-hero seat (seat order). Same player records as the
 * list rows above — Dexie live queries keep tags/notes/verified in lockstep in
 * both places. This is the reading/notes surface; the list up top is for logging.
 */
function PlayerCards() {
  const { live, settings } = useApp();
  const { toast } = useUi();
  const playersById = useSeatedPlayers();
  const [collapsed, setCollapsed] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [cardEditKey, setCardEditKey] = useState<string | null>(null);
  const [cardEditText, setCardEditText] = useState('');
  const cardEditCancel = useRef(false);

  const cards = live.seats.filter((s) => !s.open && !s.hero && s.playerId != null);
  if (cards.length === 0) return null;

  const setDraft = (pid: number, v: string) => setDrafts((d) => ({ ...d, [pid]: v }));
  const saveNote = (pid: number, name: string) => {
    const text = (drafts[pid] ?? '').trim();
    if (!text) return;
    void repo.addPlayerNote(pid, text, live.handNo, live.sessionId);
    setDraft(pid, '');
    toast(`Note saved on ${name}`);
  };

  return (
    <div className="cards-section">
      <button className="cards-head" onClick={() => setCollapsed((v) => !v)}>
        <span>Player Cards ({cards.length})</span>
        <span className="chev">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div className="cards-grid">
          {cards.map((s) => {
            const p = playersById.get(s.playerId!);
            if (!p) return null;
            const color = p.tag ? tagColor(p.tag, settings.tags) : undefined;
            return (
              <div className="pcard" key={s.seatNo} id={`pcard-${s.seatNo}`}>
                <div className="pcard-head">
                  <span className="pcard-seat">{s.seatNo}</span>
                  <span className="pcard-name">{p.name}</span>
                  {p.tag && (
                    <span
                      className="pcard-tag"
                      style={{ background: color, borderColor: color }}
                    >
                      {p.tag}
                    </span>
                  )}
                  {s.stack && <span className="pcard-stack">${s.stack}</span>}
                </div>
                {p.tag && (
                  <div className="pcard-verify">
                    <span>{confidenceLabel(p.tag, p.exploits ?? [], settings.exploitAxes)}</span>
                    <Switch on={p.verified} onToggle={() => void repo.toggleVerified(p.id!)} />
                  </div>
                )}
                <ExploitChips playerId={p.id!} exploits={p.exploits ?? []} axes={settings.exploitAxes} handNo={live.handNo} />
                <div className="pcard-notes">
                  {p.notes.length === 0 && <div className="pcard-nonote">No notes yet</div>}
                  {orderedNotes(p.notes).slice(0, 3).map(({ note: n, index: orig }) => {
                    const key = `${p.id}:${orig}`;
                    const armed = confirmDel === key;
                    return (
                      <div
                        className={`pcard-note ${n.pinned ? 'pinned' : ''} ${armed ? 'confirm-del' : ''}`}
                        key={orig}
                        onClick={() => armed && setConfirmDel(null)}
                      >
                        <div className="pcard-note-body">
                          {cardEditKey === key ? (
                            <input
                              className="note-edit"
                              autoFocus
                              value={cardEditText}
                              onChange={(e) => setCardEditText(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                else if (e.key === 'Escape') {
                                  cardEditCancel.current = true;
                                  e.currentTarget.blur();
                                }
                              }}
                              onBlur={() => {
                                if (cardEditCancel.current) {
                                  cardEditCancel.current = false;
                                  setCardEditKey(null);
                                  return;
                                }
                                void repo.updatePlayerNote(p.id!, orig, cardEditText);
                                toast(cardEditText.trim() ? 'Note updated' : 'Note deleted');
                                setCardEditKey(null);
                              }}
                            />
                          ) : (
                            <div
                              className="pcard-note-text"
                              title="Double-click to edit"
                              onDoubleClick={() => {
                                setCardEditKey(key);
                                setCardEditText(n.text);
                              }}
                            >
                              {n.pinned && <span className="pin-flag">📌</span>}
                              {n.text}
                            </div>
                          )}
                          <div className="note-meta">
                            <span className="ts">
                              {n.t}
                              {n.h != null ? ` · Hand #${n.h}` : ''}
                            </span>
                            {n.fromName && <span className="note-from">from name</span>}
                            {n.exploits?.map((x, k) => (
                              <span key={k} className={`note-ex lvl${x.level}`}>
                                {exploitLabel(x, settings.exploitAxes)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="note-actions">
                          <button
                            className={`note-pin ${n.pinned ? 'on' : ''}`}
                            title={n.pinned ? 'Unpin' : 'Pin (one per player)'}
                            onClick={(e) => {
                              e.stopPropagation();
                              void repo.togglePinnedNote(p.id!, orig);
                              toast(n.pinned ? 'Unpinned' : 'Pinned');
                            }}
                          >
                            📌
                          </button>
                          <button
                            className={`note-del ${armed ? 'confirm' : ''}`}
                            title={armed ? 'Tap again to delete' : 'Delete note'}
                            onClick={(e) => {
                              e.stopPropagation();
                              const r = toggleDeleteConfirm(confirmDel, key);
                              if (r.doDelete) {
                                void repo.deletePlayerNote(p.id!, orig);
                                toast('Note deleted');
                                setConfirmDel(null);
                              } else setConfirmDel(r.confirm);
                            }}
                          >
                            {armed ? 'Delete?' : '✕'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="quick-note pcard-note-add">
                  <input
                    value={drafts[p.id!] ?? ''}
                    placeholder={`Note on ${p.name}… Enter saves`}
                    onChange={(e) => setDraft(p.id!, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveNote(p.id!, p.name);
                    }}
                  />
                  <button className="mini-btn enabled" onClick={() => saveNote(p.id!, p.name)}>
                    Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BlindToggles() {
  const { live, dispatch } = useApp();
  type BlindKey = 'noSB' | 'straddle' | 'mustStraddle';
  const chip = (key: BlindKey, label: string, title: string) => (
    <button
      className={`blind-chip ${live[key] ? 'on' : ''}`}
      title={title}
      onClick={() => dispatch({ type: 'TOGGLE', key })}
    >
      {label}
    </button>
  );
  return (
    <div className="blind-bar">
      {chip('noSB', 'No SB', 'No small blind player this hand')}
      {chip('straddle', 'Straddle', 'UTG straddle posted — acts last preflop')}
      {chip('mustStraddle', 'Must STR', 'Keeps straddle on between hands')}
    </div>
  );
}
