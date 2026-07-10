# Plan 011: Restore The Original Two-Phase Construction Lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise. When done, update this plan's status in `plans/README.md` unless a coordinator owns the index.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/simulation/world.ts src/simulation/orders.ts src/wargus/saveGame.ts src/view/sourceUiHelpers.ts src/main.ts scripts/verify-browser-command-card-session.mjs scripts/verify-construction-definitions.mjs scripts/verify-fixed-demo-random-ai.mjs scripts/verify-source-build-action.mjs plans/evidence/011.md plans/011-protect-construction-lifecycle.md plans/README.md`
> If any in-scope file changed, compare the current-state excerpts below with the live code. A semantic mismatch is a STOP condition.

**Goal:** Match installed Wargus construction: placement creates a cancellable
unpaid travel order, arrival revalidates and pays for the 10% foundation, and
ordinary retasks before arrival leave no foundation or resource loss.

**Architecture:** Give `build` orders explicit `to-site` and `constructing`
phases. Placement stores building type/tile/path only. On arrival, revalidate
site, limits, prerequisites, and resources; then spend, create the foundation,
and continue through the existing inside/outside construction step. Keep
`build-oil-platform` as the same already-deferred travel model. AI construction
selection still uses genuinely idle workers so scripts do not thrash orders.

**Tech Stack:** TypeScript 6, PixiJS 8 runtime, Vite 8, repo-native browser/CDP verifier scripts.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Use `plans/ORIGINAL-WARGUS-SOURCE.md` when construction semantics are ambiguous.
- Preserve the fixed demo's one Peasant, no starting Hall, and high resources.
- Do not make builder-inside foundations repairable by unrelated workers in this plan.
- Do not change construction costs, durations, the 10% starting hit points, or the 75% cancellation refund.
- Do not reserve or deduct resources during `to-site`; this matches installed
  Stratagus `COrder_Build::StartBuilding`.
- Playable behavior is the acceptance criterion; source-fragment verifiers are regression guardrails only.
- Do not deploy or alter `public/wargus` assets.

---

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `6af2eeb`, 2026-07-10

## Player-visible contract and evidence

- Assigned scenario: M01 in `plans/MECHANICS-ACCEPTANCE.md`.
- Before: placement immediately spends resources and creates a 10% Hall, so a
  retask while walking can leave it orphaned.
- After: retasks safely replace the unpaid travel order with no foundation or
  resource loss; arrival creates the paid 10% Hall and explicit foundation
  cancel still refunds 75%.
- Required handoff: `plans/evidence/011.md`, ending with `Review decision: READY`.

## Current state

- `src/simulation/orders.ts:4952-5006` spends the full cost, creates a 10%-health foundation, and replaces the builder's current order with `kind: "build"`.
- `src/simulation/orders.ts:5343-5345` considers a moving worker usable even when it already has a build order.
- `src/simulation/orders.ts:5415-5434` already has the correct explicit cancellation behavior: 75% refund, builder release/order clear, foundation removal.
- `src/simulation/orders.ts:6784-6864` uses `workers.find((worker) => !worker.order) ?? workers[0]` for several AI buildings. With one Peon, this can overwrite the Great Hall build order with a Barracks build order.
- Installed Stratagus `src/action/action_build.cpp:276-349` deducts and creates
  only after the worker reaches the site. Ordinary unshifted commands flush the
  unpaid travel order through `src/action/command.cpp:65-108`.
- `canReceiveMoveOrders()` currently ignores the active order:

```ts
export function canReceiveMoveOrders(unit: WorldUnit): boolean {
  return unit.hitPoints > 0
    && !isUnitHiddenInConstruction(unit)
    && !unit.construction
    && (unit.kind === "land" || unit.kind === "naval" || unit.kind === "fly");
}
```

## Interfaces

Extend the existing build order instead of adding a new top-level order kind:

```ts
{
  kind: "build";
  phase: "to-site" | "constructing";
  buildingTypeId: string;
  tileX: number;
  tileY: number;
  targetId: string | null;
  targetX: number;
  targetY: number;
  buildCycle: number;
  path: WorldPathPoint[];
  pathIndex: number;
}
```

- Placement creates `phase: "to-site"`, `targetId: null`, and spends nothing.
- Arrival calls one `startBuildingFoundation` helper. Success changes the same
  order to `phase: "constructing"` with the new foundation id.
- Repairing an existing outside-built foundation creates a `constructing`
  order directly.
- Save loading accepts old build orders as `constructing` and validates new
  `to-site` orders by building definition, tile, path, and map bounds.
- Explicit paid-foundation cancellation remains
  `issueCancelConstructionOrder(world, buildingId)`.

## Design decision and rollback

- **Rejected:** lock the worker after placement; installed Wargus permits
  unshifted Move/Stop/Harvest/Repair/Attack/Build to flush the unpaid travel
  order.
- **Rejected:** immediately create a paid foundation and auto-refund on retask;
  that preserves the wrong phase boundary and creates unnecessary economy
  churn.
- **Chosen:** reproduce the original two-phase order and keep the existing 75%
  paid-foundation cancellation path.
- **Rollback trigger:** placement deducts before arrival, a retask leaves any
  foundation/resource delta, arrival creates more than one foundation, an old
  save loses an active foundation build, or paid cancellation stops returning
  75%.

## Scope

**In scope**:

- `src/simulation/orders.ts`
- `src/simulation/world.ts`
- `src/wargus/saveGame.ts`
- `src/view/sourceUiHelpers.ts` only to label a nullable-target `to-site`
  build order from its `buildingTypeId`
- `src/main.ts` only for a smoke-mode, data-only M01 scenario hook
- `scripts/verify-browser-command-card-session.mjs`
- `scripts/verify-construction-definitions.mjs`
- `scripts/verify-fixed-demo-random-ai.mjs`
- `scripts/verify-source-build-action.mjs`
- `plans/evidence/011.md` (create during execution)
- `plans/README.md`

**Out of scope**:

- Changing source construction timing or refunds
- Multiple-builder construction
- General multi-worker resumption after a builder dies or disappears
- Movement/pathfinding changes from plan 012
- AI attack timing or difficulty from plan 014
- Mission objectives

## Git workflow

- Suggested branch: `codex/011-construction-lifecycle`
- Use short imperative commits, matching `Implement Wargus verifier plans`.
- Do not push or open a PR unless instructed.

## Steps

### Task 1: Establish the behavioral baseline

- [x] Run `./node_modules/.bin/tsc --noEmit`.

Expected: exit 0 with no TypeScript errors.

- [x] Run `npm run verify:browser-command-card-session` and `npm run verify:fixed-demo-random-ai`.

Expected: both exit 0. If either is already red for an unrelated reason, STOP.

### Task 2: Defer payment and foundation creation until arrival

- [ ] Extend the `WorldOrder` build member with `phase`, `buildingTypeId`,
  `tileX`, `tileY`, and nullable `targetId` as specified above.
- [ ] Replace immediate `placeBuilding` behavior with a planning helper that
  stores the chosen tile and a path to touch range without spending resources,
  incrementing unit serials, changing player stats, replacing on-top units, or
  creating a foundation.
- [ ] In `stepBuildOrder`, while `phase === "to-site"`, follow/replan the path.
  On arrival re-run allow-list, source dependency, limit, affordability, and
  placement checks against the current world.
- [ ] Add `startBuildingFoundation` for the current spend/create/10%-HP/event
  work. On success mutate the same order to `phase: "constructing"`; preserve
  inside/outside builder behavior and queue semantics.
- [ ] If arrival validation fails, clear the pending build and emit existing
  failure feedback without spending. Never leave a live build order with no
  target/path decision.
- [ ] Keep `build-oil-platform` travel interruptible and unpaid. Its arrival
  helper should produce the same `constructing` build-order shape and remove
  the tanker inside the paid platform, because source platforms do not declare
  `BuilderOutside`.
- [ ] Update queued builds and repair-to-finish construction to populate the
  appropriate phase and metadata.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exit 0.

### Task 2a: Preserve both build phases across save/load

- [ ] Normalize new `to-site` orders only when the building definition exists,
  the target tile is in map bounds, and the saved path/point data are finite.
- [ ] Normalize new `constructing` orders only when their paid foundation and
  builder relationship are valid.
- [ ] Treat old saves whose build order has a string `targetId` and no `phase`
  as `constructing`, deriving building type/tile from the live foundation.
- [ ] Update missing-reference pruning so `targetId: null` is valid only for a
  well-formed `to-site` build.

**Verify**: `npm run verify:save-schema` -> exit 0 with an added pending-build
round-trip and the existing active-foundation compatibility case.

### Task 3: Remove AI busy-worker fallbacks

- [ ] In `runLandAttackAi`, replace every construction fallback shaped like `workers.find((worker) => !worker.order) ?? workers[0]` with an idle-only selection.
- [ ] If no idle worker exists, skip that building request for the current AI think. Do not cancel harvesting globally and do not steal a committed builder.
- [ ] Keep the existing town-center count of incomplete foundations so the AI does not place duplicate Halls.

Target shape:

```ts
const builder = workers.find((worker) => !worker.order);
if (builder) {
  issueAiBuildBySourceRole(world, builder, playerId, "barracks", race);
}
```

**Verify**: `rg -n '\?\? workers\[0\]' src/simulation/orders.ts` -> no AI building fallback matches.

### Task 4: Exercise the actual retask failure

- [ ] Extend the construction-cancel fixture in `scripts/verify-browser-command-card-session.mjs`:
  1. Select a Peasant fixture.
  2. Place a Town Hall far enough away that the Peasant is still walking.
  3. Confirm resources, unit count, serial, and player building stats do not
     change while the unpaid `to-site` order exists.
  4. In isolated resets, attempt Move, Stop, Harvest, Repair, Attack, and a
     second Build before arrival. Confirm each legal unshifted retask replaces
     the pending build without a foundation or resource delta.
  5. Place once more and allow arrival. Confirm one 10%-HP Hall appears and the
     exact cost is deducted at that moment.
  6. Select the paid foundation and cancel it.
  7. Confirm the Peasant becomes commandable and the existing 75% refund remains.
- [ ] Add one smoke-mode-only, data-only M01 scenario hook in `src/main.ts` if
  the existing fixture cannot expose those real order/resource transitions.
- [ ] Extend `scripts/verify-fixed-demo-random-ai.mjs` only with stable guards for idle-only AI builder selection; do not encode exact line formatting.

**Verify**: `npm run verify:browser-command-card-session` -> exits 0 and its success output includes the construction-retask scenario.

**Verify**: `npm run verify:fixed-demo-random-ai` -> exits 0.

### Task 5: Perform the playable acceptance session

- [ ] Start the app with `npm run dev -- --port 5173 --strictPort`.
- [ ] In the Codex in-app Browser, open `http://127.0.0.1:5173/?smoke=1&demoSeed=construction-lifecycle`.
- [ ] Place a distant Town Hall and immediately retask with Move. Confirm there
  is no foundation/resource delta, then place again, allow arrival, and cancel
  the paid Hall foundation.

Expected observable behavior:

- The pre-arrival retask succeeds and leaves no foundation or resource loss.
- Arrival deducts the cost and creates exactly one 10% foundation.
- Cancellation removes the foundation, releases the Peasant, and refunds 75%.
- The one-Peasant/no-Hall start is unchanged.

### Task 6: Close out

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:browser-command-card-session`.
- [ ] Run `npm run verify:fixed-demo-random-ai`.
- [ ] Run `npm run verify:constructions`.
- [ ] Run `npm run verify:source-build-action`.
- [ ] Run `npm run verify:save-schema`.
- [ ] Run `git diff --check`.
- [ ] Confirm `git status --short` lists only the in-scope source/verifier files and the plan index.
- [ ] Write `plans/evidence/011.md` using the shared template, including M01 baseline/after snapshots and the reviewer decision.
- [ ] Update plan 011 to `DONE` in `plans/README.md`.

## Done criteria

- [ ] Ordinary building placement spends nothing and creates nothing until the
  worker reaches the site.
- [ ] Move, Stop, Harvest, Repair, Attack, and a second Build can safely replace
  the unpaid travel order with no foundation or resource delta.
- [ ] Arrival revalidates, deducts once, creates one 10% foundation, and hides
  an inside-builder exactly as installed Wargus does.
- [ ] Pre-foundation oil-platform travel remains interruptible; arrival uses the
  same payment boundary and removes the tanker inside the paid platform.
- [ ] Old active-foundation saves and new pending-build saves round-trip.
- [ ] AI never selects a busy worker as a construction fallback.
- [ ] Explicit construction cancellation still refunds 75% and releases the worker.
- [ ] The fixed demo still starts with exactly one selected Peasant, no Hall, and high resources.
- [ ] Focused browser checks and the playable acceptance session pass.
- [ ] `plans/evidence/011.md` exists and records M01 as READY.
- [ ] No files outside scope changed.

## STOP conditions

- Any placement-time resource deduction, foundation creation, serial increment,
  player-stat change, or replaced-on-top unit removal remains.
- A legal unshifted pre-arrival retask is rejected or leaves a resource/unit delta.
- AI construction cannot progress without stealing a worker and fixing that requires changing economy strategy.
- Arrival validation cannot be made atomic without changing costs or map rules.
- Save compatibility requires dropping an old active-foundation build.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

Reviewers should verify the payment boundary in the simulation, not a special
case hidden in the fixed demo. Future queued-building work must preserve the
original distinction: queued placement is an unpaid intention; payment occurs
only when that queued order reaches a valid site.
