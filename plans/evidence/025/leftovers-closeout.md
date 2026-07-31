# Plan 025 leftovers closeout (2026-07-30)

## Checkpoint B — contribution-count incremental FOV

- `visibilityCache.ts` now maintains per-source tile records and `Uint16Array` contribution counts.
- When a small number of sources change (≤24) under stable global rules, FOV updates subtract/add only those sources.
- Stationary ticks still skip entirely.
- Verifier `verify:visibility-fog-incremental` proves skip → incremental-on-move → continued correct grids.

## Checkpoint C — fog chunks

- `src/view/fogChunkCache.ts` with `FOG_CHUNK_TILES = 16`.
- `drawFog` retains per-chunk display objects and rebuilds only dirty/visible chunks on visibility revision changes.
- Camera pan attaches/detaches chunk set without full-layer destroy when possible.

## Pathfinding leftovers

- `enqueueRepathRequest` for in-place order path fills.
- Harvest gold/wood/oil issue, harvest repaths, return-goods, repair, load-transport, and follow issue through the budgeted scheduler when out of range.

## Gates

- tsc, x12-first-tick, pathfinding-budget, visibility-fog-incremental, save-schema, runtime-determinism, wargus-assets, browser-execution-controller

## Map-10 AI reachability stall (playable session blocker)

- Symptom: `Input.dispatchKeyEvent` CDP timeout on `levelx10h` after load (tick 2 ~25s, 324 sync `findPathResult` via `canReachAttackTarget` → full multi-candidate A*).
- Fix:
  - `canReachAttackTarget` uses attack-position candidates only (no A*)
  - `resourceDropoffTargetPoint` / `nearestReachableDropoff` drop sync path probes
- Result: map10 worst tick ~0.4s; `verify:browser-playable-session` **12/12 maps pass** including X12.

## Browser gates

- `verify:browser-execution-controller` pass
- `verify:browser-runtime-smoke` pass
- `verify:browser-playable-session` pass (12 maps)
