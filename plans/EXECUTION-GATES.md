# Gameplay Roadmap Execution And Integration Gates

These gates apply to plans 011–017. They keep risky simulation changes
reviewable, prevent overlapping edits to central files, and stop later tuning
from hiding an upstream mechanics regression.

## Original-game authority

Read `plans/ORIGINAL-WARGUS-SOURCE.md` before changing a mechanic. If a plan
assumption conflicts with the installed game or its installed source, the
original behavior governs unless the user explicitly approves a deliberate
departure. Record the exact runtime observation or installed source path in the
evidence packet.

## Resource-bounded execution

These limits override any plan wording that implies one continuous browser or
playable session:

- Run no live game tab or browser verifier continuously for more than 30
  seconds. Start the wall-clock budget when the game page begins loading, not
  when the first assertion or interaction begins.
- Run one low-priority project process at a time. Do not use parallel agents,
  parallel suites, or simultaneous headless and in-app browsers.
- Split any browser verifier that cannot finish inside 30 seconds into focused,
  deterministic modes that reuse the same assertions. Do not weaken or remove
  the original acceptance assertion to make a shard pass.
- For player-visible progression, use the real F11 Save Game and F12 Load Game
  UI between milestones. Each segment loads the last accepted save, performs
  one bounded milestone through visible controls, saves, closes the tab, stops
  the server, and verifies its ports are clear.
- F12 Load restores the saved world with the battle paused. A segment that must
  advance simulation clicks the visible `Run` control after loading; waiting
  while the control still says `Run` is a no-progress segment and is discarded.
- Before F11, activate the visible `Pause` control or its documented `Space`
  hotkey and assert the runtime is paused. Prefer `Space` after a canvas tap has
  proved unreliable under rendering load. Capture the checkpoint tick after
  pausing so the post-save slot can require exact tick equality without racing
  the running simulation.
- A successful acknowledged gameplay order may automatically resume the fixed
  demo. A setup segment that intends to stay paused must reassert the paused
  state after every issued order; if it resumed, use documented `Space` and
  confirm `paused === true` before the next input or F11.
- Timed coordinates are not sufficient proof that F12 Load or F11 Save applied.
  In the same bounded browser action, use read-only debugger evaluation to
  assert the expected slot JSON before mutation, assert the loaded smoke state
  before issuing gameplay input, assert the target smoke state before F11, and
  assert the new slot JSON after Save. On any mismatch, close without saving.
- Derive checkpoint identity from the slot's map, tick, source speed,
  visibility-player resources, and visibility-player unit records. A live
  map-wide unit count may only be compared with the count captured from that
  same slot; never hard-code it. `selectedUnitTypes` is selection state, and
  smoke `ownedUnitCounts` excludes construction, so neither can prove that a
  foundation exists. Prove construction from the post-F11 player-owned saved
  unit record and its non-null `construction` state.
- Never replay from the opening when an accepted save checkpoint exists. Keep
  checkpoint metadata in the plan evidence packet: starting milestone, ending
  milestone, wall time, source speed, resources, supply, and completed units.
- A segment that is interrupted before its save is observational evidence only;
  it cannot satisfy an acceptance row and must not be treated as resumable.
- A previously observed milestone whose slot is later overwritten remains
  observational evidence but is no longer a resumable acceptance checkpoint;
  reconstruct and re-save it before advancing the progression chain.
- Static inspection, typechecking, and non-browser verifiers may run without a
  browser, but still use the smallest focused command and low scheduler
  priority. Broad suites remain final-integration gates only.

## Critical path and safe concurrency

```text
011 construction -> 012 movement -> 015 tech reachability -> 013 combat -> 014 AI -> 016 legibility -> 017 pacing
```

- Plan 015 follows 012 because its bounded completion-level M10 evidence hook
  now uses `src/main.ts`; this keeps one owner on the shared fixture surface.
- Plan 013 waits for both 012 and 015, then owns the next `src/main.ts` and
  `orders.ts` checkpoint.
- Plan 014 waits for 011, 012, 013, and 015 so AI execution is evaluated only
  after the source-faithful Barracks/Inventor/Alchemist graph is reachable.
- Plan 016 waits for 014 and 015 because it changes the same world/order/save
  types and must explain the final tech graph.
- Plan 017 is the only tuning plan and always lands last.

## Shared-file ownership

Only one active implementation plan may own a hotspot at a time:

| Hotspot | Serialized owners, in order |
|---|---|
| `src/simulation/orders.ts` | 011 -> 012 -> 013 -> 014 -> 016 |
| `src/simulation/world.ts` | 013 -> 014 -> 016 |
| `src/wargus/saveGame.ts` | 013 -> 014 -> 016 |
| `src/view/sourceUiHelpers.ts` | 011 -> 016 |
| `src/main.ts` | 011 -> 012 -> 015 -> 013 -> 014 -> 016 -> 017 |
| `src/wargus/demoScenario.ts` | 015 -> 017 |
| `scripts/verify-fixed-demo-random-ai.mjs` | 011 -> 015 -> 014 -> 017 |
| `scripts/verify-browser-command-card-session.mjs` | 011 -> 015 -> 016 |

If a plan would edit a hotspot owned by an unfinished predecessor, STOP. Do not
resolve the conflict by copying one plan's future implementation into another.

## Per-plan landing protocol

### Gate A — preflight

- Dependency rows are DONE and their evidence packets say READY.
- Working tree is clean except for the current plan branch/worktree.
- Drift check matches current source.
- Assigned baseline scenarios reproduce the documented before behavior.
- Typecheck and focused existing browser gates are green.

Failure action: mark the plan BLOCKED with the exact failing gate. Do not edit.

### Gate B — checkpoint review

After each logical checkpoint named by the plan:

- inspect `git diff --stat` and `git diff --check`;
- confirm only the checkpoint's files/symbols changed;
- run its focused scenario before starting the next checkpoint;
- record new public/runtime interface shapes in the evidence packet;
- commit the checkpoint independently so it can be reverted without removing
  later accepted behavior.

Failure action: correct the current checkpoint once. On a second failure,
restore the last green checkpoint on the plan branch and report; do not stack a
workaround in the next checkpoint.

### Gate C — plan acceptance

- Assigned M-scenarios pass.
- Required upstream scenarios replay successfully.
- Determinism and performance budgets in `MECHANICS-ACCEPTANCE.md` pass.
- Save/load gate passes for plans that change persistent state.
- Asset gate passes for scenario/manifest-facing plans.
- Evidence packet has a READY decision from someone other than the implementer
  when a separate reviewer is available.

Failure action: leave the plan IN PROGRESS or BLOCKED. Never mark DONE because
the code checks pass while the playable contract fails.

### Gate D — integration

After merging a plan into the integration branch:

- rerun its assigned and upstream replay scenarios on the integrated branch;
- verify the next plan's drift check against the new HEAD;
- update the next plan's current-state excerpt only when integration actually
  changed the cited seam;
- do not begin plan 017 until M01–M12 all pass together.

## Rollback triggers

A plan is not ready to integrate when any trigger fires:

- an upstream M-scenario regresses;
- deterministic replay changes without an intentional, documented state change;
- average update/render exceeds 20ms/24ms in the shared acceptance setup;
- save/load drops or corrupts a new state field;
- a command/order can fail silently rather than returning feedback;
- the implementation requires a file explicitly listed out of scope;
- the plan's chosen seam proves false (for example, a “static” blocker can move).

Rollback means removing the current plan's unaccepted checkpoint(s) on its
branch and returning to the last green checkpoint. It does not mean resetting
or rewriting unrelated user work.

## Integration evidence summary

Plan 017's evidence packet contains the final table:

| Plan | Integrated SHA | Assigned scenarios | Upstream replay | Budgets | Residual risk | Decision |
|---|---|---|---|---|---|---|

The roadmap cannot close with a BLOCKED, NOT READY, missing evidence, or
unresolved release-blocker row.
