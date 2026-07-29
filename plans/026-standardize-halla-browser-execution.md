# Plan 026: Standardize Halla Browser Execution

> **Executor instructions:** Execute the gates in order from an isolated Halla
> worktree. `plans/HALLA-EXECUTION-POLICY.md` is the governing host, ownership,
> browser, resource, and artifact contract; `plans/PERFORMANCE-ACCEPTANCE.md`
> governs any qualifying capture. Stop on every STOP condition. This plan changes
> browser-verifier tooling and defines one coordinator-integrated artifact
> exclusion; it does not change product behavior or optimize runtime performance.
>
> **Drift check:** Run the command below first.
> `git diff --stat 4c94af0c16813bf53fc488c95ed0445b639389c8..HEAD -- scripts/browser-smoke-harness.mjs scripts/verify-browser-*.mjs scripts/verify-modern-hud-layout.mjs scripts/verify-plan014-task9-contract.mjs .gitignore package.json plans/026-standardize-halla-browser-execution.md plans/README.md`
> Then run the port and cleanup inventory in Step 1. If its fixed-port list,
> process ownership shape, or browser backend has changed, STOP and reconcile
> the plan before editing.

## Status

- **Status:** TODO
- **Wave:** 0 — Foundation repair
- **Priority:** P0
- **Effort:** L
- **Risk:** HIGH — host access and process cleanup
- **Depends on:** none
- **Category:** test infrastructure, dx, performance evidence
- **Planned at:** commit `4c94af0c16813bf53fc488c95ed0445b639389c8`, 2026-07-28

## Why this matters

Current browser verifiers combine hard-coded server/debug ports with detached
processes and process-group cleanup. That can collide with another Halla job or
stop work the verifier does not own. Halla also cannot qualify a hardware Chrome
capture until a fresh `halla` process can read both DRM devices. This plan makes
the browser controller safe and makes later performance evidence eligible for
the shared acceptance contract.

## Current state

The drift inspection at `4c94af0c16813bf53fc488c95ed0445b639389c8` found:

- `halla` is not in `video` or `render`; `/dev/dri/card1` is `root:video` and
  `/dev/dri/renderD128` is `root:render`, both mode `crw-rw----`.
- Fixed server/debug pairs are 5198/9225 (map loads), 5199/9226 (playable),
  5200/9227 (harvest), 5202/9229 (spell), 5203/9230 (fixed-demo input and
  train, a collision), 5205/9232 (demo victory), 5211/9235 (command card), and
  5227/9241 (modern HUD). `verify-browser-runtime-smoke.mjs` defaults to 54314
  and `verify-browser-combat-session.mjs` defaults to 54252. Plan 014's Task 9
  script already allocates from a checked port base and is the only current
  positive precedent.
- `scripts/browser-smoke-harness.mjs` and several direct browser scripts use
  detached children and `process.kill(-child.pid, ...)`; harvest, spell, and
  train verifiers also use `pkill`. Those are incompatible with the exact-owned-
  PID rule.
- The shared harness starts Chrome with `--disable-gpu`, so it cannot qualify a
  hardware renderer. Its headless path is repository verification tooling; the
  interactive in-app Browser remains first under `AGENTS.md`.
- `.gitignore` does not currently contain `/.artifacts/`; a representative
  `.artifacts/performance/...` path is not ignored, and raw files inside a
  disposable plan worktree would not survive its removal.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Host/worktree preflight | `test "$(hostname)" = halla && git status --short --branch && id halla && getent group video && getent group render` | Halla, assigned branch/worktree, and recorded group state |
| GPU-device preflight | `stat -c '%A %U %G %n' /dev/dri/card1 /dev/dri/renderD128` | Both device owner/group/mode records are captured |
| Fresh-process GPU read | `su - halla -c 'test -r /dev/dri/card1 && test -r /dev/dri/renderD128'` | exits 0 after the group change and fresh login |
| Listener inventory | `ss -ltnp` | required ports are inspected before allocation |
| Fixed-port inventory | `rg -n --glob 'scripts/*.mjs' 'const (PORT\|DEBUG_PORT) =\|WARGUS_[A-Z0-9_]+_PORT .\?\?' scripts` | every remaining fixed/default port is listed |
| Focused controller tests | `node scripts/verify-browser-execution-controller.mjs` | branch-local occupied-port, descendant, unrelated-process, renderer, readiness-watchdog, valid-capture-duration, and safety-abort cases pass before package integration |
| Browser qualification | controller hardware-renderer preflight | records a non-software Chrome renderer, GPU device/driver, focus/visibility, and advancing RAF |
| Artifact-exclusion baseline | `git check-ignore -v .artifacts/performance/026/probe/file.json` | before coordinator integration: exits nonzero and prints no rule; preserve this infrastructure RED baseline |
| Durable artifact-root preflight | `test -n "$WARGUS_ARTIFACT_WORKSPACE" && test -n "$WARGUS_ARTIFACT_ROOT" && test -d "$WARGUS_ARTIFACT_ROOT" && test -w "$WARGUS_ARTIFACT_ROOT" && git -C "$WARGUS_ARTIFACT_WORKSPACE" check-ignore -q .artifacts/performance/026/probe/file.json` | retained checkout/root identity is recorded; nested path is ignored and writable outside the disposable plan worktree |

## Scope

**In scope**:

- the shared browser execution controller and the browser verifier scripts that
  currently own a server, Chrome debug port, or cleanup path;
- a focused controller verifier and the exact proposed package-script fragment
  recorded for coordinator integration; the plan branch invokes the verifier
  directly with `node`;
- resource-monitor and artifact helpers used only by browser verification;
- the proposed exact `/.artifacts/` `.gitignore` rule, explicit retained-root
  interface, and preflight recorded for coordinator integration; and
- `plans/evidence/026.md` and the coordinator-owned `plans/README.md` closeout
  row.

**Out of scope**:

- product/gameplay/UI behavior, rendering optimization, or performance-budget
  changes;
- changing the in-app Browser-first policy;
- killing, restarting, or reconfiguring an unrelated process;
- accepting a software renderer as frame-budget evidence; or
- editing `.gitignore`, `package.json`, or `plans/README.md` on the isolated
  Plan 026 branch; those are coordinator integration surfaces.

## Git workflow

- Work in an isolated `plan-026` worktree from the accepted Wave 0 start.
- Keep controller tests and migration checkpoints reviewable; do not combine
  them with application behavior changes.
- Use this closeout order: independently review the isolated implementation
  checkpoint; coordinator-integrate `.gitignore` and `package.json`; run the
  integrated controller/artifact tests and complete evidence; then update the
  README status to `DONE-VERIFIED`.
- Do not push, deploy, or run a performance matrix in parallel with another
  capture.

## Shared interfaces and ownership

- `plans/HALLA-EXECUTION-POLICY.md` controls host thresholds, exact-owned PID
  cleanup, in-app-first browser use, serial captures, and artifact location.
- `plans/PERFORMANCE-ACCEPTANCE.md` controls renderer qualification and all
  later capture metadata; this plan supplies the controller, not a competing
  acceptance protocol.
- Plan 018 owns the performance summary schema and matrix. Plan 026 may expose
  generic resource-monitor records but must not alter Plan 018 measurements.
- After the isolated implementation checkpoint is independently approved, the
  Wave coordinator alone integrates `.gitignore` and `package.json` before final
  Plan 026 verification/acceptance. It updates `plans/README.md` only after that
  integrated verification and evidence are accepted. Plan 026 records the exact
  proposed `verify:browser-execution-controller` script fragment in
  its evidence but does not edit `package.json`. It also records the exact
  `/.artifacts/` ignore line and retained-root interface without editing
  `.gitignore`; all three paths remain in drift inventory because they are shared
  integration surfaces.

## Steps

### Step 1: Record the entry preflight and current inventory

Confirm hostname `halla`, the assigned branch, isolated `/home/halla/workspaces/`
worktree, no conflicting project benchmark, start thresholds, listeners, and
pre-mutation host metrics as required by the Halla policy. Record the exact
root PIDs and descendants for every process this plan starts.

Run the fixed-port and artifact-exclusion baselines from the command table and
preserve their output. Confirm the listed collision at 5203/9230, identify any
new fixed browser/debug port before changing a script, and confirm no current
ignore rule is being mistaken for the future retained-artifact deliverable.

**Verify:** the artifact records listeners, memory, swap, disk, load, CPU, GPU,
fixed-port inventory, and no unowned process is selected for cleanup.

### Step 2: Qualify DRM access without changing browser semantics

With the approved host administrator action, run `sudo usermod -aG render,video halla`.
Start a fresh `halla` login/session; do not treat the initiating shell
as proof. Verify read access to `/dev/dri/card1` and `/dev/dri/renderD128` with
the exact fresh-process command above and record device ownership/mode.

Use the in-app Browser first for interactive work. Only when the user-approved
headless fallback is recorded may the repository controller launch headless
Chrome. Its renderer preflight must reject a string containing `SwiftShader`,
`llvmpipe`, or another software renderer and record executable/version, GPU
device/driver, viewport, focus, visibility, and advancing RAF.

**Verify:** a hardware renderer is qualified before any frame-budget capture;
software renderer fixtures are rejected without starting measurement.

Implement the Halla policy's browser lifecycle in the controller: readiness
has a 120-second no-progress watchdog, while a valid capture has no arbitrary
tab-duration ceiling and ends only through its protocol's explicit stop
lifecycle.

**Verify:** a simulated readiness stall aborts at the 120-second no-progress
boundary, while a valid advancing-RAF capture is not stopped by an arbitrary
tab-duration timer.

### Step 3: Replace fixed ports with inspected unique allocations

Create one controller allocation API for server and Chrome-debug ports. It must
inspect each candidate immediately before spawn, retain the allocation ledger,
refuse an occupied candidate, and pass the selected values explicitly to Vite
and Chrome. Migrate every Step 1 fixed/default owner, including the duplicated
5203/9230 pair; no verifier may silently reuse a static port.

Retain `WARGUS_BROWSER_RUNTIME_PORT` only as an explicit requested-candidate
interface for runtime smoke. It has no default after migration: the controller
must inspect, reserve, pass, and record that concrete value or reject it. This
is the post-integration interface used by Plan 027 revalidation; all other
server/debug ports come from the controller allocation ledger.

**Verify:** the focused test occupies a candidate and proves refusal; a second
allocation obtains distinct inspected server/debug ports; the fixed-port
inventory has no script-owned constants or fallback defaults outside an
explicitly documented test fixture.

### Step 4: Replace process-group cleanup with exact owned-PID cleanup

On spawn, record each root PID and discover descendants by parent PID. Stop
only that recorded set, in descendant-first order, escalating from SIGTERM to
SIGKILL only for recorded surviving PIDs. Remove `pkill`, `killall`,
`process.kill(-pid, ...)`, and port-owner termination from production verifier
cleanup. Verify every recorded PID/descendant and every owned port after exit;
record residual state and its ownership rather than deleting it.

**Verify:** a fixture proves descendant cleanup, a separately started sentinel
survives, and cleanup leaves the controller's owned ports clear.

### Step 5: Add safety monitoring and durable artifacts

Before any capture, have the coordinator integrate `/.artifacts/` into
`.gitignore` and designate a retained checkout/root exactly as required by the
Halla policy. Set `WARGUS_ARTIFACT_WORKSPACE` and `WARGUS_ARTIFACT_ROOT`
explicitly, run the command-table ignore/writability probe, compare realpaths to
prove the root is outside the disposable Plan 026 worktree, and record who
preserves it. A merely untracked directory inside that worktree is not durable.

Before start and after cleanup, collect the host metrics named by the Halla
policy. During owned sessions, poll memory, swap, workspace disk, load, CPU,
and GPU. At a stop threshold, abort only owned work, execute exact-PID cleanup,
and write the reason and residual-state result.

Write raw records under the retained root's logical
`.artifacts/performance/026/<commit>/<UTC-stamp>/`; do not rely on `/tmp`, a
disposable-worktree directory, or an unignored path, and do not commit raw
artifacts. Commit a concise normalized closeout to
`plans/evidence/026.md` with checksums, controller commit/version, allocation
ledger, renderer result, metrics, and cleanup proof.

**Verify:** the ignore/root preflight passes; removing the disposable fixture
worktree does not remove its retained test artifact; the safety-abort fixture
reaches a simulated threshold, terminates only its owned fixture tree, preserves
the sentinel, and writes a durable artifact record.

## Test plan

- Occupied-port refusal before server/Chrome spawn.
- Distinct server/debug allocation and ledger recording.
- Descendant cleanup after normal completion and safety abort.
- Unrelated-process survival, including no `pkill`, `killall`, process-group,
  or port-owner cleanup path.
- Software-renderer rejection and hardware-renderer qualification metadata.
- A 120-second readiness no-progress watchdog and proof that valid captures
  have no arbitrary tab-duration ceiling.
- Committed `/.artifacts/` ignore rule, `git check-ignore`, retained-root
  realpath/writability, disposable-worktree-removal survival, checksums, and
  preservation ownership.
- Start/stop threshold checks, durable artifact creation, and residual-state
  reporting.

## Performance acceptance

This plan does not optimize or score the product. It qualifies the execution
environment required by `plans/PERFORMANCE-ACCEPTANCE.md`; later Plan 018 and
optimization captures must use that document's matrix, trial lifecycle,
renderer rules, and budgets unchanged.

## Evidence contract

The evidence packet contains the exact command outputs for group/device and
fresh-process access; browser renderer qualification; port allocation ledger;
root/descendant PID ledger; before/after host metrics; resource-monitor summary;
owned-port and PID cleanup result; fixture results; checksums; and every
residual state. It also records the exact proposed package-script fragment and
`/.artifacts/` ignore rule, retained artifact workspace/root realpaths,
`git check-ignore`/writability/worktree-removal results and preservation owner,
and the direct `node scripts/verify-browser-execution-controller.mjs` result
before coordinator integration and the package-script result after integration.
Plan 026 is not accepted until both phases and the retained-artifact proof pass.
Raw artifacts remain outside Git in the shared artifact path;
`plans/evidence/026.md` links the durable directory and does not depend only on
`/tmp`.

## Done criteria

- [ ] `halla` has fresh-process read access to both required DRM devices.
- [ ] A hardware Chrome renderer is qualified with the required environment
  metadata; software renderers are rejected.
- [ ] The 120-second readiness no-progress watchdog passes, and a valid capture
  is proven free of any arbitrary tab-duration ceiling.
- [ ] Every current browser/debug fixed port is migrated to inspected unique
  allocation.
- [ ] Exact owned-PID/descendant cleanup passes while an unrelated process
  survives.
- [ ] The coordinator-integrated `/.artifacts/` rule and retained-root preflight
  pass, and raw files survive disposal of an isolated fixture worktree.
- [ ] Resource safety abort and durable artifact tests pass.
- [ ] The branch-local controller verifier passes directly; its package-script
  fragment is recorded for coordinator-owned integration.
- [ ] After independent checkpoint approval, the coordinator-integrated ignore
  and package entries pass the final controller/artifact verification before the
  README records `DONE-VERIFIED`.
- [ ] No product behavior or performance optimization is included.

## STOP conditions

- The hostname, branch, isolated worktree, start thresholds, listener state, or
  conflicting-benchmark preflight fails.
- The fresh `halla` process cannot read either DRM device after the approved
  group change.
- The available renderer is software-only, hidden/unfocused, or RAF does not
  advance when a qualifying capture is requested.
- Browser readiness makes no progress for 120 seconds.
- A cleanup implementation would use a process group, broad match, port owner,
  or any PID not recorded as owned.
- Any resource stop threshold fires and exact cleanup cannot be proven.
- The ignore rule, explicit retained root, outside-worktree realpath,
  writability, preservation owner, or survival check is absent or fails.
- A required focused test fails twice.

## Rollback

Revert only the unaccepted controller/verifier checkpoint and remove only its
recorded artifact directory if it contains no needed evidence. Do not remove
group membership, kill unrelated processes, reset another worktree, or delete
accepted Wave 0 work without an explicit operator decision.

## Maintenance notes

New browser verifiers must consume the controller rather than declare a static
port or cleanup helper. Any new process type must extend the owned-PID ledger
and focused tests. Performance capture remains serial even when implementation
work is parallel.
