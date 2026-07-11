// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import App from './App';
import PlayersScreen from './screens/PlayersScreen';
import { AppProvider } from './state/AppContext';
import { UiProvider } from './state/UiContext';
import * as repo from './db/repo';

const withProviders = (ui: React.ReactNode) => (
  <StrictMode>
    <AppProvider>
      <UiProvider>{ui}</UiProvider>
    </AppProvider>
  </StrictMode>
);

describe('app smoke test', () => {
  it('boots, shows session setup, and repo round-trips a player', async () => {
    render(withProviders(<App />));
    await waitFor(() => expect(screen.getByText('Start a session')).toBeTruthy());
    expect(screen.getAllByText('Live HUD').length).toBeGreaterThan(0);

    const p = await repo.findOrCreatePlayer('Test Villain', 'LAG');
    expect(p.id).toBeTruthy();
    await repo.setPlayerTag(p.id!, 'TAG');
    const again = await repo.findOrCreatePlayer('test villain');
    expect(again.id).toBe(p.id); // case-insensitive identity
    expect(again.tag).toBe('TAG');
    expect(again.archHand).toBe(0);
  });

  it('players screen filters and sorts by archetype', async () => {
    cleanup();
    await repo.findOrCreatePlayer('Lagger', 'LAG');
    await repo.findOrCreatePlayer('Nitty', 'TAG');

    render(withProviders(<PlayersScreen />));
    await waitFor(() => expect(screen.getByText('Lagger')).toBeTruthy());
    expect(screen.getByText('Nitty')).toBeTruthy();

    // Filter: only LAG players remain visible.
    fireEvent.click(screen.getByTitle('Filter: LAG'));
    await waitFor(() => expect(screen.queryByText('Nitty')).toBeNull());
    expect(screen.getByText('Lagger')).toBeTruthy();

    // Clear filter → everyone back.
    fireEvent.click(screen.getByTitle('Clear filters'));
    await waitFor(() => expect(screen.getByText('Nitty')).toBeTruthy());

    // Sort by Type ascending via the mobile sort bar: LAG < TAG alphabetically.
    fireEvent.change(screen.getByDisplayValue('Hands'), { target: { value: 'tag' } });
    const firstRow = document.querySelector('table.data tbody tr');
    expect(firstRow?.textContent).toContain('Lagger');
  });

  it('creates sequential No Name villains for fill-all-open-seats', async () => {
    const first = await repo.createNoNamePlayers(3);
    expect(first.map((p) => p.name)).toEqual(['No Name 1', 'No Name 2', 'No Name 3']);
    // Numbering continues from the highest existing No Name.
    const more = await repo.createNoNamePlayers(2);
    expect(more.map((p) => p.name)).toEqual(['No Name 4', 'No Name 5']);
    // Distinct records — different unknowns never merge.
    const ids = new Set([...first, ...more].map((p) => p.id));
    expect(ids.size).toBe(5);
  });
});
