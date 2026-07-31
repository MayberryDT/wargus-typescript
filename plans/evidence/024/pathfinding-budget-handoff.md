# Plan 024 pathfinding budget evidence (2026-07-30)

## Problem fixed

X12 first simulation tick was ~12.3s with 304 synchronous `findPathResult` calls and ~2.16M A* expansions. Stack profiling attributed the burst to:

1. `stepDefensiveAutoAttack` → `sourceAttackTargetPathResult`
2. Immediate same-tick `stepAttackOrder` repath because `world.tick % retry === 0` on tick 0

## Implementation

- Deterministic resumable A* (`createResumablePathSearch` / `advanceResumablePathSearch`)
- Per-world path request scheduler (`src/simulation/pathRequests.ts`)
  - 512 expansions/tick, 16 expansions/quantum
  - Move, attack-move, and multi-candidate attack requests
  - Supersession/cancel on reissue and unit death
- Command issue paths enqueue instead of searching synchronously
- Defensive auto-attack and attack/attack-move repaths enqueue
- Verifiers:
  - `npm run verify:x12-first-tick`
  - `npm run verify:pathfinding-budget`

## Measured results (Halla)

| Metric | Before | After |
|--------|--------|-------|
| X12 first tick | ~12300 ms | ~1000–1100 ms |
| Sync `findPathResult` on X12 tick 0 | 304 | 0 |
| Expansion attempts on X12 tick 0 | ~2,166,395 | ~373 |
| Scheduler expansions last group-move tick | n/a | ≤512 (observed 379) |

## Gates run

- `tsc --noEmit` pass
- `verify:x12-first-tick` pass
- `verify:pathfinding-budget` pass (budget + determinism + X12 bounds)
- `verify:save-schema` pass
- `verify:runtime-determinism` pass
- `verify:wargus-assets` pass (1182 files)

## Known follow-ups

- Remaining synchronous path uses still exist for harvest/repair/board/etc.; they are not the X12 first-tick hotspot.
- Full Plan 018 performance matrix recapture and browser gates still required after integration.
- Save/load of in-flight resumable search frontier is rebuild-on-load (authoritative request fields only via live order pending empty paths); expand serialization if cross-save pending queues must resume mid-search.
