# Halla Execution Policy

## Scope

Applies to all unfinished Wargus plans and successor verification work on Halla.
Historical evidence retains the policy active when it was captured.

## Execution preflight

- Confirm the hostname is `halla`, the expected branch is checked out, and the
  work runs from its assigned isolated worktree under `/home/halla/workspaces/`.
- Inspect listeners, confirm the required port is unoccupied, and use a unique
  unoccupied port.
- Confirm no conflicting project benchmark is active.
- Confirm the host meets the start thresholds below before starting work.

## Host stability

- Start only with at least 4 GiB MemAvailable and 20 GiB workspace disk free.
- Stop only owned work if MemAvailable falls below 2 GiB, swap used exceeds
  8 GiB, or workspace disk free falls below 20 GiB.
- CPU and GPU utilization are unrestricted.

Record host memory, swap, disk, load, CPU, and GPU metrics before starting and
after cleanup. These are host-stability guards, not benchmark budgets.

## Process ownership

- Record exact root PIDs and descendants.
- Stop only exact owned PIDs.
- Never use broad pkill, killall, unrelated port-owner termination, or
  process-group cleanup that can reach unrelated work.

After each owned session, verify exact cleanup of recorded PIDs, descendants,
and owned ports. Report any residual state explicitly, including why it remains
and whether it is owned.

## Parallelism

- Implementation and focused non-benchmark checks may run concurrently in
  isolated worktrees when the wave ownership table permits.
- Later performance captures run one at a time.
- Broad integration verification runs after all wave branches integrate.

## Coordinator post-integration gate

After the coordinator integrates every accepted branch in Wave 2, Wave 3, or
Wave 4, it runs one post-integration gate on the exact integrated SHA (the
combined commit):

| Completed wave | Blocked successor until the gate is `READY` | Acceptance mode |
|---|---|---|
| Wave 2 | Wave 3 | `incremental` |
| Wave 3 | Wave 4 | `incremental` |
| Wave 4 | Wave 5 | `incremental` |

For each gate, the coordinator must:

1. record the exact combined SHA, host, branch/worktree, build mode, browser
   executable/version, controller version or commit, renderer/GPU/driver,
   viewports, profile-definition hashes, initial entity/effect fingerprints,
   artifact-root realpath, and pre/post host resource state;
2. run against that same combined SHA every focused verifier owned by the
   completed wave, all upstream parity gates those plans consume, and the
   relevant shared typecheck, build, asset, fixed-tick determinism, save-schema,
   and browser gates required by the completed wave's plan exit gates;
3. run the full seven-row canonical Plan 018 matrix, with three valid trials per
   row, exactly as defined by `plans/PERFORMANCE-ACCEPTANCE.md`; all captures
   and replacements run serially with no overlapping project benchmark;
4. retain the raw trials, normalized matrix summary, environment and
   fingerprint metadata, invalid/replacement records, resource-monitor
   summaries, and SHA-256 checksums under the policy's durable artifact root;
   and
5. commit `plans/evidence/WAVE-<N>-INTEGRATION.md`, naming the exact combined
   SHA, every command and result, durable artifact path and checksums,
   individual-plan evidence inputs, residual risks, and a combined `READY` or
   `NOT READY` verdict.

An individual plan's exit packet, branch-local capture, or successful merge is
not a substitute. Waves 2, 3, and 4 receive `READY` only when their combined
gate satisfies `incrementalReady` from `PERFORMANCE-ACCEPTANCE.md`, including no
new budget-failure key, no frame p95 regression over 5%, targeted
work-reduction proof, and complete durable evidence. A pre-existing accepted
Plan 018 budget-failure key alone does not make an incremental gate `NOT READY`.
Any missing, invalid, overlapping, SHA-mismatched, or incrementally failing gate
keeps the successor wave blocked. Wave 5 uses `absolute-release` and requires
`absoluteReleaseReady`, including every absolute shared budget. This gate does
not run between the parallel Wave 0 branches and does not run before Plan 018
establishes the accepted baseline; Plan 018 acceptance itself governs the Wave
1-to-Wave 2 barrier.

## Browser qualification

- Prefer the in-app Browser when it provides continuously advancing RAF and
  the required hooks.
- Headless Chromium is explicitly approved as fallback.
- Frame-budget evidence requires a hardware renderer and rejects SwiftShader,
  llvmpipe, hidden documents, or non-advancing RAF.
- Readiness has a 120-second no-progress watchdog; valid captures have no arbitrary tab-duration ceiling.

## Artifact storage

The canonical logical path is:

```text
.artifacts/performance/<plan>/<commit>/<UTC-stamp>/
```

This path is not usable yet merely because it is documented. Before any
capture, Wave 0 must:

1. have the coordinator integrate the exact `/.artifacts/` rule into the
   repository `.gitignore`;
2. designate a retained Halla checkout under `/home/halla/workspaces/` that is
   not the disposable plan worktree;
3. set `WARGUS_ARTIFACT_ROOT` to that retained checkout's `.artifacts`
   directory and pass the absolute root to the shared controller;
4. prove a representative nested path is ignored with `git check-ignore`, the
   physical root is writable, has enough free space, and resolves outside the
   disposable worktree; and
5. record the checkout/root identity and preservation owner in Plan 026
   evidence without committing raw files.

The controller writes
`$WARGUS_ARTIFACT_ROOT/performance/<plan>/<commit>/<UTC-stamp>/`; evidence uses
the canonical logical path above. Removing an isolated plan worktree must not
remove this retained root. Do not delete or relocate it without an explicit
retention decision after checksums and concise committed evidence are verified.
If the ignore rule, retained root, or preflight is absent, STOP before capture.
