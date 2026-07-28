# Plan 023: Add a Deterministic Spatial Occupancy Index

**Priority:** P1
**Effort:** L
**Risk:** High
**Depends on:** 018, 019, 020
**Planned against:** `8ac0006` on 2026-07-27

## Problem

Collision, placement, pathfinding, and de-stacking repeatedly scan `world.units`. `src/simulation/passability.ts` lines 123–141 check the full unit list for each queried tile. `resolveStackedMovableUnit` in `src/simulation/orders.ts` around line 10776 performs another world-wide scan, and pathfinding calls footprint passability for many A* neighbors.

The combined cost grows approximately with queried tiles multiplied by total units. Crowded maps therefore spend progressively more simulation time proving that mostly unrelated units do not occupy a location.

## Goal

Provide one deterministic, transient spatial occupancy index so tile and footprint queries inspect only nearby candidates while preserving every existing blocking and movement rule.

## Non-goals

- Changing collision, stacking, movement-layer, building-placement, or path selection semantics.
- Persisting the index in saves or including it in deterministic hashes.
- Broadly rewriting order execution.
- Introducing a third-party spatial library or nondeterministic collection iteration.

## Preconditions and Drift Checks

1. Confirm the Halla host, isolated checkout, branch, and HEAD.
2. Read Plans 018–020 completely and verify their relevant checks pass.
3. Map every runtime mutation of `world.units`, unit position, footprint, movement layer, hidden/transport state, alive state, spawn, removal, load, unload, teleport, construction transition, and save restoration.
4. Exclude test-fixture builders from the production mutation inventory, but cover their resulting runtime states in tests.
5. Record Plan 018 `army-100`, `army-200`, `command-18`, and `combat-100` baselines plus counts and duration of occupancy queries.

**STOP:** If production code can mutate occupancy-relevant unit fields without a discoverable central seam, first add explicit mutation helpers with parity tests. Do not ship an index that can silently become stale.

## Design

Add `src/simulation/occupancyIndex.ts`:

- The authoritative state remains `world.units`; the index is derived, transient, and rebuildable.
- Store deterministic tile buckets partitioned by movement/blocking layer. Each solid unit is indexed over the exact tiles covered by its footprint.
- Bucket results follow the existing authoritative unit order. Use stable ordered arrays or explicitly sort candidates by that order; never depend on `Set`/`Map` insertion order created by incidental mutation timing.
- Maintain a unit-to-covered-tiles record for removal and movement updates.
- Expose focused queries for tile occupants, footprint occupants, nearby units, and overlap candidates. Callers still apply their existing semantic predicates.

Lifecycle:

1. Rebuild at world creation/load and at the start of a fixed step if identity or revision validation fails.
2. Update incrementally for every spawn, removal, position/footprint/layer transition, hide/unhide, transport load/unload, teleport, construction state change, and death state that changes blocking.
3. In development/test builds, sample-query the old full scan and assert identical ordered IDs. Provide an explicit full parity mode for fixtures.
4. Invalidate or rebuild rather than attempting recovery from an unknown mutation.

The index must not alter save schema, world equality, replay hashes, or command ordering.

## Implementation Steps

### Checkpoint A — Read-only index with full-scan parity

1. Implement index construction from `world.units`.
2. Implement deterministic tile, footprint, and nearby-candidate queries.
3. Add revision/identity validation and development parity instrumentation.
4. Add exhaustive fixtures for overlapping footprints, multiple movement layers, hidden units, transported units, buildings, resources, corpses/non-blockers, and map edges.

**Verify:**

- Indexed and legacy queries return identical ordered unit IDs in every fixture.
- Rebuilding the same world produces byte-for-byte identical query evidence.
- The index is absent from saves and deterministic world serialization.

### Checkpoint B — Migrate read paths

1. Replace the full-list blocker scan in `passability.ts` with local index candidates while preserving its predicates and exclusions.
2. Migrate building placement, collision/overlap, de-stacking, and other nearby-unit searches identified in the mutation/query inventory.
3. Make pathfinding reuse the indexed footprint query without changing A* tie-breaking.
4. Keep a development parity assertion available at every migrated boundary.

**Verify:**

- Existing passability, placement, movement, combat, and determinism tests pass.
- Query counters show candidate visits scale with local occupancy rather than `world.units.length`.
- Results remain identical under reversed fixture construction followed by authoritative-order normalization.

### Checkpoint C — Centralize incremental updates

1. Add explicit register, unregister, and occupancy-transition helpers.
2. Route every inventoried production mutation through those helpers.
3. Cover save restore, unit creation, building placement/completion, death/removal, transport, movement, de-stacking, teleport, and world replacement.
4. Add a fixed-step invariant check that compares indexed membership with authoritative unit state in test/debug mode.
5. Add `scripts/verify-occupancy-index.mjs` and its package script to exercise semantic parity and mutation coverage.

**Verify:**

- A scripted scenario hits every registered transition with no stale or duplicate bucket membership.
- Removing or moving a multi-tile unit clears all former tiles.
- A forced invalidation performs one safe rebuild and resumes incremental operation.

## Tests

- Property-style parity tests over deterministic generated maps and unit layouts.
- Layer, footprint, edge, overlap, exclusion-ID, and ordering tests.
- Mutation-transition tests for spawn/remove/move/teleport/hide/unhide/load/unload/death/revive/build.
- Save/load and world-replacement rebuild tests.
- Pathfinding and building-placement regression tests.
- Deterministic replay/hash checks proving the transient cache does not affect authoritative state.

## Performance Acceptance

Using Plan 018's exact profiles:

- `army-100`, `army-200`, `command-18`, and `combat-100` meet the frozen frame, input, scheduler, and heap budgets.
- For indexed queries, visited candidate count is bounded by occupants of covered/local tiles rather than the complete unit count.
- `army-200` reduces p95 simulation-step occupancy time relative to its recorded baseline without regressing command latency.
- Index maintenance does not introduce long-frame spikes during mass movement, teleport, spawn, or death.

Report query count, candidates visited, rebuild count/duration, incremental update count/duration, and full-scan parity failures alongside Plan 018 metrics.

## Verification Commands

```bash
./node_modules/.bin/tsc --noEmit
npm run verify:wargus-assets
npm run build
npm run verify
npm run verify:occupancy-index
npm run verify:browser-playable-session
npm run verify:browser-demo-session
```

Use the Codex in-app Browser with the `iab` backend for browser captures.

## Completion Criteria

- Occupancy queries use the deterministic spatial index at all inventoried hot paths.
- All occupancy-relevant mutations maintain or explicitly invalidate the index.
- Full-scan parity, transition, save/load, deterministic, and browser checks pass.
- Performance evidence in `plans/evidence/023/` demonstrates lower candidate work and passing Plan 018 budgets.
- No gameplay rule or save format changed.

## Rollback

Each migrated read path can temporarily return to the authoritative full scan while preserving the verified index implementation and diagnostics. If mutation coverage is incomplete, disable indexed reads and rebuild validation first; never leave a partially trusted index active.
