# Plan 014: Make The AI Execute Its Script At Human-Scale Timing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow all steps and verification gates. This plan repairs the existing source-style AI; it does not invent a new strategy system. Stop on any STOP condition and update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/simulation/world.ts src/simulation/orders.ts src/wargus/saveGame.ts src/main.ts scripts/verify-fixed-demo-random-ai.mjs scripts/verify-source-ai-difficulty.mjs scripts/verify-source-ai-force-plans.mjs scripts/verify-source-ai-explores.mjs scripts/verify-browser-runtime-smoke.mjs plans/evidence/014.md plans/014-make-ai-execute-its-strategy.md plans/README.md`
> If the source AI instruction loop, build-order representation, difficulty factors, or exploration state changed, STOP and reconcile.

**Goal:** Make the AI honor sleep/attack barriers, build the requested number of producers with idle workers, use sane difficulty factors, and scout from its own explored map.

**Architecture:** Give the source AI interpreter a three-result advance/block/yield protocol, keep counted build needs without unbounded duplication, normalize source percentages at the timing boundary, and persist explored tiles per player.

**Tech Stack:** TypeScript 6 deterministic simulation, JSON save normalization, Vite/PixiJS browser runtime, repo-native AI/browser verifier scripts.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Preserve producer relationships from `plans/ORIGINAL-WARGUS-SOURCE.md`.
- Preserve the existing land/air scripts and force compositions unless a producer is currently impossible to request.
- Do not add omniscient targeting or start-position knowledge.
- Preserve the one-Peon AI opening.
- Difficulty may change think delay, resource bonuses, and speed factors, but no mode may run at 75x/120x/150x.
- The default demo should deliver staged pressure, not one delayed 16-unit blob.

---

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/011-protect-construction-lifecycle.md, plans/012-make-movement-orders-reliable.md, plans/013-fix-combat-commitment-and-response.md, plans/015-complete-demo-tech-paths.md
- **Category**: bug
- **Planned at**: commit `6af2eeb`, 2026-07-10

## Player-visible contract and evidence

- Assigned scenarios: M08–M09; replay M01, M04, and M07.
- Before: the AI skips early pressure, may underbuild production, and difficulty can make timing effectively instantaneous.
- After: small attacks arrive in order, producer counts match script intent, difficulty is bounded, and scouting uses AI knowledge.
- Required handoff: `plans/evidence/014.md`, with script/force/build/factor timelines and exploration-buffer growth bounds.

## Current state

- `stepAiPlayers` calls `advanceSourceAiScript` and then `runLandAttackAi` once per think.
- `advanceSourceAiScript` processes up to eight successful instructions without rechecking sleep or executing an attack.
- `sleep` and `attack-force` both return `true`; later instructions in the same pass can overwrite their effects.
- `addSourceAiBuildNeed` refuses duplicate roles, while `set barracks 2` relies on duplicate entries to represent a count of two.
- Plan 011 removes `workers[0]` busy-builder fallbacks; this plan assumes that dependency is complete.
- `applySourceAiDifficultyBonuses` writes `75`, `120`, and `150` directly into fields interpreted as multiplicative factors.
- Difficulties 2 and 3 do not reset factors previously written by another difficulty.
- `WorldState` has one persistent `exploredTiles` buffer for `visibilityPlayer`; AI explore candidates read that same buffer.

## Interfaces

Interpreter result:

```ts
type SourceAiInstructionResult = "advance" | "block" | "yield";
```

Rules:

- `block`: do not increment `sourceScriptIndex`; return from the interpreter.
- `advance`: increment and continue within the eight-step budget.
- `yield`: increment and return so `runLandAttackAi` sees the instruction's state immediately.

Build-count helper:

```ts
function ensureSourceAiBuildNeed(state: WorldAiState, role: SourceAiBuildRole, desiredCount = 1): void;
```

Difficulty boundary:

```ts
function setSourceAiSpeedFactorsFromPercent(player: WorldState["players"][number], percent: number): void {
  const factor = Math.max(0.01, percent / 100);
  // assign factor to build/train/upgrade/research/harvest/return
}
```

Per-player exploration:

```ts
// WorldState
exploredTilesByPlayer: Uint8Array[];
```

Index by player id. `exploredTiles` remains the rendering alias for `visibilityPlayer` to avoid rewriting fog rendering in this plan.

## Design decision and rollback

- **Rejected:** execute attacks directly inside the interpreter; that couples script parsing to army movement and makes later instruction types harder to reason about.
- **Rejected:** replace the entire build-order array with a new map schema in the same pass; save migration risk is unnecessary for counted duplicates.
- **Chosen:** a tri-state interpreter result, bounded duplicate-role counts, percentage normalization at one boundary, and per-player exploration buffers with the local buffer retained as a render alias.
- **Rollback trigger:** M08 skips or repeats a force, build-order arrays grow after the desired count, M09 factors leave 0.75–1.5, save/load loses exploration, or AI exploration pushes update time over budget. Roll back only the failing checkpoint and keep earlier READY checkpoints isolated.

## Scope

**In scope**:

- `src/simulation/world.ts`
- `src/simulation/orders.ts`
- `src/wargus/saveGame.ts`
- `src/main.ts` only for data-only AI smoke-state fields required by Task 8
- `scripts/verify-fixed-demo-random-ai.mjs`
- `scripts/verify-source-ai-difficulty.mjs`
- `scripts/verify-source-ai-force-plans.mjs`
- `scripts/verify-source-ai-explores.mjs`
- `scripts/verify-browser-runtime-smoke.mjs`
- `plans/evidence/014.md` (create during execution)
- `plans/README.md`

**Out of scope**:

- New AI personalities or machine-learning behavior
- Rebalancing unit statistics or resource costs
- Changing player starting resources
- Giving the AI hidden-map knowledge
- Naval strategy beyond preserving existing behavior
- Mission objectives

## Git workflow

- Suggested branch: `codex/014-ai-strategy-execution`
- Land the checkpoints below as separate reviewable commits. Do not begin a
  checkpoint until the preceding checkpoint is READY in `plans/evidence/014.md`.
- Do not push or open a PR unless instructed.

## Landing checkpoints

| Checkpoint | Tasks | Allowed result | Acceptance before continuing |
|---|---|---|---|
| 014-A — script execution | 2–4 | Barriers yield/block correctly, requested building counts remain bounded, and unit targets retain their original Wargus producers. | M08 shows 1 -> 4 -> 16 attack activation and two Barracks without an orphaned Hall; Catapult/Ballista remain Barracks units; no difficulty/fog state changes yet. |
| 014-B — timing boundary | 5 | Imported percentages become bounded runtime factors and every difficulty selection resets all factors. | M09 factors/durations pass for difficulties 1–5 and switching back to normal; no save-schema diff. |
| 014-C — AI knowledge | 6–9 | Each AI persists and consults its own explored map at a bounded update cadence. | Save round-trip passes, AI exploration never reads the human buffer, update time stays under 20ms, and M01/M04/M07 replay passes. |

If a checkpoint fails twice, revert only that checkpoint and keep the last READY
commit. Do not hide an interpreter failure with difficulty or exploration work.

## Steps

### Task 1: Confirm dependencies and baseline

- [ ] Confirm plans 011, 012, 013, and 015 are `DONE` with READY evidence packets.
- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:fixed-demo-random-ai`.
- [ ] Run `npm run verify:source-ai-difficulty`.
- [ ] Run `npm run verify:source-ai-forces`.
- [ ] Run `npm run verify:source-ai-explores`.

Expected: all exit 0 before edits. STOP if a dependency is incomplete or a focused baseline is red.

### Task 2: Add instruction barriers

- [ ] Change `applySourceAiInstruction` to return `SourceAiInstructionResult`.
- [ ] Change `advanceSourceAiScript` to increment on `advance`/`yield`, return on `block`/`yield`, and retain the eight-instruction safety budget.
- [ ] Return `yield` for `sleep` after setting `sourceScriptSleepUntilTick`.
- [ ] Return `yield` for `attack-force` after selecting the force and making `nextAttackTick` eligible.
- [ ] Return `block` for unmet `wait` and `wait-force`.
- [ ] Return `advance` for force declarations, count declarations, successful needs/upgrades, force-role, and research declarations.

Target loop:

```ts
const result = applySourceAiInstruction(world, playerId, state, instruction);
if (result === "block") return;
state.sourceScriptIndex += 1;
if (result === "yield") return;
```

**Verify**: `npm run verify:source-ai-forces` -> exits 0 after it requires sleep/attack yield semantics.

### Task 3: Represent desired building counts correctly

- [ ] Replace `addSourceAiBuildNeed` with `ensureSourceAiBuildNeed`.
- [ ] Normalize guard/cannon tower requests to the existing `tower` base role before counting.
- [ ] Append the role until `sourceAiRoleDesiredBuildCount(state, role) >= desiredCount`; never append beyond that count.
- [ ] `need`/`upgrade-to` calls use desired count 1.
- [ ] `set` calls use their declared count.
- [ ] Preserve duplicate entries in `buildOrder` through `normalizeAiBuildOrder`; do not convert it to a `Set` on save/load.

Target helper:

```ts
function normalizeSourceAiBuildRole(role: SourceAiBuildRole): SourceAiBuildRole {
  return role === "guard-tower" || role === "cannon-tower" ? "tower" : role;
}

function ensureSourceAiBuildNeed(state: WorldAiState, role: SourceAiBuildRole, desiredCount = 1): void {
  const targetRole = normalizeSourceAiBuildRole(role);
  let current = sourceAiRoleDesiredBuildCount(state, targetRole);
  while (current < Math.max(0, Math.floor(desiredCount))) {
    state.buildOrder.push(targetRole);
    current += 1;
  }
}
```

**Verify**: an AI state after `set barracks 2` contains two `barracks` entries and repeated evaluation does not add a third.

### Task 4: Preserve the original producer graph

- [ ] Keep Ballista/Catapult production on Human/Orc Barracks, as defined by
  the installed Wargus button scripts.
- [ ] Keep Flying Machine/Dwarves on Inventor and Zeppelin/Goblin Sappers on
  Alchemist. Do not insert a demolition-producer need for a Catapult force.
- [ ] If a source AI force later requests Dwarves or Goblin Sappers, derive the
  corresponding Inventor/Alchemist need from that actual unit target rather
  than treating the `catapult` role as demolition.
- [ ] Do not add or remove force members in this plan.

**Verify**: `npm run verify:fixed-demo-random-ai` -> exits 0 and asserts the
source force order without a false demolition-before-catapult dependency.

### Task 5: Normalize and reset difficulty speed factors

- [ ] Rename `setSourceAiSpeedFactors` to `setSourceAiSpeedFactorsFromPercent`.
- [ ] Divide source percentages by 100 exactly once inside that function.
- [ ] At the start of `applySourceAiDifficultyBonuses` for every computer player, reset timing factors with 100% before applying easy/hard/very-hard overrides.
- [ ] Keep existing resource-bonus amounts and think-delay formulas.
- [ ] Difficulty 1 should use factor 0.75; 2/3 should use 1; 4 should use 1.2; 5 should use 1.5.
- [ ] Changing from one difficulty to another must update existing AI players on their next think.

**Verify**: update `scripts/verify-source-ai-difficulty.mjs` to evaluate or inspect normalized factors rather than requiring raw assignments. Expected values: `0.75, 1, 1, 1.2, 1.5`.

**Verify**: `npm run verify:source-ai-difficulty` -> exits 0.

### Task 6: Add per-player explored state

- [ ] Add `exploredTilesByPlayer` to `WorldState` and initialize one `Uint8Array(tileCount)` for every player id represented in the world.
- [ ] Make `exploredTiles` reference `exploredTilesByPlayer[visibilityPlayer]` after world creation and load.
- [ ] Extract the current vision-marking loop into `markExploredTilesForPlayer(world, playerId, buffer)`.
- [ ] Update the local player's buffer every visibility update as today.
- [ ] Update enabled AI players' persistent buffers at most once per `tickRate` ticks to avoid multiplying fog work every frame.
- [ ] Make `findExplorationCandidates` and `findUnexploredExplorationCandidates` read the unit owner's buffer.
- [ ] Current visibility and target acquisition still use `isWorldPositionVisibleToPlayer`; persistent exploration is only for choosing scout destinations.

**Verify**: `npm run verify:source-ai-explores` -> exits 0 and asserts AI exploration reads its own player buffer.

### Task 7: Preserve exploration in save/load

- [ ] Add optional `exploredTilesByPlayer?: number[][]` to the saved world shape.
- [ ] Save each buffer as an array.
- [ ] On load, normalize each buffer to exactly `map.width * map.height` bytes.
- [ ] Backward compatibility: if the field is absent, copy saved `exploredTiles` only into `visibilityPlayer`; initialize all other players to zero.
- [ ] Rebind `world.exploredTiles` to the visibility player's restored buffer.

**Verify**: `npm run verify:save-schema` -> exits 0.

### Task 8: Add live AI progression evidence

- [ ] Extend the browser smoke state in `src/main.ts` only if required to expose these data-only fields per AI state: selected attack force id(s), build-order role counts, completed building counts, and normalized speed factors.
- [ ] Extend `scripts/verify-browser-runtime-smoke.mjs` to run a deterministic fixed-demo seed at accelerated verifier speed and assert:
  1. Initial sleep does not advance into build/force work in the same think.
  2. The 1-soldier attack becomes active before the 4-soldier declaration overwrites it.
  3. The 4-soldier attack becomes active before the 16-soldier declaration.
  4. The desired Barracks count reaches two once resources/space/builders allow it.
  5. AI speed factors remain within `0.75..1.5` for all menu difficulties.
- [ ] Do not require exact wall-clock timing; assert ordering and bounded factor values.

**Verify**: `npm run verify:browser-runtime-smoke` -> exits 0 and reports staged AI progression.

### Task 9: Perform the playable AI acceptance session

- [ ] Start the fixed demo with a deterministic seed and play normally from one Peasant.
- [ ] Build enough defense to observe at least the 1-, 4-, and 16-unit force stages.
- [ ] Change difficulty down and up once through the visible menu.

Expected observable behavior:

- The enemy builds its Hall without orphaning it.
- Small pressure arrives before the major army.
- The AI eventually fields more than one production building when requested.
- Easier feels slower, normal remains normal, and hard is faster without becoming instantaneous.
- Scouts do not act as though the human player's fog history belongs to them.

### Task 10: Close out

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:fixed-demo-random-ai`.
- [ ] Run `npm run verify:source-ai-difficulty`.
- [ ] Run `npm run verify:source-ai-forces`.
- [ ] Run `npm run verify:source-ai-explores`.
- [ ] Run `npm run verify:browser-runtime-smoke`.
- [ ] Run `npm run verify:save-schema`.
- [ ] Replay M01/M04/M07 and record M08–M09 in `plans/evidence/014.md`; obtain a READY review decision.
- [ ] Run `git diff --check` and confirm only in-scope files changed.
- [ ] Update plan 014 to `DONE` in `plans/README.md`.

## Done criteria

- [ ] Sleep and attack instructions yield after advancing exactly once.
- [ ] The AI activates 1-, 4-, and 16-unit attack stages in order.
- [ ] `set barracks 2` can produce two desired entries without unbounded duplication.
- [ ] AI speed factors are 0.75/1/1/1.2/1.5 and reset after every difficulty change.
- [ ] AI exploration reads persistent knowledge for its own player.
- [ ] Existing saves load; new saves preserve per-player exploration.
- [ ] The deterministic browser progression check and manual staged-pressure session pass.
- [ ] M01, M04, and M07–M09 evidence is recorded and plan 014 has a READY review decision.

## STOP conditions

- Plan 011, 012, 013, or 015 is not complete.
- Implementing barriers requires changing the declared source script order or force composition.
- Difficulty normalization conflicts with another documented factor representation in live code.
- Per-player exploration requires rewriting fog rendering rather than rebinding the existing local alias.
- AI exploration updates cause a sustained update-time regression in the browser smoke telemetry.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

The AI interpreter's `yield` result is an execution boundary. Future instruction types that must affect the world before later declarations run should use it. Keep source percentages at the import/compatibility boundary; runtime timing code should remain factor-1 based.
