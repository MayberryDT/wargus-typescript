# Plan 014: Make The AI Execute Its Script At Human-Scale Timing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow all steps and verification gates. This plan repairs the existing source-style AI; it does not invent a new strategy system. Stop on any STOP condition and update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- package.json package-lock.json src/simulation/world.ts src/simulation/orders.ts src/wargus/saveGame.ts src/main.ts src/view/renderHud.ts scripts/verify-fixed-demo-random-ai.mjs scripts/verify-source-ai-difficulty.mjs scripts/verify-source-ai-force-plans.mjs scripts/verify-source-ai-explores.mjs scripts/verify-plan014-ai-manager.mjs scripts/verify-browser-runtime-smoke.mjs scripts/verify-browser-native-viewport.mjs scripts/verify-minimap-render-cache.mjs plans/evidence/014.md plans/014-make-ai-execute-its-strategy.md plans/README.md`
> If the source AI instruction loop, build-order representation, difficulty factors, or exploration state changed, STOP and reconcile.

**Goal:** Make the AI execute original Wargus script semantics at human-scale
timing: block on sleeps/waits, launch and detach staged forces, preserve
additive `Need` versus absolute `Set`, build without stealing committed work,
normalize difficulty factors, and scout from its own explored map.

**Architecture:** Use an advance/block interpreter that runs until the next
barrier (bounded by one script length only as a malformed-script guard).
`attack-force` immediately snapshots assigned ids into a bounded launch record,
orders them, then clears the scripted force slot before the next declaration.
Run the complete AI once per simulated second independent of difficulty;
difficulty scales scripted sleeps and action/resource factors, not the whole
manager cadence. Preserve additive `Need`, absolute `Set`, and distinct upgrade
requests, reserve costs for unpaid construction travel, normalize source
percentages at the timing boundary, and persist explored tiles per player.

**Tech Stack:** TypeScript 6 deterministic simulation, JSON save normalization, Vite/PixiJS browser runtime, repo-native AI/browser verifier scripts.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Preserve producer relationships from `plans/ORIGINAL-WARGUS-SOURCE.md`.
- Preserve the existing land/air scripts and force compositions unless a producer is currently impossible to request.
- Do not add omniscient targeting or start-position knowledge.
- Preserve the one-Peon AI opening.
- Every AI runs once per simulated second. Difficulty may scale script sleep,
  resource bonuses, and action speed factors, but not the whole AI think loop;
  no mode may run at 75x/120x/150x.
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
- **Current decision**: IN PROGRESS — independent review at `7de113c` was NOT READY; construction, force, save, and browser-gate fixes are committed, while Task 9 and a new independent review remain pending.

## Player-visible contract and evidence

- Assigned scenarios: M08–M09; replay M01, M04, and M07.
- Before: the AI skips early pressure, may underbuild production, and difficulty can make timing effectively instantaneous.
- After: launched armies detach before later force declarations, additive and
  absolute build requests retain their different meanings, difficulty is
  bounded, and scouting uses AI knowledge.
- Required handoff: `plans/evidence/014.md`, with script/force/build/factor timelines and exploration-buffer growth bounds.

## Current state

- `stepAiPlayers` calls `advanceSourceAiScript` and then `runLandAttackAi` once per think.
- The entire think is currently scheduled through difficulty-scaled
  `sourceAiSleepCycles(world, 30)`; source runs script and managers once per
  simulated second and scales only explicit script sleeps.
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
- Both TypeScript source-script arrays hard-code an initial 120-cycle sleep;
  installed land/air scripts receive zero from the default launcher. The land
  array also omits four installed Blacksmith research instructions before the
  first force.

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
function addSourceAiUpgradeNeed(state: WorldAiState, role: SourceAiBuildRole): void;
```

`add` appends exactly one normalized base/build role. `set` changes that
normalized role's total to the exact non-negative desired count. `upgrade-to`
retains its exact tier/tower upgrade role; a Guard/Cannon Tower request must not
collapse into the base Tower count. A source instruction advances once, so
valid scripts cannot grow the array repeatedly at one index.

Bounded scripted membership/evidence:

```ts
sourceScriptForces: Array<{ id: number; attack: boolean; targets: SourceAiForceTarget[]; assignedUnitIds: string[] }>;
sourceScriptLaunches: Array<{ sourceForceId: number; unitIds: string[]; launchedTick: number }>;
```

Both shapes are save-normalized. Launched ids cannot be reassigned to a later
scripted slot, and launch history is bounded by the script's attack-force
instructions because EOF never rewinds.

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
- **Rejected:** normalize Guard/Cannon Tower `upgrade-to` into the base Tower
  role. Installed AI first requests a base tower, then a distinct upgrade.
- **Rejected:** scale the entire AI think cadence by difficulty. Source calls
  the full AI once per second and scales explicit sleep durations separately.
- **Chosen:** source-like advance/block execution, immediate detached force
  launch, additive/absolute build helpers, source-eligible worker selection
  with pending-cost reservation, normalized timing factors, and per-player
  exploration buffers.
- **Rollback trigger:** M08 reuses launched units or skips/repeats a declaration,
  desired build counts diverge from `Need`/`Set`, M09 factors leave 0.75–1.5,
  save/load loses exploration, or AI exploration pushes update time over budget.

## Scope

**In scope**:

- `package.json`
- `package-lock.json`
- `src/simulation/world.ts`
- `src/simulation/orders.ts`
- `src/wargus/saveGame.ts`
- `src/main.ts` only for data-only AI smoke-state fields required by Tasks 8–9
- `src/view/renderHud.ts` for the accepted minimap performance correction
- `scripts/verify-fixed-demo-random-ai.mjs`
- `scripts/verify-source-ai-difficulty.mjs`
- `scripts/verify-source-ai-force-plans.mjs`
- `scripts/verify-source-ai-explores.mjs`
- `scripts/verify-plan014-ai-manager.mjs`
- `scripts/verify-browser-runtime-smoke.mjs`
- `scripts/verify-browser-native-viewport.mjs`
- `scripts/verify-minimap-render-cache.mjs`
- `plans/014-make-ai-execute-its-strategy.md`
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
| 014-A — script execution | 2–4 | Once-per-second execution, zero/positive sleeps, waits, distinct upgrades, installed research order, detached attacks, `Need`/`Set`, and pending reservation are source-correct and bounded. | M08 at source-neutral level 3 shows detached 1 -> 4 -> 16 launches and two Barracks without reusing units or orphaning a Hall; Catapult/Ballista remain Barracks units; no difficulty/fog state changes yet. |
| 014-B — timing boundary | 5 | Imported percentages become bounded runtime factors and every difficulty selection resets all factors. | M09 factors/durations pass for difficulties 1–5 and switching back to normal; no save-schema diff. |
| 014-C — AI knowledge | 6–9 | Each AI persists and consults its own explored map at a bounded update cadence. | Save round-trip passes, AI exploration never reads the human buffer, update time stays under 20ms, and M01/M04/M07 replay passes. |

If a checkpoint fails twice, revert only that checkpoint and keep the last READY
commit. Do not hide an interpreter failure with difficulty or exploration work.

## Steps

### Task 1: Confirm dependencies and baseline

- [x] Confirm plans 011, 012, 013, and 015 are `DONE` with READY evidence packets.
- [x] Run `./node_modules/.bin/tsc --noEmit`.
- [x] Run `npm run verify:fixed-demo-random-ai`.
- [x] Run `npm run verify:source-ai-difficulty`.
- [x] Run `npm run verify:source-ai-forces`.
- [x] Run `npm run verify:source-ai-explores`.

Expected: all exit 0 before edits. STOP if a dependency is incomplete or a focused baseline is red.

### Task 2: Restore source instruction barriers and script completion

- [x] Schedule each enabled AI exactly once per `tickRate` simulation ticks,
  independent of difficulty. Resource bonus/manager work therefore also runs
  once per simulated second. Update the save/load `nextThinkTick` cap to the
  same fixed cadence.
- [x] Change `applySourceAiInstruction` to return `"advance" | "block"`.
- [x] Change `advanceSourceAiScript` to increment only on `advance`, return on
  `block`, stop at EOF without rewinding, and use `script.length` only as a
  malformed no-barrier safety bound.
- [x] Sleep with zero effective cycles advances immediately. A positive sleep
  sets `sourceScriptSleepUntilTick`, holds the current instruction, then
  advances exactly once when the deadline is reached.
- [x] Unmet `wait` and `wait-force` block at their current index.
- [x] `need`, `upgrade-to`, `set`, force declarations, force-role, research,
  and a successful `attack-force` advance in the same think.
- [x] Replace the hard-coded initial land/air sleep `120` with the installed
  default zero cycles. Add a separate positive-sleep fixture instead of
  preserving an artificial opening delay.
- [x] Restore the four installed race-resolved Blacksmith weapon/armor research
  instructions before the first land force, without changing their order.

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

- [x] Keep `addSourceAiBuildNeed`, but make every executed `need` append exactly
  one normalized base/build role. Route `upgrade-to` through a distinct
  `addSourceAiUpgradeNeed` so tier and Guard/Cannon Tower requests survive.
- [x] Add `setSourceAiBuildNeed`, which removes/re-adds the normalized role until
  its count equals the declared non-negative absolute count.
- [x] Make worker `set` assign its declared absolute target rather than
  `Math.max` with the old value.
- [x] Normalize only base-tower `need`/`set` counts to `tower`; never collapse a
  Guard/Cannon Tower `upgrade-to` request into that base role.
- [x] Preserve duplicate `buildOrder` entries through save/load; never convert
  them to a `Set`.
- [x] Remove the current immediate `issueSourceAiNeedNow` barrier semantics.
  Source `Need` records desire and advances; the resource/build manager fulfills
  it on subsequent AI work.
- [x] Count the costs of every valid AI `build` order in `phase: "to-site"` as
  reserved when deciding whether another AI build request is affordable. Do not
  deduct those resources before arrival.
- [x] Select source-eligible builders without ever stealing `build`,
  `build-oil-platform`, `repair`, or active gathering phases. A worker merely
  travelling to a resource may be retasked, matching Wargus; keep deterministic
  selection in place of Wargus's random worker choice.

**Verify**: a script with `need tower`, `need tower`, `set tower 1`, and `set
barracks 2` ends with one tower/two Barracks desires; reevaluating a blocked
instruction adds nothing; pending construction costs prevent overcommit.

### Task 4: Preserve the original producer graph

- [x] Keep Ballista/Catapult production on Human/Orc Barracks, as defined by
  the installed Wargus button scripts.
- [x] Keep Flying Machine/Dwarves on Inventor and Zeppelin/Goblin Sappers on
  Alchemist. Do not insert a demolition-producer need for a Catapult force.
- [x] If a source AI force later requests Dwarves or Goblin Sappers, derive the
  corresponding Inventor/Alchemist need from that actual unit target rather
  than treating the `catapult` role as demolition.
- [x] Do not add or remove force members in this plan.

- [x] Implement `attack-force` as an immediate detached launch:
  - deterministically assign free, non-launched unit ids to the scripted slot;
  - exclude ids assigned to other active slots or any prior bounded launch;
  - choose only assigned ids satisfying that scripted force's targets;
  - issue their real attack/attack-move orders immediately;
  - append `{ sourceForceId, unitIds, launchedTick }`, then remove/reset that
    scripted force slot before the interpreter advances;
  - exclude those now-attacking units from readiness/allocation for the next
    force;
  - allow the next declaration to execute in the same think and block at its
    `wait-force`.
- [x] Source-script players must not also pass through the legacy mutable wave
  selector in `runLandAttackAi`; retain that path only for non-source AI plans.
- [x] When no currently known/visible enemy exists, choose a deterministic
  unexplored point from that AI player's own buffer. Do not fall back to an
  enemy player's start coordinates.

**Verify**: `npm run verify:fixed-demo-random-ai` and `npm run
verify:source-ai-forces` -> exit 0, assert the source force order without a false
demolition-before-catapult dependency, and prove launched unit ids cannot be
reused by the next scripted force.

### Task 5: Normalize and reset difficulty speed factors

- [x] Rename `setSourceAiSpeedFactors` to `setSourceAiSpeedFactorsFromPercent`.
- [x] Divide source percentages by 100 exactly once inside that function.
- [x] At the start of `applySourceAiDifficultyBonuses` for every computer player, reset timing factors with 100% before applying easy/hard/very-hard overrides.
- [x] Keep existing resource-bonus amounts, but apply them only at the fixed
  once-per-second AI cadence. Difficulty scales explicit script sleeps, not the
  whole think loop.
- [x] Difficulty 1 should use factor 0.75; 2/3 should use 1; 4 should use 1.2; 5 should use 1.5.
- [x] Changing from one difficulty to another must update existing AI players on their next think.

**Verify**: update `scripts/verify-source-ai-difficulty.mjs` to evaluate or inspect normalized factors rather than requiring raw assignments. Expected values: `0.75, 1, 1, 1.2, 1.5`.

**Verify**: `npm run verify:source-ai-difficulty` -> exits 0.

### Task 6: Add per-player explored state

- [x] Add `exploredTilesByPlayer` to `WorldState` and initialize one `Uint8Array(tileCount)` for every player id represented in the world.
- [x] Make `exploredTiles` reference `exploredTilesByPlayer[visibilityPlayer]` after world creation and load.
- [x] Extract the current vision-marking loop into `markExploredTilesForPlayer(world, playerId, buffer)`.
- [x] Update the local player's buffer every visibility update as today.
- [x] Update enabled AI players' persistent buffers at most once per `tickRate` ticks to avoid multiplying fog work every frame.
- [x] Make `findExplorationCandidates` and `findUnexploredExplorationCandidates` read the unit owner's buffer.
- [x] Current visibility and target acquisition still use `isWorldPositionVisibleToPlayer`; persistent exploration is only for choosing scout destinations.
- [x] Throttle assignment of a new AI explorer/scout destination to at most
  once per five simulated seconds per AI; existing explore orders continue.

**Verify**: `npm run verify:source-ai-explores` -> exits 0 and asserts AI exploration reads its own player buffer.

### Task 7: Preserve exploration in save/load

- [x] Add optional `exploredTilesByPlayer?: number[][]` to the saved world shape.
- [x] Save/normalize `assignedUnitIds`, bounded launch records, and any explicit
  scout-cadence tick. Deduplicate ids deterministically and discard missing ids
  from active membership without unbounding historical launch evidence.
- [x] Save each buffer as an array.
- [x] On load, normalize each buffer to exactly `map.width * map.height` bytes.
- [x] Backward compatibility: if the field is absent, copy saved `exploredTiles` only into `visibilityPlayer`; initialize all other players to zero.
- [x] Rebind `world.exploredTiles` to the visibility player's restored buffer.

**Verify**: `npm run verify:save-schema` -> exits 0.

### Task 8: Add live AI progression evidence

- [x] Extend the browser smoke state in `src/main.ts` only if required to expose these data-only fields per AI state: selected attack force id(s), build-order role counts, completed building counts, and normalized speed factors.
- [ ] Extend `scripts/verify-browser-runtime-smoke.mjs` to run deterministic
  fixed-demo seed `ai-staged-pressure` at source-neutral difficulty level 3 and
  accelerated verifier speed, recording actual source slots/AI id, and assert:
  1. The installed default zero-cycle initial sleep advances without an
     artificial delay; a separate nonzero-sleep fixture blocks then advances
     once.
  2. The 1-soldier attack is issued to detached unit ids before the 4-soldier
     force waits, and those ids are not counted into the next force.
  3. The detached 4-soldier attack launches before the 16-soldier force waits.
  4. The desired Barracks count reaches two once resources/space/builders allow it.
  5. AI speed factors remain within `0.75..1.5` for all menu difficulties.
- [x] Do not require exact wall-clock timing; assert ordering and bounded factor values.

The review-fix browser mode now reads bounded evidence from the running world
and no longer invokes the preseeded script/knowledge fixtures. The focused
fixtures remain unit/integration checks under `verify:plan014-ai-runtime`; the
literal live 1/4/16 progression, real duration sample, and progressed-stage
performance capture remain part of Task 9.

**Verify**: use the Codex in-app Browser for the segmented Task 9 chain. The
shell verifier's opt-in `WARGUS_BROWSER_RUNTIME_REPORT` path is an artifact
format for a separately authorized run, not a substitute for visible play.

### Task 9: Perform the playable AI acceptance session

- [ ] Start the fixed demo with a deterministic seed and play normally from one Peasant.
- [ ] Use source-neutral difficulty level 3 and build enough defense to observe
  the literal 1-, 4-, and 16-unit force stages. Do not label level 3 as the
  current UI's “Normal” level 2.
- [ ] Change difficulty down and up once through the visible menu.

Expected observable behavior:

- The enemy builds its Hall without orphaning it or overcommitting resources
  reserved by an unpaid travel order.
- Small pressure arrives before the major army.
- The AI eventually fields more than one production building when requested.
- Easier feels slower, normal remains normal, and hard is faster without becoming instantaneous.
- Scouts do not act as though the human player's fog history belongs to them.

### Task 10: Close out

- [x] Run `./node_modules/.bin/tsc --noEmit`.
- [x] Run `npm run verify:fixed-demo-random-ai`.
- [x] Run `npm run verify:source-ai-difficulty`.
- [x] Run `npm run verify:source-ai-forces`.
- [x] Run `npm run verify:source-ai-explores`.
- [ ] Run the production-honest `npm run verify:browser-runtime-smoke` through the approved browser path.
- [x] Run `npm run verify:save-schema`.
- [ ] Replay M01/M04/M07 and record M08–M09 in `plans/evidence/014.md`; obtain a READY review decision.
- [x] Run `git diff --check` and confirm only the expanded in-scope files changed.
- [ ] Update plan 014 to `DONE` in `plans/README.md`.

## Done criteria

- [x] Zero-cycle sleep advances, positive sleep/waits block correctly, EOF does
  not replay, and attack launch advances to the next barrier.
- [x] The AI activates 1-, 4-, and 16-unit attack stages in order.
- [x] Launched unit ids detach and cannot satisfy the next scripted force.
- [x] `Need` adds one, `Set` is absolute, duplicate desires remain bounded, and
  unpaid construction costs are reserved.
- [x] AI speed factors are 0.75/1/1/1.2/1.5 and reset after every difficulty change.
- [x] AI exploration reads persistent knowledge for its own player.
- [x] Existing saves load; new saves preserve per-player exploration.
- [ ] The deterministic browser progression check and manual staged-pressure session pass.
- [ ] M01, M04, and M07–M09 evidence is recorded and plan 014 has a READY review decision.

## STOP conditions

- Plan 011, 012, 013, or 015 is not complete.
- Implementing barriers/detached launch requires changing the declared source
  script order or force composition.
- Difficulty normalization conflicts with another documented factor representation in live code.
- AI think/manager cadence remains difficulty-scaled rather than once per
  simulated second, or installed zero sleep is replaced by another delay.
- Tower upgrade requests cannot remain distinct from base-tower counts.
- Per-player exploration requires rewriting fog rendering rather than rebinding the existing local alias.
- AI exploration updates cause a sustained update-time regression in the browser smoke telemetry.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

The source interpreter advances until a real barrier. `attack-force` must have
completed its detached world mutation before returning `advance`; do not add a
synthetic yield that changes declaration timing. `Need` and `Set` are distinct
language operations, and `upgrade-to` remains a distinct upgrade request. Keep
source percentages at the import/compatibility boundary; runtime timing code
should remain factor-1 based and the whole AI cadence fixed at one second.
