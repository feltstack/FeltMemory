/**
 * Sessions — one entry per session with session-scoped table stats, drilling
 * into a per-player breakdown. Every number here comes from foldHands(), the
 * same replay the future hand-by-hand stepper will use.
 */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state/AppContext';
import { TagChip, initialsOf } from '../components/Bits';
import { Icon } from '../components/Icons';
import {
  avgOpponentStats,
  fmtDuration,
  fmtPct,
  fmtSessionDate,
  foldHands,
  sessionNotes,
} from '../db/session-stats';
import { DEFAULT_SESSION_KIND, sessionBadge } from '../db/session-meta';
import type { HandRecord, Player, Session, StatCounters } from '../types';

function StatCell({ label, num, den }: { label: string; num: number; den: number }) {
  return (
    <div className="sess-stat">
      <div className="sess-stat-v">{fmtPct(num, den)}</div>
      <div className="sess-stat-l">
        {label} <span className="nd">{num}/{den}</span>
      </div>
    </div>
  );
}

function SessionDetail({
  session,
  hands,
  players,
  allTags,
  onBack,
}: {
  session: Session;
  hands: HandRecord[];
  players: Player[];
  allTags: string[];
  onBack: () => void;
}) {
  const fold = useMemo(() => foldHands(hands), [hands]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id!, p])), [players]);

  const rows = useMemo(
    () =>
      [...fold.byPlayer.entries()]
        .map(([pid, c]) => ({ player: byId.get(pid), counters: c }))
        .filter((r): r is { player: Player; counters: StatCounters } => !!r.player)
        .sort((a, b) => b.counters.dealt - a.counters.dealt || a.player.name.localeCompare(b.player.name)),
    [fold, byId],
  );

  const badge = sessionBadge(session.kind ?? DEFAULT_SESSION_KIND, !!session.isTest);

  return (
    <div className="screen">
      <button className="btn ghost back-btn" onClick={onBack}>
        ‹ All sessions
      </button>
      <div className="section-title">
        {session.venueName} · {fmtSessionDate(session.startedAt)}
        {badge && <span className={`sess-badge${session.isTest ? ' test' : ''}`}>{badge}</span>}
      </div>
      <div className="hint sess-sub">
        {session.stakes} · {fmtDuration(session.startedAt, session.endedAt, Date.now(), session.breakMs ?? 0)} ·{' '}
        {fold.handsFolded} hands · {rows.length} opponents
        {fold.approxHands > 0 && (
          <span className="warn-note">
            {' '}· {fold.approxHands} hand{fold.approxHands === 1 ? '' : 's'} recorded before seat
            snapshots — 3-bet opportunities approximate
          </span>
        )}
      </div>

      {rows.length === 0 && (
        <div className="card">
          <div className="hint">No opponents were dealt into this session yet.</div>
        </div>
      )}

      {hands.some((h) => h.postflop) && (
        <div className="card">
          <div className="sess-hand-title">Postflop notes</div>
          {[...hands]
            .filter((h) => h.postflop)
            .sort((a, b) => a.handNo - b.handNo)
            .map((h) => (
              <div className="sess-hand" key={h.handNo}>
                <span className="sess-hand-no">#{h.handNo}</span>
                <span className="sess-hand-text">{h.postflop}</span>
              </div>
            ))}
        </div>
      )}

      {rows.map(({ player, counters }) => {
        const notes = sessionNotes(player.notes, session.id!, session.startedAt, session.endedAt);
        return (
          <div className="card sess-player" key={player.id}>
            <div className="sess-player-head">
              <span className="sess-avatar">{initialsOf(player.name)[0] ?? '?'}</span>
              <span className="sess-player-name">{player.name}</span>
              {player.tag ? <TagChip tag={player.tag} allTags={allTags} /> : <span className="hint">no archetype</span>}
              <span className="sess-hands">{counters.dealt} hands</span>
            </div>
            <div className="sess-stats">
              <StatCell label="VPIP" num={counters.vpip} den={counters.dealt} />
              <StatCell label="PFR" num={counters.pfr} den={counters.dealt} />
              <StatCell label="3B" num={counters.threeBet} den={counters.threeBetOpp} />
            </div>
            {notes.length > 0 && (
              <div className="sess-notes">
                {notes.map((n, i) => (
                  <div className="sess-note" key={i}>
                    <div className="sess-note-meta">
                      {n.sh != null ? `Hand #${n.sh}` : n.t}
                      {n.h != null && <span className="nd"> · their hand #{n.h}</span>}
                    </div>
                    <div className="sess-note-text">
                      {n.pinned && <span className="pin-flag">📌</span>}
                      {n.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SessionRow({
  session,
  hands,
  active,
  onOpen,
}: {
  session: Session;
  hands: HandRecord[];
  active: boolean;
  onOpen: () => void;
}) {
  const fold = useMemo(() => foldHands(hands), [hands]);
  const avg = useMemo(() => avgOpponentStats(fold.byPlayer), [fold]);
  const badge = sessionBadge(session.kind ?? DEFAULT_SESSION_KIND, !!session.isTest);

  return (
    <div className={`card sess-card${active ? ' live' : ''}`} onClick={onOpen}>
      <div className="sess-head">
        <div className="sess-when">
          {fmtSessionDate(session.startedAt)}
          {active && <span className="sess-live">in progress</span>}
          {badge && <span className={`sess-badge${session.isTest ? ' test' : ''}`}>{badge}</span>}
        </div>
        <div className="sess-where">
          {session.venueName} · {session.stakes}
        </div>
      </div>
      <div className="sess-meta">
        <span>{fmtDuration(session.startedAt, session.endedAt, Date.now(), session.breakMs ?? 0)}</span>
        <span>{fold.handsFolded} hands</span>
        <span>
          {avg.players} opponent{avg.players === 1 ? '' : 's'}
        </span>
      </div>
      <div className="sess-avg">
        <span className="sess-avg-l">Table avg</span>
        <span className="sess-avg-v">VPIP {avg.vpip == null ? '—' : `${avg.vpip}%`}</span>
        <span className="sess-avg-v">PFR {avg.pfr == null ? '—' : `${avg.pfr}%`}</span>
        <span className="sess-avg-v">3B {avg.threeBet == null ? '—' : `${avg.threeBet}%`}</span>
      </div>
      <button
        className="sess-open"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        title="Open session detail"
      >
        Detail <Icon name="chevron" />
      </button>
    </div>
  );
}

export default function SessionsScreen() {
  const { live, settings } = useApp();
  const [openId, setOpenId] = useState<number | null>(null);

  const sessions = useLiveQuery(() => db.sessions.toArray(), [], [] as Session[]);
  const hands = useLiveQuery(() => db.hands.toArray(), [], [] as HandRecord[]);
  const players = useLiveQuery(() => db.players.toArray(), [], [] as Player[]);

  const handsBySession = useMemo(() => {
    const m = new Map<number, HandRecord[]>();
    for (const h of hands ?? []) {
      const arr = m.get(h.sessionId);
      if (arr) arr.push(h);
      else m.set(h.sessionId, [h]);
    }
    return m;
  }, [hands]);

  const ordered = useMemo(() => {
    const rows = [...(sessions ?? [])];
    rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const activeId = live.sessionId;
    if (activeId == null) return rows;
    const i = rows.findIndex((s) => s.id === activeId);
    if (i <= 0) return rows;
    return [rows[i], ...rows.slice(0, i), ...rows.slice(i + 1)];
  }, [sessions, live.sessionId]);

  // settings tags ∪ tags still on players, so a removed tag still renders
  const allTags = useMemo(
    () => [...new Set([...settings.tags, ...(players ?? []).map((p) => p.tag).filter(Boolean)])],
    [settings.tags, players],
  );

  const open = openId == null ? null : (sessions ?? []).find((s) => s.id === openId) ?? null;

  if (open) {
    return (
      <SessionDetail
        session={open}
        hands={handsBySession.get(open.id!) ?? []}
        players={players ?? []}
        allTags={allTags}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <div className="screen">
      <div className="section-title">Sessions</div>
      {ordered.length === 0 && (
        <div className="card">
          <div className="hint">
            No sessions yet — start one on the Live HUD and it will appear here with the table's
            stats for that session.
          </div>
        </div>
      )}
      {ordered.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          hands={handsBySession.get(s.id!) ?? []}
          active={s.id === live.sessionId}
          onOpen={() => setOpenId(s.id!)}
        />
      ))}
    </div>
  );
}
