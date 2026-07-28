# Plan 005: Stabilize Stale Fixed-Demo Verifier Contracts

> **Historical status — `DONE-HISTORICAL`:** This plan has already been
> executed. Its original executor instructions are retained as history and are
> not a current work order. See `plans/HISTORICAL-PLAN-AUDIT.md`.

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP Conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- scripts/verify-fixed-demo-random-ai.mjs scripts/verify-browser-runtime-smoke.mjs README.md package.json plans/005-stabilize-fixed-demo-verifiers.md plans/README.md`
> If any in-scope file changed since this plan was written, compare the "Current State" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/002-restore-runtime-determinism.md
- **Category**: tests
- **Planned at**: commit `3c35520`, 2026-06-16

## Why This Matters

`npm run verify:fixed-demo-random-ai` is currently red because it expects a source fragment that no longer exists in the browser runtime smoke script. Several repo verifiers are static source-fragment checks, which can be useful but become noisy when implementation names change. This plan fixes the known stale verifier, makes sure the fixed-demo behavior is protected by runtime smoke where possible, and updates stale README wording about the current demo.

This plan should run after plan 002 so the fixed-demo runtime path is not blocked by the known determinism failure.

## Current State

Failing verifier:

```js
// scripts/verify-fixed-demo-random-ai.mjs:56
expect(runtimeSmoke, "single-original-start-unit", "Browser runtime smoke should allow original starts with only one visible unit type.");
```

Runtime smoke now directly checks the one-peasant fixed-demo start:

```js
// scripts/verify-browser-runtime-smoke.mjs:77
await waitForExpression(client, `
  (() => {
    const state = window.__WARGUS_TS_SMOKE_STATE__;
    const counts = state?.ownedUnitCounts ?? {};
    const resources = state?.visibilityPlayerResources ?? {};
    return state?.selectedUnitCount === 1
      && state?.selectedUnitTypes?.[0] === "unit-peasant"
      && counts["unit-peasant"] === 1
      && !counts["unit-town-hall"]
      && !counts["unit-farm"]
      && !counts["unit-keep"]
      && !counts["unit-castle"]
      && Number(resources.gold ?? 0) >= 10000
      && Number(resources.wood ?? 0) >= 5000;
  })()
`, 10_000);
```

README first slice is stale:

```markdown
README.md:9 - ... a starting Ballista for the final building kill ...
```

Current implementation creates one human peasant and one enemy peon, and only allows Ballista/Catapult as available unit types:

```ts
// src/wargus/demoScenario.ts:39
const demoUnits = [
  ...neutral units,
  { typeId: "unit-peasant", player: FIXED_BROWSER_DEMO_PLAYER_ID, ... },
  { typeId: "unit-peon", player: FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID, ... }
];
```

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Dependency gate | `npm run verify:runtime-determinism` | exits 0 before this plan starts |
| Fixed-demo static verifier | `npm run verify:fixed-demo-random-ai` | exits 0 |
| Runtime smoke | `npm run verify:browser-runtime-smoke` | exits 0 |
| Fixed demo session | `npm run verify:browser-demo-session` | exits 0 |
| Package chain check | `node -e "const p=require('./package.json'); if(!p.scripts['verify:fixed-demo-random-ai'] || !p.scripts.verify.includes('verify:fixed-demo-random-ai')) process.exit(1)"` | exits 0 after wiring |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0, no output |

## Scope

**In scope**:

- `scripts/verify-fixed-demo-random-ai.mjs`
- `scripts/verify-browser-runtime-smoke.mjs` only if a runtime assertion is missing
- `README.md` first-slice wording for the current fixed demo
- `package.json` only if adding `verify:fixed-demo-random-ai` to the full `verify` chain
- `plans/README.md`

**Out of scope**:

- Changing fixed-demo gameplay balance
- Reintroducing a starting Ballista
- Rewriting all static verifiers
- Changing browser automation tooling
- Netlify deployment

## Steps

### Step 1: Confirm Dependency And Current Failure

Run the dependency gate from plan 002 first.

**Verify**: `npm run verify:runtime-determinism` -> exits 0.

Then confirm the stale verifier failure still applies.

**Verify**: `npm run verify:fixed-demo-random-ai` -> fails only on `Browser runtime smoke should allow original starts with only one visible unit type`, or exits 0 if another executor already completed this plan.

### Step 2: Update The Stale Static Expectation

In `scripts/verify-fixed-demo-random-ai.mjs`, replace the stale `"single-original-start-unit"` expectation with checks that match the current runtime smoke contract.

Recommended static checks:

- `selectedUnitTypes?.[0] === "unit-peasant"`
- `counts["unit-peasant"] === 1`
- `!counts["unit-town-hall"]`
- `Number(resources.gold ?? 0) >= 10000`
- `Number(resources.wood ?? 0) >= 5000`

Do not loosen the verifier to merely check that `verify-browser-runtime-smoke.mjs` exists.

**Verify**: `npm run verify:fixed-demo-random-ai` -> prints `Fixed demo random-start source AI contract verified.`

### Step 3: Confirm Runtime Smoke Owns The Behavior

Inspect `scripts/verify-browser-runtime-smoke.mjs`. If it already contains the one-peasant/no-hall/high-resource assertion shown above, do not edit it. If it does not, add the assertion there instead of relying only on source text checks.

**Verify**: `npm run verify:browser-runtime-smoke` -> exits 0.

### Step 4: Add The Fixed-Demo Contract To Full Verification

If `package.json` still has a `verify:fixed-demo-random-ai` script that is not part of the long `verify` chain, add it near the other fixed-demo checks, after `verify:fixed-demo-polish`.

Keep the long chain style that already exists in `package.json`; do not reformat the entire scripts block.

**Verify**: `node -e "const p=require('./package.json'); if(!p.scripts['verify:fixed-demo-random-ai'] || !p.scripts.verify.includes('verify:fixed-demo-random-ai')) process.exit(1)"` -> exits 0.

### Step 5: Correct The README Demo Description

Update the first "Current Slice" bullet so it no longer claims the default demo starts with a Ballista. Keep the sentence concise and factual: one selected worker start, source-style briefing, high resources, gather/train/raid/assault objectives, and no title-screen gate.

Do not rewrite the historical changelog entries unless they are directly false about current state.

**Verify**: `rg -n "starting Ballista|starting ballista" README.md` -> no current-slice claim remains. Historical technical mentions of Ballista behavior can remain if they are not describing a starting unit.

### Step 6: Run Focused Demo Verification

Run the fixed-demo and runtime checks.

**Verify**: `npm run verify:fixed-demo-random-ai` -> exits 0.

**Verify**: `npm run verify:browser-runtime-smoke` -> exits 0.

**Verify**: `npm run verify:browser-demo-session` -> exits 0.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exits 0.

## Test Plan

- `npm run verify:fixed-demo-random-ai`
- `npm run verify:browser-runtime-smoke`
- `npm run verify:browser-demo-session`
- `node -e "const p=require('./package.json'); if(!p.scripts['verify:fixed-demo-random-ai'] || !p.scripts.verify.includes('verify:fixed-demo-random-ai')) process.exit(1)"`
- `./node_modules/.bin/tsc --noEmit`

## Done Criteria

- [ ] `npm run verify:fixed-demo-random-ai` exits 0.
- [ ] The verifier checks the current fixed-demo runtime contract rather than the stale `"single-original-start-unit"` marker.
- [ ] Runtime smoke still asserts one selected peasant, no starting town hall/farm/keep/castle, and high starting resources.
- [ ] README no longer describes a starting Ballista in the current demo.
- [ ] `verify:fixed-demo-random-ai` is included in the full `verify` chain.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report back if:

- The user wants the starting Ballista restored instead of documenting/removing the stale claim.
- `npm run verify:runtime-determinism` is still failing.
- Runtime smoke does not actually load the fixed demo after plan 002.
- Making the verifier behavior-based requires a new browser automation approach outside the approved in-app Browser/repo-native verifier path.

## Maintenance Notes

Keep static source-fragment verifiers for narrow invariants that are hard to exercise, but prefer browser/runtime assertions for user-visible fixed-demo behavior.
