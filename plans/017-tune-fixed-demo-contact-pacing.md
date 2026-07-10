# Plan 017: Tune The One-Peasant Demo For Faster, Consistent Contact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: This is a gameplay tuning plan after correctness work. Do not start until all dependencies are DONE. Follow the explicit values and acceptance windows; if they fail, stop and report measurements rather than improvising new numbers. Update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/wargus/demoScenario.ts src/main.ts scripts/verify-browser-fixed-demo-input.mjs scripts/verify-browser-runtime-smoke.mjs scripts/verify-fixed-demo-random-ai.mjs scripts/verify-playtest-telemetry.mjs plans/evidence/017.md plans/017-tune-fixed-demo-contact-pacing.md plans/README.md`
> If fixed-demo start selection, game-speed initialization, movement pace, or AI progression changed after the earlier plans, STOP and update the measured current state before tuning.

**Goal:** Preserve the deliberate one-Peasant/no-Hall/high-resource opening while selecting an evidence-backed global pace and start-distance band that reduce dead time and contact variance without a hidden movement-only multiplier.

**Architecture:** First restrict the fixed demo's enemy source slots to the
map's `wc2-land-attack` strategy so contact runs compare like with like. Then
compare three coherent pace/distance candidates, select the highest-scoring
candidate through a frozen milestone rubric, centralize the winner, remove
private unit-speed mutation, and verify it across deterministic seeds.

**Tech Stack:** TypeScript 6 fixed-demo setup/runtime, deterministic seeded selection, PixiJS 8/Vite browser session, playtest telemetry and repo-native browser verifiers.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Start with exactly one selected Peasant and one enemy Peon.
- Start with no Hall and preserve `10,000 gold / 5,000 wood / 5,000 oil`.
- Do not add mission objectives, tutorials, starting armies, or starting buildings.
- Do not change manifest costs or per-unit movement statistics.
- The UI must show the real selected pace; no hidden “Speed 1x” multiplier.
- Deterministic `?demoSeed=` and `?smoke=1` behavior must remain.
- The fixed demo deliberately uses only Garden of War source slots assigned
  `wc2-land-attack`; do not mix the radically later air script into contact
  timing evidence.

---

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/011-protect-construction-lifecycle.md, plans/012-make-movement-orders-reliable.md, plans/013-fix-combat-commitment-and-response.md, plans/014-make-ai-execute-its-strategy.md, plans/015-complete-demo-tech-paths.md, plans/016-make-gameplay-state-legible.md
- **Category**: direction
- **Planned at**: commit `6af2eeb`, 2026-07-10

## Player-visible contract and evidence

- Assigned scenario: M13; integrated replay M01–M13.
- Before: opening/contact time varies widely and movement is secretly 1.3x while the HUD says 1x.
- After: the selected pace is honest and coherent, three seeds land inside the same contact envelope, and no prior mechanic regresses.
- Required handoff: `plans/evidence/017.md`, containing the full integrated scenario summary and final release decision.

## Current state

- `applyFixedBrowserDemoWorldPresentation` sets `sourceGameSpeedDefault = world.tickRate`, producing 1x.
- `main.ts` separately applies `FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER = 1.3` to every mobile unit and exposes the hidden multiplier in smoke state.
- A Town Hall's source time 255 is 51 seconds at 1x; Farm is 20 seconds, Barracks 40 seconds, Peasant 9 seconds, and Footman 12 seconds.
- The previous draft's champion candidate was 45 source ticks/sec (1.5x), which predicts approximately 34s, 13.3s, 26.7s, 6s, and 8s for those actions. This plan now requires it to beat two challengers before landing.
- `chooseFixedDemoStarts` selects human and enemy independently. Previous seeded inspection found start distances from roughly 31 to 151 tiles.
- Garden of War source starts 1 and 6 carry `wc2-air-attack`; the other source
  slots carry `wc2-land-attack`. Current random enemy selection therefore mixes
  incomparable strategy/contact timelines.
- High resources deliberately make harvesting optional during the opening; this plan retains that immediate-play direction.

## Candidate configurations and decision rule

Evaluate exactly these candidates; do not invent a fourth during execution:

| Candidate | Source ticks/sec | Displayed multiplier | Start band | Target distance |
|---|---:|---:|---:|---:|
| A — conservative | 40 | 1.3333x | 60–100 tiles | 80 tiles |
| B — champion | 45 | 1.5x | 70–110 tiles | 90 tiles |
| C — aggressive | 50 | 1.6667x | 80–120 tiles | 100 tiles |

Every candidate uses only eligible `wc2-land-attack` enemy source slots and must
first pass the hard gates: unchanged one-Peasant/high-resource
premise, M01–M12 regression replay, no per-unit pace mutation, deterministic
replay, and shared performance budgets.

Score passing candidates out of 100:

- Hall unavailable time: 25 points when the median is 25–40s; otherwise subtract 2 points per second outside the interval, floor 0.
- First human combat unit: 25 points when the median is 60–85s; otherwise subtract 1 point per second outside, floor 0.
- First visible AI contact: 25 points when every run is 90–180s; otherwise subtract 1 point per second outside across runs, floor 0.
- Cross-seed contact spread: 15 points when max-minus-min is at most 45s; otherwise subtract 1 point per 3 excess seconds, floor 0.
- Performance headroom: 10 points when update/render remain within 20ms/24ms for every run; otherwise the candidate fails the hard gate.

Select the highest score at or above 80. A difference under 2 points is a tie;
choose the lower source speed in a tie. If no candidate reaches 80, STOP and
return the measurements to the user rather than changing costs, resources, or
force sizes.

## Design decision and rollback

- **Rejected:** add workers/buildings or lower source build costs; both erase the intended opening rather than tune it.
- **Rejected:** retain per-unit 1.3x movement under a 1x label; it distorts every movement-relative balance relationship.
- **Chosen:** source-assigned land-AI enemy slots for comparable fixed-demo
  contact, plus a measurement-gated visible global simulation pace and
  deterministic start band. This slot restriction is explicit demo tuning, not
  an original Wargus start-selection rule. Candidate B remains the champion to
  beat, not a foregone conclusion.
- **Rollback trigger:** any M01–M12 regression, sustained performance-budget failure, or first contact outside the accepted window. Return to the previous global speed/start-pair checkpoint and report the milestone breakdown instead of changing force size or resources.

## Scope

**In scope**:

- `src/wargus/demoScenario.ts`
- `src/main.ts`
- `scripts/verify-browser-fixed-demo-input.mjs`
- `scripts/verify-browser-runtime-smoke.mjs`
- `scripts/verify-fixed-demo-random-ai.mjs`
- `scripts/verify-playtest-telemetry.mjs`
- `plans/evidence/017.md` (create during execution)
- `plans/README.md`

**Out of scope**:

- Starting-resource changes
- Manifest time/cost changes
- A per-building first-Hall special case
- New objectives or scripted tutorial steps
- Unit-stat balance
- AI force composition changes after plan 014

## Git workflow

- Suggested branch: `codex/017-fixed-demo-pacing`
- Keep start-pair selection and speed/multiplier removal in separate commits for easier tuning review.
- Do not push or open a PR unless instructed.

## Steps

### Task 1: Confirm the correctness baseline

- [ ] Confirm plans 011–016 are `DONE` in `plans/README.md`.
- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:browser-fixed-demo-input`.
- [ ] Run `npm run verify:browser-runtime-smoke`.
- [ ] Run `npm run verify:fixed-demo-random-ai`.
- [ ] Run `npm run verify:playtest-telemetry`.

Expected: all exit 0 before tuning. STOP if a correctness dependency is incomplete or red.

### Task 2: Run a land-AI-only pre-change champion/challenger bakeoff

- [ ] Enumerate Garden of War source slots with their configured AI type, then
  enumerate ordered start pairs whose enemy slot is `wc2-land-attack` and their
  Euclidean tile distances. Record excluded air-AI enemy slots explicitly.
- [ ] For each candidate A/B/C, select three deterministic eligible pairs:
  nearest the band minimum, target, and maximum. Find and record one `demoSeed`
  that selects each pair under the proposed pair algorithm, plus player ids,
  enemy AI type, and exact distance.
- [ ] Run both the economy-first and pressure-first action sequence for each candidate's three pairs. Use visible speed controls to set the candidate pace; use a temporary isolated checkpoint for candidate pair filtering, never stack candidates in one diff.
- [ ] Record Hall completion, first human combat unit, first AI attack activation, first visible hostile contact, update/render timing, and M01–M12 replay result in `plans/evidence/017.md`.
- [ ] Score candidates with the frozen formula above. Select the winner only if it passes every hard gate and scores at least 80; apply the lower-speed tie-break exactly.

**Verify**: the evidence packet contains 18 measured land-AI runs (3 candidates
× 3 seeds × 2 openings), every enemy AI field is `wc2-land-attack`, the
arithmetic can be recomputed from the raw milestone table, and one candidate is
selected unambiguously. Otherwise STOP.

### Task 3: Choose start pairs inside the selected contact band

- [ ] Add `DEMO_MIN_START_DISTANCE_TILES`, `DEMO_MAX_START_DISTANCE_TILES`, and `DEMO_TARGET_START_DISTANCE_TILES` with the selected row's exact values.
- [ ] In `chooseFixedDemoStarts`, resolve each available source player's AI from
  `setup.players`/`aiTypeOverrides`, then construct ordered pairs whose enemy
  source player is `wc2-land-attack`.
- [ ] Compute Euclidean distance from `setup.starts` points in tiles.
- [ ] Filter those comparable land-AI pairs to the selected candidate's exact
  minimum/maximum distance band.
- [ ] Sort candidates by human player id, then enemy player id before applying the seed so input ordering cannot change results.
- [ ] Select from the filtered pairs with `seededIndex(`${seed}:pair`, pairs.length)`.
- [ ] If no eligible land-AI pair lies inside the selected band, choose
  deterministically from all eligible land-AI pairs by smallest absolute
  distance from the target, then player-id tie-breaks.
- [ ] Keep the existing fallback for maps with fewer than two available starts.
  If the fixed demo map unexpectedly has no land-AI enemy source slot, STOP the
  fixed-demo setup with an explicit diagnostic rather than silently measuring
  the air script as land pressure.

Target data shape:

```ts
type DemoStartPair = {
  human: number;
  enemy: number;
  enemyAi: "wc2-land-attack";
  distanceTiles: number;
};
```

**Verify**: update `scripts/verify-fixed-demo-random-ai.mjs` with the selected
candidate's exact numeric band and enumerate several deterministic seeds. Every
chosen pair must have land AI and lie inside the band when eligible pairs exist.

### Task 4: Set the selected honest global pace

- [ ] Add `FIXED_DEMO_SOURCE_GAME_SPEED` with the selected A/B/C row's exact source ticks/sec.
- [ ] Set `world.engineSettings.sourceGameSpeedDefault = FIXED_DEMO_SOURCE_GAME_SPEED` in `applyFixedBrowserDemoWorldPresentation`.
- [ ] Keep `gameSpeed = sourceGameSpeedMultiplier(world)` after map creation/load; it must equal the selected candidate's displayed multiplier without a second fixed-demo override.
- [ ] Preserve the visible slower/faster controls and the 15–75 source speed bounds.

**Verify**: browser smoke state reports the selected candidate's exact source speed and multiplier.

### Task 5: Remove the movement-only multiplier

- [ ] Delete `FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER`, `FixedDemoPacedUnit`, and `applyFixedDemoMovementPace` from `main.ts`.
- [ ] Remove every call after world creation/load and from the frame loop.
- [ ] Remove the private unit fields `__fixedDemoPaceBaseSpeed` and `__fixedDemoPaceMultiplier` by deleting the only type that introduced them.
- [ ] Keep `fixedDemoMovementPaceMultiplier` in smoke state temporarily as compatibility/debug data with the constant value `1`; do not mutate unit speeds.
- [ ] Update any verifier message that claims the demo presents hidden accelerated movement as Speed 1x.

**Verify**: `rg -n 'FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER|applyFixedDemoMovementPace|__fixedDemoPace' src` -> no matches.

### Task 6: Update focused pacing contracts

- [ ] In `scripts/verify-browser-fixed-demo-input.mjs`:
  - set expected source speed and visible multiplier to the selected candidate's exact numeric row;
  - set expected movement pace multiplier to 1;
  - keep smooth movement and camera responsiveness checks;
  - lower no thresholds solely to make the new pace pass.
- [ ] In `scripts/verify-browser-runtime-smoke.mjs`, require coherent pace data without requiring hidden movement acceleration.
- [ ] In `scripts/verify-playtest-telemetry.mjs`, preserve actual frame/update/render budgets at the faster simulation pace.

**Verify**: all three focused scripts exit 0.

### Task 7: Confirm the selected candidate after implementation

- [ ] Extend the existing fixed-demo browser session with timestamps derived from simulation elapsed time and wall time for these milestones:
  - Hall placement and completion;
  - second worker completion;
  - first Barracks completion;
  - first human combat unit completion;
  - first AI attack order activation;
  - first visible hostile contact.
- [ ] Use the three representative seeds from the winning candidate's bakeoff.
- [ ] Assert and record `wc2-land-attack` for every selected enemy source slot;
  a strategy mismatch invalidates the timing run.
- [ ] Keep measurements in verifier output/telemetry; do not add mission objectives or tutorial UI.

Required acceptance windows on a normal foreground browser session:

- Sole-unit unavailable Hall construction: at most 40 wall-clock seconds.
- First human Footman/Grunt possible from the opening: at most 85 wall-clock seconds with competent build order and no harvesting requirement.
- First AI hostile contact: between 90 and 180 wall-clock seconds at default difficulty.
- No sustained average update time above 20ms or render time above 24ms.

If the implemented winner's milestones differ from its bakeoff by more than 10% or leave the acceptance windows, STOP and report the delta. Do not switch candidates without re-running the full frozen score.

### Task 8: Perform two real play sessions

- [ ] Session A: economy-first—Hall, additional workers, Farm, Barracks, harvesting, first army.
- [ ] Session B: pressure-first—Hall, second worker, Barracks, Farm only as supply requires, first raid.
- [ ] Use two different seeds inside the allowed distance band.

Expected observable behavior:

- The opening still unmistakably begins with one Peasant building a base.
- The first Hall completes inside the selected candidate's measured expectation and never exceeds the 40-second acceptance ceiling.
- High resources allow immediate strategic choice; harvesting is useful for sustain rather than mandatory before the first army.
- Small AI pressure arrives before the large wave and travel time is comparable between seeds.
- Both sessions use source land AI; neither substitutes the air-tech timing path.
- Speed controls and status text truthfully show the selected candidate's pace.

### Task 9: Close out

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:browser-fixed-demo-input`.
- [ ] Run `npm run verify:browser-runtime-smoke`.
- [ ] Run `npm run verify:fixed-demo-random-ai`.
- [ ] Run `npm run verify:playtest-telemetry`.
- [ ] Run `npm run verify:browser-demo-session`.
- [ ] Replay M01–M13 and write `plans/evidence/017.md`; obtain a READY review decision for the integrated roadmap.
- [ ] Run `git diff --check` and confirm only in-scope files changed.
- [ ] Update plan 017 to `DONE` in `plans/README.md`.

## Done criteria

- [ ] Fixed demo still starts with one selected Peasant, one enemy Peon, no Hall, and unchanged high resources.
- [ ] The selected candidate scored at least 80, passed every hard gate, and its pace is displayed truthfully.
- [ ] No fixed-demo code mutates individual unit movement speed.
- [ ] Seeded start pairs use the selected candidate's exact band or deterministic closest-to-target fallback.
- [ ] Every fixed-demo enemy source slot is `wc2-land-attack`; air-script starts
  remain available to non-demo map play but are excluded from contact scoring.
- [ ] Hall, first combat unit, and first hostile contact fall inside the stated acceptance windows.
- [ ] Two play sessions with different seeds feel comparably paced.
- [ ] Focused browser/performance gates pass.
- [ ] M01–M13 evidence is recorded and plan 017 has a READY integrated review decision.

## STOP conditions

- Any correctness plan 011–016 is incomplete.
- A candidate band has fewer than three representative ordered pairs with a
  land-AI enemy slot.
- No candidate scores at least 80 while passing the hard gates.
- First AI contact remains outside 90–180 seconds after plan 014, because the required fix belongs in AI strategy rather than more speed tuning.
- Achieving the target requires lowering resources, adding starting units/buildings, or changing manifest costs.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

This plan intentionally optimizes immediate land-skirmish play with optional
early harvesting because the high-resource premise is deliberate. The land-AI
slot filter is demo-only tuning; do not describe it as an original start rule or
remove the air AI from normal map data. Preserve the bakeoff table, enemy AI
type, and winning score so future pacing changes challenge a measured champion
rather than silently replacing constants.
