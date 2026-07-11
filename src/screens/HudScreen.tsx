/** Live HUD: session setup → felt/list views, tap logging, blind toggles. */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import * as repo from '../db/repo';
import { pendingBadge, seatXY } from '../db/stats';
import { useApp } from '../state/AppContext';
import { useUi } from '../state/UiContext';
import { Icon } from '../components/Icons';
import { Switch, anchorOf, initialsOf } from '../components/Bits';
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
  const { sessionActive, settings } = useApp();
  const [view, setView] = useState<'table' | 'list'>(settings.defaultView);
  const [btnMode, setBtnMode] = useState(false);
  const [wide, setWide] = useState(window.innerWidth >= 900);

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!sessionActive) return <SessionSetup />;

  const showCompanion = wide && view === 'table';
  return (
    <div className="screen">
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>
          Table view
        </button>
        <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
          List view
        </button>
      </div>
      <UndoBar />
      <div className={showCompanion ? 'hud-grid' : ''}>
        <div>{view === 'table' ? <Felt btnMode={btnMode} setBtnMode={setBtnMode} /> : <SeatList />}</div>
        {showCompanion && (
          <div>
            <SeatList />
          </div>
        )}
      </div>
      {view === 'table' && (
        <div className="btn-row" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <button
            className={`btn ${btnMode ? 'primary' : ''}`}
            onClick={() => setBtnMode((v) => !v)}
          >
            {btnMode ? 'Tap a seat to place the button…' : 'Move dealer button'}
          </button>
        </div>
      )}
      <BlindToggles />
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
  const [tableSize, setTableSize] = useState(9);
  const [heroSeat, setHeroSeat] = useState(5);
  const [btnSeat, setBtnSeat] = useState(1);

  const venueName = venueChoice === '__new__' || venues.length === 0 ? newVenue.trim() : venueChoice;

  const start = async () => {
    if (!venueName) {
      toast('Pick or add a venue first');
      return;
    }
    await startSession(venueName, stakes.trim() || '—', tableSize, Math.min(heroSeat, tableSize), Math.min(btnSeat, tableSize));
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
          <input
            placeholder="e.g. $1/$3 NL Hold'em"
            value={stakes}
            onChange={(e) => setStakes(e.target.value)}
          />
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
      <div className="dealer-gap">
        <Icon name="cards" />
        DEALER
      </div>
      <div className="felt-center">
        <div className="stakes">{live.stakes}</div>
        <div className="venue">
          {live.venueName} · Hand #{live.handNo}
        </div>
      </div>
      {live.seats.map((s) => {
        const [x, y] = seatXY(s.seatNo, live.seats.length);
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
              className={`seat-chip ${s.hero ? 'hero' : ''} ${btnMode ? 'btn-target' : ''}`}
              style={{ left: `${x}%`, top: `${y}%`, ...(ring && !s.hero ? { borderColor: ring } : {}) }}
              onClick={(e) => tapSeat(s, e)}
            >
              <div className="num">{s.seatNo}</div>
              <div className="initials">{s.hero ? 'YOU' : initialsOf(p?.name ?? '?')}</div>
              <div className="pos">{s.pos}</div>
              {badge && <div className="act-tag">{badge}</div>}
              {hasNote && !badge && <div className="note-dot">📝</div>}
              {s.stack && <div className="stack-tag">${s.stack}</div>}
            </div>
            {s.dealer && (
              <div className="dealer-btn" style={{ left: `${x + 7}%`, top: `${y - 9}%` }}>
                D
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================= seat list ================= */

function SeatList() {
  const { live, dispatch, settings } = useApp();
  const { openPlayer, openAssign, toast } = useUi();
  const playersById = useSeatedPlayers();
  // Inline quick-note editor: 📝 on a row opens an input right under it —
  // no popup, autofocused, Enter saves, Esc closes.
  const [noteSeat, setNoteSeat] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const saveQuickNote = (playerId: number, name: string) => {
    const text = noteDraft.trim();
    if (!text) {
      setNoteSeat(null);
      return;
    }
    void repo.addPlayerNote(playerId, text);
    toast(`Note saved on ${name}`);
    setNoteDraft('');
    setNoteSeat(null);
  };

  return (
    <div>
      {live.seats.map((s) => {
        if (s.open) {
          return (
            <div className="seat-row open" key={s.seatNo}>
              <div className="badge">{s.seatNo}</div>
              <div className="row-main">
                <div className="row-name">Open Seat</div>
              </div>
              <button className="mini-btn enabled" onClick={() => openAssign(s.seatNo)}>
                ＋ Add
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
            </div>
          );
        }
        const p = s.playerId != null ? playersById.get(s.playerId) : undefined;
        const c = p?.counters;
        const ring = p?.tag ? tagColor(p.tag, settings.tags) : undefined;
        const badge = pendingBadge(live.currentEntries, s.seatNo);
        const notePreview = p?.notes?.length ? p.notes[p.notes.length - 1].text : '';
        return (
          <div key={s.seatNo}>
          <div
            className="seat-row"
            onClick={(e) => {
              if (s.hero) toast("That's you — Hero isn't tracked like an opponent");
              else if (s.playerId != null) openPlayer(s.playerId, s.seatNo, anchorOf(e));
            }}
          >
            <div
              className={`badge ${s.hero ? 'hero' : ''}`}
              style={ring && !s.hero ? { borderColor: ring } : undefined}
            >
              {s.seatNo}
            </div>
            <div className="row-main">
              <div className="row-name-line">
                <div className="row-name">
                  {s.hero ? 'Hero' : p?.name ?? '?'}
                  {!s.hero && notePreview
                    ? ` — ${notePreview.slice(0, 18)}${notePreview.length > 18 ? '…' : ''}`
                    : ''}
                </div>
                {badge && <span className="pending-chip">{badge}</span>}
                {s.stack && <span className="row-stack">${s.stack}</span>}
              </div>
              <div className="stat-quad">
                <div>
                  VPIP <b>{s.hero ? '–' : fmt(pct(c?.vpip ?? 0, c?.dealt ?? 0))}</b>
                </div>
                <div>
                  PFR <b>{s.hero ? '–' : fmt(pct(c?.pfr ?? 0, c?.dealt ?? 0))}</b>
                </div>
                <div>
                  3B <b>{s.hero ? '–' : fmt(pct(c?.threeBet ?? 0, c?.threeBetOpp ?? 0))}</b>
                </div>
                <div>
                  Hands <b>{s.hero ? '–' : c?.dealt ?? 0}</b>
                </div>
              </div>
            </div>
            <div className="row-pos">{s.dealer ? <span title="Button">🔘</span> : s.pos}</div>
            <div className="row-actions">
              <button
                className={`mini-btn enabled ${badge && badge !== 'Open' && !badge.includes('Bet') ? 'tapped' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'TAP', seatNo: s.seatNo, playerId: s.playerId, action: 'call' });
                }}
              >
                Call
              </button>
              <button
                className={`mini-btn enabled ${badge && (badge === 'Open' || badge.includes('Bet')) ? 'tapped' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: 'TAP', seatNo: s.seatNo, playerId: s.playerId, action: 'raise' });
                }}
              >
                Raise
              </button>
              {!s.hero && s.playerId != null && (
                <button
                  className={`mini-btn ${noteSeat === s.seatNo ? 'tapped' : ''}`}
                  title="Quick note — types right here, no popup"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteDraft('');
                    setNoteSeat(noteSeat === s.seatNo ? null : s.seatNo);
                  }}
                >
                  📝
                </button>
              )}
            </div>
            <Icon name="chevron" className="icon chevron" style={{ width: 16, height: 16 }} />
          </div>
          {noteSeat === s.seatNo && s.playerId != null && (
            <div className="quick-note">
              <input
                autoFocus
                value={noteDraft}
                placeholder={`Note on ${p?.name ?? 'player'}… Enter saves, Esc closes`}
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
                Save
              </button>
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
        ? 'Open raise'
        : `${last.raiseLevel + 1}-bet`
      : last.action;
  return (
    <div className="undo-bar">
      <div>
        This hand: <b>{live.currentEntries.length}</b> action
        {live.currentEntries.length === 1 ? '' : 's'} · last: <b>seat {last.seatNo} {label}</b>
      </div>
      <div className="undo-actions">
        <button className="mini-btn enabled" onClick={() => dispatch({ type: 'UNDO_TAP' })}>
          Undo
        </button>
        <button className="mini-btn" onClick={() => dispatch({ type: 'CLEAR_HAND' })}>
          Clear
        </button>
      </div>
    </div>
  );
}

function BlindToggles() {
  const { live, dispatch } = useApp();
  return (
    <div className="card" style={{ marginTop: 6 }}>
      <div className="toggle-row">
        <div>
          <div className="label">No Small Blind Player</div>
        </div>
        <Switch on={live.noSB} onToggle={() => dispatch({ type: 'TOGGLE', key: 'noSB' })} />
      </div>
      <div className="toggle-row">
        <div>
          <div className="label">Straddle</div>
        </div>
        <Switch on={live.straddle} onToggle={() => dispatch({ type: 'TOGGLE', key: 'straddle' })} />
      </div>
      <div className="toggle-row">
        <div>
          <div className="label">Must Straddle</div>
          <div className="sub">Keeps straddle on between hands</div>
        </div>
        <Switch on={live.mustStraddle} onToggle={() => dispatch({ type: 'TOGGLE', key: 'mustStraddle' })} />
      </div>
    </div>
  );
}
