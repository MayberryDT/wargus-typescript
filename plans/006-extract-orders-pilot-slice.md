# Plan 006: Extract A Low-Risk orders.ts Pilot Slice

> **Historical status — `DONE-HISTORICAL`:** This plan has already been
> executed. Its original executor instructions are retained as history and are
> not a current work order. See `plans/HISTORICAL-PLAN-AUDIT.md`.

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP Conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- src/simulation/orders.ts src/simulation/workerSelection.ts scripts/verify-source-resource-ui.mjs plans/006-extract-orders-pilot-slice.md plans/README.md`
> If any in-scope file changed since this plan was written, compare the "Current State" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/002-restore-runtime-determinism.md, plans/005-stabilize-fixed-demo-verifiers.md
- **Category**: tech-debt
- **Planned at**: commit `3c35520`, 2026-06-16

## Why This Matters

`src/simulation/orders.ts` is over 18,000 lines and mixes selection helpers, movement, transports, production, spell AI, upgrade classification, resources, and late runtime utilities. A broad rewrite is too risky. This plan creates a small, reversible extraction around idle-worker selection so the repo gains a module boundary pattern without disturbing the core order state machine.

## Current State

`orders.ts` currently exports idle-worker helpers near the top of the file:

```ts
// src/simulation/orders.ts:447
export function findNextIdleWorker(world: WorldState, selectedUnitIds: string[], playerId = world.visibilityPlayer): WorldUnit | null {
  const idleWorkers = world.units
    .filter((unit) => isIdleWorkerForPlayer(world, unit, playerId))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (idleWorkers.length === 0) {
    return null;
  }
  const selectedIndex = idleWorkers.findIndex((unit) => selectedUnitIds.includes(unit.id));
  return idleWorkers[(selectedIndex + 1) % idleWorkers.length] ?? null;
}

export function isIdleWorkerForPlayer(world: WorldState, unit: WorldUnit, playerId = world.visibilityPlayer): boolean {
  return unit.player === playerId
    && unit.hitPoints > 0
    && !unit.construction
    && isGoldOrWoodWorkerUnit(unit)
    && !unit.order
    && unit.resourcesHeld <= 0;
}

export function isGoldOrWoodWorkerUnit(unit: Pick<WorldUnit, "gatherResources">): boolean {
  return unit.gatherResources.includes("gold") || unit.gatherResources.includes("wood");
}
```

`src/main.ts` imports `findNextIdleWorker` from `./simulation/orders`:

```ts
// src/main.ts:10
import { ..., findNextIdleWorker, ..., simulateWorld, ... } from "./simulation/orders";
```

`orders.ts` also uses `isGoldOrWoodWorkerUnit` internally for HUD builder eligibility:

```ts
// src/simulation/orders.ts:7627
export function canUseHudBuilderCommands(unit: WorldUnit): boolean {
  return unit.hitPoints > 0
    && !unit.construction
    && isGoldOrWoodWorkerUnit(unit);
}
```

The goal of this pilot is to preserve the public import path by re-exporting from `orders.ts`, while moving the implementation to a focused module. Because `orders.ts` still calls `isGoldOrWoodWorkerUnit`, the extraction must also import that helper locally.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck before | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| Resource UI verifier | `npm run verify:source-resource-ui` | exits 0 |
| Diff shape | `git diff -- src/simulation/orders.ts src/simulation/workerSelection.ts` | shows only helper extraction/import/re-export |
| Browser smoke | `npm run verify:browser-runtime-smoke` | exits 0 |
| Typecheck after | `./node_modules/.bin/tsc --noEmit` | exit 0 |

## Scope

**In scope**:

- `src/simulation/orders.ts`
- `src/simulation/workerSelection.ts` (create)
- `scripts/verify-source-resource-ui.mjs` only if it has stale source-location assumptions
- `plans/README.md`

**Out of scope**:

- Transport order extraction
- Spell AI extraction
- Production/research extraction
- Changing idle-worker behavior
- Changing imports outside `orders.ts` unless TypeScript forces it
- Formatting unrelated parts of `orders.ts`

## Git Workflow

- Branch suggestion: `codex/orders-worker-selection-pilot`
- Commit message style from repo history is short imperative, for example `Polish playable Wargus demo`.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Establish Baseline

Run the checks before editing.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exits 0.

**Verify**: `npm run verify:source-resource-ui` -> exits 0.

If either check is already failing, STOP and report. Do not start a refactor on a red baseline.

### Step 2: Create workerSelection.ts

Create `src/simulation/workerSelection.ts`.

Move the three helper implementations there:

- `findNextIdleWorker`
- `isIdleWorkerForPlayer`
- `isGoldOrWoodWorkerUnit`

Import only types from `./world`:

```ts
import type { WorldState, WorldUnit } from "./world";
```

Preserve the function signatures and bodies exactly unless TypeScript requires a type-only adjustment.

**Verify**: `sed -n '1,180p' src/simulation/workerSelection.ts` -> file contains only the worker-selection helpers and type imports.

### Step 3: Import And Re-export From orders.ts

Remove the local helper implementations from `src/simulation/orders.ts`. Add a local import for the helper still used inside `orders.ts`:

```ts
import { isGoldOrWoodWorkerUnit } from "./workerSelection";
```

Then add a re-export near the top:

```ts
export { findNextIdleWorker, isGoldOrWoodWorkerUnit, isIdleWorkerForPlayer } from "./workerSelection";
```

This preserves existing imports from `./simulation/orders` and avoids touching `src/main.ts`.

**Verify**: `rg -n "function findNextIdleWorker|function isIdleWorkerForPlayer|function isGoldOrWoodWorkerUnit" src/simulation/orders.ts` -> no matches.

**Verify**: `rg -n "workerSelection|isGoldOrWoodWorkerUnit" src/simulation/orders.ts src/simulation/workerSelection.ts` -> shows the import, re-export, helper implementation, and the existing `canUseHudBuilderCommands` call.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exits 0 before moving on.

### Step 4: Adjust Static Verifier Only If Needed

Run `npm run verify:source-resource-ui`. If it fails because it expects the helper implementation to live in `orders.ts`, update `scripts/verify-source-resource-ui.mjs` to accept the new `workerSelection.ts` location.

Do not loosen the verifier by removing idle-worker assertions. It should still verify that:

- The UI calls `selectNextIdleWorker(world)`.
- The runtime helper `findNextIdleWorker(loadedWorld, selectedUnitIds)` exists somewhere in `src/simulation`.
- Source `UiFindIdleWorker()` intent remains represented.

**Verify**: `npm run verify:source-resource-ui` -> exits 0.

### Step 5: Run Runtime Smoke

Idle-worker selection is user-visible through the `.` hotkey and HUD state. Run browser smoke after typecheck and source-resource verifier pass.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exits 0.

**Verify**: `npm run verify:browser-runtime-smoke` -> exits 0.

## Test Plan

- Baseline and final typecheck: `./node_modules/.bin/tsc --noEmit`
- Existing source UI verifier: `npm run verify:source-resource-ui`
- Runtime browser smoke: `npm run verify:browser-runtime-smoke`
- Diff review: `git diff -- src/simulation/orders.ts src/simulation/workerSelection.ts`

No new tests are required for this pilot unless moving the helper exposes a missing contract in `verify-source-resource-ui.mjs`.

## Done Criteria

- [ ] `src/simulation/workerSelection.ts` exists and owns the three idle-worker helpers.
- [ ] `src/simulation/orders.ts` imports `isGoldOrWoodWorkerUnit` for internal use, re-exports all three helpers, and no longer contains their implementations.
- [ ] Existing callers do not need import changes.
- [ ] `./node_modules/.bin/tsc --noEmit` exits 0.
- [ ] `npm run verify:source-resource-ui` exits 0.
- [ ] `npm run verify:browser-runtime-smoke` exits 0.
- [ ] No unrelated formatting or gameplay changes were made.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report back if:

- The baseline checks are already red.
- TypeScript requires changing imports across many runtime files.
- The helper behavior has to change to make extraction compile.
- `orders.ts` needs additional imports from `workerSelection.ts` beyond the three worker helpers.
- `verify:source-resource-ui` failure is behavioral rather than a stale source-location assumption.

## Maintenance Notes

This is a pilot extraction, not the full architecture fix. If it lands cleanly, future plans can extract larger slices such as transport orders, spell-condition evaluation, or upgrade classification. Each future extraction should preserve public imports first, then move callers in a separate pass only when tests are green.
