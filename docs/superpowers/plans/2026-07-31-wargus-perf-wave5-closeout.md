# Wargus Performance Wave 5 Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the performance program with honest hardware evidence, eliminate remaining synchronous pathfinding stalls, harden visibility/fog and path save semantics, and leave status docs + browser gates trustworthy for ordinary play.

**Architecture:** Work proceeds as five serial waves on Halla. Wave A truth-aligns docs and runs the existing Plan 018 matrix harness against the post-024/025 tree. Wave B finishes routing order repaths through the existing `pathRequests` scheduler. Wave C hardens Plan 025 contribution FOV + fog dirty lists. Wave D improves first-tick load feel and pending-path save/load. Wave E expands browser sessions and optional gameplay polish only after frame evidence is recorded. Prefer measured hotspots over broad rewrites.

**Tech Stack:** TypeScript simulation (`src/simulation/**`), Pixi view (`src/view/**`), Node verifiers (`scripts/**`), Halla browser controller (`scripts/lib/browser-execution-controller.mjs`), Plan 018 matrix (`scripts/run-successor-performance-matrix.mjs`), package scripts in `package.json`.

## Global Constraints

- Execute on SSH host `halla` under `/home/halla/workspaces/t3/Wargus-TypeScript` (confirm `hostname` is `halla`).
- Never use broad `pkill` / `killall`; only clean exact owned PIDs from the browser controller.
- No `Math.random()`, `Date.now()`, or `crypto.getRandomValues()` under `src/**/*.ts`.
- Path and visibility work must remain deterministic: stable unit-id ordering, sequence numbers, no wall-clock scheduling.
- Do not deploy to Netlify unless the user explicitly asks.
- Treat `public/wargus/manifest.json` and `npm run verify:wargus-assets` as release-blocking for asset/build changes.
- Hardware frame evidence requires `sg video -c 'sg render -c "..."'` and a real GPU path; SwiftShader/llvmpipe captures are invalid for budgets.
- Performance budgets (from `plans/PERFORMANCE-ACCEPTANCE.md`): frame p95 ≤ 33.3 ms, frame p99 ≤ 50 ms, over-50% ≤ 1, dropped ≤ 0, backlog ≤ 0.25 s, heap growth ≤ 15%, command p95 ≤ 50 ms, render p95 ≤ 100 ms on command rows.
- Surgical diffs only: no drive-by refactors of unrelated `orders.ts` regions.
- Base commit at plan write: `a0482f5` on `main` (already includes Plans 018–025 path/visibility work and push to origin).

## File Map

| Path | Responsibility |
|------|----------------|
| `plans/README.md` | Authoritative status table for plans 018–027 |
| `plans/evidence/WAVE-5-CLOSEOUT.md` | Create: matrix + wave verdict |
| `plans/evidence/024/` | Append matrix/path-coverage evidence |
| `plans/evidence/025/` | Append FOV/fog hardening evidence |
| `scripts/run-successor-performance-matrix.mjs` | Existing hardware matrix runner |
| `scripts/verify-successor-fixed-tick.mjs` | Deterministic profile parity |
| `scripts/verify-pathfinding-budget.mjs` | Expand for remaining repath classes |
| `scripts/verify-visibility-fog-incremental.mjs` | Expand for dirty tiles + parity |
| `scripts/verify-x12-first-tick.mjs` | First-tick budget tightening |
| `src/simulation/pathRequests.ts` | Scheduler, repath, diagnostics, optional save snapshot API |
| `src/simulation/pathfinding.ts` | Resumable A* only; no new sync entry points |
| `src/simulation/orders.ts` | Order issue/step repaths → scheduler |
| `src/simulation/saveGame.ts` | Pending path request serialization if Task D2 lands |
| `src/simulation/visibilityCache.ts` | Contribution FOV, dirty tiles, parity |
| `src/view/fogChunkCache.ts` | Chunk keys / dirty chunk sets |
| `src/view/renderWorld.ts` | `drawFog` chunk rebuild path |
| `src/main.ts` / `src/performance/*` | Telemetry export of plan024/025 counters if missing |
| `src/simulation/world.ts` | FOV collectors already exported; only touch if save/world fields added |

## Dependency Graph

```text
A1 docs baseline
  └─► A2 matrix capture 024/025/wave
        ├─► B1 inventory + red tests
        │     └─► B2–B5 repath migrations (serial by order family)
        │           └─► B6 path coverage verifier green
        ├─► C1 dirty-tile + parity FOV
        │     └─► C2 fog dirty consumption
        └─► D1 first-tick budget (after A2 numbers known)
              └─► D2 pending-path save (optional if save tests fail mid-queue)
                    └─► E1 browser demo/combat/harvest sessions
                          └─► E2 gameplay polish only if matrix absolute budgets pass or user accepts soft budgets
```

Tasks A and the start of B/C may use separate worktrees only if they do not both edit `orders.ts`. Prefer a single branch `perf/wave5-closeout` from current `main`.

---

### Task A1: Truth-align plan status and Wave 5 ledger

**Files:**
- Modify: `plans/README.md` (status rows for 018–025 and the short runtime summary table)
- Create: `plans/evidence/WAVE-5-CLOSEOUT.md` (scaffold only)
- Modify: `plans/evidence/WAVE-3-4-CLOSEOUT-2026-07-30.md` (mark leftovers complete; point to Wave 5)

**Interfaces:**
- Produces: accurate human/agent status strings: `DONE-VERIFIED`, `DONE-IMPLEMENTATION-MATRIX-PENDING`, or `IN PROGRESS` with one-line reason

- [ ] **Step 1: Drift-check live HEAD**

```bash
hostname   # must print halla
cd /home/halla/workspaces/t3/Wargus-TypeScript
git status -sb
git rev-parse HEAD
git log --oneline -5
```

Expected: clean `main` at or after `a0482f5`, tracking `origin/main`.

- [ ] **Step 2: Update the wave status table**

In `plans/README.md`, set (or add if missing) statuses:

| Plan | Status text |
|------|-------------|
| 018 | DONE-VERIFIED (qualified baseline with recorded absolute budget failures) |
| 019–020 | DONE-VERIFIED (implementation + focused gates; matrix per evidence) |
| 021–022 | DONE-IMPLEMENTATION-MATRIX-PENDING (implementation integrated; absolute frame budgets not yet re-proven post-024/025) |
| 023 | DONE-VERIFIED non-browser; browser pathfinding stall closed by 024 |
| 024 | DONE-IMPLEMENTATION + playable/X12 green; hardware matrix recapture is Wave 5 Task A2 |
| 025 | DONE-IMPLEMENTATION (skip + contribution FOV + fog chunks); matrix + dirty/parity hardening in Wave 5 |
| 026–027 | DONE-VERIFIED (leave existing evidence SHAs) |

Remove or rewrite any summary line that still says Plan 025 is “PARTIAL DONE” without mentioning the leftovers commit `a0482f5`.

- [ ] **Step 3: Scaffold Wave 5 closeout**

Create `plans/evidence/WAVE-5-CLOSEOUT.md` with sections: Environment, Matrix results, Path coverage, Visibility/fog, First-tick, Browser gates, Verdict. Leave result tables empty with `PENDING` placeholders only in the Results columns (not in task steps).

- [ ] **Step 4: Commit**

```bash
git add plans/README.md plans/evidence/WAVE-5-CLOSEOUT.md plans/evidence/WAVE-3-4-CLOSEOUT-2026-07-30.md
git commit -m "docs: truth-align plan status for Wave 5 closeout"
```

---

### Task A2: Hardware successor matrix for Plans 024 and 025

**Files:**
- Create artifacts under: `.artifacts/performance/024/` and `.artifacts/performance/025/` (or the path the matrix runner already uses)
- Modify: `plans/evidence/WAVE-5-CLOSEOUT.md`
- Create or update: `plans/evidence/024/matrix-recapture.md`, `plans/evidence/025/matrix-recapture.md`

**Interfaces:**
- Consumes: `npm run capture:successor-performance-matrix` env contract
- Produces: checksummed trial packets + summary verdict `READY` / `NOT READY` under `incremental` then optional `absolute-release`

- [ ] **Step 1: Preflight controller + renderer**

```bash
sg video -c 'sg render -c "test -r /dev/dri/card1 && test -r /dev/dri/renderD128 && node scripts/verify-browser-execution-controller.mjs"'
```

Expected: controller verified; DRM nodes readable; no owned-port leaks.

- [ ] **Step 2: Fixed-tick determinism for Plan 024 rows**

```bash
SHA=$(git rev-parse HEAD)
WARGUS_PERF_PLAN=024 WARGUS_PERF_ACCEPTANCE_MODE=incremental WARGUS_CAPTURE_SHA=$SHA \
  npm run verify:successor-fixed-tick
```

Expected: all assigned profiles `equal: true` (army-200, command-18, combat-100 for plan 024).

- [ ] **Step 3: Capture Plan 024 matrix (incremental)**

```bash
SHA=$(git rev-parse HEAD)
# Inspect scripts/run-successor-performance-matrix.mjs for required env if this fails.
WARGUS_PERF_PLAN=024 \
WARGUS_PERF_ACCEPTANCE_MODE=incremental \
WARGUS_CAPTURE_SHA=$SHA \
WARGUS_RUN_FULL_MATRIX=1 \
  sg video -c 'sg render -c "npm run capture:successor-performance-matrix"'
```

Expected: seven trials per assigned row; no silent trial discards for budget fails; summary written with checksums.

If the runner requires additional env vars (artifact root, baseline SHA), read the script header and the existing `plans/evidence/018.md` capture commands; do not invent alternate harnesses.

- [ ] **Step 4: Capture Plan 025 matrix (incremental)**

```bash
SHA=$(git rev-parse HEAD)
WARGUS_PERF_PLAN=025 \
WARGUS_PERF_ACCEPTANCE_MODE=incremental \
WARGUS_CAPTURE_SHA=$SHA \
WARGUS_RUN_FULL_MATRIX=1 \
  sg video -c 'sg render -c "npm run capture:successor-performance-matrix"'
```

- [ ] **Step 5: Record results honestly**

Fill `plans/evidence/024/matrix-recapture.md` and `025/matrix-recapture.md` with:

- Capture SHA, host, GPU qualification output
- Per-row worst-trial frame p95/p99, backlog, heap, command/render latency
- Which absolute budgets still fail vs Plan 018 baseline
- Whether `incremental` mode passes (no new failure keys / no p95 regression beyond contract)

Update `plans/evidence/WAVE-5-CLOSEOUT.md` verdict:

- If absolute budgets all pass → note Wave 5 absolute path open
- If only incremental passes → keep 021/022/024/025 as `DONE-IMPLEMENTATION-MATRIX-SOFT` and list remaining failing keys

- [ ] **Step 6: Commit evidence only (no code unless capture tooling bug)**

```bash
git add plans/evidence/024 plans/evidence/025 plans/evidence/WAVE-5-CLOSEOUT.md plans/README.md
git commit -m "docs(perf): record Wave 5 hardware matrix for plans 024 and 025"
```

**STOP (recoverable):** If hardware is unavailable or controller qualification fails, record the blocker in WAVE-5-CLOSEOUT and continue Tasks B/C/D on software-safe verifiers; do not invent frame numbers.

---

### Task B1: Inventory remaining sync path sites and add RED coverage

**Files:**
- Create: `scripts/verify-path-coverage-inventory.mjs` (or extend `scripts/verify-pathfinding-budget.mjs`)
- Modify: `package.json` (wire script if new file)
- Read-only inventory output committed under `plans/evidence/024/path-coverage-inventory.md`

**Interfaces:**
- Produces: ordered list of `orders.ts` call sites still invoking `findPath`, `findPathResult`, `sourceAttackTargetPath`, or `sourceUnitInteractionPath` from step/issue functions (not pure `can*` validators)

- [ ] **Step 1: Generate inventory**

```bash
rg -n "findPath\(|findPathResult\(|sourceAttackTargetPath\(|sourceUnitInteractionPath\(" src/simulation/orders.ts \
  | tee /tmp/path-sites.txt
```

Classify each hit as: `issue`, `step-repath`, `can-check`, `ai-select`, `helper`.

- [ ] **Step 2: Write a failing coverage assertion for a known step repath family**

Extend `scripts/verify-pathfinding-budget.mjs` (or new script) so that after 30 simulation ticks on X12 with AI enabled, `snapshotPathfindingDiagnostics().synchronousFindPathResultCalls` for **patrol/explore/defend step repaths** is not unbounded. Concrete first RED:

```js
// After creating X12 world and running 30 ticks with AI enabled:
const diag = pathfinding.snapshotPathfindingDiagnostics();
// Temporary RED threshold documenting the problem; Task B2+ lower it.
assert.ok(
  diag.synchronousFindPathResultCalls < 50,
  "expected step repaths to stay under 50 sync findPathResult calls over 30 ticks, got "
    + diag.synchronousFindPathResultCalls
);
```

- [ ] **Step 3: Run RED**

```bash
node scripts/verify-pathfinding-budget.mjs
```

Expected: FAIL on the new assertion (or document current count if already under 50, then tighten to a lower bar after profiling).

- [ ] **Step 4: Commit inventory + RED test only**

```bash
git add scripts/verify-pathfinding-budget.mjs package.json plans/evidence/024/path-coverage-inventory.md
git commit -m "test(path): inventory remaining sync path sites and add coverage RED"
```

---

### Task B2: Migrate patrol, explore, and defend repaths to the scheduler

**Files:**
- Modify: `src/simulation/orders.ts` (`stepPatrolOrder` ~5902, `stepExploreOrder` ~5958, `stepDefendOrder` ~6220)
- Modify: `src/simulation/pathRequests.ts` only if a new request kind is required (prefer `enqueueRepathRequest` / `enqueuePointPathRequest`)
- Test: `scripts/verify-pathfinding-budget.mjs`, `scripts/verify-x12-first-tick.mjs`

**Interfaces:**
- Consumes: `enqueueRepathRequest(world, unitId, candidates)`, `hasPendingPathRequest(world, unitId)`, `cancelPathRequestsForUnit`
- Produces: step functions that never assign `unit.order.path = findPath(...)` on the hot retry branch

- [ ] **Step 1: Patch `stepPatrolOrder` repath branches**

Replace patterns equivalent to:

```ts
if (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0) {
  unit.order.path = findPatrolPathWithinSourceRange(...);
  unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
}
```

with:

```ts
if (!hasPendingPathRequest(world, unit.id)
    && (unit.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0)) {
  enqueuePointPathRequest(world, unit.id, unit.order.targetX, unit.order.targetY, "attack-move");
  // If patrol must preserve kind "patrol", use enqueueRepathRequest with the intended endpoint only.
  // Prefer enqueueRepathRequest(world, unit.id, [{ x: unit.order.targetX, y: unit.order.targetY }])
  // so finishRequest only fills path on the existing patrol order.
  enqueueRepathRequest(world, unit.id, [{ x: unit.order.targetX, y: unit.order.targetY }]);
}
if (unit.order.path.length > 0) {
  stepMoveOrder(world, unit, tickSeconds);
}
```

Use **exactly one** of `enqueuePointPathRequest` or `enqueueRepathRequest` per branch — `enqueueRepathRequest` is correct when the order kind must remain `patrol` / `explore` / `defend`.

- [ ] **Step 2: Same pattern for explore and defend**

`stepExploreOrder` and `stepDefendOrder` (and any `findFollowPathWithinSourceRange` / exploration helper that currently calls `findPath` in a loop) must:

1. Not call `findPath` inside multi-candidate loops on the tick hot path.
2. Enqueue at most one repath request per unit per retry.
3. Guard with `hasPendingPathRequest`.

If a helper tries many candidate destinations with A*, change it to: pick the first passable candidate by geometric order **without** A*, then `enqueueRepathRequest` to that single point.

- [ ] **Step 3: Verify**

```bash
./node_modules/.bin/tsc --noEmit
node scripts/verify-x12-first-tick.mjs
node scripts/verify-pathfinding-budget.mjs
```

Expected: all pass; X12 first tick still &lt; 2500 ms.

- [ ] **Step 4: Commit**

```bash
git add src/simulation/orders.ts src/simulation/pathRequests.ts scripts/verify-pathfinding-budget.mjs
git commit -m "fix(simulation): budget patrol/explore/defend path repaths"
```

---

### Task B3: Migrate build, repair-step, and construction approach paths

**Files:**
- Modify: `src/simulation/orders.ts` (`issueBuildOrder` ~4180, build-site helpers ~5024+, step construction/repair repaths ~9330+)
- Test: existing construction-related verifiers if present; otherwise extend path budget script with a builder scenario

**Interfaces:**
- Consumes: `enqueueRepathRequest`, `sourceUnitInteractionPath` only for offline/tests not for tick issue
- Produces: build/repair orders that acknowledge with empty path + scheduled repath when out of range

- [ ] **Step 1: Change `issueBuildOrder` path commit**

When a path is required to reach the foundation:

```ts
cancelPathRequestsForUnit(world, builder.id);
builder.order = {
  kind: "build",
  // ...existing fields...
  path: [],
  pathIndex: 0
};
if (!isInTouchRange(builder, platformOrSite, world)) {
  enqueueRepathRequest(world, builder.id, [{ x: site.x, y: site.y }]);
}
```

Do **not** call `sourceUnitInteractionPath` during AI mass build planning inside a single tick for every candidate site. Site scoring may use distance + passable tile checks only; path is deferred.

- [ ] **Step 2: Step-order repair/build repaths**

Any `unit.order.path = sourceUnitInteractionPath(...)` inside step loops → scheduled repath with `hasPendingPathRequest` guard.

- [ ] **Step 3: Verify**

```bash
./node_modules/.bin/tsc --noEmit
node scripts/verify-pathfinding-budget.mjs
# If present:
npm run verify:browser-construction-lifecycle 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add src/simulation/orders.ts scripts/verify-pathfinding-budget.mjs
git commit -m "fix(simulation): schedule build and construction approach paths"
```

---

### Task B4: Migrate transport, rally, and remaining step repaths

**Files:**
- Modify: `src/simulation/orders.ts` (load/unload transport steps ~9618, rally ~9992, follow step repaths ~10965, attack-ground issue ~1382 if still sync, random-move helpers)
- Test: `scripts/verify-pathfinding-budget.mjs`, `npm run verify:browser-playable-session` (hardware)

**Interfaces:**
- Consumes: existing scheduler API
- Produces: no unbounded `findPath` inside `stepWorld` unit loop except debug-only paths

- [ ] **Step 1: Transport unload/load mid-order repaths**

```ts
if (!hasPendingPathRequest(world, transport.id)
    && (transport.order.path.length === 0 || world.tick % sourceOrderRetryTicks(world, 30) === 0)) {
  enqueueRepathRequest(world, transport.id, [{ x: transport.order.targetX, y: transport.order.targetY }]);
}
```

- [ ] **Step 2: Rally / trained unit paths**

On unit completion, set move/attack order with empty path + `enqueueRepathRequest` / `enqueueAttackPathRequest` instead of `findPath` / `sourceAttackTargetPath`.

- [ ] **Step 3: Attack-ground and remaining issue helpers**

If `issueAttackGroundOrder` still uses sync `findPath` when out of range, switch to enqueue + empty path, matching attack-move.

- [ ] **Step 4: Leave pure `can*` validators**

`canIssue*` may keep a single cheap check (range or candidate existence). It must **not** run multi-candidate A*. Prefer `sourceAttackTargetCandidates(...).length > 0` over `sourceAttackTargetPath(...).length > 0`.

- [ ] **Step 5: Verify**

```bash
./node_modules/.bin/tsc --noEmit
node scripts/verify-x12-first-tick.mjs
node scripts/verify-pathfinding-budget.mjs
sg video -c 'sg render -c "npm run verify:browser-playable-session"'
```

Expected: playable 12/12 still green; path coverage RED from B1 now green or tightened threshold still green.

- [ ] **Step 6: Commit**

```bash
git add src/simulation/orders.ts scripts/verify-pathfinding-budget.mjs plans/evidence/024
git commit -m "fix(simulation): schedule transport, rally, and residual repaths"
```

---

### Task B5: Path diagnostics in performance telemetry

**Files:**
- Modify: `src/main.ts` and/or `src/performance/runtimePerformance.ts` where Plan 018 counters are exported
- Modify: `src/simulation/pathRequests.ts` (`snapshotPathRequestDiagnostics` already exists)

**Interfaces:**
- Consumes: `snapshotPathRequestDiagnostics()`, `snapshotPathfindingDiagnostics()`
- Produces: browser summary keys `plan024.pathRequests.*` and `plan024.pathfinding.synchronousFindPathResultCalls`

- [ ] **Step 1: Locate summary export**

```bash
rg -n "plan023|plan024|snapshotPath|performanceSummary|__WARGUS_TS_SMOKE" src/main.ts src/performance -g'*.ts' | head -40
```

- [ ] **Step 2: Merge path diagnostics into the existing metrics object** without renaming Plan 018 fields.

- [ ] **Step 3: Verify smoke still loads**

```bash
sg video -c 'sg render -c "npm run verify:browser-runtime-smoke"'
```

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/performance src/simulation/pathRequests.ts
git commit -m "feat(perf): export plan 024 path scheduler diagnostics"
```

---

### Task C1: Harden contribution FOV dirty tiles and parity

**Files:**
- Modify: `src/simulation/visibilityCache.ts`
- Modify: `scripts/verify-visibility-fog-incremental.mjs`
- Modify: `src/simulation/world.ts` only if parity oracle needs a pure full-rebuild export

**Interfaces:**
- Consumes: `collectUnitFieldOfViewTileIndices`, `collectRevealTileIndices`
- Produces: non-empty `dirtyTiles` when visible/explored bits change; `snapshotVisibilityDiagnostics` includes incremental counts; optional `assertVisibilityParity(world)` for tests

- [ ] **Step 1: Fix empty dirty lists**

After incremental subtract/add, if any contribution transition changed a visible bit, `dirtyTiles` must include that index. If a source moved and tiles arrays differ, every removed-or-added tile index enters the dirty set even when another source keeps the tile visible (fog edges may need neighbor ring; chunk layer already expands neighbors).

Add a development/test-only parity helper:

```ts
export function assertLocalVisibilityMatchesFullRebuild(
  world: WorldState,
  collectors: TileCollectors,
  rebuild: (world: WorldState) => void
): void {
  const visibleCopy = Uint8Array.from(world.visibleTiles);
  const exploredCopy = Uint8Array.from(world.exploredTiles);
  // rebuild() runs the classic clear+markExplored path into temp buffers or a clone world
  // Assert visibleCopy equals rebuilt visible for all tiles.
}
```

Prefer comparing against a one-off full rebuild into temporary `Uint8Array`s rather than mutating live world when possible.

- [ ] **Step 2: Extend verifier**

In `scripts/verify-visibility-fog-incremental.mjs`, after a one-tile unit move that triggers incremental:

```js
assert.ok(
  afterMove["plan025.visibility.incrementalRebuilds"] >= 1,
  "movement must use incremental rebuild when contributions are seeded"
);
assert.ok(
  afterMove["plan025.visibility.dirtyTileCount"] > 0
    || /* allow zero only if FOV tiles bitwise identical */ false,
  "incremental movement must publish dirty tiles when FOV changes"
);
```

If FOV can be bitwise identical across a tile boundary for some units, assert the weaker condition: either dirty count &gt; 0 or a recorded `sourcesVisited === 2` (remove+add) with signature change.

- [ ] **Step 3: Verify**

```bash
./node_modules/.bin/tsc --noEmit
node scripts/verify-visibility-fog-incremental.mjs
```

- [ ] **Step 4: Commit**

```bash
git add src/simulation/visibilityCache.ts src/simulation/world.ts scripts/verify-visibility-fog-incremental.mjs plans/evidence/025
git commit -m "fix(visibility): dirty-tile publication and FOV parity checks"
```

---

### Task C2: Fog chunk dirty consumption correctness

**Files:**
- Modify: `src/view/renderWorld.ts` (`drawFog`)
- Modify: `src/view/fogChunkCache.ts`
- Test: extend `scripts/verify-visibility-fog-incremental.mjs` only if fog can be unit-tested without Pixi; otherwise rely on browser smoke + manual chunk diagnostics

**Interfaces:**
- Consumes: `getVisibilityRevision`, `getVisibilityDirtyTiles` / `consumeVisibilityDirtyTiles`
- Produces: when only a few tiles dirty, `plan025.fog.rebuilt` increases by a small chunk count, not the full viewport chunk count

- [ ] **Step 1: Ensure `drawFog` rebuilds a chunk when**

1. chunk never built, or  
2. `record.revision !== visibilityRevision` **and** (full dirty OR chunk key ∈ dirty set OR settings/bounds changed)

Avoid rebuilding all visible chunks on every revision when `dirtyTiles` is non-empty and non-full-map.

- [ ] **Step 2: Export fog diagnostics if not already**

`snapshotFogChunkDiagnostics(layer)` already exists; wire into smoke summary if cheap.

- [ ] **Step 3: Verify**

```bash
./node_modules/.bin/tsc --noEmit
sg video -c 'sg render -c "npm run verify:browser-runtime-smoke"'
sg video -c 'sg render -c "npm run verify:browser-playable-session"'
```

- [ ] **Step 4: Commit**

```bash
git add src/view/renderWorld.ts src/view/fogChunkCache.ts
git commit -m "fix(view): rebuild only dirty fog chunks on visibility revision"
```

---

### Task D1: First-tick budget improvement (X12 and large maps)

**Files:**
- Modify: `src/simulation/orders.ts` (AI first-think deferral and/or path enqueue limits on tick 0)
- Modify: `scripts/verify-x12-first-tick.mjs` (tighten threshold after evidence)
- Create: `plans/evidence/024/first-tick-budget.md`

**Interfaces:**
- Consumes: matrix/profile data from Task A2; current X12 ~1000–1100 ms baseline
- Produces: X12 first active tick ≤ 500 ms on Halla (stretch goal 300 ms) without changing route semantics

- [ ] **Step 1: Profile first tick breakdown**

Write a temporary profiler script (do not leave in tree unless useful) that reports ms spent in:

- `stepPathRequests`
- `stepAiPlayers`
- `updateVisibility`
- remainder of `stepWorld`

Use the existing X12 fixture compile pattern from `scripts/verify-x12-first-tick.mjs`.

- [ ] **Step 2: Apply the smallest high-impact fix**

Preferred order (stop when budget met):

1. Defer non-essential AI construction/path probes from tick 0 to tick 1 when `world.tick === 0` (keep harvest/attack assignment if required for determinism tests — prefer delaying only build placement A*-like work already removed).
2. Cap path request **starts** on tick 0 while still counting expansions under 512 (already capped); ensure defensive auto-attack does not enqueue more than N attack requests on tick 0 without changing eventual targets (stable unit-id sort, process first N, remainder next ticks).
3. Ensure first visibility rebuild is the only FOV full rebuild; no double rebuild on load.

Do **not** raise `PATH_NODE_EXPANSIONS_PER_TICK` without Task A2 evidence that command latency still passes.

- [ ] **Step 3: Tighten verifier**

In `scripts/verify-x12-first-tick.mjs`, after measured improvement:

```js
const maximumFirstTickMilliseconds = 500; // was 2500
```

Keep a secondary diagnostic log of exact ms.

- [ ] **Step 4: Verify**

```bash
node scripts/verify-x12-first-tick.mjs
node scripts/verify-pathfinding-budget.mjs
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/simulation/orders.ts scripts/verify-x12-first-tick.mjs plans/evidence/024/first-tick-budget.md
git commit -m "perf(simulation): cut X12 first-tick cost under 500ms"
```

---

### Task D2: Serialize authoritative pending path requests

**Files:**
- Modify: `src/simulation/pathRequests.ts` (export snapshot/restore of pending request queue)
- Modify: `src/simulation/saveGame.ts` (schema field)
- Modify: `scripts/verify-save-schema.mjs` and any normalizer
- Test: new assertions in `scripts/verify-pathfinding-budget.mjs` or `scripts/verify-save-schema.mjs`

**Interfaces:**
- Produces:

```ts
export type SavedPathRequest = {
  sequence: number;
  unitId: string;
  kind: "move" | "attack-move" | "attack" | "repath";
  candidates: Array<{ x: number; y: number }>;
  candidateIndex: number;
  targetId: string | null;
  autoReturn: { x: number; y: number } | null;
  enqueuedTick: number;
};

export function exportPathRequestsForSave(world: WorldState): {
  nextSequence: number;
  cursor: number;
  requests: SavedPathRequest[];
};

export function importPathRequestsFromSave(
  world: WorldState,
  payload: { nextSequence: number; cursor: number; requests: SavedPathRequest[] } | null | undefined
): void;
```

Resumable A* frontier is **not** saved; `search` restarts from `createResumablePathSearch` after load (deterministic given same world).

- [ ] **Step 1: RED — save during drained queue**

```js
// enqueue 8 moves, step 1 tick, export save JSON, load into new world, compare pending counts + sequences
```

- [ ] **Step 2: Implement export/import + schema field**

Bump save schema only if existing verifiers require it; follow patterns already used for occupancy/transient fields (authoritative vs derived).

- [ ] **Step 3: Verify**

```bash
./node_modules/.bin/tsc --noEmit
node scripts/verify-save-schema.mjs
node scripts/verify-pathfinding-budget.mjs
node scripts/verify-runtime-determinism.mjs
```

- [ ] **Step 4: Commit**

```bash
git add src/simulation/pathRequests.ts src/simulation/saveGame.ts scripts/verify-save-schema.mjs scripts/verify-pathfinding-budget.mjs
git commit -m "feat(save): persist pending path request queue across save/load"
```

---

### Task E1: Expand browser regression sessions

**Files:**
- Evidence only under `plans/evidence/WAVE-5-CLOSEOUT.md` unless scripts need timeout fixes
- No product code unless a session fails for a real bug

**Interfaces:**
- Consumes: existing package scripts

- [ ] **Step 1: Run demo session**

```bash
sg video -c 'sg render -c "npm run verify:browser-demo-session"'
```

- [ ] **Step 2: Run combat + harvest + train sessions**

```bash
sg video -c 'sg render -c "npm run verify:browser-combat-session"'
sg video -c 'sg render -c "npm run verify:browser-harvest-session"'
sg video -c 'sg render -c "npm run verify:browser-train-session"'
```

- [ ] **Step 3: Map loads (representative)**

```bash
sg video -c 'sg render -c "npm run verify:browser-map-loads"'
```

- [ ] **Step 4: Record pass/fail in WAVE-5-CLOSEOUT; fix only true regressions**

If a session fails, open a surgical fix task rather than disabling the gate.

- [ ] **Step 5: Commit evidence / fixes**

```bash
git add plans/evidence/WAVE-5-CLOSEOUT.md src scripts
git commit -m "test(browser): record Wave 5 demo/combat/harvest session results"
```

---

### Task E2: Optional absolute-release matrix and gameplay polish gate

**Files:**
- Evidence under `plans/evidence/WAVE-5-CLOSEOUT.md`
- Gameplay files only if absolute budgets pass and user still wants polish (contact pacing lives in demo scenario / AI timing — do not invent new systems)

**Interfaces:**
- Consumes: Task A2 incremental results

- [ ] **Step 1: Decision gate**

If Task A2 absolute budgets already pass, skip re-run. Else run:

```bash
SHA=$(git rev-parse HEAD)
WARGUS_PERF_PLAN=025 \
WARGUS_PERF_ACCEPTANCE_MODE=absolute-release \
WARGUS_CAPTURE_SHA=$SHA \
WARGUS_RUN_FULL_MATRIX=1 \
  sg video -c 'sg render -c "npm run capture:successor-performance-matrix"'
```

- [ ] **Step 2: Only if absolute-release is READY — gameplay polish**

Allowed polish (pick measured issues only):

- Fixed-demo contact timing constants already owned by plan 017 surfaces
- Command-18 input latency regressions introduced by scheduling (issue orders must still acknowledge same tick)

Forbidden without a new plan:

- New AI personalities
- Netlify deploy
- Engine rule changes unrelated to perf

- [ ] **Step 3: Final status update**

Mark plans 021–025 in `plans/README.md` with final post-matrix statuses and write the WAVE-5 verdict (`READY` / `SOFT-READY` / `NOT READY` with remaining keys).

- [ ] **Step 4: Commit + push (only with user authority already granted or reconfirmed)**

```bash
git add plans
git commit -m "docs(perf): close Wave 5 with matrix and browser evidence"
git push origin HEAD
```

---

## Verification Matrix (full program)

| Gate | When |
|------|------|
| `./node_modules/.bin/tsc --noEmit` | Every code task |
| `npm run verify:wargus-assets` | Any build/public change |
| `node scripts/verify-x12-first-tick.mjs` | Path + first-tick tasks |
| `node scripts/verify-pathfinding-budget.mjs` | All path tasks |
| `node scripts/verify-visibility-fog-incremental.mjs` | Visibility/fog tasks |
| `node scripts/verify-save-schema.mjs` | Save task |
| `node scripts/verify-runtime-determinism.mjs` | Any `src/**/*.ts` change |
| `npm run verify:successor-fixed-tick` | Before/after matrix |
| `capture:successor-performance-matrix` | Task A2 / E2 |
| `verify:browser-runtime-smoke` | After view/sim hot path changes |
| `verify:browser-playable-session` | After path coverage waves |
| `verify:browser-demo-session` + combat/harvest/train | Task E1 |

---

## Self-Review

**Spec coverage (from improvement backlog):**

| Ask | Task |
|-----|------|
| Hardware matrix army-200/command-18/combat-100 | A2, E2 |
| Docs status truth-up | A1 |
| Remaining step-order repaths on scheduler | B1–B4 |
| Demo + combat browser sessions | E1 |
| First-tick under ~200–500 ms | D1 |
| Save pending path queue | D2 |
| Plan 025 dirty/parity + fog chunks | C1–C2 |
| Telemetry for path counters | B5 |
| No broad rewrites / no Netlify | Global Constraints |

**Placeholder scan:** No TBD/implement-later steps remain; matrix env edge cases direct the executor to read the existing runner rather than invent one.

**Type consistency:** Scheduler APIs use existing `enqueueRepathRequest` / `enqueuePointPathRequest` / `enqueueAttackPathRequest`; save types `SavedPathRequest` defined once in D2.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-31-wargus-perf-wave5-closeout.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with executing-plans checkpoints  

**Which approach?**
