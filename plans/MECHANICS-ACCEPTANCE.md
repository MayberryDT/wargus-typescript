# Gameplay Mechanics Acceptance Matrix

This is the shared player-visible contract for plans 011–017. It prevents a
plan from declaring success because TypeScript compiles or a source-fragment
verifier passes. Each executor runs the scenarios assigned to its plan, records
an evidence packet, and replays the critical scenarios from completed upstream
plans before marking its own plan DONE.

## Reproducibility rules

- Use the Codex in-app Browser for manual browser work.
- Use `http://127.0.0.1:5173/?smoke=1&demoSeed=<seed>` unless a scenario names a different URL.
- Record commit SHA, seed, source speed, difficulty, viewport, simulation tick
  at start/end, and wall-clock duration.
- Use a 1280×720 viewport for the primary run. Repeat UI/input scenarios at
  1024×768. Repeat pacing scenarios with every seed named below.
- Do not use cheats in the primary run. Fixture-assisted replay is allowed only
  for the explicitly marked setup portion; the action and result must execute
  through normal simulation commands.
- A black automation capture without a corresponding visible runtime failure is
  evidence-tool noise, not a gameplay failure. Record it separately.

## Shared performance and determinism budgets

- No new `Math.random()`, `Date.now()`, or `crypto.getRandomValues()` under
  `src/**/*.ts`.
- Average update time must remain at or below 20ms; average render time at or
  below 24ms during the fixed-demo acceptance run.
- No unbounded array growth in AI build needs, per-player exploration buffers,
  movement retries, events, or production state.
- Replaying the same scenario seed and action sequence must produce the same
  milestone ordering and final unit/resource counts.

## Scenario matrix

| ID | Plan | Seed / setup | Player action | Required observable result | Evidence |
|---|---|---|---|---|---|
| M01 | 011 | `construction-lifecycle`; one Peasant | Place a distant Hall and retask before arrival; place again, allow arrival, then cancel foundation | Pre-arrival order is unpaid and safely replaceable with no foundation; arrival deducts once/creates 10%; cancel removes it, releases Peasant, refunds 75% | Resources/unit-count/order snapshot before arrival, at arrival, after retask, and after paid cancel |
| M02 | 012 | fixture-assisted 3×1 land corridor | Order rear unit through a friendly blocker; move blocker away | Rear unit retains the order while blocked and reaches destination after clearance | Per-tick order kind/path length, final tile, no empty-path live order |
| M03 | 012 | fixture with blocked target and isolated first ring tile | Click the blocked target | Unit reaches another valid ring tile instead of rejecting the command | Requested tile, candidate tiles, selected final tile/path length |
| M04 | 012 | `formation-five`; five Footmen | Group-move to open ground, then through a base exit | Five distinct destination tiles; no silent order loss, permanent stack, or visible command hitch | Assigned/final tiles, order completion count, update-time sample |
| M05 | 013 | fixture with visible unreachable enemy beside attack-move route | Attack-move beyond the enemy | Unit rejects unreachable aggro and continues to original destination | Target-id transitions and final destination |
| M06 | 013 | fog-boundary Archer/Footman and area-spell fixture | Launch projectile/start area spell, remove sight before impact/pulse | Committed direct/area damage resolves exactly once per intended impact/pulse | HP timeline, projectile/effect ids, visibility timeline |
| M07 | 013 | melee defender, target just outside weapon range | Leave defender idle; repeat with Hold Position | Idle defender chases, attacks, returns within one tile; Hold Position never chases | Origin/max chase/final distance and attack count |
| M08 | 014 | `ai-staged-pressure`; normal difficulty | Observe AI from opening through first three attack declarations | Sleep delays work; 1-unit attack activates before 4, and 4 before 16; Hall is not orphaned | AI script index/force id/attack tick timeline and completed-building counts |
| M09 | 014 | same seed, difficulties 1–5 | Step difficulty and allow one AI think each | Factors are 0.75/1/1/1.2/1.5; switching back resets them; nothing completes instantly | Per-difficulty factor and one build/train duration |
| M10 | 015 | fixture-assisted completed prerequisite tiers | Open advanced pages and complete each production/research path | Church/Altar, Mage Tower/Temple, Inventor/Alchemist are buildable; current advanced units and the four deliberate Inventor/Alchemist additions are reachable through source mechanics | Command-card reason before/after prerequisite, research conversion ids, queue/completion unit ids |
| M11 | 016 | `legibility-queue`; Hall/Farm/Barracks | Inspect 1/0 supply, disabled commands, queue four units, cancel index 2, surround producer | Icons load; Hall warning is clear; reasons are specific; indexed cancellation is correct; blocked exit reports and clears | Screenshot set, queue/resource/supply snapshots, console warning scan |
| M12 | 016 | soldier + Hall; stationary cursor over build preview | Shift-drag mixed objects; pan camera without moving mouse | Selection remains valid; build/hover world point tracks camera beneath stationary cursor | Selected type ids and pointer world/screen coordinates before/after pan |
| M13 | 017 | `pace-a`, `pace-b`, `pace-c`; default difficulty | Run economy-first and pressure-first openings | Honest selected pace, no unit-speed mutation, Hall/first unit/contact inside accepted windows across seeds | Milestone table, start distance, telemetry budgets, final recommendation |

## Cross-plan regression replay

Before a plan is marked DONE, replay these completed-upstream scenarios:

| Completing plan | Replay |
|---|---|
| 011 | M01 |
| 012 | M01, M02–M04 |
| 013 | M02, M04–M07 |
| 014 | M01, M04, M07–M09 |
| 015 | M01, M10 |
| 016 | M01, M04, M10–M12 |
| 017 | M01–M13 (fixture-assisted scenarios may use their normal fixture setup) |

## Evidence packet template

Each executor creates or updates `plans/evidence/NNN.md`:

```markdown
# Plan NNN Evidence

- Commit: `<sha>`
- Branch: `<branch>`
- Date/time zone: `<ISO timestamp and zone>`
- In-scope diff: `<git diff --stat output>`

## Baseline reproduction

| Scenario | Seed | Before behavior | Evidence |
|---|---|---|---|

## After behavior

| Scenario | Seed | Result | Tick/wall time | Evidence |
|---|---|---|---|---|

## Budgets

- Determinism scan: PASS/FAIL
- Average update/render: `<ms>/<ms>`
- Asset gate when applicable: PASS/FAIL/N/A

## Residual risk

- `<specific risk or none>`

## Review decision

- READY / NOT READY
- Reviewer: `<human or reviewing agent>`
- Reason: `<one sentence>`
```

The evidence file contains summaries and local artifact paths, not binary
screenshots, generated attachments, raw browser logs, or credentials.

## Roadmap exit gate

The mechanics roadmap is complete only when:

- every plan row 011–017 is DONE;
- every evidence packet records READY;
- M01–M13 pass on the integrated branch;
- M13 meets its pacing and performance budgets for all three seeds;
- no plan's residual-risk section contains an unresolved release blocker;
- a final human play session can build, expand, fight staged AI pressure, and
  reach the advertised advanced units without a silent order/state failure.
