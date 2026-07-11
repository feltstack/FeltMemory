/** Venues: "who plays here and how" before you sit down. */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state/AppContext';
import { useUi } from '../state/UiContext';
import { Icon } from '../components/Icons';
import { TagChip, anchorOf, initialsOf } from '../components/Bits';
import { fmt, pct } from '../types';

export default function VenuesScreen() {
  const { settings } = useApp();
  const { openPlayer } = useUi();
  const [open, setOpen] = useState<string | null>(null);
  const venues = useLiveQuery(() => db.venues.toArray(), []) ?? [];
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];

  if (venues.length === 0) {
    return (
      <div className="screen">
        <div className="empty-state">
          No venues yet — start a session and its venue shows up here with every regular you
          tag there.
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      {venues.map((v) => {
        const regulars = players
          .filter((p) => Object.keys(p.venues || {}).includes(v.name))
          .sort((a, b) => (b.venues[v.name] || 0) - (a.venues[v.name] || 0));
        const isOpen = open === v.name;
        return (
          <div className="venue-card" key={v.id}>
            <div className="venue-head" onClick={() => setOpen(isOpen ? null : v.name)}>
              <div>
                <div className="name">{v.name}</div>
                <div className="meta">
                  {v.stakes || '—'} · last visited {v.lastVisited}
                </div>
              </div>
              <Icon name="chevron" className={`icon chev-rot ${isOpen ? 'open' : ''}`} />
            </div>
            {isOpen && (
              <div className="venue-body">
                <div className="section-title">Regulars tracked here ({regulars.length})</div>
                {regulars.length === 0 && (
                  <div className="empty-state" style={{ padding: '16px 0' }}>
                    No regulars tagged here yet
                  </div>
                )}
                {regulars.map((p) => {
                  const c = p.counters;
                  return (
                    <div
                      className="seat-row"
                      key={p.id}
                      onClick={(e) => openPlayer(p.id!, undefined, anchorOf(e))}
                    >
                      <div className="badge" style={{ width: 30, height: 30, fontSize: 11 }}>
                        {initialsOf(p.name)[0] ?? '?'}
                      </div>
                      <div className="row-main">
                        <div className="row-name-line">
                          <div className="row-name">{p.name}</div>
                          <TagChip tag={p.tag} verified={p.verified} allTags={settings.tags} />
                        </div>
                        <div className="stat-quad">
                          <div>
                            VPIP <b>{fmt(pct(c.vpip, c.dealt))}</b>
                          </div>
                          <div>
                            PFR <b>{fmt(pct(c.pfr, c.dealt))}</b>
                          </div>
                          <div>
                            Sessions here <b>{p.venues[v.name]}</b>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
