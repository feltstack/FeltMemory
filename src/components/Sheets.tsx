/** Bottom sheets: player detail (tag/read-tracking/notes) + assign-to-seat. */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import * as repo from '../db/repo';
import { useApp } from '../state/AppContext';
import { useUi } from '../state/UiContext';
import { Icon } from './Icons';
import { StatBox, Switch, TagChip, initialsOf } from './Bits';
import { fmt, pct, tagColor, tagSlug, type Player } from '../types';

export function SheetHost() {
  const { sheet, closeSheet } = useUi();

  // Desktop: anchor the player card to the clicked row/chip as a popover
  // instead of a detached bottom sheet. Mobile keeps the thumb-friendly sheet.
  const popover =
    sheet?.kind === 'player' && sheet.anchor && window.innerWidth >= 900
      ? sheet.anchor
      : null;

  let popStyle: React.CSSProperties | undefined;
  if (popover) {
    const width = 440;
    const margin = 12;
    const spaceBelow = window.innerHeight - popover.bottom - margin;
    const spaceAbove = popover.top - margin;
    const below = spaceBelow >= 340 || spaceBelow >= spaceAbove;
    popStyle = {
      width,
      left: Math.min(Math.max(margin, popover.left), window.innerWidth - width - margin),
      maxHeight: Math.min(620, (below ? spaceBelow : spaceAbove) - 4),
      ...(below
        ? { top: popover.bottom + 6 }
        : { bottom: window.innerHeight - popover.top + 6 }),
    };
  }

  return (
    <div
      className={`sheet-backdrop ${sheet ? 'show' : ''} ${popover ? 'popover-mode' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSheet();
      }}
    >
      <div className={`sheet ${popover ? 'popover-sheet' : ''}`} style={popStyle}>
        {sheet?.kind === 'player' && (
          <PlayerSheet playerId={sheet.playerId} seatNo={sheet.seatNo} />
        )}
        {sheet?.kind === 'assign' && <AssignSheet seatNo={sheet.seatNo} />}
        {sheet?.kind === 'menu' && <MenuSheet />}
      </div>
    </div>
  );
}

/* ================= Player sheet ================= */

function PlayerSheet({ playerId, seatNo }: { playerId: number; seatNo?: number }) {
  const { live, dispatch, settings, sessionActive } = useApp();
  const { toast, closeSheet } = useUi();
  const player = useLiveQuery(() => db.players.get(playerId), [playerId]);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const seat = seatNo != null ? live.seats.find((s) => s.seatNo === seatNo) : undefined;
  const allTags = useMemo(() => {
    const set = new Set(settings.tags);
    if (player?.tag) set.add(player.tag);
    return [...set];
  }, [settings.tags, player?.tag]);

  useEffect(() => setNameDraft(null), [playerId]);
  if (!player) return null;

  const c = player.counters;
  const commitName = async () => {
    if (nameDraft === null || nameDraft.trim() === player.name) return;
    const err = await repo.renamePlayer(playerId, nameDraft);
    if (err) {
      toast(err);
      setNameDraft(null);
    } else {
      toast('Renamed');
      setNameDraft(null);
    }
  };

  const setTag = async (tag: string) => {
    if (player.tag === tag) return; // same tag = no-op (doesn't reset the read)
    await repo.setPlayerTag(playerId, tag);
    toast(`Tagged ${tag}`);
  };

  const venueRows = Object.entries(player.venues || {});
  const notes = [...(player.notes || [])].reverse();
  const tagInfo = player.tag ? (
    <>
      Tagged <b>{player.tag}</b> after {player.archHand ?? '–'} hands observed
      {player.verified
        ? ` · verified correct at ${player.verifiedHand} hands`
        : ' · not yet verified'}
    </>
  ) : (
    'Not yet tagged with an archetype'
  );

  return (
    <>
      <div className="sheet-handle" />
      <div className="sheet-header">
        <input
          value={nameDraft ?? player.name}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Player name"
        />
        <button className="sheet-close" onClick={closeSheet}>✕</button>
      </div>
      <div className="chip-row">
        {allTags.map((t) => {
          const active = player.tag === t;
          const color = tagColor(t, allTags);
          return (
            <button
              key={t}
              className={`chip ${active ? 'active ' + tagSlug(t) : ''}`}
              style={active ? { background: color, borderColor: color } : undefined}
              onClick={() => setTag(t)}
            >
              {t}
            </button>
          );
        })}
      </div>
      <div className="tag-meta">{tagInfo}</div>
      {player.tag && (
        <div className="toggle-row">
          <div>
            <div className="label">Read verified correct</div>
            <div className="sub">Confirms this archetype call held up</div>
          </div>
          <Switch on={player.verified} onToggle={() => repo.toggleVerified(playerId)} />
        </div>
      )}
      <div className="stat-grid">
        <StatBox v={fmt(pct(c.vpip, c.dealt))} label="VPIP" />
        <StatBox v={fmt(pct(c.pfr, c.dealt))} label="PFR" />
        <StatBox v={fmt(pct(c.threeBet, c.threeBetOpp))} label="3-Bet" />
        <StatBox v={String(c.dealt)} label="Hands" />
      </div>
      {seat && (
        <div className="stack-inline">
          <label>Stack $</label>
          <input
            inputMode="numeric"
            placeholder="e.g. 450"
            value={seat.stack}
            onChange={(e) =>
              dispatch({ type: 'SET_STACK', seatNo: seat.seatNo, stack: e.target.value })
            }
          />
        </div>
      )}
      <div className="section-title">Seen at</div>
      <div className="venue-breakdown">
        {venueRows.length === 0 && <div>No venue history yet</div>}
        {venueRows.map(([v, n]) => (
          <div key={v}>
            <span>{v}</span>
            <span>
              {n} session{n === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>
      <div className="section-title">Notes</div>
      <div className="notes-list">
        {notes.length === 0 && (
          <div className="note-item" style={{ color: 'var(--text-faint)' }}>
            No notes yet
          </div>
        )}
        {notes.map((n, i) => (
          <div className="note-item" key={i}>
            {n.text}
            <div className="ts">{n.t}</div>
          </div>
        ))}
      </div>
      <div className="note-add">
        <input
          placeholder="Add a read or note…"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNote()}
        />
        <button onClick={addNote}>Add</button>
      </div>
      <div className="btn-row" style={{ marginTop: 16 }}>
        {seat && (
          <button
            className="btn"
            onClick={() => {
              dispatch({ type: 'UNSEAT', seatNo: seat.seatNo });
              toast(`Seat ${seat.seatNo} opened — stats stay on ${player.name}`);
              closeSheet();
            }}
          >
            Player left — open seat
          </button>
        )}
        {!seat && !sessionActive && (
          <button
            className="btn danger"
            onClick={async () => {
              if (!window.confirm(`Delete ${player.name} and all their history?`)) return;
              await repo.deletePlayer(playerId);
              toast('Player deleted');
              closeSheet();
            }}
          >
            Delete player
          </button>
        )}
      </div>
    </>
  );

  function addNote() {
    const text = noteDraft.trim();
    if (!text) return;
    void repo.addPlayerNote(playerId, text);
    setNoteDraft('');
    toast('Note added');
  }
}

/* ================= Table menu (Pokeri-style session actions) ================= */

function MenuSheet() {
  const { live, dispatch, endSession, saveHand } = useApp();
  const { toast, closeSheet } = useUi();
  const openSeats = live.seats.filter((s) => s.open);
  const villains = live.seats.filter((s) => !s.open && !s.hero);

  const fillAll = async () => {
    if (openSeats.length === 0) {
      toast('No open seats to fill');
      return;
    }
    const created = await repo.createNoNamePlayers(openSeats.length);
    dispatch({
      type: 'ASSIGN_SEATS_BULK',
      assignments: openSeats.map((s, i) => ({
        seatNo: s.seatNo,
        playerId: created[i].id!,
      })),
    });
    toast(`Seated ${created.length} No Name villain${created.length === 1 ? '' : 's'}`);
    closeSheet();
  };

  const removeVillains = () => {
    if (villains.length === 0) {
      toast('No villains seated');
      return;
    }
    if (!window.confirm(`Open all ${villains.length} villain seats? Their stats stay in the database.`))
      return;
    dispatch({ type: 'UNSEAT_VILLAINS' });
    toast('Table cleared — all seats open');
    closeSheet();
  };

  const end = async () => {
    if (live.currentEntries.length > 0 && window.confirm('Save the hand in progress first?')) {
      await saveHand();
    }
    if (!window.confirm('End this session?')) return;
    await endSession();
    toast('Session ended');
    closeSheet();
  };

  return (
    <>
      <div className="sheet-handle" />
      <div className="sheet-header">
        <input value="Table menu" disabled style={{ color: 'var(--text)' }} />
        <button className="sheet-close" onClick={closeSheet}>✕</button>
      </div>
      <div className="menu-actions">
        <button className="btn block" onClick={fillAll}>
          Fill all open seats ({openSeats.length}) with No Names
        </button>
        <button className="btn block" onClick={removeVillains}>
          Remove all villains — open every seat
        </button>
        <button className="btn danger block" onClick={end}>
          End session
        </button>
      </div>
      <div className="menu-hint">
        No Names are numbered so each unknown stays a separate player — rename them from
        their seat once you have a read.
      </div>
    </>
  );
}

/* ================= Assign sheet (open seat → player) ================= */

function AssignSheet({ seatNo }: { seatNo: number }) {
  const { live, dispatch } = useApp();
  const { toast, closeSheet, openPlayer } = useUi();
  const [query, setQuery] = useState('');
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];

  const seatedIds = new Set(
    live.seats.filter((s) => s.playerId != null).map((s) => s.playerId),
  );
  const matches = players
    .filter(
      (p) =>
        !seatedIds.has(p.id!) &&
        p.name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, 30);

  const assign = (p: Player) => {
    dispatch({ type: 'ASSIGN_SEAT', seatNo, playerId: p.id! });
    toast(`${p.name} seated at ${seatNo}`);
    openPlayer(p.id!, seatNo);
  };

  const createAndAssign = async () => {
    const name = query.trim();
    if (!name) return;
    const existing = await repo.findPlayerByName(name);
    if (existing && seatedIds.has(existing.id!)) {
      toast(`${existing.name} is already seated`);
      return;
    }
    const p = existing ?? (await repo.findOrCreatePlayer(name));
    assign(p);
  };

  const canCreate =
    query.trim().length > 0 &&
    !players.some((p) => p.nameLower === query.trim().toLowerCase());

  return (
    <>
      <div className="sheet-handle" />
      <div className="sheet-header">
        <input
          placeholder={`Seat ${seatNo} — player name…`}
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createAndAssign()}
        />
        <button className="sheet-close" onClick={closeSheet}>✕</button>
      </div>
      {canCreate && (
        <button className="btn primary block" style={{ margin: '10px 0' }} onClick={createAndAssign}>
          ＋ Add “{query.trim()}” as a new player
        </button>
      )}
      <div className="section-title">
        {query ? 'Matching players' : 'Known players (most recent)'}
      </div>
      <div className="assign-list">
        {matches.length === 0 && (
          <div className="empty-state" style={{ padding: '18px 0' }}>
            {query ? 'No unseated player matches' : 'No players in your database yet'}
          </div>
        )}
        {matches.map((p) => {
          const c = p.counters;
          return (
            <div className="seat-row" key={p.id} onClick={() => assign(p)}>
              <div className="badge">{initialsOf(p.name)}</div>
              <div className="row-main">
                <div className="row-name-line">
                  <div className="row-name">{p.name}</div>
                  <TagChip tag={p.tag} verified={p.verified} allTags={[p.tag]} />
                </div>
                <div className="stat-quad">
                  <div>
                    VPIP <b>{fmt(pct(c.vpip, c.dealt))}</b>
                  </div>
                  <div>
                    PFR <b>{fmt(pct(c.pfr, c.dealt))}</b>
                  </div>
                  <div>
                    Hands <b>{c.dealt}</b>
                  </div>
                  <div>
                    Seen <b>{p.lastSeen}</b>
                  </div>
                </div>
              </div>
              <Icon name="chevron" className="icon chevron" />
            </div>
          );
        })}
      </div>
    </>
  );
}
