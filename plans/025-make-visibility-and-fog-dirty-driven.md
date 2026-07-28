# Plan 025: Make Visibility and Fog Dirty-Driven

**Priority:** P1
**Effort:** L
**Risk:** High
**Depends on:** 018, 019, 022, 023
**Planned against:** `8ac0006` on 2026-07-27

## Problem

Visibility is cleared and rebuilt for every player on every fixed tick in `src/simulation/world.ts` lines 1740–1772. Every sight source then re-walks its footprint and line-of-sight area. Rendering scans the viewport to hash fog state around `src/view/renderWorld.ts` line 2094 and destroys/rebuilds the complete fog subtree when that key changes around lines 2003–2070.

Most ticks change only a fraction of sight sources and fog tiles, but both simulation and renderer pay close to full-map/full-view cost. More units therefore increase simulation work, and any visibility change produces large render allocation spikes.

## Goal

Recompute visibility only for changed sources and update only dirty fog chunks while preserving exact line-of-sight, exploration, targeting, and deterministic behavior.

## Non-goals

- Lowering visibility update frequency or allowing stale targeting information.
- Changing sight radius, opacity, alliances, shared vision, reveal rules, or explored-tile semantics.
- Optimizing the minimap renderer; that is a separate concern.
- Persisting renderer caches in saves.

## Preconditions and Drift Checks

1. Confirm Halla, isolated checkout, branch, and HEAD.
2. Read Plans 018, 019, 022, and 023 completely and verify their relevant checks pass.
3. Inventory every event that can change visibility: source spawn/removal/death, tile crossing, sight/range/status change, owner/alliance/shared-vision change, transport hide/unhide, terrain opacity change, scripted reveal, fog-mode change, map reset, and save restore.
4. Record Plan 018 `army-100`, `army-200`, and `combat-100` baselines including visibility rebuild time, sources visited, tiles tested/changed, fog hash time, fog object create/destroy counts, and heap growth.
5. Capture deterministic expected visibility/exploration grids for representative maps before editing.

**STOP:** If exact current targeting depends on a visibility side effect not represented in the inventory, model that dependency explicitly. Do not trade correctness for a lower update cadence.

## Design

Separate authoritative visibility maintenance from renderer fog caching.

Simulation:

- Add per-player integer contribution counts for currently visible tiles. A tile is visible when its count is positive; exploration remains monotonic under existing rules.
- Keep a deterministic record of each sight source's last contributed tile set/signature.
- When a source changes, subtract its old contribution and add its new exact field-of-view contribution. Mark tiles whose visible/explored state actually changed.
- Reuse Plan 019's terrain opacity metadata and Plan 023's source/location mutation seams.
- Maintain monotonically increasing visibility revisions and deterministic dirty-tile lists per player.
- Rebuild completely on load, world replacement, alliance topology change, explicit invalidation, or failed development invariant.

Rendering:

- Divide viewport fog into fixed-size tile chunks.
- Rebuild only chunks intersecting dirty tiles plus the neighbor border required by edge rendering.
- Retain chunk display objects through Plan 022's lifecycle model.
- Use visibility revisions/dirty lists instead of hashing the full viewport each frame.
- A camera movement attaches/reuses the required chunks; it does not force authoritative visibility recomputation.

All iteration and dirty-list ordering must be deterministic. Derived contribution sets and render chunks remain out of save data unless a field is authoritative to gameplay.

## Implementation Steps

### Checkpoint A — Skip provably unchanged visibility rebuilds

1. Add explicit visibility revision and invalidation reasons.
2. Build a complete deterministic source signature covering all inventoried visibility inputs.
3. Skip full recomputation when neither sources nor global visibility rules changed.
4. Keep the existing full rebuild as the authoritative parity oracle in tests/development.

**Verify:**

- A stationary unchanged tick performs no source FOV walk and produces the identical visibility/exploration grid.
- Every inventoried mutation invalidates visibility in the same fixed tick required today.
- AI and targeting checks observe the same current visibility.

### Checkpoint B — Incremental contribution accounting

1. Add per-player contribution counts and per-source contributed tile records.
2. Incrementally subtract/add changed sources in deterministic source order.
3. Emit ordered dirty tiles only when visible or explored state changes.
4. Handle owner/alliance changes, source removal/death, transport, scripted reveal, opacity changes, save/load, and world replacement.
5. Add a development invariant that periodically compares incremental output with a complete rebuild.

**Verify:**

- Incremental and full rebuild grids match exactly after every step of scripted and generated scenarios.
- Overlapping sight sources do not hide a tile when only one source leaves.
- Exploration remains monotonic and save/load restores identical authoritative results.

### Checkpoint C — Retain and dirty-update fog chunks

1. Replace full-viewport fog hashing with revision and dirty-chunk consumption.
2. Add retained fog chunks with explicit world/view ownership and disposal.
3. Invalidate changed chunks and the precise neighbor ring needed for edges.
4. Reconcile chunks on camera pan, viewport resize, player/view change, fog-mode change, and world replacement.
5. Add `scripts/verify-visibility-fog-incremental.mjs` and package wiring for grid parity, dirty propagation, chunk lifecycle, and determinism.

**Verify:**

- A one-tile visibility transition rebuilds only its affected chunk set and required neighbors.
- A stationary view with no dirty visibility creates/destroys zero fog objects after warm-up.
- Camera panning reuses cached chunks within declared bounds and never displays stale fog.

## Tests

- Golden-grid field-of-view parity across terrain, forest/opacity, map edges, and sight radii.
- Overlapping-source contribution-count tests.
- Mutation tests for every inventoried invalidation reason.
- Alliance/shared-vision, owner change, reveal, transport, death, and terrain-opacity tests.
- Save/load and world-replacement rebuild tests.
- Dirty-tile and dirty-chunk propagation tests, including edge-neighbor handling.
- Deterministic repeated-run and replay/hash tests.
- Renderer screenshot parity for fully visible, explored, hidden, and mixed fog edges.

## Performance Acceptance

Using Plan 018's exact profiles:

- `army-100`, `army-200`, and `combat-100` meet the frozen frame, scheduler, and heap budgets.
- An unchanged stationary tick visits zero sight sources for FOV recomputation.
- Incremental source work scales with changed sources and their sight areas, not all units or the full map.
- After warm-up, unchanged fog produces zero fog display-object creations or destructions.
- A local visibility change rebuilds only affected chunks plus the specified neighbor ring.

Report before/after visibility time percentiles, sources and tiles visited, full rebuild count/reasons, dirty tiles/chunks, fog hash time, fog object churn, frame percentiles, and heap growth.

## Verification Commands

```bash
./node_modules/.bin/tsc --noEmit
npm run verify:wargus-assets
npm run build
npm run verify
npm run verify:visibility-fog-incremental
npm run verify:browser-map-loads
npm run verify:browser-playable-session
npm run verify:browser-native-viewport
```

Use the Codex in-app Browser with the `iab` backend for screenshots and Plan 018 profiles.

## Completion Criteria

- Unchanged ticks avoid visibility recomputation.
- Changed sight sources update exact contribution counts and deterministic dirty tiles.
- Fog rendering retains chunks and rebuilds only dirty regions.
- Full-rebuild parity, save/load, determinism, targeting, visual, and browser checks pass.
- Evidence in `plans/evidence/025/` demonstrates passing Plan 018 budgets without stale visibility.

## Rollback

The full authoritative rebuild remains available behind an explicit invalidation/parity path. If incremental simulation parity fails, disable incremental reads and use the full rebuild while retaining diagnostics. If fog chunking fails independently, render from correct authoritative grids through the prior fog path; never retain stale fog to preserve performance.
