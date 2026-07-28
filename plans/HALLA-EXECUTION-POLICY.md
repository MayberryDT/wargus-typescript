# Halla Execution Policy

## Scope

Applies to all unfinished Wargus plans and successor verification work on Halla.
Historical evidence retains the policy active when it was captured.

## Host stability

- Start only with at least 4 GiB MemAvailable and 20 GiB workspace disk free.
- Stop only owned work if MemAvailable falls below 2 GiB, swap used exceeds
  8 GiB, or workspace disk free falls below 20 GiB.
- CPU and GPU utilization are unrestricted.

Record host memory, swap, disk, load, CPU, and GPU metrics before starting and
after cleanup. These are host-stability guards, not benchmark budgets.

## Process ownership

- Inspect listeners first and use unique unoccupied ports.
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
- Performance captures run one at a time.
- Broad integration verification runs after all wave branches integrate.

## Browser qualification

- Prefer the in-app Browser when it provides continuously advancing RAF and
  the required hooks.
- Headless Chromium is explicitly approved as fallback.
- Frame-budget evidence requires a hardware renderer and rejects SwiftShader,
  llvmpipe, hidden documents, or non-advancing RAF.
- Readiness has a 120-second no-progress watchdog; valid captures have no arbitrary tab-duration ceiling.

## Artifact storage

```
.artifacts/performance/<plan>/<commit>/<UTC-stamp>/
```
