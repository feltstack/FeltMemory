# FeltMemory — Session Update 2026-07-11 (v0.1.4 → v0.1.8)

Supplements `FeltMemory_Session_Handoff.md` (still valid for environment quirks + architecture).
Built this session from the Drive v0.1.3 source, delivered as `dist-standalone`. Every version
below is `tsc` clean with the vitest suite green (26 tests at v0.1.8).

## Shipped

- **v0.1.5 — Felt geometry corrected to real casino convention.** Hero is pinned bottom-center;
  the human **DEALER** is a FIXED marker between the highest seat and seat 1 (seat 1 to its
  screen-left, top seat to its right), placed by a rigid ring — nothing mirrored, so "two to my
  left" is really on the left. Verified vs. web sources (seat 1 left of dealer, numbering
  clockwise). The earlier v0.1.4 used a 180 rotation that wrongly mirrored L/R — replaced.
  "DEALER" text removed (icon only); marker shrinks at 10+ seats. **List view is now the default
  and the left toggle.** Stat labels moved to a single top header (VPIP/PFR/3B/Hands) with values
  aligned in columns; position shown as a chip on the name line.
- **v0.1.6 — Seat Edit mode.** Edit/Done button top-right. Red − removes a seat (auto-renumber,
  table size adjusts, ≥2 kept, Hero seat protected). ≡ drag handle reorders players, pointer-based
  (touch + mouse). New reducer actions `REMOVE_SEAT` / `MOVE_SEAT`; pure helpers
  `reorderSeats` / `removeSeatAt` / `reindexSeats` in stats.ts.
- **v0.1.7 — Position-tap-to-BTN + sit-out.** Tapping a position chip (SB/BB/UTG/…) sets that seat
  as the button and recomputes positions. Tapping the seat-number circle sits a player out: grayed,
  no position, skipped by button rotation and dealt-counts; Call/Raise disabled; button never parks
  on an out player. New `Seat.sittingOut` + `TOGGLE_SITOUT`; stat engine
  (`assignPositions` / `nextButtonSeat` / `actingOrder` / `computeHandDeltas`) excludes sitting-out
  seats.
- **v0.1.8 — Note hand-# on the date line.** Saving a note stamps `Note.h` = the villain's observed
  hands + 1 (the current hand of their sample). Shown as "· Hand #N" on the note's date line in the
  player card; note text stays clean.

## Files touched
`src/db/stats.ts` (new Hero-bottom geometry `seatXY(seatNo, heroSeat, n)` + `dealerXY` + `seatAngle`;
reorder/remove/reindex; sitting-out exclusions), `src/state/AppContext.tsx` (3 new actions),
`src/state/UiContext.tsx` (editMode/toggleEdit), `src/screens/HudScreen.tsx` (edit mode, drag,
sit-out, pos→BTN, header/columns), `src/db/repo.ts` (Note.h stamp), `src/types.ts`
(`Seat.sittingOut`, `Note.h`), `src/theme.css` (dealer marker, list header/columns, edit + sit-out).

## Open / not done
- **Not visually screenshot-verified this session** — the connected Chrome extension can't open local
  `file://` (needs "Allow access to file URLs"). Logic verified by unit tests + tsc, geometry also
  checked with an SVG render. Please eyeball on-device.
- Note hand-# uses `dealt + 1` (current hand); switch to `dealt` if the completed count is preferred.
- Drag reorder / seat removal clear in-progress taps by design (edit is a setup activity).
- Deferred still: `stats-extended.ts` (P2 Pokeri stat pack), Results/bankroll, hero self-tracking,
  voice notes, note template chips, hotkeys.
