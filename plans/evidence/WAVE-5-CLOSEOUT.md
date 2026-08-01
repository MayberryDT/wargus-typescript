# Wave 5 closeout

Branch: `perf/wave5-closeout`  
Base: `a0482f5` (Plans 018–025 path/visibility work on `main`)  
Plan: `docs/superpowers/plans/2026-07-31-wargus-perf-wave5-closeout.md`

Scaffold only. Result columns stay `PENDING` until Tasks A2–E2 fill them with measured evidence.

## Environment

| Field | Value |
|-------|-------|
| Host | `halla` |
| Branch | `perf/wave5-closeout` |
| Capture SHA | PENDING |
| GPU / DRM qualification | PENDING |
| Acceptance mode | PENDING (`incremental` then optional `absolute-release`) |

## Matrix results

| Plan / row | Mode | Trials | Frame p95 worst | Frame p99 worst | Backlog | Heap growth | Command p95 | Render p95 | Verdict |
|------------|------|--------|-----------------|-----------------|---------|-------------|-------------|------------|---------|
| 024 army-200 | incremental | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 024 command-18 | incremental | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 024 combat-100 | incremental | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 025 army-200 | incremental | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 025 command-18 | incremental | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 025 combat-100 | incremental | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Absolute-release (if run) | absolute-release | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

Packet paths and checksums: PENDING (Task A2 / E2).

## Path coverage

| Item | Result |
|------|--------|
| Sync path site inventory | PENDING (Task B1) |
| Patrol / explore / defend repaths scheduled | PENDING (Task B2) |
| Build / repair / construction repaths scheduled | PENDING (Task B3) |
| Transport / rally / residual repaths scheduled | PENDING (Task B4) |
| Path diagnostics in perf telemetry | PENDING (Task B5) |
| `verify-pathfinding-budget` | PENDING |
| X12 first-tick budget | PENDING (Task D1) |

## Visibility/fog

| Item | Result |
|------|--------|
| Contribution FOV dirty-tile publication | PENDING (Task C1) |
| FOV parity helper / verifier | PENDING (Task C1) |
| Fog dirty-chunk consumption | PENDING (Task C2) |
| `verify-visibility-fog-incremental` | PENDING |

## First-tick

| Item | Result |
|------|--------|
| X12 first active tick (ms) | PENDING |
| First-tick budget threshold | PENDING (target ≤ 500 ms) |
| Evidence note | PENDING (`plans/evidence/024/first-tick-budget.md`) |

## Browser gates

| Gate | Result |
|------|--------|
| `verify:browser-runtime-smoke` | PENDING |
| `verify:browser-playable-session` | PENDING |
| `verify:browser-demo-session` | PENDING (Task E1) |
| `verify:browser-combat-session` | PENDING (Task E1) |
| `verify:browser-harvest-session` | PENDING (Task E1) |
| `verify:browser-train-session` | PENDING (Task E1) |
| `verify:browser-map-loads` | PENDING (Task E1) |

## Verdict

| Field | Value |
|-------|-------|
| Wave 5 overall | PENDING (`READY` / `SOFT-READY` / `NOT READY`) |
| Absolute budgets | PENDING |
| Remaining failing keys | PENDING |
| Notes | Docs truth-aligned in Task A1. Hardware matrix and code tasks not yet recorded. |

## Path coverage (Tasks B1–B5)

- Inventory: `plans/evidence/024/path-coverage-inventory.md` (81 call sites classified).
- Migrated: patrol/explore/defend repaths, stepMove blocked recovery, transport/rally/follow issue, build/repair step repaths, load can-checks.
- `scheduleOrderRepath` routes attack/attack-move/move/generic repaths through the budgeted scheduler.
- Coverage gate: 30 AI ticks on X12 → `synchronousFindPathResultCalls: 0` (was 168+).
- Telemetry: `pathRequests`, `pathfinding`, `visibility` on runtime performance summary.
- Save: optional `pathRequests` queue export/import (frontier rebuild on load).

## Visibility (Task C1)

- Incremental FOV forces dirty tile publication when sources change even if intermediate contribution bits overlap.

## Matrix (Task A2)

- Controller preflight: PASS
- Full hardware matrix: deferred if wall-clock budget requires separate overnight run; fixed-tick + playable remain the day-of gates.
