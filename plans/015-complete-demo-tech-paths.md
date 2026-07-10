# Plan 015: Complete And Extend The Fixed-Demo Advanced Tech Paths — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow the plan and verification gates exactly. This plan completes the existing advertised roster; it does not expand the demo with unrelated naval or campaign content. Update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/wargus/demoScenario.ts scripts/verify-fixed-demo-random-ai.mjs scripts/verify-browser-command-card-session.mjs scripts/verify-browser-train-session.mjs plans/evidence/015.md plans/015-complete-demo-tech-paths.md plans/README.md`
> If the fixed-demo allowed-unit list or advanced build-page behavior changed, STOP and reconcile.

**Goal:** Close the missing producer paths for the fixed demo's current advanced
roster, then deliberately add the four source-faithful Inventor/Alchemist units
with complete player-buildable paths from the one-Peasant opening.

**Architecture:** Use the existing manifest buttons, dependency rules, build mappings, production functions, and unrestricted demo upgrade list. Add only the scenario allow-list producer links missing from the existing reachability graph.

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

---

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/011-protect-construction-lifecycle.md
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

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:fixed-demo-random-ai`.
- [ ] Run `npm run verify:browser-command-card-session`.
- [ ] Run `npm run verify:browser-train-session`.

Expected: all exit 0. These commands do not currently prove the missing producer path; that gap is what this plan adds.

- [ ] Confirm each missing producer above exists in `public/wargus/manifest.json` with a build button and the expected train/research buttons.

Expected: all six producer definitions and their source-faithful unit buttons
exist. If any definition or button is absent from the manifest, STOP; the work
is no longer a scenario allow-list fix.

### Task 2: Complete the fixed-demo allow list

- [ ] Add the six missing producer type ids to `allowedUnitTypes` in `applyFixedBrowserDemoSetup`.
- [ ] Place human entries beside the other human buildings and orc entries beside their counterparts.
- [ ] Do not alter `demoUnits`, starting resources, or `allowedUpgradeTypes`.

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

- [ ] Update `scripts/verify-fixed-demo-random-ai.mjs` to assert all six producer ids are present in the fixed-demo allow list.
- [ ] Keep its one-Peasant, high-resource, randomized-start, and source-AI assertions unchanged.
- [ ] Do not encode prerequisite logic in this static verifier; browser scenarios own behavior.

**Verify**: `npm run verify:fixed-demo-random-ai` -> exits 0.

### Task 4: Exercise advanced build command cards

- [ ] Extend the existing fixture matrix in `scripts/verify-browser-command-card-session.mjs` rather than creating a parallel command-card harness.
- [ ] For a completed Keep/Castle-era Peasant fixture, assert the advanced page exposes enabled source build commands for Church, Mage Tower, and Inventor when their source dependencies are satisfied.
- [ ] Repeat with an Orc fixture for Altar, Temple, and Alchemist.
- [ ] Assert the commands are disabled before their source prerequisites are satisfied; do not bypass dependencies to make the buttons green.

**Verify**: `npm run verify:browser-command-card-session` -> exits 0 and reports six advanced producer commands.

### Task 5: Exercise production and conversion paths

- [ ] Extend `scripts/verify-browser-train-session.mjs` with data-driven fixtures using the existing fixture hooks:
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
- [ ] For Paladin/Ogre Mage, verify both halves of the source mechanic:
  research completion converts an existing Knight/Ogre, and the upgraded unit
  becomes directly trainable from the Barracks afterward. Do not expect a
  Church/Altar production queue.
- [ ] For each directly trained unit, verify resource deduction, queue progress, completion, spawn, and supply reservation/release using the existing train-session conventions.

**Verify**: `npm run verify:browser-train-session` -> exits 0 and reports all
ten source-faithful advanced paths.

### Task 6: Perform the playable progression session

- [ ] Start the fixed demo at 2x through the visible speed control only for the duration of this acceptance session.
- [ ] From one Peasant, build through Keep/Castle and produce at least one
  Paladin, Mage, Ballista, Flying Machine, and Dwarves.
- [ ] Use an Orc fixture or deterministic AI observation to confirm Catapult,
  Ogre Mage, Death Knight, Zeppelin, and Goblin Sappers through the mirrored
  Altar/Temple/Alchemist paths.

Expected observable behavior:

- Every current advertised advanced unit has a visible, comprehensible path,
  and the four deliberate Inventor/Alchemist additions are likewise usable.
- No advanced button remains permanently disabled once its true prerequisites are completed.
- Advanced units enter the normal production queue and spawn like existing units.

### Task 7: Close out

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:fixed-demo-random-ai`.
- [ ] Run `npm run verify:browser-command-card-session`.
- [ ] Run `npm run verify:browser-train-session`.
- [ ] Run `npm run verify:wargus-assets`.
- [ ] Replay M01 and record M10 in `plans/evidence/015.md`; obtain a READY review decision.
- [ ] Run `git diff --check` and confirm only in-scope files changed.
- [ ] Update plan 015 to `DONE` in `plans/README.md`.

## Done criteria

- [ ] All six missing advanced producer buildings are allowed in the fixed demo.
- [ ] Human and Orc advanced build cards expose the producers at the correct tech tier.
- [ ] Paladin/Ogre Mage, Mage/Death Knight, Ballista/Catapult, Flying
  Machine/Zeppelin, and Dwarves/Goblin Sappers complete through their original
  production/research mechanics.
- [ ] The one-Peasant/no-Hall/high-resource start remains unchanged.
- [ ] No manifest or asset files changed.
- [ ] Focused browser scenarios and playable progression session pass.
- [ ] M01/M10 evidence is recorded and plan 015 has a READY review decision.

## STOP conditions

- Any missing producer lacks manifest art, buttons, or production definitions.
- Reaching an advertised unit requires bypassing source dependency rules.
- A unit advertised as direct training is actually conversion-only, or vice versa, and the fixture cannot follow manifest data.
- The fix expands into naval/oil or campaign tech.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

Keep the demo roster and producer allow list in sync. Future additions to `allowedUnitTypes` should be reviewed as a reachability graph: unit -> producer -> producer prerequisites -> required upgrade producer.
