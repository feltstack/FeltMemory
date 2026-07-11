# FeltMemory — Live HUD & Population Tendencies

The real, working build of the app scoped in `Live_HUD_Product_Spec.docx` and prototyped in
`Live_HUD_Interactive_Mockup.html`: a live poker HUD for logging seat-by-seat stats at the
table, plus a persistent, cross-session, cross-venue population database of opponent reads.

Offline-first PWA · React + TypeScript + Vite · IndexedDB (Dexie) · no backend, no account.

## Try it right now

**Fastest (no install):** open `dist-standalone/index.html` in Chrome or Edge. It's the whole
app in one file; your data persists in that browser via IndexedDB.

**Dev server:**

```
npm install
npm run dev
```

**Tests + production build:**

```
npm test        # stat-engine unit tests + app boot smoke test
npm run build   # type-checks, outputs PWA to dist/
```

## Put it on your phone (required for the home-screen install)

A PWA needs an HTTPS URL. Two free options:

1. **GitHub Pages (automated):** push this folder to a GitHub repo, then in the repo go to
   Settings → Pages → Source: **GitHub Actions**. The included workflow
   (`.github/workflows/deploy.yml`) tests, builds, and deploys on every push to `main`.
   Open the Pages URL on your phone → Share → **Add to Home Screen**.
2. **Netlify Drop (no git needed):** run `npm run build`, then drag the `dist` folder onto
   https://app.netlify.com/drop.

Once installed it works fully offline — casino-floor wifi never touches the app.

## How stats are captured (minimal preflop taps)

- Per hand, tap **Call** or **Raise** only for players who voluntarily enter the pot.
  Folds are implicit — never tapped.
- Raise taps are leveled by order: 1st = open (PFR), 2nd = 3-bet, 3rd = 4-bet.
  Call taps auto-label as limp vs call from context.
- The **✓ FAB saves the hand**: counts a dealt hand for every occupied seat, updates all
  counters, advances the button (BTN→SB→BB), and clears the taps. Undo/Clear sit above the
  seat list while a hand has taps.
- Real math, not nudges: `VPIP = entered ÷ dealt`, `PFR = raised ÷ dealt`,
  `3-Bet = 3-bets ÷ opportunities`. A 3-bet opportunity = you faced exactly one raise with
  action pending (players behind the opener; limpers when the raise comes back around;
  once someone 3-bets, players behind face a 4-bet decision — no opportunity counted).
- Every committed hand is stored raw in the `hands` table, so stats are auditable and future
  analytics (per-position, per-venue, straddle-aware) can be computed retroactively.

## Data model

`players` is the single source of truth per opponent (keyed by case-insensitive name) —
the seat UI and the Players/Venues/Population screens all read and write the same record.
`venues`, `sessions`, `hands` support it, and `meta` holds settings + the live table state,
which is persisted on every change so a refresh or phone sleep mid-session restores the
table exactly.

Read tracking (the differentiator): tagging a player stamps `archHand` = how many hands
you'd observed them when first tagged; the **verified** toggle stamps `verifiedHand`.
Re-selecting the same tag is a no-op; picking a different tag re-stamps and resets
verification. Population aggregates per archetype: sample size, avg VPIP/PFR/3-Bet,
verified %, and average hands-to-first-read.

### Two deliberate deviations from the mockup

1. **`archHand` counts hands observed of that player**, not the session hand number — the
   session number is meaningless across sessions, and "how fast can we read this archetype"
   is exactly the hands-observed count. (Handoff doc's stated intent, made cross-session.)
2. **Position labels start at UTG** (UTG, UTG+1, … LJ, HJ, CO) — the mockup's label pool
   slice could label the first-to-act seat "UTG+2". Layout math and BTN→SB→BB rotation are
   carried over unchanged.

## What shipped vs. deferred

Phase 1 (parity) + Phase 2 (population differentiator) are in: table + list views,
2–11 max, open-seat add/assign with typeahead against the roster, mid-session reseat
("Player left — open seat" keeps their stats), stack-size field per seat, blind/straddle
toggles, notes, tag taxonomy (extendable in Settings), venue rollups, population rollups,
JSON backup/restore, players CSV export. Results/bankroll stays a placeholder per the spec.
Straddle toggles are recorded on each hand but don't yet alter stat math (documented
simplification). Hero's own play isn't tracked. Single-user, local-only; the repo layer is
structured so a sync backend (e.g. Supabase) can bolt on without schema changes.

Notes for the table: the dealer-button mover lives in Table view ("Move dealer button",
then tap a seat); everything else works from List view, which is the faster logging surface.

## Code tour (for whoever picks this up)

```
src/types.ts            domain types, stat helpers, tag colors
src/db/db.ts            Dexie schema (IndexedDB)
src/db/stats.ts         pure stat + seat/position/rotation math  ← unit-tested
src/db/repo.ts          all mutations (tagging rules, hand-commit transaction)
src/db/backup.ts        JSON export/import, CSV export
src/state/AppContext.tsx live session reducer + persistence + settings
src/state/UiContext.tsx  toasts + bottom-sheet routing
src/screens/            one file per tab; HudScreen has setup/felt/list/toggles
src/components/         sheets (player detail, assign), icons, small atoms
```
