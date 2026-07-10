# Plan 011: Protect Builder-Inside Construction From Orphaned Foundations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise. When done, update this plan's status in `plans/README.md` unless a coordinator owns the index.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/simulation/orders.ts scripts/verify-browser-command-card-session.mjs scripts/verify-fixed-demo-random-ai.mjs plans/evidence/011.md plans/011-protect-construction-lifecycle.md plans/README.md`
> If any in-scope file changed, compare the current-state excerpts below with the live code. A semantic mismatch is a STOP condition.

**Goal:** Make a paid builder-inside foundation impossible to orphan through an ordinary player or AI retask, while preserving the deliberate one-Peasant opening and the existing explicit 75% construction-cancel path.

**Architecture:** Treat a worker whose `build` order already targets a paid foundation as committed until construction completes, fails, or the player cancels the foundation. Pre-foundation `build-oil-platform` travel remains interruptible because the original flow has not spent resources or created a platform yet; once it creates the platform it becomes an ordinary committed `build` order. Centralize this predicate at command eligibility boundaries. AI construction selection must use genuinely idle workers and wait when all workers are committed.

**Tech Stack:** TypeScript 6, PixiJS 8 runtime, Vite 8, repo-native browser/CDP verifier scripts.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Use `plans/ORIGINAL-WARGUS-SOURCE.md` when construction semantics are ambiguous.
- Preserve the fixed demo's one Peasant, no starting Hall, and high resources.
- Do not make builder-inside foundations repairable by unrelated workers in this plan.
- Do not change construction costs, durations, the 10% starting hit points, or the 75% cancellation refund.
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
- Before: a retask can leave a paid Hall foundation permanently at 10%.
- After: retasks reject while the Peasant is committed; explicit foundation cancel is the only early release and still refunds 75%.
- Required handoff: `plans/evidence/011.md`, ending with `Review decision: READY`.

## Current state

- `src/simulation/orders.ts:4952-5006` spends the full cost, creates a 10%-health foundation, and replaces the builder's current order with `kind: "build"`.
- `src/simulation/orders.ts:5343-5345` considers a moving worker usable even when it already has a build order.
- `src/simulation/orders.ts:5415-5434` already has the correct explicit cancellation behavior: 75% refund, builder release/order clear, foundation removal.
- `src/simulation/orders.ts:6784-6864` uses `workers.find((worker) => !worker.order) ?? workers[0]` for several AI buildings. With one Peon, this can overwrite the Great Hall build order with a Barracks build order.
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

- Produce `isCommittedToConstruction(unit: WorldUnit): boolean` in `src/simulation/orders.ts`.
- `canReceiveMoveOrders`, `isUsableBuilder`, and `isUsableSourceBuildActor` consume that predicate.
- Pending harvest/repair eligibility and direct selected-unit commands must
  delegate to the same predicate or to `canReceiveMoveOrders`; do not duplicate
  order-kind tests at each call site.
- AI building selection continues to use existing order functions; it receives no new bypass flag.
- Explicit cancellation continues through `issueCancelConstructionOrder(world, buildingId)`.

Target predicate:

```ts
function isCommittedToConstruction(unit: WorldUnit): boolean {
  return unit.order?.kind === "build"
    || isUnitHiddenInConstruction(unit);
}
```

## Design decision and rollback

- **Rejected:** silently cancel/refund the first foundation when a new order arrives; this makes an accidental click economically destructive.
- **Rejected:** add general foundation resumption; that expands construction semantics and save state before the orphan source is removed.
- **Rejected:** lock a tanker during pre-foundation oil-platform travel; no cost or foundation exists yet, so ordinary retask remains safe and matches the approved original-game rule.
- **Chosen:** reject non-cancel retasks while committed, using centralized eligibility. It is the smallest reversible seam and keeps the existing explicit cancel UX.
- **Rollback trigger:** M01 cannot cancel/release the builder, or a normal harvesting worker becomes unselectable for its first build. Restore the last green checkpoint and report which eligibility caller bypasses or over-applies the predicate.

## Scope

**In scope**:

- `src/simulation/orders.ts`
- `scripts/verify-browser-command-card-session.mjs`
- `scripts/verify-fixed-demo-random-ai.mjs`
- `plans/evidence/011.md` (create during execution)
- `plans/README.md`

**Out of scope**:

- Changing source construction timing or refunds
- Multiple-builder construction
- Resuming foundations whose builder died or disappeared
- Movement/pathfinding changes from plan 012
- AI attack timing or difficulty from plan 014
- Mission objectives

## Git workflow

- Suggested branch: `codex/011-construction-lifecycle`
- Use short imperative commits, matching `Implement Wargus verifier plans`.
- Do not push or open a PR unless instructed.

## Steps

### Task 1: Establish the behavioral baseline

- [ ] Run `./node_modules/.bin/tsc --noEmit`.

Expected: exit 0 with no TypeScript errors.

- [ ] Run `npm run verify:browser-command-card-session` and `npm run verify:fixed-demo-random-ai`.

Expected: both exit 0. If either is already red for an unrelated reason, STOP.

### Task 2: Add one committed-builder predicate

- [ ] Add `isCommittedToConstruction` beside the builder eligibility helpers in `src/simulation/orders.ts`.
- [ ] Make `canReceiveMoveOrders`, `isUsableBuilder`, and `isUsableSourceBuildActor` return false while the predicate is true.
- [ ] Make harvest and repair eligibility delegate to the same commitment gate,
  and make direct selected-unit commands (including Stop) reject a committed
  builder before any order setter runs.
- [ ] Keep a pre-foundation `build-oil-platform` travel order interruptible. The
  worker becomes committed only after `startOilPlatformConstruction` spends the
  cost, creates the platform, and replaces the travel order with `kind: "build"`.
- [ ] Do not modify `issueCancelConstructionOrder`; it remains the only ordinary way to release the commitment early.

Target shape:

```ts
function isUsableBuilder(unit: WorldUnit): boolean {
  return unit.hitPoints > 0
    && !unit.construction
    && unit.speed > 0
    && isWorker(unit)
    && !isCommittedToConstruction(unit);
}
```

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exit 0.

### Task 3: Remove AI busy-worker fallbacks

- [ ] In `runLandAttackAi`, replace every construction fallback shaped like `workers.find((worker) => !worker.order) ?? workers[0]` with an idle-only selection.
- [ ] If no idle worker exists, skip that building request for the current AI think. Do not cancel harvesting globally and do not steal a committed builder.
- [ ] Keep the existing town-center count of incomplete foundations so the AI does not place duplicate Halls.

Target shape:

```ts
const builder = workers.find((worker) => !worker.order && !isCommittedToConstruction(worker));
if (builder) {
  issueAiBuildBySourceRole(world, builder, playerId, "barracks", race);
}
```

**Verify**: `rg -n '\?\? workers\[0\]' src/simulation/orders.ts` -> no AI building fallback matches.

### Task 4: Exercise the actual retask failure

- [ ] Extend the construction-cancel fixture in `scripts/verify-browser-command-card-session.mjs`:
  1. Select a Peasant fixture.
  2. Place a Town Hall far enough away that the Peasant is still walking.
  3. Attempt Move, Stop, Harvest, Repair, Attack, and a second build command before entry.
  4. Confirm the first foundation remains, the Peasant's order still targets it, and no second foundation is created.
  5. Select the first foundation and cancel it.
  6. Confirm the Peasant becomes commandable and the existing 75% refund remains.
- [ ] Extend `scripts/verify-fixed-demo-random-ai.mjs` only with stable guards for idle-only AI builder selection; do not encode exact line formatting.

**Verify**: `npm run verify:browser-command-card-session` -> exits 0 and its success output includes the construction-retask scenario.

**Verify**: `npm run verify:fixed-demo-random-ai` -> exits 0.

### Task 5: Perform the playable acceptance session

- [ ] Start the app with `npm run dev -- --port 5173 --strictPort`.
- [ ] In the Codex in-app Browser, open `http://127.0.0.1:5173/?smoke=1&demoSeed=construction-lifecycle`.
- [ ] Place a Town Hall, immediately attempt Move and a second building placement, then cancel the Hall foundation.

Expected observable behavior:

- The original foundation is never stranded at 10%.
- The retask is rejected with normal error feedback.
- Cancellation removes the foundation, releases the Peasant, and refunds 75%.
- The one-Peasant/no-Hall start is unchanged.

### Task 6: Close out

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:browser-command-card-session`.
- [ ] Run `npm run verify:fixed-demo-random-ai`.
- [ ] Run `git diff --check`.
- [ ] Confirm `git status --short` lists only the in-scope source/verifier files and the plan index.
- [ ] Write `plans/evidence/011.md` using the shared template, including M01 baseline/after snapshots and the reviewer decision.
- [ ] Update plan 011 to `DONE` in `plans/README.md`.

## Done criteria

- [ ] A worker attached to a paid foundation cannot be overwritten by Move, Stop, Harvest, Repair, Attack, or another build command.
- [ ] Pre-foundation oil-platform travel remains interruptible; once the paid platform exists its ordinary `build` order is protected.
- [ ] AI never selects a busy worker as a construction fallback.
- [ ] Explicit construction cancellation still refunds 75% and releases the worker.
- [ ] The fixed demo still starts with exactly one selected Peasant, no Hall, and high resources.
- [ ] Focused browser checks and the playable acceptance session pass.
- [ ] `plans/evidence/011.md` exists and records M01 as READY.
- [ ] No files outside scope changed.

## STOP conditions

- Preventing retasks also prevents cancelling the selected foundation.
- More than the three centralized eligibility functions require bespoke committed-builder checks.
- AI construction cannot progress without stealing a worker and fixing that requires changing economy strategy.
- Paid oil-platform construction does not convert the tanker to the ordinary protected `build` order shown in the approved preflight.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

Reviewers should verify the commitment is a command-eligibility rule, not a special case hidden in the fixed demo. Future queued-building work must decide explicitly whether queueing happens before or after the current foundation completes; it must never silently replace the active foundation.
