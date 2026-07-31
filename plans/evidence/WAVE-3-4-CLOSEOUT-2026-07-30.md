# Wave 3–4 closeout (2026-07-30)

Coordinator branch: `perf/plan-018-v2`
Tip: after Plan 025 merge

## Integrated

- Plan 023 occupancy index (prior session)
- Plan 024 budgeted pathfinding (`a200b07` merge)
- Plan 025 visibility skip + fog revision (`770ab68` merge)

## Key measurements

| Gate | Result |
|------|--------|
| X12 first tick | ~1.0–1.1s (was ~12.3s) |
| X12 sync findPathResult | 0 (was 304) |
| X12 expansions | ~373 (was ~2.16M) |
| Path budget/tick | ≤512 |
| Visibility idle skips | yes (grid-preserving) |

## Remaining optional work

1. Plan 025 Checkpoint B contribution-count FOV
2. Plan 025 fog chunk retain/dirty mesh
3. Full Plan 018 browser performance matrix recapture for army-200/combat-100/command-18
4. Merge coordinator → `main` after desired browser smoke

## Verifiers green on coordinator

- tsc --noEmit
- verify:x12-first-tick
- verify:pathfinding-budget
- verify:visibility-fog-incremental
- verify:save-schema
- verify:runtime-determinism

## Leftovers pass (same day)

- Plan 025 B/C contribution FOV + fog chunks
- Harvest/repair/load/follow scheduled repaths
- AI attack reachability no longer sync-A*
- Browser playable 12/12 green
- Pushed to origin/main after commit
