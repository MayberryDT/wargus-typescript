# Plan 027: Repair Drifted Verification Gates

> **Executor instructions:** Execute this Wave 0 repair in an isolated Halla
> worktree. Preserve all existing assertions except the two stale
> `verify:fixed-demo-polish` source fragments identified below. Do not make
> gameplay or UI changes. Stop on every STOP condition.
>
> **Drift check:** Run both inventories below first.
>
> **Editable surfaces:**
> `git diff --stat 4c94af0c16813bf53fc488c95ed0445b639389c8..HEAD -- scripts/verify-source-resource-ui.mjs scripts/verify-fixed-demo-polish.mjs`
>
> **Read-only dependency drift check:**
> `git diff --stat 4c94af0c16813bf53fc488c95ed0445b639389c8..HEAD -- scripts/verify-source-pathfinding.mjs scripts/verify-browser-native-viewport.mjs scripts/verify-browser-runtime-smoke.mjs scripts/verify-modern-hud-layout.mjs scripts/browser-smoke-harness.mjs src/simulation/orders.ts src/main.ts src/view/resourceUiAtlas.ts src/view/renderHud.ts package.json plans/027-repair-drifted-verification-gates.md plans/README.md`
> Run both red baseline commands in Step 1. If their failure shape differs,
> STOP and reconcile the current contract before editing. The Plan 027 branch
> may not edit a read-only dependency to reconcile drift.

## Status

- **Status:** TODO
- **Wave:** 0 — Foundation repair
- **Priority:** P0
- **Effort:** M
- **Risk:** MEDIUM — verifier contract replacement
- **Depends on:** none for its two branch checkpoints; accepted and
  coordinator-integrated Plan 026 before browser revalidation and closeout
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
| Branch-local green set | `npm run verify:source-resource-ui && npm run verify:fixed-demo-polish && npm run verify:source-pathfinding` | both owned gates and the read-only pathfinding contract pass without a browser |
| Browser listener preflight after Plan 026 integration | `ss -ltnp` then set `PLAN027_RUNTIME_PORT` to one recorded unused concrete port | the integrated controller validates/reserves this runtime candidate and allocates distinct remaining server/debug ports |
| Coordinator post-integration revalidation | `WARGUS_BROWSER_RUNTIME_PORT="${PLAN027_RUNTIME_PORT:?set a controller-inspected unused port}" npm run verify:browser-runtime-smoke && npm run verify:browser-native-viewport && npm run verify:modern-hud-layout` | all read-only browser gates pass through the integrated Plan 026 controller; allocation and cleanup ledgers are recorded |
| Historical-contract revalidation | branch-local green set plus coordinator post-integration revalidation | evidence names Plans 003, 005, 006, 007, 009, and 010 |

## Scope

**In scope**:

- `scripts/verify-source-resource-ui.mjs` and its original-source root
  preflight;
- `scripts/verify-fixed-demo-polish.mjs`, limited to its two stale assertions;
- branch-local red/green output for those exact edits; and
- a concise `plans/evidence/027.md` closeout.

**Out of scope**:

- `src/` gameplay, UI, renderer, simulation, asset, or manifest changes;
- removing original-source assertions, silently skipping them, or vendoring a
  different source tree without an approved separate decision;
- rewriting unrelated static source-fragment assertions;
- editing `scripts/verify-source-pathfinding.mjs`, any `verify-browser-*.mjs`,
  `scripts/verify-modern-hud-layout.mjs`, the browser harness/controller, or
  `src/`; those are read-only gates or Plan 026-owned migration surfaces;
- editing `package.json` or `plans/README.md`; both are coordinator-owned
  integration surfaces; and
- package-wide verification-policy changes.

## Git workflow

- Work from the accepted Wave 0 start in a dedicated worktree.
- Make one focused portability checkpoint and one focused stale-contract
  checkpoint; do not mix changes to product code.
- Before acceptance, prove the branch diff contains only the two owned scripts
  and `plans/evidence/027.md`. Any other implementation path is a STOP.
- Do not mark historical plans newly executed. Record their affected contract
  revalidation only after the coordinator has integrated Plan 026 first.

## Shared interfaces and ownership

- Plan 026 exclusively owns the shared browser controller, harness, every
  browser verifier server/debug-port migration, and exact-owned-PID cleanup.
  Plan 027 never edits those surfaces and runs no browser gate before Plan 026
  is accepted and coordinator-integrated.
- For final coordinator revalidation, inspect listeners, record one unused
  `PLAN027_RUNTIME_PORT`, and pass it through the integrated controller's
  validated `WARGUS_BROWSER_RUNTIME_PORT` requested-candidate interface. The
  controller owns all other allocations and cleanup. No hard-coded modern-HUD
  port or pre-integration browser process is permitted.
- Plan 027 owns these two red gates. Plans 003, 005, 006, 007, 009, and 010
  remain historical records; this plan records only whether their still-relevant
  verifier contracts revalidate.
- `WARGUS_ORIGINAL_SOURCE_ROOT` is the one configurable Halla root. The verifier
  resolves only `src/ui/mouse.cpp`, `src/ui/interface.cpp`, and
  `src/ui/mainscr.cpp` beneath it; it must not retain a `/home/tyler` fallback.
- The Wave coordinator integrates accepted Plan 026 before final Plan 027
  browser/historical revalidation, and alone owns package/index integration.
  Do not alter the performance acceptance contract.

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
   Retain runtime/browser smoke as a read-only post-integration revalidation
   surface rather than requiring one constructor spelling.

Do not alter any other expectation in the fixed-demo verifier.

**Verify:** the diff shows exactly two replaced assertions in that script and
no edit to `verify:source-pathfinding` or a browser/controller surface. The
branch-local source-pathfinding gate proves movement behavior; browser behavior
is proven later by the coordinator after Plan 026 integration.

### Step 4: Revalidate affected historical contracts

First prove Plan 026 is accepted and coordinator-integrated. Only the
coordinator then runs the listener preflight and read-only browser gates. Use
the explicit `WARGUS_BROWSER_RUNTIME_PORT` requested-candidate value from the
command table for runtime smoke; record the concrete inspected port, the
controller's complete server/debug allocation ledger, exact-owned-PID cleanup,
and clear owned ports after exit. STOP rather than touching an existing owner.

Record the focused result for each affected historical plan:

- Plan 003: source-resource gate remains part of the verified project gate.
- Plan 005: fixed-demo verifier contract is truthful again.
- Plan 006: source pathfinding verifies the orders extraction seam.
- Plan 007: runtime smoke runs under the current process policy.
- Plan 009: browser native viewport/harness contract remains valid.
- Plan 010: `npm run verify:modern-hud-layout` passes and proves fixed-demo
  polish does not conflict with its primary live layout contract.

Any failure is current drift owned by this plan only if it arises from the two
owned script edits. If proof would require editing a read-only dependency,
STOP; the coordinator assigns a separate post-Plan-026 repair rather than
expanding this branch.

## Test plan

- Original-source root unset, unreadable, and valid-root preflight cases.
- Full original-source UI assertions against the configured Halla source root;
  no silent skip branch.
- Branch diff guard permitting only the two owned scripts and evidence 027.
- Fixed-demo movement contract: whole-unit footprint checks at both live gates,
  plus read-only blocked-movement pathfinding verification.
- Loading-screen contract: tracked visible layer, progress, first-load copy,
  and user-facing error state, plus post-Plan-026 runtime/browser smoke.
- Plan 010's post-Plan-026 `npm run verify:modern-hud-layout` gate.
- Regression check that no fixed-demo polish assertion besides the two named
  ones changes.

## Performance acceptance

No performance budget, profile, renderer criterion, or measurement behavior is
changed. Browser runtime smoke is a focused revalidation only and must follow
the Halla policy; it is not a replacement for the performance matrix.

## Evidence contract

Commit `plans/evidence/027.md` with the red baseline output, Halla root
preflight result without secrets, final command output, the two exact replaced
contracts, branch diff guard, accepted/integrated Plan 026 SHA, affected-plan
revalidation table, controller allocation ledger, explicit runtime-port
requested candidate, exact-owned cleanup result, commit, and any unrelated drift.
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
- [ ] The branch diff contains only the two owned scripts and evidence 027; all
  pathfinding/browser/controller/source dependencies remain read-only.
- [ ] Plan 026 is accepted and coordinator-integrated before browser
  revalidation or Plan 027 closeout.
- [ ] Plans 003, 005, 006, 007, 009, and 010 have a recorded focused
  revalidation result where their current contracts are affected.
- [ ] Browser runtime smoke uses the recorded requested candidate through the
  integrated controller, whose allocation/cleanup ledger leaves every owned
  port clear without disturbing any pre-existing listener.
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
- Plan 026 is not accepted/integrated when browser revalidation would start.
- The Plan 027 branch edits or needs to edit source-pathfinding, a browser
  verifier, the harness/controller, `src/`, `package.json`, or the roadmap.
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
