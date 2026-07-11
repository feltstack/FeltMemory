/** Population: per-archetype rollups — the differentiator screen. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state/AppContext';
import { StatBox, TagChip } from '../components/Bits';
import { fmt, pct, type Player } from '../types';

interface ArchStats {
  n: number;
  avgVpip: number | null;
  avgPfr: number | null;
  avgTb: number | null;
  avgHands: number;
  verifiedCount: number;
  verifiedPct: number;
  avgFirstTagHand: number | null;
}

function computeArchetypeStats(group: Player[]): ArchStats | null {
  const n = group.length;
  if (n === 0) return null;
  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  const vpips = group.map((p) => pct(p.counters.vpip, p.counters.dealt)).filter((x): x is number => x !== null);
  const pfrs = group.map((p) => pct(p.counters.pfr, p.counters.dealt)).filter((x): x is number => x !== null);
  const tbs = group.map((p) => pct(p.counters.threeBet, p.counters.threeBetOpp)).filter((x): x is number => x !== null);
  const verifiedCount = group.filter((p) => p.verified).length;
  const firstReads = group.map((p) => p.archHand).filter((x): x is number => x !== null);
  return {
    n,
    avgVpip: avg(vpips),
    avgPfr: avg(pfrs),
    avgTb: avg(tbs),
    avgHands: avg(group.map((p) => p.counters.dealt)) ?? 0,
    verifiedCount,
    verifiedPct: Math.round((100 * verifiedCount) / n),
    avgFirstTagHand: avg(firstReads),
  };
}

export default function PopulationScreen() {
  const { settings } = useApp();
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];

  const tagsInUse = new Set(players.map((p) => p.tag).filter(Boolean));
  const allTags = [...new Set([...settings.tags, ...tagsInUse])];

  const totalTagged = players.filter((p) => p.tag).length;
  const totalVerified = players.filter((p) => p.verified).length;
  const overallPct = totalTagged ? Math.round((100 * totalVerified) / totalTagged) : 0;

  return (
    <div className="screen">
      <div className="card">
        <div className="pop-summary">
          <div>
            <b>{totalTagged}</b>
            <span>Villains tagged</span>
          </div>
          <div>
            <b>{overallPct}%</b>
            <span>Reads verified correct</span>
          </div>
        </div>
      </div>
      <div className="section-title">Archetype Averages</div>
      {allTags.map((t) => {
        const s = computeArchetypeStats(players.filter((p) => p.tag === t));
        if (!s) {
          return (
            <div className="card" key={t}>
              <div className="pop-head">
                <TagChip tag={t} allTags={allTags} />
                <span className="pop-n">0 villains</span>
              </div>
              <div className="empty-state" style={{ padding: '14px 0' }}>
                No villains tagged {t} yet
              </div>
            </div>
          );
        }
        return (
          <div className="card" key={t}>
            <div className="pop-head">
              <TagChip tag={t} allTags={allTags} />
              <span className="pop-n">
                {s.n} villain{s.n === 1 ? '' : 's'}
              </span>
            </div>
            <div className="stat-grid">
              <StatBox v={fmt(s.avgVpip)} label="Avg VPIP" />
              <StatBox v={fmt(s.avgPfr)} label="Avg PFR" />
              <StatBox v={fmt(s.avgTb)} label="Avg 3-Bet" />
              <StatBox v={String(s.avgHands)} label="Avg hands" />
            </div>
            <div className="pop-meta">
              <div>
                <span>Read verified correct</span>
                <b>
                  {s.verifiedCount}/{s.n} ({s.verifiedPct}%)
                </b>
              </div>
              <div>
                <span>Avg hands observed at first read</span>
                <b>{fmt(s.avgFirstTagHand)}</b>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
