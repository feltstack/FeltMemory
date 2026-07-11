/** Players roster: searchable, sortable, archetype-filterable population list. */
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../state/AppContext';
import { useUi } from '../state/UiContext';
import { Icon } from '../components/Icons';
import { TagChip, anchorOf, initialsOf } from '../components/Bits';
import { fmt, pct, tagColor, type Player } from '../types';

type SortKey = 'name' | 'tag' | 'sessions' | 'hands' | 'vpip' | 'pfr' | 'tb' | 'lastSeen';

const COLS: [SortKey, string][] = [
  ['name', 'Player'],
  ['tag', 'Type'],
  ['sessions', 'Sessions'],
  ['hands', 'Hands'],
  ['vpip', 'VPIP'],
  ['pfr', 'PFR'],
  ['tb', '3-Bet'],
  ['lastSeen', 'Last seen'],
];

const UNTAGGED = '__untagged__';

function sortValue(p: Player, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return p.nameLower;
    case 'tag':
      return p.tag.toLowerCase();
    case 'sessions':
      return p.sessions;
    case 'hands':
      return p.counters.dealt;
    case 'vpip':
      return pct(p.counters.vpip, p.counters.dealt) ?? -1;
    case 'pfr':
      return pct(p.counters.pfr, p.counters.dealt) ?? -1;
    case 'tb':
      return pct(p.counters.threeBet, p.counters.threeBetOpp) ?? -1;
    case 'lastSeen':
      return p.lastSeen;
  }
}

export default function PlayersScreen() {
  const { settings } = useApp();
  const { openPlayer } = useUi();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('hands');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [tagFilter, setTagFilter] = useState<string[]>([]); // empty = all; '' via UNTAGGED
  const [exFilter, setExFilter] = useState<string[]>([]); // exploit axis ids (AND)
  const players = useLiveQuery(() => db.players.toArray(), []) ?? [];

  // Filterable taxonomy = settings tags ∪ tags still present on players
  // (so players keeping a removed tag stay reachable).
  const allTags = useMemo(() => {
    const inUse = players.map((p) => p.tag).filter(Boolean);
    return [...new Set([...settings.tags, ...inUse])];
  }, [settings.tags, players]);

  const allAxes = useMemo(() => {
    const ids = settings.exploitAxes.map((a) => a.l1);
    players.forEach((p) => (p.exploits ?? []).forEach((e) => {
      if (!ids.includes(e.tag)) ids.push(e.tag);
    }));
    return ids;
  }, [settings.exploitAxes, players]);

  const toggleTag = (key: string) =>
    setTagFilter((cur) => (cur.includes(key) ? cur.filter((t) => t !== key) : [...cur, key]));
  const toggleEx = (key: string) =>
    setExFilter((cur) => (cur.includes(key) ? cur.filter((t) => t !== key) : [...cur, key]));

  const rows = players
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter(
      (p) =>
        tagFilter.length === 0 ||
        tagFilter.includes(p.tag ? p.tag : UNTAGGED),
    )
    .filter(
      (p) =>
        exFilter.length === 0 ||
        exFilter.every((ax) => (p.exploits ?? []).some((e) => e.tag === ax)),
    )
    .sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      let cmp: number;
      if (typeof av === 'string' || typeof bv === 'string') {
        cmp = String(av).localeCompare(String(bv));
      } else {
        cmp = av - bv;
      }
      if (sortDir === 'desc') cmp = -cmp;
      // Stable, useful tie-break: most-observed players first.
      return cmp !== 0 ? cmp : b.counters.dealt - a.counters.dealt;
    });

  const clickSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'tag' ? 'asc' : 'desc');
    }
  };

  const filteredNote =
    tagFilter.length > 0 || exFilter.length > 0
      ? ` · ${rows.length} of ${players.length} shown`
      : '';

  return (
    <div className="screen">
      <div className="searchbar">
        <Icon name="search" />
        <input
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chip-row filter-chips">
        {allTags.map((t) => {
          const active = tagFilter.includes(t);
          const color = tagColor(t, allTags);
          return (
            <button
              key={t}
              className={`chip ${active ? 'active' : ''}`}
              style={active ? { background: color, borderColor: color } : { color }}
              onClick={() => toggleTag(t)}
              title={`Filter: ${t}`}
            >
              {t}
            </button>
          );
        })}
        <button
          className={`chip ${tagFilter.includes(UNTAGGED) ? 'active untagged-active' : ''}`}
          onClick={() => toggleTag(UNTAGGED)}
          title="Filter: players without an archetype yet"
        >
          Untagged
        </button>
        {tagFilter.length > 0 && (
          <button className="chip" onClick={() => setTagFilter([])} title="Clear filters">
            ✕ Clear
          </button>
        )}
      </div>

      {allAxes.length > 0 && (
        <div className="chip-row filter-chips">
          {allAxes.map((ax) => (
            <button
              key={ax}
              className={`chip ex-filter ${exFilter.includes(ax) ? 'active' : ''}`}
              onClick={() => toggleEx(ax)}
              title={`Filter: players tagged ${ax}`}
            >
              {ax}
            </button>
          ))}
          {exFilter.length > 0 && (
            <button className="chip" onClick={() => setExFilter([])} title="Clear exploit filters">
              ✕ Clear
            </button>
          )}
        </div>
      )}

      <div className="sort-bar">
        <label>Sort</label>
        <select
          className="mini-select"
          value={sortKey}
          onChange={(e) => clickSort(e.target.value as SortKey)}
        >
          {COLS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <button
          className="mini-btn enabled"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          title="Flip sort direction"
        >
          {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
        <span className="sort-note">{filteredNote}</span>
      </div>

      <table className="data">
        <thead>
          <tr>
            {COLS.map(([k, l]) => (
              <th key={k} className={sortKey === k ? 'active' : ''} onClick={() => clickSort(k)}>
                {l} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  {players.length === 0
                    ? 'No players yet — they appear here as you seat them during sessions'
                    : 'No players match the current search/filters'}
                </div>
              </td>
            </tr>
          )}
          {rows.map((p) => {
            const c = p.counters;
            return (
              <tr key={p.id} onClick={(e) => openPlayer(p.id!, undefined, anchorOf(e))}>
                <td className="name-cell-td name-cell">
                  <span className="badge" style={{ width: 28, height: 28, fontSize: 11 }}>
                    {initialsOf(p.name)[0] ?? '?'}
                  </span>
                  {p.name}
                </td>
                <td data-label="Type">
                  <TagChip tag={p.tag} verified={p.verified} allTags={allTags} />
                </td>
                <td data-label="Sessions">{p.sessions}</td>
                <td data-label="Hands">{c.dealt}</td>
                <td data-label="VPIP">{fmt(pct(c.vpip, c.dealt))}</td>
                <td data-label="PFR">{fmt(pct(c.pfr, c.dealt))}</td>
                <td data-label="3-Bet">{fmt(pct(c.threeBet, c.threeBetOpp))}</td>
                <td data-label="Last seen">{p.lastSeen}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
