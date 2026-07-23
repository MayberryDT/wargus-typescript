# Plan 015: Complete And Extend The Fixed-Demo Advanced Tech Paths — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow the plan and verification gates exactly. This plan completes the existing advertised roster; it does not expand the demo with unrelated naval or campaign content. Update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/wargus/demoScenario.ts src/main.ts scripts/verify-fixed-demo-random-ai.mjs scripts/verify-browser-command-card-session.mjs scripts/verify-browser-train-session.mjs plans/evidence/015.md plans/015-complete-demo-tech-paths.md plans/README.md`
> If the fixed-demo allowed-unit list or advanced build-page behavior changed, STOP and reconcile.

**Goal:** Close the missing producer paths for the fixed demo's current advanced
roster, then deliberately add the four source-faithful Inventor/Alchemist units
with complete player-buildable paths from the one-Peasant opening.

**Architecture:** Use the existing manifest buttons, dependency rules, build
mappings, production functions, and unrestricted demo upgrade list. Add only
the ten missing scenario allow-list links, then exercise the existing runtime
through one bounded smoke-only cloned-world completion fixture.

**Tech Stack:** TypeScript 6 scenario setup, generated Wargus manifest data, PixiJS/Vite browser runtime, repo-native command-card/train verifiers.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Preserve the installed production graph in `plans/ORIGINAL-WARGUS-SOURCE.md`.
- Keep the one-Peasant/no-Hall/high-resource opening.
- Do not add starting buildings or units.
- Do not bypass manifest dependency rules or pre-research upgrades.
- Add only the source-faithful units produced by the newly allowed
  Inventor/Alchemist: Flying Machine/Dwarves and Zeppelin/Goblin Sappers. Do
  not add ships, heroes, or unrelated roster expansion.
- Air producers already exist in the allow list; do not duplicate them.
- Do not encode the port's queued-food reservation as a contract. Original
  Wargus pays queued resources but changes food demand only when a unit is
  created; Plan 016 owns that correction.

---

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/011-protect-construction-lifecycle.md, plans/012-make-movement-orders-reliable.md (for serialized `src/main.ts` fixture ownership)
- **Category**: bug, direction
- **Planned at**: commit `6af2eeb`, 2026-07-10

## Player-visible contract and evidence

- Assigned scenario: M10; replay M01.
- Before: the command tree advertises advanced units whose required producer buildings are forbidden by the scenario.
- After: every advertised advanced unit has a real build/research/train or conversion path with normal prerequisites.
- Required handoff: `plans/evidence/015.md`, containing the reachability graph and before/after command/queue evidence.

## Current state

`src/wargus/demoScenario.ts:127-174` currently allows these advanced combat
units:

- Human: Knight, Paladin, Ballista, Mage, Gryphon Rider.
- Orc: Ogre, Ogre Mage, Catapult, Death Knight, Dragon.

It already allows Stables/Ogre Mound and Gryphon Aviary/Dragon Roost, but omits:

- `unit-church`
- `unit-altar-of-storms`
- `unit-mage-tower`
- `unit-temple-of-the-damned`
- `unit-inventor`
- `unit-alchemist`

Flying Machine, Dwarves, Zeppelin, and Goblin Sappers are not currently
advertised by the scenario. Adding Inventor/Alchemist therefore also requires
an explicit, source-faithful four-unit roster expansion; otherwise those new
producer buildings would have no usable demo output.

The runtime already knows how to build them:

```ts
"build-caster-building": human ? "unit-mage-tower" : "unit-temple-of-the-damned",
"build-holy-building": human ? "unit-church" : "unit-altar-of-storms",
"build-siege-lab": human ? "unit-inventor" : "unit-alchemist"
```

`allowedUpgradeTypes: []` intentionally leaves upgrades governed by the manifest/source dependency rules rather than a second demo allow list.

The manifest and runtime already contain all six producer definitions, their
buttons/dependencies/assets, both research conversions, direct upgraded
Barracks training, and all ten direct output paths. This plan repairs scenario
reachability and proves those existing mechanics; it does not add a new tech
tree implementation.

## Design decision and rollback

- **Rejected:** remove Paladin/Mage/Death Knight from the advertised roster;
  that narrows the game instead of finishing the existing mechanics.
- **Rejected:** bypass prerequisites or pre-place producers; both contradict the one-Peasant base-building premise.
- **Chosen:** allow the six missing producers, explicitly add the four normal
  Inventor/Alchemist outputs, and leave the manifest dependency graph
  authoritative.
- **Rollback trigger:** any producer lacks complete manifest art/buttons/production data, or M10 requires a source dependency bypass. Remove only the unsupported producer addition and report the exact broken graph edge.

## Scope

**In scope**:

- `src/wargus/demoScenario.ts`
- `src/main.ts` only for one smoke-mode, data-only cloned-world M10 completion hook after the Plan 012/013 hotspot owner releases it
- `scripts/verify-fixed-demo-random-ai.mjs`
- `scripts/verify-browser-command-card-session.mjs`
- `scripts/verify-browser-train-session.mjs`
- `plans/evidence/015.md` (create during execution)
- `plans/README.md`

**Out of scope**:

- Manifest generation or asset-pack modification
- New units or buildings
- Naval/oil tech completion
- AI build sequencing (plan 014)
- Command prerequisite explanations (plan 016)
- Cost and timing balance

## Git workflow

- Suggested branch: `codex/015-demo-tech-paths`
- One logical commit is sufficient after all production paths are exercised.
- Do not push or open a PR unless instructed.

## Steps

### Task 1: Confirm the current reachability gap

- [x] Run `./node_modules/.bin/tsc --noEmit`.
- [x] Run `npm run verify:fixed-demo-random-ai`.
- [x] Run `npm run verify:browser-command-card-session`.
- [x] Run `npm run verify:browser-train-session`.

Expected: all exit 0. These commands do not currently prove the missing producer path; that gap is what this plan adds.

- [x] Confirm each missing producer above exists in `public/wargus/manifest.json` with a build button and the expected train/research buttons.

Expected: all six producer definitions and their source-faithful unit buttons
exist. If any definition or button is absent from the manifest, STOP; the work
is no longer a scenario allow-list fix.

### Task 2: Complete the fixed-demo allow list

- [x] Add the six missing producer type ids to `allowedUnitTypes` in `applyFixedBrowserDemoSetup`.
- [x] Place human entries beside the other human buildings and orc entries beside their counterparts.
- [x] Do not alter `demoUnits`, starting resources, or `allowedUpgradeTypes`.

Target additions:

```ts
"unit-church",
"unit-altar-of-storms",
"unit-mage-tower",
"unit-temple-of-the-damned",
"unit-inventor",
"unit-alchemist",
"unit-balloon",
"unit-zeppelin",
"unit-dwarves",
"unit-goblin-sappers",
```

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exit 0.

### Task 3: Lock scenario reachability without duplicating the tech tree

- [x] Update `scripts/verify-fixed-demo-random-ai.mjs` to assert all six producer ids and all four Inventor/Alchemist output ids are present exactly once in the fixed-demo allow list.
- [x] Keep its one-Peasant, high-resource, randomized-start, and source-AI assertions unchanged.
- [x] Do not encode prerequisite logic in this static verifier; browser scenarios own behavior.

**Verify**: `npm run verify:fixed-demo-random-ai` -> exits 0.

### Task 4: Exercise advanced build command cards

- [x] Extend the existing fixture matrix in `scripts/verify-browser-command-card-session.mjs` rather than creating a parallel command-card harness.
- [x] Use Peasant + completed Elven Lumber Mill to expose the advanced page while Inventor, Mage Tower, and Church remain dependency-disabled; add a completed Castle to the same fixture and assert all three become executable.
- [x] Mirror with Peon + completed Troll Lumber Mill, then add a completed Fortress for Alchemist, Temple, and Altar.
- [x] Assert the actual source command values before/after; do not hardcode a second dependency graph or bypass prerequisites.

**Verify**: `npm run verify:browser-command-card-session` -> exits 0 and reports six advanced producer commands.

### Task 5: Exercise production and conversion paths

- [x] After Plan 012/013 release `src/main.ts`, add one smoke-only
  `__WARGUS_TS_RUN_ADVANCED_TECH_PATH_FIXTURE__` that clones the loaded demo
  world, disables AI in the clone, prepares real prerequisites/resources, issues
  normal research/train orders, and advances fixed simulation steps. It must
  not mutate the live playable world or use wall-clock waits as game time.
- [x] Extend `scripts/verify-browser-train-session.mjs` with data-driven results from that fixture:
  - Church researches Paladin. Completion converts existing Knights to
    Paladins and unlocks direct Paladin training at the Barracks.
  - Altar researches Ogre Mage. Completion converts existing Ogres to Ogre
    Mages and unlocks direct Ogre Mage training at the Barracks.
  - Mage Tower trains Mage.
  - Temple trains Death Knight.
  - Human Barracks trains Ballista.
  - Orc Barracks trains Catapult.
  - Inventor trains Flying Machine and Dwarves.
  - Alchemist trains Zeppelin and Goblin Sappers.
- [x] For Paladin/Ogre Mage, verify both halves of the source mechanic:
  research completion converts an existing Knight/Ogre, and the upgraded unit
  becomes directly trainable from the Barracks afterward. Do not expect a
  Church/Altar production queue.
- [x] For each directly trained unit, verify resource deduction, queue progress,
  completion, spawn, and stable deterministic ids/counts. Record supply
  snapshots, but do not assert queued reservation/release: demand is unchanged
  before spawn and increases only when the unit is created in source behavior.
- [x] For both conversions, preserve the existing Knight/Ogre unit id while its
  type changes, then prove the separate Barracks Paladin/Ogre Mage command
  changes from blocked to executable after real research completion.

**Verify**: `npm run verify:browser-train-session` -> exits 0 and reports all
ten source-faithful advanced paths.

### Task 6: Perform the playable progression session

- [x] Complete the progression as resumable segments of at most 30 seconds each.
  Start each segment by loading the prior accepted checkpoint through the real
  F12 Load Game UI, and end it by saving through F11 before closing the tab and
  stopping the server. The opening segment starts fresh because no save exists.
- [x] After F12 Load, click the visible `Run` control before any segment that
  depends on elapsed simulation time. Confirm the control changes away from
  `Run`; a paused wait does not advance the target milestone.
- [x] Within the same bounded action, read-only assert the expected save-slot
  unit types/resources/speed before mutation, the matching loaded smoke state
  after F12, the target smoke state before F11, and the committed slot JSON
  after Save. A failed assertion closes without F11 and does not advance Task 6.
- [x] Build the checkpoint guard from stable save/load fields. Before F12,
  capture the slot's `savedAt`, map path, tick, source speed, visibility-player
  resources, visibility-player unit records, and total unit count. After F12,
  require the same map, tick, source speed, resources, ready owned-unit counts,
  and `unitCount === slot.world.units.length`. Do not hard-code a scenario-wide
  unit total and do not use `selectedUnitTypes` as checkpoint identity.
- [x] For a construction target, compare against the just-loaded baseline:
  require the exact resource delta, unchanged ready owned-unit counts, and one
  additional live unit before F11. After F11, require a changed `savedAt`, the
  target tick/speed/resources, and the expected visibility-player building
  record with a non-null `construction` object in the saved slot. The saved
  player-owned construction record is authoritative because smoke
  `ownedUnitCounts` intentionally excludes foundations.
- [x] Treat command-page navigation and command availability as separate
  assertions. Before opening the Peasant basic page, require one enabled
  `build-basic-page` command with displayed key `B`, source action `button`,
  and source value `1`; issue that visible hotkey and then assert only
  `commandPage === 1`. Inspect the resulting card separately and require one
  enabled `source-build:unit-town-hall` command with displayed key `H`, source
  action `build`, and source value `unit-town-hall` before issuing it. Record
  the actual card and disabled reason on a mismatch instead of retrying a
  canvas coordinate or waiting on a compound predicate.
- [x] Use 2x through the visible speed control only. Preserve 2x in every save
  segment and record the visible speed at each checkpoint.
- [x] Before F11, activate the visible Pause control or its documented `Space`
  hotkey and assert the runtime is paused. Prefer `Space` when a canvas tap has
  already proved unreliable under rendering load. Capture the target tick only
  after that pause, then require the saved slot tick to match it exactly. A tick
  observed while the game is still running is only a lower bound and must not
  be compared for exact equality with a later F11 save.
- [x] Account for fixed-demo command acknowledgement: a successful train,
  build, research, or other acknowledged order may resume a loaded paused game.
  When a setup segment must not advance simulation, issue one command, assert
  its queue/resource result, immediately pause with `Space`, and assert paused
  again before issuing the next command.
- [x] Keep queued supply diagnostic in supporting worker/army setup. The current
  HUD displays `used + queued` and the current order gate reserves queued
  demand, so four queued Peasants display `5/5`; do not require the original
  completion-time `1/5` behavior in Plan 015 or treat `5/5` as correct source
  behavior. Record used/queued/cap separately and leave the correction to Plan
  016 as assigned.
- [x] Recompute placement candidates from the loaded base at every building
  milestone. Once multiple workers/buildings exist, select a visible idle
  Peasant with the greatest clearance from current owned buildings and probe
  bounded candidate rings inside the live map viewport. Do not reuse offsets
  from the one-worker opening. If no candidate is accepted, close without F11
  and record the worker/building screen points before another attempt.
- [x] Give each segment one target milestone: one completed building, one Hall
  upgrade, one research conversion, or one spawned advanced output. If normal
  simulation has not completed it by the cutoff, save the in-progress state and
  continue that same target in the next segment; only completion satisfies the
  milestone. Do not keep the game open to combine milestones.
- [x] From one Peasant, build through Keep/Castle and produce at least one
  Paladin, Mage, Ballista, Flying Machine, and Dwarves.
- [x] When normal gathering is required, budget the complete remaining Human
  showcase rather than only the next Castle payment. From the accepted
  Stables-complete checkpoint (`1100/1050/4700`), Castle + Church + Mage Tower
  + Inventor + Knight + Paladin research + Mage + Ballista + Flying Machine +
  Dwarves costs `10500 gold / 3050 wood / 500 oil`. If front-loading gathering,
  reach at least `11600 gold / 4100 wood` before spending. Castle adds one
  supply, taking `5/9` to `5/10`, exactly enough for those five demanded
  outputs; do not add another Farm unless the live source supply differs.
- [x] Use an Orc fixture or deterministic AI observation to confirm Catapult,
  Ogre Mage, Death Knight, Zeppelin, and Goblin Sappers through the mirrored
  Altar/Temple/Alchemist paths.

Expected observable behavior:

- Every current advertised advanced unit has a visible, comprehensible path,
  and the four deliberate Inventor/Alchemist additions are likewise usable.
- No advanced button remains permanently disabled once its true prerequisites are completed.
- Advanced units enter the normal production queue and spawn like existing units.
- Every accepted segment has a matching save checkpoint and evidence row; an
  interrupted unsaved segment is discarded rather than replayed continuously.

### Task 7: Close out

- [x] Run `./node_modules/.bin/tsc --noEmit`.
- [x] Run `npm run verify:fixed-demo-random-ai`.
- [x] Run `npm run verify:browser-command-card-session`.
- [x] Run `npm run verify:browser-train-session`.
- [x] Run `npm run verify:wargus-assets`.
- [x] Run `npm run verify:runtime-determinism`.
- [x] Replay M01 and record M10 in `plans/evidence/015.md`; obtain a READY review decision.
- [x] Run `git diff --check` and confirm only in-scope files changed.
- [x] Update plan 015 to `DONE` in `plans/README.md`.

## Done criteria

- [x] All six missing advanced producer buildings are allowed in the fixed demo.
- [x] Human and Orc advanced build cards expose the producers at the correct tech tier.
- [x] Paladin/Ogre Mage, Mage/Death Knight, Ballista/Catapult, Flying
  Machine/Zeppelin, and Dwarves/Goblin Sappers complete through their original
  production/research mechanics.
- [x] The one-Peasant/no-Hall/high-resource start remains unchanged.
- [x] No manifest or asset files changed.
- [x] Focused browser scenarios and playable progression session pass.
- [x] M01/M10 evidence is recorded and plan 015 has a READY review decision.

## STOP conditions

- Any missing producer lacks manifest art, buttons, or production definitions.
- Reaching an advertised unit requires bypassing source dependency rules.
- `src/main.ts` is still owned by an unfinished predecessor plan.
- Completion evidence requires pre-seeding `researchedUpgrades`, bypassing
  normal order completion, or encoding queued-food reservation as correct.
- A unit advertised as direct training is actually conversion-only, or vice versa, and the fixture cannot follow manifest data.
- The fix expands into naval/oil or campaign tech.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

Keep the demo roster and producer allow list in sync. Future additions to `allowedUnitTypes` should be reviewed as a reachability graph: unit -> producer -> producer prerequisites -> required upgrade producer. Keep M10 supply snapshots diagnostic until Plan 016 restores source completion-time food checks.
