/** App shell: topbar, tab bar / sidebar (900px breakpoint), FAB, sheets, toast. */
import { useEffect, useState } from 'react';
import { useApp } from './state/AppContext';
import { useUi } from './state/UiContext';
import { Icon } from './components/Icons';
import { SheetHost } from './components/Sheets';
import HudScreen from './screens/HudScreen';
import PopulationScreen from './screens/PopulationScreen';
import PlayersScreen from './screens/PlayersScreen';
import VenuesScreen from './screens/VenuesScreen';
import ResultsScreen from './screens/ResultsScreen';
import SettingsScreen from './screens/SettingsScreen';

type ScreenKey = 'hud' | 'population' | 'players' | 'venues' | 'results' | 'settings';

const TABS: [ScreenKey, string, string][] = [
  ['hud', 'Live HUD', 'hud'],
  ['population', 'Population', 'population'],
  ['players', 'Players', 'players'],
  ['venues', 'Venues', 'venues'],
  ['results', 'Results', 'results'],
  ['settings', 'Settings', 'settings'],
];

const TITLES: Record<ScreenKey, string> = {
  hud: 'Live HUD',
  population: 'Population',
  players: 'Players',
  venues: 'Venues',
  results: 'Results',
  settings: 'Settings',
};

function SessionMeta() {
  const { live, sessionActive, endSession, saveHand } = useApp();
  const { toast } = useUi();
  const [, tick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!sessionActive || !live.startedAt) return null;
  const secs = Math.max(0, Math.floor((Date.now() - new Date(live.startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);

  return (
    <div className="session-meta">
      <span className="pill">{live.stakes}</span>
      <span className="pill">{live.venueName}</span>
      <span className="pill timer">⏱ {h}h {m}m</span>
      <span className="pill">Hand #{live.handNo}</span>
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
  const { toast, toastMsg, toastShow, openMenu } = useUi();
  const [screen, setScreen] = useState<ScreenKey>('hud');

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
        <header className="topbar">
          <div className="topbar-row">
            <h1>{TITLES[screen]}</h1>
            <div className="actions">
              <button
                className="icon-btn"
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
            </div>
          </div>
          {screen === 'hud' && <SessionMeta />}
        </header>

        <main className="content">
          {screen === 'hud' && <HudScreen />}
          {screen === 'population' && <PopulationScreen />}
          {screen === 'players' && <PlayersScreen />}
          {screen === 'venues' && <VenuesScreen />}
          {screen === 'results' && <ResultsScreen />}
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
