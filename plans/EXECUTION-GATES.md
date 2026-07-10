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

## Critical path and safe concurrency

```text
011 construction ─┬─> 015 tech reachability ──────────────┐
                  └─> 012 movement -> 013 combat ─────────┼─> 014 AI -> 016 legibility -> 017 pacing
                                                         ┘
```

- Plans 012 and 015 may run concurrently after 011 because their runtime source
  scopes do not overlap. Merge 015 before 014.
- Plan 013 waits for 012.
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
| `src/main.ts` | 011 -> 012 -> 013 -> 014 -> 016 -> 017 |
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
