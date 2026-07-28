# Plan 027: Repair Drifted Verification Gates

> **Executor instructions:** Execute this Wave 0 repair in an isolated Halla
> worktree. Preserve all existing assertions except the two stale
> `verify:fixed-demo-polish` source fragments identified below. Do not make
> gameplay or UI changes. Stop on every STOP condition.
>
> **Drift check (run first):**
> `git diff --stat 4c94af0c16813bf53fc488c95ed0445b639389c8..HEAD -- scripts/verify-source-resource-ui.mjs scripts/verify-fixed-demo-polish.mjs scripts/verify-source-pathfinding.mjs scripts/verify-browser-native-viewport.mjs scripts/verify-browser-runtime-smoke.mjs src/simulation/orders.ts src/main.ts src/view/resourceUiAtlas.ts src/view/renderHud.ts package.json plans/027-repair-drifted-verification-gates.md plans/README.md`
> Run both red baseline commands in Step 1. If their failure shape differs,
> STOP and reconcile the current contract before editing.

## Status

- **Wave:** 0 — Foundation repair
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM — verifier contract replacement
- **Depends on:** none
- **Category:** tests, portability, dx
- **Planned at:** commit `4c94af0c16813bf53fc488c95ed0445b639389c8`, 2026-07-28

## Why this matters

The full verification gate is red for two infrastructure reasons, not because
the accepted product behavior has been reopened. `verify:source-resource-ui`
uses Tyler's workstation-only Stratagus path, and `verify:fixed-demo-polish`
requires two implementation spellings that no longer represent the current
module contracts. This plan makes both gates truthful and portable without
weakening their behavior coverage.

## Current state

At `4c94af0c16813bf53fc488c95ed0445b639389c8`:

- `npm run verify:source-resource-ui` throws `ENOENT` opening
  `/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/ui/mouse.cpp` from line 95 of
  `scripts/verify-source-resource-ui.mjs`.
- `npm run verify:fixed-demo-polish` fails exactly two assertions: “Movement
  should continue to consult passability before entering a tile.” and “Browser
  startup should render a full-screen loading layer.”
- The first stale assertion requires an old `isTilePassable(...)` spelling in
  `stepMoveOrder`; `verify:source-pathfinding` now establishes the current
  contract: the live move step uses
  `isUnitFootprintPassable(...)` at both movement gates and no longer invokes
  `isTilePassable` there.
- The second requires `const loadingLayer = new Container();`, while
  `src/main.ts` now creates `loadingLayer` with `createTrackedContainer()` and
  keeps the structured `LoadingScreenState`, `loadingProgress`, and
  `showLoadingError` behavior.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Red source-root baseline | `npm run verify:source-resource-ui` | before repair: ENOENT under `/home/tyler/.../stratagus-src/src/ui/mouse.cpp` |
| Red stale-contract baseline | `npm run verify:fixed-demo-polish` | before repair: exactly the two named failures |
| Original-source preflight | `test -n "$WARGUS_ORIGINAL_SOURCE_ROOT" && test -r "$WARGUS_ORIGINAL_SOURCE_ROOT/src/ui/mouse.cpp" && test -r "$WARGUS_ORIGINAL_SOURCE_ROOT/src/ui/interface.cpp" && test -r "$WARGUS_ORIGINAL_SOURCE_ROOT/src/ui/mainscr.cpp"` | exits 0 or fails explicitly before assertions |
| Affected verifier set | `npm run verify:source-resource-ui && npm run verify:fixed-demo-polish && npm run verify:source-pathfinding && npm run verify:browser-runtime-smoke && npm run verify:browser-native-viewport && npm run verify:modern-hud-layout` | all pass after repair |
| Historical-contract revalidation | `npm run verify:source-resource-ui && npm run verify:fixed-demo-polish && npm run verify:source-pathfinding && npm run verify:browser-native-viewport && npm run verify:modern-hud-layout` | revalidation record names Plans 003, 005, 006, 007, 009, and 010 |

## Scope

**In scope**:

- `scripts/verify-source-resource-ui.mjs` and its original-source root
  preflight;
- `scripts/verify-fixed-demo-polish.mjs`, limited to its two stale assertions;
- existing focused verifier scripts only when needed to express the replacement
  behavior/module contracts;
- a concise `plans/evidence/027.md` closeout and coordinator-owned README row.

**Out of scope**:

- `src/` gameplay, UI, renderer, simulation, asset, or manifest changes;
- removing original-source assertions, silently skipping them, or vendoring a
  different source tree without an approved separate decision;
- rewriting unrelated static source-fragment assertions;
- package-wide verification-policy changes.

## Git workflow

- Work from the accepted Wave 0 start in a dedicated worktree.
- Make one focused portability checkpoint and one focused stale-contract
  checkpoint; do not mix changes to product code.
- Do not mark historical plans newly executed. Record their affected contract
  revalidation in the Plan 027 evidence packet.

## Shared interfaces and ownership

- The Halla execution policy governs any browser process started by the runtime
  smoke revalidation. Use its inspected ports and exact-owned-PID cleanup.
- Plan 027 owns these two red gates. Plans 003, 005, 006, 007, 009, and 010
  remain historical records; this plan records only whether their still-relevant
  verifier contracts revalidate.
- `WARGUS_ORIGINAL_SOURCE_ROOT` is the one configurable Halla root. The verifier
  resolves only `src/ui/mouse.cpp`, `src/ui/interface.cpp`, and
  `src/ui/mainscr.cpp` beneath it; it must not retain a `/home/tyler` fallback.
- The Wave coordinator owns package/index integration. Do not alter the
  performance acceptance contract.

## Steps

### Step 1: Capture both failures unchanged

Run the two baseline commands and save their complete output. Confirm the
source-resource failure is the stated ENOENT path and fixed-demo polish reports
exactly the two stated stale assertions. If either gate passes, fails
differently, or exposes additional stale assertions, STOP.

### Step 2: Make original-source access portable and mandatory

Replace the literal workstation root with the single
`WARGUS_ORIGINAL_SOURCE_ROOT` configuration. Before reading a source file,
validate that the variable is non-empty and all three required files are
readable. A missing root or file must fail with an actionable message naming
the environment variable and path; it must not turn the assertions into a skip
or pass. Set the root only in the Halla execution environment/evidence record,
never in repository source or a committed credential/config file.

**Verify:** an unset root and a root with one missing file fail explicitly;
the configured Halla root runs every original-source assertion and passes only
when those assertions hold.

### Step 3: Replace exactly two stale fragments with current contracts

In `verify:fixed-demo-polish`, replace only:

1. the old `stepMoveOrder` `isTilePassable(...)` source spelling with the
   module contract that `stepMoveOrder` calls
   `isUnitFootprintPassable(...)` at both live gates and does not directly call
   `isTilePassable`; retain `verify:source-pathfinding` as the behavior-level
   regression gate for blocked movement and whole-unit footprints;
2. the old `new Container()` allocation spelling with the loading-screen
   contract: structured `LoadingScreenState`, a tracked visible loading layer,
   progress rendering, user-facing first-load text, and `showLoadingError`.
   Revalidate it through the runtime/browser smoke surface rather than requiring
   one constructor spelling.

Do not alter any other expectation in the fixed-demo verifier.

**Verify:** the diff shows exactly two replaced assertions in that script;
`verify:source-pathfinding` and the focused browser checks prove the retained
movement and loading behavior.

### Step 4: Revalidate affected historical contracts

Record the focused result for each affected historical plan:

- Plan 003: source-resource gate remains part of the verified project gate.
- Plan 005: fixed-demo verifier contract is truthful again.
- Plan 006: source pathfinding verifies the orders extraction seam.
- Plan 007: runtime smoke runs under the current process policy.
- Plan 009: browser native viewport/harness contract remains valid.
- Plan 010: `npm run verify:modern-hud-layout` passes and proves fixed-demo
  polish does not conflict with its primary live layout contract.

Any failure is current drift owned by this plan only if it arises from these
two repairs; otherwise STOP and assign it to the appropriate successor.

## Test plan

- Original-source root unset, unreadable, and valid-root preflight cases.
- Full original-source UI assertions against the configured Halla source root;
  no silent skip branch.
- Fixed-demo movement contract: whole-unit footprint checks at both live gates,
  plus existing blocked-movement pathfinding verification.
- Loading-screen contract: tracked visible layer, progress, first-load copy,
  and user-facing error state, plus runtime/browser smoke.
- Plan 010's primary `npm run verify:modern-hud-layout` gate.
- Regression check that no fixed-demo polish assertion besides the two named
  ones changes.

## Performance acceptance

No performance budget, profile, renderer criterion, or measurement behavior is
changed. Browser runtime smoke is a focused revalidation only and must follow
the Halla policy; it is not a replacement for the performance matrix.

## Evidence contract

Commit `plans/evidence/027.md` with the red baseline output, Halla root
preflight result without secrets, final command output, the two exact replaced
contracts, affected-plan revalidation table, commit, and any unrelated drift.
Keep original-source location details limited to the configured root and
readability results; do not record credentials or shell state. Any generated
browser artifacts follow the Halla policy and stay outside Git.

## Done criteria

- [ ] `verify:source-resource-ui` uses one checked configurable Halla root and
  does not contain or fall back to `/home/tyler`.
- [ ] Original-source assertions cannot silently skip.
- [ ] Only the two named stale fixed-demo assertions are replaced with the
  specified behavior/module contracts.
- [ ] `npm run verify:source-resource-ui` and
  `npm run verify:fixed-demo-polish` both pass.
- [ ] Plans 003, 005, 006, 007, 009, and 010 have a recorded focused
  revalidation result where their current contracts are affected.
- [ ] No gameplay or UI behavior changed.

## STOP conditions

- Either baseline failure differs from the two recorded failures.
- No configured Halla original-source root contains all three required readable
  files.
- Making the root portable would skip, weaken, or replace an original-source
  assertion rather than execute it.
- A proposed fixed-demo change touches any assertion other than the two named
  stale fragments.
- A behavior/module contract cannot distinguish the intended movement or
  loading behavior from a regression.
- An affected historical-contract check fails for a cause outside these two
  gates, or any focused verifier fails twice.

## Rollback

Revert only the unaccepted portability or two-assertion checkpoint. Restore the
previous verifier contract rather than changing product code, and preserve the
red-baseline/evidence record. Do not reset historical plan implementation,
delete source assertions, or alter unrelated browser verifier work.

## Maintenance notes

New source-port verifiers must receive a checked configurable root rather than
a developer-home literal. Static checks should name a stable behavior or module
contract; exact implementation spellings are acceptable only when the spelling
itself is the invariant.
