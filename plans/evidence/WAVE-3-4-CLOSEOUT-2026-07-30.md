# Wave 3–4 closeout (2026-07-30)

Coordinator branch: `perf/plan-018-v2`  
Tip: after Plan 025 leftovers on `main` at `a0482f5`  
Successor: [Wave 5 closeout](WAVE-5-CLOSEOUT.md) on `perf/wave5-closeout`

## Integrated

- Plan 023 occupancy index (prior session; merges through `eabade5` / `ff6ba89`)
- Plan 024 budgeted pathfinding (`a200b07` merge)
- Plan 025 visibility skip + fog revision (`770ab68` merge)
- Plan 025 leftovers B/C + AI path-probe kill (`a0482f5`)

## Key measurements

| Gate | Result |
|------|--------|
| X12 first tick | ~1.0–1.1s (was ~12.3s) |
| X12 sync findPathResult | 0 (was 304) |
| X12 expansions | ~373 (was ~2.16M) |
| Path budget/tick | ≤512 |
| Visibility idle skips | yes (grid-preserving) |
| Contribution FOV + fog chunks | landed at `a0482f5` |
| Browser playable session | 12/12 maps green after leftovers |

## Remaining work (moved to Wave 5)

Wave 3–4 leftovers listed below are **complete** on `main` at `a0482f5`. Open follow-through is owned by Wave 5, not by this closeout:

1. ~~Plan 025 Checkpoint B contribution-count FOV~~ — done (`a0482f5`; see [025 leftovers](025/leftovers-closeout.md))
2. ~~Plan 025 fog chunk retain/dirty mesh~~ — done (`a0482f5`)
3. Full Plan 018 browser performance matrix recapture for army-200/combat-100/command-18 — **Wave 5 Task A2**
4. ~~Merge coordinator → `main` after desired browser smoke~~ — done (`a0482f5` on `origin/main`)
5. Remaining step-order repaths (patrol/explore/defend/build/transport/rally) — **Wave 5 Tasks B1–B4**
6. FOV dirty-tile/parity hardening and fog dirty consumption — **Wave 5 Tasks C1–C2**
7. Absolute-release matrix + browser demo/combat sessions — **Wave 5 Tasks E1–E2**

## Verifiers green on coordinator / leftovers tip

- tsc --noEmit
- verify:x12-first-tick
- verify:pathfinding-budget
- verify:visibility-fog-incremental
- verify:save-schema
- verify:runtime-determinism
- verify:browser-playable-session (12/12 after leftovers)

## Leftovers pass (same day) — COMPLETE

- Plan 025 B/C contribution FOV + fog chunks — **done** (`a0482f5`)
- Harvest/repair/load/follow scheduled repaths — **done** (`a0482f5`)
- AI attack reachability no longer sync-A* — **done** (`a0482f5`)
- Browser playable 12/12 green — **done**
- Pushed to origin/main after commit — **done** (`a0482f5`)

Further path coverage, FOV/fog hardening, first-tick tightening, and hardware matrix recapture continue under [WAVE-5-CLOSEOUT](WAVE-5-CLOSEOUT.md).
