# Plan 007: Fix Browser Runtime Smoke Process Cleanup

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md` unless a coordinator tells you they own the index.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- scripts/verify-browser-runtime-smoke.mjs scripts/verify-browser-native-viewport.mjs plans/007-fix-browser-smoke-process-cleanup.md plans/README.md`
> If either in-scope script changed since this plan was written, compare the "Current state" excerpts below against live code before editing. If the relevant code no longer matches, STOP and report.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug, dx
- **Planned at**: commit `3c35520`, 2026-06-16

## Why this matters

The browser runtime smoke verifier starts a detached Vite process and a detached headless Chrome process. Its cleanup helper accidentally names the child-process parameter `process`, then calls `process.kill(-process.pid, ...)`. In that scope `process.kill` is the child process method, not Node's global process-group killer, so the intended process-group termination path throws and falls back to killing only the direct child. That can leave descendant browser/server processes behind, causing later verifier runs to fail on occupied ports or stale Chrome state.

## Current state

Relevant files:

- `scripts/verify-browser-runtime-smoke.mjs` - starts the dev or preview server, starts Chrome, drives CDP, and cleans both processes in `finally`.
- `scripts/verify-browser-native-viewport.mjs` - static verifier that already reads `scripts/verify-browser-runtime-smoke.mjs` and package scripts.

Current smoke process startup:

```js
// scripts/verify-browser-runtime-smoke.mjs:7
const PORT = 5197;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
...
chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  `--user-data-dir=${chromeProfile}`,
  "--remote-debugging-port=9224",
  "about:blank"
], { detached: true, stdio: "ignore" });
```

Current buggy cleanup:

```js
// scripts/verify-browser-runtime-smoke.mjs:438
async function stopProcess(process) {
  if (!process || process.exitCode !== null || process.signalCode !== null) {
    return;
  }
  try {
    process.kill(-process.pid, "SIGTERM");
  } catch {
    process.kill("SIGTERM");
  }
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try {
        process.kill(-process.pid, "SIGKILL");
      } catch {
        process.kill("SIGKILL");
      }
      resolve();
    }, 2000);
    process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
```

Repo conventions:

- Browser verifier scripts are plain ESM `.mjs` scripts using `spawn`, local temp Chrome profiles, and best-effort cleanup.
- Similar scripts use `globalThis.process.kill(-process.pid, ...)` to avoid the shadowing bug. See `scripts/verify-browser-train-session.mjs:267-292`.
- Do not replace this with Playwright or external browser tooling. This plan only fixes the repo-native verifier script.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Static cleanup guard | `rg -n "async function stopProcess\\(process\\)|process\\.kill\\(-process\\.pid|--remote-debugging-port=9224" scripts/verify-browser-runtime-smoke.mjs` | exits 1, no matches |
| Static positive guard | `rg -n "const DEBUG_PORT = 9224|globalThis\\.process\\.kill\\(-child\\.pid|child\\.kill\\(\"SIGTERM\"\\)|child\\.kill\\(\"SIGKILL\"\\)" scripts/verify-browser-runtime-smoke.mjs` | shows the expected cleanup fragments |
| Viewport verifier | `npm run verify:browser-native-viewport` | exits 0 |
| Runtime smoke | `npm run verify:browser-runtime-smoke` | exits 0 |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exits 0 |

## Scope

**In scope**:

- `scripts/verify-browser-runtime-smoke.mjs`
- `scripts/verify-browser-native-viewport.mjs`, only if adding a static guard for the cleanup shape
- `plans/README.md`

**Out of scope**:

- Refactoring shared browser verifier helpers
- Changing verifier assertions unrelated to cleanup
- Changing app/runtime source under `src/`
- Changing package scripts
- Replacing the repo-native CDP verifier with another browser automation stack

## Git workflow

- Branch suggestion: `codex/browser-smoke-cleanup`
- Commit message style from repo history is short imperative, for example `Polish playable Wargus demo`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Establish the failing shape

Run:

```sh
rg -n "async function stopProcess\\(process\\)|process\\.kill\\(-process\\.pid|--remote-debugging-port=9224" scripts/verify-browser-runtime-smoke.mjs
```

Expected before editing: matches exist for the shadowing parameter, the bad process-group kill calls, and the hardcoded debug port.

If there are no matches before editing, STOP and report that the cleanup may have already been changed.

### Step 2: Make the debug port named

In `scripts/verify-browser-runtime-smoke.mjs`, add a named debug-port constant next to `PORT`:

```js
const DEBUG_PORT = 9224;
```

Replace:

```js
"--remote-debugging-port=9224"
await waitForHttp("http://127.0.0.1:9224/json/version", 10_000);
await waitForPageTarget("http://127.0.0.1:9224/json/list", 10_000);
```

with template strings that use `DEBUG_PORT`.

**Verify**: `rg -n "--remote-debugging-port=9224|127\\.0\\.0\\.1:9224" scripts/verify-browser-runtime-smoke.mjs` -> exits 1, no matches.

### Step 3: Fix `stopProcess` shadowing

In `scripts/verify-browser-runtime-smoke.mjs`, rename the `stopProcess` parameter from `process` to `child`. Use the same basic pattern as the other browser verifier scripts:

```js
async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    globalThis.process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // Already stopped.
    }
  }
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try {
        globalThis.process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already stopped.
        }
      }
      resolve();
    }, 2000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
```

Keep the 2000 ms timeout; this plan is not changing runtime timing.

**Verify**: `rg -n "async function stopProcess\\(process\\)|process\\.kill\\(-process\\.pid" scripts/verify-browser-runtime-smoke.mjs` -> exits 1, no matches.

**Verify**: `rg -n "globalThis\\.process\\.kill\\(-child\\.pid|child\\.kill\\(\"SIGTERM\"\\)|child\\.kill\\(\"SIGKILL\"\\)" scripts/verify-browser-runtime-smoke.mjs` -> shows all three expected fragments.

### Step 4: Add a static guard

Update `scripts/verify-browser-native-viewport.mjs`, which already reads the runtime smoke source, to assert the cleanup shape:

- `runtimeSmokeSource.includes("const DEBUG_PORT = 9224")`
- `runtimeSmokeSource.includes("globalThis.process.kill(-child.pid, \"SIGTERM\")")`
- `runtimeSmokeSource.includes("globalThis.process.kill(-child.pid, \"SIGKILL\")")`
- `!runtimeSmokeSource.includes("async function stopProcess(process)")`
- `!runtimeSmokeSource.includes("process.kill(-process.pid")`

Keep the messages specific to runtime smoke process cleanup.

**Verify**: `npm run verify:browser-native-viewport` -> exits 0.

### Step 5: Run the live smoke

Run:

```sh
npm run verify:browser-runtime-smoke
```

Expected: exits 0 and prints `Browser runtime smoke verified (...)`.

If this fails due an unavailable local Chrome binary, STOP and report the environment issue. Do not replace the verifier with another browser stack.

### Step 6: Close out

Run:

```sh
./node_modules/.bin/tsc --noEmit
```

Expected: exits 0.

Update this plan's row in `plans/README.md` from `TODO` to `DONE`.

## Test plan

- Static negative tests: no shadowing parameter and no `process.kill(-process.pid` calls remain in `scripts/verify-browser-runtime-smoke.mjs`.
- Static positive tests: runtime smoke uses `DEBUG_PORT` and `globalThis.process.kill(-child.pid, ...)`.
- Live verifier: `npm run verify:browser-runtime-smoke` proves the script still boots the app, drives Chrome, and exits cleanly.
- Regression verifier: `npm run verify:browser-native-viewport` locks the cleanup shape.

## Done criteria

- [ ] `rg -n "async function stopProcess\\(process\\)|process\\.kill\\(-process\\.pid|--remote-debugging-port=9224" scripts/verify-browser-runtime-smoke.mjs` exits 1.
- [ ] `npm run verify:browser-native-viewport` exits 0.
- [ ] `npm run verify:browser-runtime-smoke` exits 0.
- [ ] `./node_modules/.bin/tsc --noEmit` exits 0.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` marks plan 007 `DONE`.

## STOP conditions

Stop and report if:

- The live runtime smoke script no longer has its own `stopProcess` helper.
- The fix appears to require changing app source under `src/`.
- `npm run verify:browser-runtime-smoke` fails because Chrome is unavailable or the environment cannot launch it.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

This is a small bug fix, not the shared-harness refactor. When plan 009 extracts browser verifier helpers, it should use this corrected cleanup behavior as the source of truth and avoid reintroducing a parameter named `process`.

## Optimizer notes

- **Final score**: 95/100
- **Score trajectory**: 78 -> 89 -> 95 -> 95
- **Main improvements**: added named debug-port drift guard, added exact negative/positive cleanup checks, and split the live browser smoke from the static verifier gate.
