# Plan 014: Make The AI Execute Its Script At Human-Scale Timing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow all steps and verification gates. This plan repairs the existing source-style AI; it does not invent a new strategy system. Stop on any STOP condition and update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/simulation/world.ts src/simulation/orders.ts src/wargus/saveGame.ts src/main.ts scripts/verify-fixed-demo-random-ai.mjs scripts/verify-source-ai-difficulty.mjs scripts/verify-source-ai-force-plans.mjs scripts/verify-source-ai-explores.mjs scripts/verify-browser-runtime-smoke.mjs plans/evidence/014.md plans/014-make-ai-execute-its-strategy.md plans/README.md`
> If the source AI instruction loop, build-order representation, difficulty factors, or exploration state changed, STOP and reconcile.

**Goal:** Make the AI execute original Wargus script semantics at human-scale
timing: block on sleeps/waits, launch and detach staged forces, preserve
additive `Need` versus absolute `Set`, build without stealing committed work,
normalize difficulty factors, and scout from its own explored map.

**Architecture:** Use an advance/block interpreter that runs until the next
barrier (bounded by one script length only as a malformed-script guard).
`attack-force` immediately snapshots and orders free members, then clears the
scripted force slot before the next declaration. Preserve additive `Need` and
absolute `Set` in bounded desired counts, reserve costs for unpaid construction
travel, normalize source percentages at the timing boundary, and persist
explored tiles per player.

**Tech Stack:** TypeScript 6 deterministic simulation, JSON save normalization, Vite/PixiJS browser runtime, repo-native AI/browser verifier scripts.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Preserve producer relationships from `plans/ORIGINAL-WARGUS-SOURCE.md`.
- Preserve the existing land/air scripts and force compositions unless a producer is currently impossible to request.
- Do not add omniscient targeting or start-position knowledge.
- Preserve the one-Peon AI opening.
- Difficulty may change think delay, resource bonuses, and speed factors, but no mode may run at 75x/120x/150x.
- The default land-AI demo should deliver staged pressure, not one delayed
  16-unit blob. Its source initial sleep is zero in the installed launcher and
  must not be presented as an opening delay.

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
- After: launched armies detach before later force declarations, additive and
  absolute build requests retain their different meanings, difficulty is
  bounded, and scouting uses AI knowledge.
- Required handoff: `plans/evidence/014.md`, with script/force/build/factor timelines and exploration-buffer growth bounds.

## Current state

- `stepAiPlayers` calls `advanceSourceAiScript` and then `runLandAttackAi` once per think.
- `advanceSourceAiScript` processes only eight successful instructions per
  simulated-second think and rewinds the tail at EOF; original `AiLoop` runs
  until a barrier and does not replay the tail.
- `sleep` advances immediately instead of holding its instruction, while
  `attack-force` selects mutable shared force state that a later declaration can
  overwrite.
- `addSourceAiBuildNeed` refuses duplicates. Original `AiNeed` adds one every
  time, while `AiSet` establishes an absolute desired count.
- Plan 011 removes `workers[0]` busy-builder fallbacks; this plan assumes that dependency is complete.
- `applySourceAiDifficultyBonuses` writes `75`, `120`, and `150` directly into fields interpreted as multiplicative factors.
- Difficulties 2 and 3 do not reset factors previously written by another difficulty.
- `WorldState` has one persistent `exploredTiles` buffer for `visibilityPlayer`; AI explore candidates read that same buffer.

## Interfaces

Interpreter result:

```ts
type SourceAiInstructionResult = "advance" | "block";
```

Rules:

- `block`: do not increment `sourceScriptIndex`; return from the interpreter.
- `advance`: increment and continue until the next barrier or script end.
- At most one full script length may execute in one think as a malformed-script
  guard; reaching EOF stops without rewinding.

Build-count helpers:

```ts
function addSourceAiBuildNeed(state: WorldAiState, role: SourceAiBuildRole): void;
function setSourceAiBuildNeed(state: WorldAiState, role: SourceAiBuildRole, desiredCount: number): void;
```

`add` appends exactly one normalized role. `set` changes that normalized role's
total to the exact non-negative desired count. A source instruction advances
once, so valid scripts cannot grow the array repeatedly at one index.

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

- **Rejected:** yield after `attack-force` as a substitute for force detachment.
  Original Wargus attacks immediately, resets the scripted slot, declares the
  next force in the same think, and then normally blocks at its wait.
- **Rejected:** make every `need` idempotent. Repeated Wargus `AiNeed` calls are
  intentionally additive; `AiSet` alone is absolute.
- **Chosen:** source-like advance/block execution, immediate detached force
  launch, additive/absolute build helpers, source-eligible worker selection
  with pending-cost reservation, normalized timing factors, and per-player
  exploration buffers.
- **Rollback trigger:** M08 reuses launched units or skips/repeats a declaration,
  desired build counts diverge from `Need`/`Set`, M09 factors leave 0.75–1.5,
  save/load loses exploration, or AI exploration pushes update time over budget.

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
| 014-A — script execution | 2–4 | Sleeps/waits block, attacks detach and continue to the next barrier, `Need`/`Set` counts stay source-correct and bounded, pending construction is reserved, and unit targets retain original producers. | M08 shows detached 1 -> 4 -> 16 launches and two Barracks without reusing units or orphaning a Hall; Catapult/Ballista remain Barracks units; no difficulty/fog state changes yet. |
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

### Task 2: Restore source instruction barriers and script completion

- [ ] Change `applySourceAiInstruction` to return `"advance" | "block"`.
- [ ] Change `advanceSourceAiScript` to increment only on `advance`, return on
  `block`, stop at EOF without rewinding, and use `script.length` only as a
  malformed no-barrier safety bound.
- [ ] Sleep with zero effective cycles advances immediately. A positive sleep
  sets `sourceScriptSleepUntilTick`, holds the current instruction, then
  advances exactly once when the deadline is reached.
- [ ] Unmet `wait` and `wait-force` block at their current index.
- [ ] `need`, `upgrade-to`, `set`, force declarations, force-role, research,
  and a successful `attack-force` advance in the same think.

Target loop:

```ts
for (let steps = 0; steps < script.length && state.sourceScriptIndex < script.length; steps += 1) {
  const result = applySourceAiInstruction(world, playerId, state, script[state.sourceScriptIndex]);
  if (result === "block") return;
  state.sourceScriptIndex += 1;
}
```

**Verify**: `npm run verify:source-ai-forces` -> exits 0 after it covers
zero/nonzero sleep, wait barriers, EOF stability, and attack continuation to the
next wait.

### Task 3: Preserve additive `Need`, absolute `Set`, and construction reservation

- [ ] Keep `addSourceAiBuildNeed`, but make every executed `need` append exactly
  one normalized role. `upgrade-to` adds its own single desired request only
  when that instruction represents a source build/upgrade request.
- [ ] Add `setSourceAiBuildNeed`, which removes/re-adds the normalized role until
  its count equals the declared non-negative absolute count.
- [ ] Make worker `set` assign its declared absolute target rather than
  `Math.max` with the old value.
- [ ] Normalize guard/cannon tower requests to the existing `tower` base role
  before add/set counting.
- [ ] Preserve duplicate `buildOrder` entries through save/load; never convert
  them to a `Set`.
- [ ] Remove the current immediate `issueSourceAiNeedNow` barrier semantics.
  Source `Need` records desire and advances; the resource/build manager fulfills
  it on subsequent AI work.
- [ ] Count the costs of every valid AI `build` order in `phase: "to-site"` as
  reserved when deciding whether another AI build request is affordable. Do not
  deduct those resources before arrival.
- [ ] Select source-eligible builders without ever stealing `build`,
  `build-oil-platform`, `repair`, or active gathering phases. A worker merely
  travelling to a resource may be retasked, matching Wargus; keep deterministic
  selection in place of Wargus's random worker choice.

**Verify**: a script with `need tower`, `need tower`, `set tower 1`, and `set
barracks 2` ends with one tower/two Barracks desires; reevaluating a blocked
instruction adds nothing; pending construction costs prevent overcommit.

### Task 4: Preserve the original producer graph

- [ ] Keep Ballista/Catapult production on Human/Orc Barracks, as defined by
  the installed Wargus button scripts.
- [ ] Keep Flying Machine/Dwarves on Inventor and Zeppelin/Goblin Sappers on
  Alchemist. Do not insert a demolition-producer need for a Catapult force.
- [ ] If a source AI force later requests Dwarves or Goblin Sappers, derive the
  corresponding Inventor/Alchemist need from that actual unit target rather
  than treating the `catapult` role as demolition.
- [ ] Do not add or remove force members in this plan.

- [ ] Implement `attack-force` as an immediate detached launch:
  - choose free, non-launched units satisfying that scripted force's targets;
  - issue their real attack/attack-move orders immediately;
  - remove/reset that scripted force slot before the interpreter advances;
  - exclude those now-attacking units from readiness/allocation for the next
    force;
  - allow the next declaration to execute in the same think and block at its
    `wait-force`.
- [ ] Source-script players must not also pass through the legacy mutable wave
  selector in `runLandAttackAi`; retain that path only for non-source AI plans.

**Verify**: `npm run verify:fixed-demo-random-ai` and `npm run
verify:source-ai-forces` -> exit 0, assert the source force order without a false
demolition-before-catapult dependency, and prove launched unit ids cannot be
reused by the next scripted force.

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
  1. The installed default zero-cycle initial sleep advances without an
     artificial delay; a separate nonzero-sleep fixture blocks then advances
     once.
  2. The 1-soldier attack is issued to detached unit ids before the 4-soldier
     force waits, and those ids are not counted into the next force.
  3. The detached 4-soldier attack launches before the 16-soldier force waits.
  4. The desired Barracks count reaches two once resources/space/builders allow it.
  5. AI speed factors remain within `0.75..1.5` for all menu difficulties.
- [ ] Do not require exact wall-clock timing; assert ordering and bounded factor values.

**Verify**: `npm run verify:browser-runtime-smoke` -> exits 0 and reports staged AI progression.

### Task 9: Perform the playable AI acceptance session

- [ ] Start the fixed demo with a deterministic seed and play normally from one Peasant.
- [ ] Build enough defense to observe at least the 1-, 4-, and 16-unit force stages.
- [ ] Change difficulty down and up once through the visible menu.

Expected observable behavior:

- The enemy builds its Hall without orphaning it or overcommitting resources
  reserved by an unpaid travel order.
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

- [ ] Zero-cycle sleep advances, positive sleep/waits block correctly, EOF does
  not replay, and attack launch advances to the next barrier.
- [ ] The AI activates 1-, 4-, and 16-unit attack stages in order.
- [ ] Launched unit ids detach and cannot satisfy the next scripted force.
- [ ] `Need` adds one, `Set` is absolute, duplicate desires remain bounded, and
  unpaid construction costs are reserved.
- [ ] AI speed factors are 0.75/1/1/1.2/1.5 and reset after every difficulty change.
- [ ] AI exploration reads persistent knowledge for its own player.
- [ ] Existing saves load; new saves preserve per-player exploration.
- [ ] The deterministic browser progression check and manual staged-pressure session pass.
- [ ] M01, M04, and M07–M09 evidence is recorded and plan 014 has a READY review decision.

## STOP conditions

- Plan 011, 012, 013, or 015 is not complete.
- Implementing barriers/detached launch requires changing the declared source
  script order or force composition.
- Difficulty normalization conflicts with another documented factor representation in live code.
- Per-player exploration requires rewriting fog rendering rather than rebinding the existing local alias.
- AI exploration updates cause a sustained update-time regression in the browser smoke telemetry.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

The source interpreter advances until a real barrier. `attack-force` must have
completed its detached world mutation before returning `advance`; do not add a
synthetic yield that changes declaration timing. `Need` and `Set` are distinct
language operations. Keep source percentages at the import/compatibility
boundary; runtime timing code should remain factor-1 based.
