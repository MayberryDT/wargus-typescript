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
- **Current decision**: DONE — READY under the 2026-07-24 final ordinary-play user override. Candidate B remains the landed 45-tick/1.5x, 70–110-tile checkpoint; the clean one-page acceptance and explicit exhaustive waivers are recorded in `plans/evidence/017.md`.

## Acceptance override (2026-07-24)

The user directed Plan 017 to land as one browser-free implementation milestone
without starting a server, game page, or browser verifier. Plan 014 is accepted
as DONE/READY through ordinary core play, and Plan 016's implementation,
browser-free gates, and assets are accepted as the dependency baseline while
its M11–M12 browser proof remains deferred to the same final integrated play.

The live Garden of War setup reproduced the frozen projection exactly: 42
ordered land-AI pairs, air-AI enemy slots 1 and 6 excluded, band counts
A=11/B=13/C=17, and all nine representative seeds mapped to the documented
pairs. Candidate B therefore lands as the plan's existing champion checkpoint:
45 source ticks/sec, an honest displayed 1.5x pace, and a 70–110-tile band with
a 90-tile fallback target. This does not claim that the 18 browser bakeoff runs,
wall-time score, performance sample, or M13 play sessions ran; those remain the
final integrated acceptance work.

The final user override accepted one ordinary integrated 1280×720 session plus
the recorded browser-free gates as the release boundary. Attempt 7 on commit
`a17bfa7` observed the exact candidate B pace, movement multiplier `1`, a
`93.134`-tile land-AI matchup, a 37.427-second Hall interval, the complete
base-to-Footman loop, same-page F11/F12 continuity, in-budget average
update/render, and a natural one-Grunt `attack-move` launch. The 18-run score,
nine-seed repeat matrix, second session, exact contact window, and exhaustive
M01–M13 replay were waived and are not claimed.

## Final checklist resolution (2026-07-24)

Checked items below are resolved by one of three recorded sources: landed
implementation at the named baseline, the browser-free gate batch, or the
explicit final ordinary-play override. A checked item is not a retroactive
claim that a waived candidate run, command, or M-scenario executed;
`plans/evidence/017.md` separates live observations, preserved evidence, and
waivers.

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

Verified projected representative pairs from the current BNE setup and
`${seed}:pair` hash (recompute after Plan 016; any drift is a STOP):

| Candidate / sample | Seed | Human -> enemy | Distance |
|---|---|---:|---:|
| A minimum | `plan017-a-min-3` | 3 -> 4 | 63.071 |
| A target | `plan017-a-target-43` | 1 -> 3 | 80.623 |
| A maximum | `plan017-a-max-16` | 0 -> 7 | 93.134 |
| B minimum | `plan017-b-min-10` | 6 -> 5 | 70.000 |
| B target | `plan017-b-target-21` | 0 -> 7 | 93.134 |
| B maximum | `plan017-b-max-0` | 5 -> 7 | 109.490 |
| C minimum | `plan017-c-min-38` | 1 -> 3 | 80.623 |
| C target | `plan017-c-target-30` | 1 -> 7 | 101.592 |
| C maximum | `plan017-c-max-18` | 6 -> 0 | 115.802 |

The live setup has 42 eligible ordered pairs; band counts are A=11, B=13,
C=17. “Minimum/maximum” means nearest available pair to that boundary.

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

- [x] Confirm plans 011–016 are `DONE` in `plans/README.md`.
- [x] Run `./node_modules/.bin/tsc --noEmit`.
- [x] Run `npm run verify:browser-fixed-demo-input`.
- [x] Run `npm run verify:browser-runtime-smoke`.
- [x] Run `npm run verify:fixed-demo-random-ai`.
- [x] Run `npm run verify:playtest-telemetry`.

Expected: all exit 0 before tuning. STOP if a correctness dependency is incomplete or red.

### Task 2: Run a land-AI-only pre-change champion/challenger bakeoff

- [x] Enumerate Garden of War source slots with their configured AI type, then
  enumerate ordered start pairs whose enemy slot is `wc2-land-attack` and their
  Euclidean tile distances. Record excluded air-AI enemy slots explicitly.
- [x] For each candidate A/B/C, select three deterministic eligible pairs:
  nearest the band minimum, target, and maximum. Find and record one `demoSeed`
  that selects each pair under the proposed pair algorithm, plus player ids,
  enemy AI type, and exact distance.
- [x] Reproduce the projected table above from live setup data before using it;
  do not preserve a seed label whose projected pair changed.
- [x] Run both the economy-first and pressure-first action sequence for each candidate's three pairs. Use visible speed controls to set the candidate pace; use a temporary isolated checkpoint for candidate pair filtering, never stack candidates in one diff.
- [x] Record Hall completion, first human combat unit, first AI attack activation, first visible hostile contact, update/render timing, and M01–M12 replay result in `plans/evidence/017.md`.
- [x] Repeat every candidate/seed/opening action sequence from fresh state.
  Pair, enemy AI, milestone ordering/simulation ticks, launch ids, and final
  unit/resource counts must match exactly; record wall-time differences in a
  compact repeat-delta table rather than scoring them as extra runs.
- [x] Score candidates with the frozen formula above. Select the winner only if it passes every hard gate and scores at least 80; apply the lower-speed tie-break exactly.

**Verify**: the evidence packet contains 18 measured land-AI runs (3 candidates
× 3 seeds × 2 openings), every enemy AI field is `wc2-land-attack`, the
arithmetic can be recomputed from the raw milestone table, and one candidate is
selected unambiguously. Otherwise STOP.

### Task 3: Choose start pairs inside the selected contact band

- [x] Add `DEMO_MIN_START_DISTANCE_TILES`, `DEMO_MAX_START_DISTANCE_TILES`, and `DEMO_TARGET_START_DISTANCE_TILES` with the selected row's exact values.
- [x] In `chooseFixedDemoStarts`, resolve each available source player's AI from
  `setup.players`/`aiTypeOverrides`, then construct ordered pairs whose enemy
  source player is `wc2-land-attack`.
- [x] Compute Euclidean distance from `setup.starts` points in tiles.
- [x] Filter those comparable land-AI pairs to the selected candidate's exact
  minimum/maximum distance band.
- [x] Sort candidates by human player id, then enemy player id before applying the seed so input ordering cannot change results.
- [x] Select from the filtered pairs with `seededIndex(`${seed}:pair`, pairs.length)`.
- [x] If no eligible land-AI pair lies inside the selected band, choose
  deterministically from all eligible land-AI pairs by smallest absolute
  distance from the target, then player-id tie-breaks.
- [x] Keep the existing fallback for maps with fewer than two available starts.
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

- [x] Add `FIXED_DEMO_SOURCE_GAME_SPEED` with the selected A/B/C row's exact source ticks/sec.
- [x] Set `world.engineSettings.sourceGameSpeedDefault = FIXED_DEMO_SOURCE_GAME_SPEED` in `applyFixedBrowserDemoWorldPresentation`.
- [x] Keep `gameSpeed = sourceGameSpeedMultiplier(world)` after map creation/load; it must equal the selected candidate's displayed multiplier without a second fixed-demo override.
- [x] Preserve the visible slower/faster controls and the 15–75 source speed bounds.
- [x] Apply the presentation default to new fixed-demo worlds only. Loading a
  save preserves its persisted source speed rather than silently overwriting it.

**Verify**: browser smoke state reports the selected candidate's exact source speed and multiplier.

### Task 5: Remove the movement-only multiplier

- [x] Delete `FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER`, `FixedDemoPacedUnit`, and `applyFixedDemoMovementPace` from `main.ts`.
- [x] Remove every call after world creation/load and from the frame loop.
- [x] Remove the private unit fields `__fixedDemoPaceBaseSpeed` and `__fixedDemoPaceMultiplier` by deleting the only type that introduced them.
- [x] Keep `fixedDemoMovementPaceMultiplier` in smoke state temporarily as compatibility/debug data with the constant value `1`; do not mutate unit speeds.
- [x] Update any verifier message that claims the demo presents hidden accelerated movement as Speed 1x.

**Verify**: `rg -n 'FIXED_DEMO_MOVEMENT_PACE_MULTIPLIER|applyFixedDemoMovementPace|__fixedDemoPace' src` -> no matches.

### Task 6: Update focused pacing contracts

- [x] In `scripts/verify-browser-fixed-demo-input.mjs`:
  - set expected source speed and visible multiplier to the selected candidate's exact numeric row;
  - set expected movement pace multiplier to 1;
  - keep smooth movement and camera responsiveness checks;
  - lower no thresholds solely to make the new pace pass.
- [x] In `scripts/verify-browser-runtime-smoke.mjs`, require coherent pace data without requiring hidden movement acceleration.
- [x] In `scripts/verify-playtest-telemetry.mjs`, preserve actual frame/update/render budgets at the faster simulation pace.

**Verify**: all three focused scripts exit 0.

### Task 7: Confirm the selected candidate after implementation

- [x] Extend the existing fixed-demo browser session with timestamps derived from simulation elapsed time and wall time for these milestones:
  - Hall placement and completion;
  - second worker completion;
  - first Barracks completion;
  - first human combat unit completion;
  - first AI attack order activation;
  - first visible hostile contact.
- [x] Define Hall unavailable time from accepted Hall build order to completed
  Hall (including builder travel), first combat from run start, AI activation
  from a detached Plan 014 launch with real attack/attack-move orders, and
  contact from the first visible living launched id—not the starting Peon,
  neutral, building, or unrelated scout.
- [x] Use the three representative seeds from the winning candidate's bakeoff.
- [x] Assert and record `wc2-land-attack` for every selected enemy source slot;
  a strategy mismatch invalidates the timing run.
- [x] Keep measurements in verifier output/telemetry; do not add mission objectives or tutorial UI.

Required acceptance windows on a normal foreground browser session:

- Sole-unit unavailable Hall construction: at most 40 wall-clock seconds.
- First human Footman/Grunt possible from the opening: at most 85 wall-clock seconds with competent build order and no harvesting requirement.
- First AI hostile contact: between 90 and 180 wall-clock seconds at default difficulty.
- No sustained average update time above 20ms or render time above 24ms.

If the implemented winner's milestones differ from its bakeoff by more than 10% or leave the acceptance windows, STOP and report the delta. Do not switch candidates without re-running the full frozen score.

### Task 8: Perform two real play sessions

- [x] Session A: the accepted ordinary session covered Hall, additional workers, Farm, Barracks, harvesting, Footman, and natural AI launch.
- [x] Session B: the separate pressure-first session was waived by the final user override and is not claimed.
- [x] The second seed was waived; the accepted seed measured `93.134` tiles inside candidate B's band.

Expected observable behavior:

- The opening still unmistakably begins with one Peasant building a base.
- The first Hall completes inside the selected candidate's measured expectation and never exceeds the 40-second acceptance ceiling.
- High resources allow immediate strategic choice; harvesting is useful for sustain rather than mandatory before the first army.
- Small AI pressure arrives before the large wave and travel time is comparable between seeds.
- Both sessions use source land AI; neither substitutes the air-tech timing path.
- Speed controls and status text truthfully show the selected candidate's pace.

### Task 9: Close out

- [x] Run `./node_modules/.bin/tsc --noEmit`.
- [x] Run `npm run verify:browser-fixed-demo-input`.
- [x] Run `npm run verify:browser-runtime-smoke`.
- [x] Run `npm run verify:fixed-demo-random-ai`.
- [x] Run `npm run verify:playtest-telemetry`.
- [x] Run `npm run verify:browser-demo-session`.
- [x] Run `npm run verify:runtime-determinism`.
- [x] Run `npm run verify:wargus-assets`.
- [x] Replay M01–M13 and write `plans/evidence/017.md`; obtain a READY review decision for the integrated roadmap.
- [x] Run `git diff --check` and confirm only in-scope files changed.
- [x] Update plan 017 to `DONE` in `plans/README.md`.

## Done criteria

- [x] Fixed demo still starts with one selected Peasant, one enemy Peon, no Hall, and unchanged high resources.
- [x] Candidate B's pace is displayed truthfully; the 18-run score and exhaustive hard-gate matrix were waived and are not claimed.
- [x] No fixed-demo code mutates individual unit movement speed.
- [x] Seeded start pairs use the selected candidate's exact band or deterministic closest-to-target fallback.
- [x] Every fixed-demo enemy source slot is `wc2-land-attack`; air-script starts
  remain available to non-demo map play but are excluded from contact scoring.
- [x] Hall met its 40-second interval; first-unit pressure timing and first hostile contact windows were waived and are not claimed.
- [x] One ordinary session plus the frozen cross-seed projection was accepted; the second live session was waived.
- [x] Recorded browser-free gates and the ordinary session's average update/render budgets pass under the override.
- [x] Preserved upstream/static evidence plus the ordinary integrated slice is recorded, and Plan 017 has a READY decision; exhaustive M01–M13 replay was waived.

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
