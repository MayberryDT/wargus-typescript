# Plan 009: Extract A Browser Verifier Harness Pilot

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md` unless a coordinator tells you they own the index.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- scripts/verify-browser-runtime-smoke.mjs scripts/verify-browser-map-loads.mjs scripts/browser-smoke-harness.mjs scripts/verify-browser-native-viewport.mjs plans/009-extract-browser-verifier-harness-pilot.md plans/README.md`
> If any in-scope script changed since this plan was written, compare the "Current state" excerpts below against live code before editing. If the relevant code no longer matches, STOP and report.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/007-fix-browser-smoke-process-cleanup.md
- **Category**: tech-debt, dx
- **Planned at**: commit `3c35520`, 2026-06-16

## Why this matters

The repo has many browser verifier scripts that each start a local Vite server, launch headless Chrome, connect to Chrome DevTools Protocol, poll browser expressions, read smoke state, and clean up processes. That duplication has already allowed cleanup logic to drift. This plan creates a small shared harness and migrates two representative scripts first, proving the module boundary without destabilizing every browser verifier in one pass.

## Current state

Relevant files:

- `scripts/verify-browser-runtime-smoke.mjs` - dev/preview runtime smoke verifier; has server startup, Chrome startup, CDP helpers, wait helpers, screenshot helpers, and cleanup.
- `scripts/verify-browser-map-loads.mjs` - dev/preview map-load verifier; repeats server/Chrome/CDP/wait/cleanup helpers.
- `scripts/verify-browser-native-viewport.mjs` - static verifier that already reads the runtime smoke and map-load verifier source.

Runtime smoke startup and helper pattern:

```js
// scripts/verify-browser-runtime-smoke.mjs:7
const PORT = 5197;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
...
const server = spawn(process.execPath, serverArgs, {
  detached: true,
  stdio: ["ignore", "pipe", "pipe"]
});
...
async function waitForHttp(url, timeoutMs, details = () => "") { ... }
async function connectDevTools(url) { ... }
async function waitForExpression(client, expression, timeoutMs) { ... }
```

Map-load startup and helper pattern:

```js
// scripts/verify-browser-map-loads.mjs:6
const PORT = 5198;
const DEBUG_PORT = 9225;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const server = spawn("npm", ["run", serverMode, "--", "--port", String(PORT), "--strictPort"], {
  detached: true,
  stdio: ["pipe", "ignore", "ignore"]
});
```

Repo conventions:

- Browser verifiers are plain ESM `.mjs` scripts.
- They use only Node built-ins plus browser WebSocket/fetch APIs.
- They should remain runnable through `npm run verify:<name>`.
- Do not replace the verifier stack with Playwright, an external browser-control server, or Computer Use.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Baseline runtime smoke | `npm run verify:browser-runtime-smoke` | exits 0 before editing |
| Baseline map loads | `npm run verify:browser-map-loads` | exits 0 before editing |
| Helper import check | `rg -n "from \"\\.\\/browser-smoke-harness\\.mjs\"" scripts/verify-browser-runtime-smoke.mjs scripts/verify-browser-map-loads.mjs` | shows both migrated scripts |
| Removed duplicate helpers | `rg -n "function waitForHttp|function connectDevTools|async function stopProcess" scripts/verify-browser-runtime-smoke.mjs scripts/verify-browser-map-loads.mjs` | exits 1, no local helper definitions |
| Static package/browser verifier | `npm run verify:browser-native-viewport` | exits 0 |
| Runtime smoke | `npm run verify:browser-runtime-smoke` | exits 0 |
| Map loads | `npm run verify:browser-map-loads` | exits 0 |

## Scope

**In scope**:

- `scripts/browser-smoke-harness.mjs` (create)
- `scripts/verify-browser-runtime-smoke.mjs`
- `scripts/verify-browser-map-loads.mjs`
- `scripts/verify-browser-native-viewport.mjs`, only for static guards around the harness imports
- `plans/README.md`

**Out of scope**:

- Migrating every browser verifier in this pass
- Changing app/runtime source under `src/`
- Changing the semantic assertions in the browser verifiers
- Replacing Chrome/CDP with another browser automation system
- Changing package-script names

## Git workflow

- Branch suggestion: `codex/browser-verifier-harness-pilot`
- Commit message style from repo history is short imperative, for example `Polish playable Wargus demo`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Establish a green baseline

Run:

```sh
npm run verify:browser-runtime-smoke
npm run verify:browser-map-loads
```

Expected: both exit 0.

If either is already failing, STOP and report. Do not refactor browser verifier infrastructure on a red baseline.

### Step 2: Create `scripts/browser-smoke-harness.mjs`

Create a new ESM helper module with only shared verifier infrastructure. Export these helpers:

- `startViteServer({ port, mode, stdio })`
- `startChrome({ chromeBin, debugPort, profilePrefix, extraArgs })`
- `waitForHttp(url, timeoutMs, details?)`
- `fetchJson(url)`
- `waitForPageTarget(url, timeoutMs)`
- `connectDevTools(url)`
- `waitForExpression(client, expression, timeoutMs, smokeReader?)`
- `evalValue(client, expression)`
- `readSmokeState(client)`
- `delay(ms)`
- `stopProcess(child)`
- `removeProfile(profilePath)`

Implementation notes:

- Use Node built-ins only: `node:child_process`, `node:fs`, `node:os`, `node:path`.
- Preserve the same Chrome arguments currently used by each caller. The helper can accept `extraArgs` so callers keep script-specific flags.
- `stopProcess(child)` must use the corrected plan 007 behavior: `globalThis.process.kill(-child.pid, "SIGTERM")` and `globalThis.process.kill(-child.pid, "SIGKILL")`, with `child.kill(...)` fallback.
- `connectDevTools` must preserve the existing interface shape: `on`, `send`, `waitFor`, and `close`.
- `waitForExpression` should preserve smoke-state diagnostics by accepting an optional smoke reader. If provided, timeout errors include `smoke=${JSON.stringify(await smokeReader())}`.

**Verify**: `sed -n '1,260p' scripts/browser-smoke-harness.mjs` -> helper exports are visible and no app-specific assertions appear.

### Step 3: Migrate runtime smoke to the harness

In `scripts/verify-browser-runtime-smoke.mjs`:

- Import shared helpers from `./browser-smoke-harness.mjs`.
- Keep runtime-smoke-specific constants such as `EXPECTED_BACKGROUND_MUSIC`.
- Keep runtime-smoke-specific screenshot and assertion helpers local.
- Replace local server startup with `startViteServer({ port: PORT, mode: serverMode, stdio: ["ignore", "pipe", "pipe"] })` or an equivalent helper call that still captures server output.
- Replace local Chrome startup with `startChrome({ chromeBin: CHROME, debugPort: DEBUG_PORT, profilePrefix: "wargus-chrome-" })`.
- Remove local definitions that the harness now owns: `waitForHttp`, `fetchJson`, `waitForPageTarget`, `connectDevTools`, `waitForExpression`, `evalValue`, `readSmokeState`, `dispatchKey` only if the harness owns it, `stopProcess`, and `delay`.
- Keep local `captureNonBlankScreenshot`, `sameScreenshotStats`, `waitForSmokePoint`, `dispatchMouseClick`, and fog helpers unless you deliberately exported exact equivalents in the harness.

**Verify**:

```sh
rg -n "from \"\\.\\/browser-smoke-harness\\.mjs\"" scripts/verify-browser-runtime-smoke.mjs
rg -n "function waitForHttp|function connectDevTools|async function stopProcess" scripts/verify-browser-runtime-smoke.mjs
```

Expected: first command shows an import; second exits 1.

### Step 4: Migrate map-load verifier to the harness

In `scripts/verify-browser-map-loads.mjs`, repeat the same pattern:

- Import shared helpers from `./browser-smoke-harness.mjs`.
- Keep map-list selection and map-load assertions local.
- Use shared server, Chrome, CDP, wait, eval, smoke-state, cleanup, and profile-removal helpers.
- Remove duplicated local helper definitions migrated to the harness.
- Preserve `serverMode` behavior for dev versus preview map-load runs.

**Verify**:

```sh
rg -n "from \"\\.\\/browser-smoke-harness\\.mjs\"" scripts/verify-browser-map-loads.mjs
rg -n "function waitForHttp|function connectDevTools|async function stopProcess" scripts/verify-browser-map-loads.mjs
```

Expected: first command shows an import; second exits 1.

### Step 5: Add a static guard

Update `scripts/verify-browser-native-viewport.mjs` so it checks:

- `runtimeSmokeSource.includes('from "./browser-smoke-harness.mjs"')`
- `mapLoadSource.includes('from "./browser-smoke-harness.mjs"')`
- `!runtimeSmokeSource.includes("function waitForHttp")`
- `!mapLoadSource.includes("function waitForHttp")`
- `!runtimeSmokeSource.includes("async function stopProcess")`
- `!mapLoadSource.includes("async function stopProcess")`

Keep the messages clear that this is a pilot migration, not a requirement that every browser verifier already use the harness.

**Verify**: `npm run verify:browser-native-viewport` -> exits 0.

### Step 6: Run migrated verifiers

Run:

```sh
npm run verify:browser-runtime-smoke
npm run verify:browser-map-loads
```

Expected: both exit 0 and print their normal success messages.

### Step 7: Close out

Update this plan's row in `plans/README.md` from `TODO` to `DONE`.

## Test plan

- Baseline before refactor: runtime smoke and map-load verifiers pass before editing.
- Static import checks: migrated scripts import `./browser-smoke-harness.mjs`.
- Static duplication checks: migrated scripts no longer define local `waitForHttp`, `connectDevTools`, or `stopProcess`.
- Behavior checks: both migrated verifiers still pass.
- Regression guard: `npm run verify:browser-native-viewport` locks the pilot harness use.

## Done criteria

- [ ] `scripts/browser-smoke-harness.mjs` exists and exports the shared helpers listed above.
- [ ] Runtime smoke imports the harness and no longer defines local `waitForHttp`, `connectDevTools`, or `stopProcess`.
- [ ] Map loads imports the harness and no longer defines local `waitForHttp`, `connectDevTools`, or `stopProcess`.
- [ ] `npm run verify:browser-native-viewport` exits 0.
- [ ] `npm run verify:browser-runtime-smoke` exits 0.
- [ ] `npm run verify:browser-map-loads` exits 0.
- [ ] No app source under `src/` changed.
- [ ] `plans/README.md` marks plan 009 `DONE`.

## STOP conditions

Stop and report if:

- Plan 007 is not done and runtime smoke still has the cleanup shadowing bug.
- Baseline runtime smoke or map loads is red before editing.
- The helper extraction requires changing app source under `src/`.
- More than the two pilot verifier scripts need migration to make this pass.
- Any migrated verifier changes its semantic assertions rather than only its harness plumbing.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

After this pilot lands, future browser verifier work should migrate one or two scripts at a time into `scripts/browser-smoke-harness.mjs`. Do not attempt a repo-wide browser verifier rewrite in a single follow-up unless the full browser gate is already stable and the operator explicitly approves the larger blast radius.

## Optimizer notes

- **Final score**: 93/100
- **Score trajectory**: 70 -> 84 -> 91 -> 93 -> 93
- **Main improvements**: narrowed from "deduplicate all browser tests" to a two-script pilot, made plan 007 a dependency, and added static no-local-helper checks to prevent partial migrations.
