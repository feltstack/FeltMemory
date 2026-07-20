/** App shell: topbar, tab bar / sidebar (900px breakpoint), FAB, sheets, toast. */
import { useEffect, useState } from 'react';
import { useApp } from './state/AppContext';
import {
  BREAK_PRESETS,
  breakElapsedMs,
  breakRemainingMs,
  fmtClock,
  isPaused,
  parseBreakMins,
  playedMs,
} from './db/breaks';
import { useUi } from './state/UiContext';
import { Icon } from './components/Icons';
import { SheetHost } from './components/Sheets';
import HudScreen from './screens/HudScreen';
import PopulationScreen from './screens/PopulationScreen';
import PlayersScreen from './screens/PlayersScreen';
import VenuesScreen from './screens/VenuesScreen';
import SessionsScreen from './screens/SessionsScreen';
import SettingsScreen from './screens/SettingsScreen';

type ScreenKey = 'hud' | 'population' | 'players' | 'venues' | 'sessions' | 'settings';

const TABS: [ScreenKey, string, string][] = [
  ['hud', 'Live HUD', 'hud'],
  ['population', 'Population', 'population'],
  ['players', 'Players', 'players'],
  ['venues', 'Venues', 'venues'],
  ['sessions', 'Sessions', 'sessions'],
  ['settings', 'Settings', 'settings'],
];

const TITLES: Record<ScreenKey, string> = {
  hud: 'Live HUD',
  population: 'Population',
  players: 'Players',
  venues: 'Venues',
  sessions: 'Sessions',
  settings: 'Settings',
};

function BreakDialog({
  onStart,
  onCancel,
}: {
  onStart: (mins: number | null) => void;
  onCancel: () => void;
}) {
  const [custom, setCustom] = useState('');
  const customMins = parseBreakMins(custom);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Session paused</div>
        <div className="hint modal-sub">
          The timer stops while you're away. Set a break length and you'll get a countdown —
          or skip it and resume whenever you sit back down.
        </div>
        <div className="break-presets">
          {BREAK_PRESETS.map((m) => (
            <button key={m} className="break-preset" onClick={() => onStart(m)}>
              {m} min
            </button>
          ))}
        </div>
        <div className="break-custom">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            placeholder="Minutes"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customMins != null) onStart(customMins);
            }}
          />
          <button
            className="btn primary"
            disabled={customMins == null}
            onClick={() => customMins != null && onStart(customMins)}
          >
            Set
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => onStart(null)}>
            No timer
          </button>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionMeta({ compact = false }: { compact?: boolean }) {
  const { live, sessionActive, endSession, saveHand, pauseSession, resumeSession } = useApp();
  const { toast } = useUi();
  const [, tick] = useState(0);
  const [askBreak, setAskBreak] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!sessionActive || !live.startedAt) return null;
  const paused = isPaused(live);
  const secs = Math.floor(playedMs(live.startedAt, null, live) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const left = breakRemainingMs(live);
  const over = left != null && left <= 0;

  return (
    <div className={`session-meta${paused ? ' paused' : ''}${compact ? ' compact' : ''}`}>
      {askBreak && (
        <BreakDialog
          onStart={(mins) => {
            pauseSession(mins);
            setAskBreak(false);
            toast(mins ? `On break — back in ${mins} min` : 'On break');
          }}
          onCancel={() => setAskBreak(false)}
        />
      )}
      <span className="pill stakes-pill">{live.stakes}</span>
      <span className="pill venue-pill" title={live.venueName}>
        {live.venueName}
      </span>
      <span className="pill timer">⏱ {h}h{m}m</span>
      <button
        className={`pill break-btn${paused ? ' on' : ''}`}
        onClick={() => {
          if (paused) {
            resumeSession();
            toast('Back in action');
          } else setAskBreak(true);
        }}
        title={paused ? 'Resume the session' : 'Pause for a break'}
      >
        {paused ? '▶ Resume' : '⏸ Pause'}
      </button>
      {paused && (
        <span className={`pill break-clock${over ? ' over' : ''}`}>
          {left == null
            ? `on break ${fmtClock(breakElapsedMs(live))}`
            : over
              ? `over by ${fmtClock(left)}`
              : `back in ${fmtClock(left)}`}
        </span>
      )}
      <span className="pill hand-pill" title={`Hand #${live.handNo}`}>
        #{live.handNo}
      </span>
      <button
        className="pill end-btn"
        onClick={async () => {
          if (live.currentEntries.length > 0) {
            if (!window.confirm('Save the hand in progress before ending?')) {
              // fall through — end without saving
            } else {
              await saveHand();
            }
          }
          if (window.confirm('End this session?')) {
            await endSession();
            toast('Session ended');
          }
        }}
      >
        End
      </button>
    </div>
  );
}

export default function App() {
  const { ready, sessionActive, saveHand, live } = useApp();
  const { toast, toastMsg, toastShow, openMenu, editMode, toggleEdit } = useUi();
  const [screen, setScreen] = useState<ScreenKey>('hud');
  // Active session: collapse the header to a single row — the tab bar already
  // names the screen, and vertical space is scarce with 9 seat rows below.
  const hudLive = screen === 'hud' && sessionActive;

  if (!ready) return null;

  const nav = (key: ScreenKey, label: string, icon: string, side: boolean) => (
    <button
      key={key}
      className={side ? `side-btn ${screen === key ? 'active' : ''}` : `tab-btn ${screen === key ? 'active' : ''}`}
      onClick={() => setScreen(key)}
    >
      <Icon name={icon} />
      {side ? label : <span>{label}</span>}
    </button>
  );

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="brand">
          Felt<span>Memory</span>
        </div>
        {TABS.map(([k, l, i]) => nav(k, l, i, true))}
      </nav>

      <div className="main-col">
        <header className={`topbar${hudLive ? ' live' : ''}`}>
          <div className={`topbar-row${hudLive ? ' compact' : ''}`}>
            {hudLive ? <SessionMeta compact /> : <h1>{TITLES[screen]}</h1>}
            <div className="actions">
              <button
                className={`icon-btn${hudLive ? ' hide-narrow' : ''}`}
                title="About"
                onClick={() =>
                  toast('FeltMemory — tap seats to log actions, ✓ saves the hand')
                }
              >
                ?
              </button>
              {screen === 'hud' && sessionActive && (
                <button className="icon-btn" title="Table menu" onClick={openMenu}>
                  ⋯
                </button>
              )}
              {screen === 'hud' && sessionActive && (
                <button
                  className={`edit-btn ${editMode ? 'active' : ''}`}
                  title="Edit seats — drag to reorder, remove seats"
                  onClick={toggleEdit}
                >
                  {editMode ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          {screen === 'hud' && <HudScreen />}
          {screen === 'population' && <PopulationScreen />}
          {screen === 'players' && <PlayersScreen />}
          {screen === 'venues' && <VenuesScreen />}
          {screen === 'sessions' && <SessionsScreen />}
          {screen === 'settings' && <SettingsScreen />}
        </main>

        <nav className="tabbar">{TABS.map(([k, l, i]) => nav(k, l, i, false))}</nav>
      </div>

      {screen === 'hud' && sessionActive && (
        <button
          className="fab"
          title="Save hand — counts a dealt hand for everyone seated, advances the button"
          onClick={async () => {
            await saveHand();
            toast(`Hand #${live.handNo} saved ✓`);
          }}
        >
          <Icon name="check" />
        </button>
      )}

      <SheetHost />
      <div className={`toast ${toastShow ? 'show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
