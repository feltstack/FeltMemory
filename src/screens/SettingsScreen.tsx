/** Settings: table setup, display, archetype taxonomy, real data actions. */
import { useRef, useState } from 'react';
import { exportBackupJSON, exportPlayersCSV, importBackupJSON } from '../db/backup';
import * as repo from '../db/repo';
import { useApp } from '../state/AppContext';
import { useUi } from '../state/UiContext';
import { Switch } from '../components/Bits';
import { DEFAULT_TAGS } from '../types';

declare const __APP_VERSION__: string;

export default function SettingsScreen() {
  const { live, dispatch, sessionActive, settings, updateSettings } = useApp();
  const { toast } = useUi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newTag, setNewTag] = useState('');
  const [newAx1, setNewAx1] = useState('');
  const [newAx2, setNewAx2] = useState('');
  const addAxis = () => {
    const l1 = newAx1.trim();
    if (!l1 || settings.exploitAxes.some((a) => a.l1.toLowerCase() === l1.toLowerCase())) {
      setNewAx1('');
      setNewAx2('');
      return;
    }
    updateSettings({ exploitAxes: [...settings.exploitAxes, { l1, l2: newAx2.trim() || `${l1}!` }] });
    setNewAx1('');
    setNewAx2('');
  };
  const removeAxis = (l1: string) =>
    updateSettings({ exploitAxes: settings.exploitAxes.filter((a) => a.l1 !== l1) });

  const addTag = () => {
    const t = newTag.trim();
    if (!t) return;
    if (settings.tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      toast('That archetype already exists');
      return;
    }
    updateSettings({ tags: [...settings.tags, t] });
    setNewTag('');
    toast(`Added archetype "${t}"`);
  };

  const removeTag = (t: string) => {
    if (DEFAULT_TAGS.includes(t)) {
      toast('Core archetypes cannot be removed');
      return;
    }
    updateSettings({ tags: settings.tags.filter((x) => x !== t) });
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    if (!window.confirm('Importing a backup REPLACES all current data. Continue?')) return;
    const err = await importBackupJSON(text);
    toast(err ?? 'Backup imported');
    if (!err) window.location.reload();
  };

  return (
    <div className="screen">
      {sessionActive && (
        <>
          <div className="section-title">Live HUD Setup</div>
          <div className="card">
            <div className="settings-item">
              <div>
                <div className="label">Table size</div>
                <div className="sub" style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>
                  2-max up to 11-max — rebuilds the seat layout, keeps seated players
                </div>
              </div>
              <select
                className="mini-select"
                value={live.tableSize}
                onChange={(e) =>
                  dispatch({ type: 'SET_TABLE_SIZE', size: parseInt(e.target.value, 10) })
                }
              >
                {Array.from({ length: 10 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}-max
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      <div className="section-title">Display</div>
      <div className="card">
        <div className="settings-item">
          <div>
            <div className="label">Dark mode</div>
            <div className="sub" style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>
              Off = light interface
            </div>
          </div>
          <Switch
            on={settings.theme === 'dark'}
            onToggle={() =>
              updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
            }
          />
        </div>
        <div className="settings-item">
          <div className="label">Reduce glare (extra dark)</div>
          <Switch on={settings.glare} onToggle={() => updateSettings({ glare: !settings.glare })} />
        </div>
        <div className="settings-item">
          <div>
            <div className="label">Compact rows</div>
            <div className="sub">Denser seat list — fits a full table on one screen</div>
          </div>
          <Switch
            on={settings.compactRows}
            onToggle={() => updateSettings({ compactRows: !settings.compactRows })}
          />
        </div>
        <div className="settings-item">
          <div className="label">Default Live HUD view</div>
          <select
            className="mini-select"
            value={settings.defaultView}
            onChange={(e) =>
              updateSettings({ defaultView: e.target.value as 'table' | 'list' })
            }
          >
            <option value="table">Table</option>
            <option value="list">List</option>
          </select>
        </div>
      </div>

      <div className="section-title">Archetype taxonomy</div>
      <div className="card">
        <div className="chip-row" style={{ margin: '2px 0 10px' }}>
          {settings.tags.map((t) => (
            <button
              key={t}
              className="chip"
              title={DEFAULT_TAGS.includes(t) ? 'Core archetype' : 'Tap to remove'}
              onClick={() => removeTag(t)}
            >
              {t}
              {!DEFAULT_TAGS.includes(t) && ' ✕'}
            </button>
          ))}
        </div>
        <div className="note-add">
          <input
            placeholder="Add archetype (e.g. Nit, Calling Station)…"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
          />
          <button onClick={addTag}>Add</button>
        </div>
      </div>

      <div className="section-title">Exploit axes</div>
      <div className="card">
        <div className="chip-row" style={{ margin: '2px 0 10px' }}>
          {settings.exploitAxes.map((a) => (
            <button key={a.l1} className="chip" title="Tap to remove axis" onClick={() => removeAxis(a.l1)}>
              {a.l1} / {a.l2} ✕
            </button>
          ))}
        </div>
        <div className="note-add axis-add">
          <input
            placeholder="On label (e.g. Overfolds)"
            value={newAx1}
            onChange={(e) => setNewAx1(e.target.value)}
          />
          <input
            placeholder={'\u201C!\u201D label (e.g. Overfolds!)'}
            value={newAx2}
            onChange={(e) => setNewAx2(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAxis()}
          />
          <button onClick={addAxis}>Add</button>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Two intensities per axis — tap a player's chip to cycle off → on → “!”.
        </div>
      </div>

      <div className="section-title">Data</div>
      <div className="card">
        <div className="btn-row">
          <button
            className="btn"
            onClick={async () => {
              await exportBackupJSON();
              toast('Backup downloaded');
            }}
          >
            Export backup (JSON)
          </button>
          <button
            className="btn"
            onClick={async () => {
              await exportPlayersCSV();
              toast('Players CSV downloaded');
            }}
          >
            Export players (CSV)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!window.confirm('Delete ALL players, venues, sessions and hands? This cannot be undone.'))
                return;
              await repo.clearAllData();
              toast('All data cleared');
              window.location.reload();
            }}
          >
            Clear all data
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="about-block">
        FeltMemory — Live HUD &amp; Population Tendencies
        <br />
        Offline-first PWA · data lives on this device · v{__APP_VERSION__}
      </div>
    </div>
  );
}
