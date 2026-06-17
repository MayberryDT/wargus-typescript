# Plan 008: Include Omitted Verifiers In The Full Verify Gate

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md` unless a coordinator tells you they own the index.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- package.json scripts/verify-browser-native-viewport.mjs plans/008-include-omitted-verifiers-in-full-verify.md plans/README.md`
> If either in-scope file changed since this plan was written, compare the "Current state" excerpts below against live code before editing. If the relevant code no longer matches, STOP and report.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests, dx
- **Planned at**: commit `3c35520`, 2026-06-16

## Why this matters

This repo relies on `npm run verify` as the broad release gate. Several dedicated verifier scripts are exposed in `package.json` but are not reachable from that full gate, so a contributor can pass the advertised command while skipping checks for modern HUD layout, playtest telemetry hooks, fixed-demo portrait/details, and resource-return/black-fog behavior. The fix should add those omitted checks intentionally and update the static verifier that locks the package-script contract.

## Current state

Relevant files:

- `package.json` - defines the full `verify` chain and all individual verifier scripts.
- `scripts/verify-browser-native-viewport.mjs` - reads `package.json` and asserts the browser verifier package-script contract.

Current full gate starts with many browser checks:

```json
// package.json:12
"verify": "npm run verify:browser-runtime-smoke && npm run verify:browser-playable-session && npm run verify:browser-demo-session && npm run verify:browser-command-card-session && npm run verify:browser-harvest-session && npm run verify:browser-combat-session && npm run verify:browser-spell-session && npm run verify:browser-train-session && npm run verify:browser-map-loads && npm run verify:browser-production && npm run verify:browser-native-viewport && ..."
```

Dedicated verifier scripts currently exposed but not directly included in `verify`:

```json
// package.json:20
"verify:modern-hud-layout": "node scripts/verify-modern-hud-layout.mjs",
"verify:resource-return-black-fog": "node scripts/verify-resource-return-and-black-fog.mjs",
"verify:playtest-telemetry": "node scripts/verify-playtest-telemetry.mjs",
"verify:fixed-demo-unit-portrait": "node scripts/verify-fixed-demo-unit-portrait-panel.mjs",
```

The package-script static verifier currently locks an exact full-verify substring:

```js
// scripts/verify-browser-native-viewport.mjs:117
expect(packageSource.includes("npm run verify:browser-runtime-smoke && npm run verify:browser-playable-session && npm run verify:browser-demo-session && npm run verify:browser-command-card-session && npm run verify:browser-harvest-session && npm run verify:browser-combat-session && npm run verify:browser-spell-session && npm run verify:browser-train-session && npm run verify:browser-map-loads && npm run verify:browser-production && npm run verify:browser-native-viewport"), "Full verify should run fixed-demo, command-card/menu parity, dev playable/economy/combat/spells/production, dev/production browser runtime/map-load smoke gates before static viewport checks.");
```

Repo conventions:

- Verification scripts are named `verify:<topic>` in `package.json`.
- Existing broad checks prefer explicit script names rather than shell globs.
- Browser-heavy checks run early in the full gate. Static/source checks run afterward.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Detect omitted scripts | `node -e 'const p=require("./package.json"); const v=p.scripts.verify; for (const n of ["verify:modern-hud-layout","verify:resource-return-black-fog","verify:playtest-telemetry","verify:fixed-demo-unit-portrait"]) if (!v.includes("npm run "+n)) throw new Error(n+" missing"); console.log("target verifiers included");'` | prints `target verifiers included` |
| Static package contract | `npm run verify:browser-native-viewport` | exits 0 |
| Omitted cheap verifier | `npm run verify:resource-return-black-fog` | exits 0 |
| Omitted cheap verifier | `npm run verify:playtest-telemetry` | exits 0 |
| Omitted cheap verifier | `npm run verify:fixed-demo-unit-portrait` | exits 0 |
| Omitted browser verifier | `npm run verify:modern-hud-layout` | exits 0 |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exits 0 |

## Scope

**In scope**:

- `package.json`
- `scripts/verify-browser-native-viewport.mjs`
- `plans/README.md`

**Out of scope**:

- Editing verifier behavior beyond package-script contract assertions
- Running or changing the full `npm run verify` chain unless the operator explicitly requests it
- Removing any existing verifier
- Reordering unrelated package scripts for formatting
- Changing source under `src/`

## Git workflow

- Branch suggestion: `codex/full-verify-coverage`
- Commit message style from repo history is short imperative, for example `Polish playable Wargus demo`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Confirm the omission

Run:

```sh
node - <<'NODE'
const p = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
const verify = p.scripts.verify;
for (const name of ["verify:modern-hud-layout", "verify:resource-return-black-fog", "verify:playtest-telemetry", "verify:fixed-demo-unit-portrait"]) {
  console.log(`${name}: ${verify.includes(`npm run ${name}`) ? "included" : "missing"}`);
}
NODE
```

Expected before editing: at least one target script prints `missing`. If all four are already included, STOP and report that this plan is stale.

### Step 2: Add the omitted scripts to `npm run verify`

Edit only the `scripts.verify` string in `package.json`.

Add:

- `npm run verify:modern-hud-layout` near the existing browser viewport/layout checks. A practical location is after `npm run verify:browser-native-viewport`, because it also drives a browser and validates fixed-demo HUD layout across viewport sizes.
- `npm run verify:resource-return-black-fog` near resource/fog/pathing checks. A practical location is after `npm run verify:source-pathfinding`.
- `npm run verify:playtest-telemetry` near fixed-demo polish checks. A practical location is after `npm run verify:fixed-demo-polish`.
- `npm run verify:fixed-demo-unit-portrait` near fixed-demo polish checks. A practical location is after `npm run verify:playtest-telemetry`.

Do not remove any existing verifier from the chain.

**Verify**:

```sh
node -e 'const p=require("./package.json"); const v=p.scripts.verify; for (const n of ["verify:modern-hud-layout","verify:resource-return-black-fog","verify:playtest-telemetry","verify:fixed-demo-unit-portrait"]) if (!v.includes("npm run "+n)) throw new Error(n+" missing"); console.log("target verifiers included");'
```

Expected: prints `target verifiers included`.

### Step 3: Update the package-script static verifier

In `scripts/verify-browser-native-viewport.mjs`, update the package-script assertions so the four target scripts are explicitly required.

Prefer separate assertions over expanding the already-long exact `verify` substring. For example:

```js
for (const scriptName of [
  "verify:modern-hud-layout",
  "verify:resource-return-black-fog",
  "verify:playtest-telemetry",
  "verify:fixed-demo-unit-portrait"
]) {
  expect(packageSource.includes(`npm run ${scriptName}`), `Full verify should include ${scriptName}.`);
}
```

If you also update the existing exact full-verify substring, keep the message accurate and do not weaken the existing browser gate assertions.

**Verify**: `npm run verify:browser-native-viewport` -> exits 0.

### Step 4: Run the newly included scripts individually

Run:

```sh
npm run verify:resource-return-black-fog
npm run verify:playtest-telemetry
npm run verify:fixed-demo-unit-portrait
npm run verify:modern-hud-layout
```

Expected: all exit 0.

If `verify:modern-hud-layout` fails because Chrome cannot be launched in the current environment, STOP and report the environment limitation. Do not remove it from the full gate to make the plan pass locally.

### Step 5: Close out

Run:

```sh
./node_modules/.bin/tsc --noEmit
```

Expected: exits 0.

Update this plan's row in `plans/README.md` from `TODO` to `DONE`.

## Test plan

- `package.json` contract: all four target scripts are included in `scripts.verify`.
- Static verifier: `npm run verify:browser-native-viewport` confirms the package contract stays locked.
- Individual checks: each newly included script exits 0.
- TypeScript: `./node_modules/.bin/tsc --noEmit` confirms no source-level type regressions.

## Done criteria

- [ ] The four target verifier scripts are present in `scripts.verify`.
- [ ] `npm run verify:browser-native-viewport` exits 0.
- [ ] `npm run verify:resource-return-black-fog` exits 0.
- [ ] `npm run verify:playtest-telemetry` exits 0.
- [ ] `npm run verify:fixed-demo-unit-portrait` exits 0.
- [ ] `npm run verify:modern-hud-layout` exits 0.
- [ ] `./node_modules/.bin/tsc --noEmit` exits 0.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` marks plan 008 `DONE`.

## STOP conditions

Stop and report if:

- Any target verifier script no longer exists in `package.json`.
- Adding one target script creates a recursive package-script cycle.
- `verify:modern-hud-layout` is too flaky to run in the executor environment.
- The change appears to require editing source under `src/`.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

This plan intentionally adds a small amount of full-gate runtime. If later maintainers split `npm run verify` into fast and exhaustive gates, they should preserve an explicitly documented release gate that includes these four checks.

## Optimizer notes

- **Final score**: 94/100
- **Score trajectory**: 76 -> 88 -> 94 -> 94
- **Main improvements**: changed from a vague "add missing checks" task into an exact four-script contract, separated cheap and browser-heavy verification, and added package-script cycle STOP conditions.
