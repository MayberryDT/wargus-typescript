# Plan 002: Restore Runtime Determinism Verification

> **Historical status — `DONE-HISTORICAL`:** This plan has already been
> executed. Its original executor instructions are retained as history and are
> not a current work order. See `plans/HISTORICAL-PLAN-AUDIT.md`.

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP Conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- src/wargus/demoScenario.ts README.md plans/002-restore-runtime-determinism.md plans/README.md`
> If any in-scope file changed since this plan was written, compare the "Current State" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3c35520`, 2026-06-16

## Why This Matters

The repo advertises replay-friendly deterministic runtime behavior and includes `npm run verify:runtime-determinism` in the full `npm run verify` chain. That verifier is currently red because `src/wargus/demoScenario.ts` uses wall-clock and random APIs to select a default fixed-demo seed. Until this is fixed, the one-command verification baseline is not trustworthy.

## Current State

- `package.json` includes `npm run verify:runtime-determinism` in the long `verify` chain.
- `scripts/verify-runtime-determinism.mjs` rejects `Math.random()`, `crypto.getRandomValues()`, and `Date.now()` anywhere under `src/**/*.ts`.
- Current failing code:

```ts
// src/wargus/demoScenario.ts:237
function fixedDemoSeed(): string {
  const search = typeof globalThis.location?.search === "string" ? globalThis.location.search : "";
  const params = new URLSearchParams(search);
  if (params.has("demoSeed")) {
    return params.get("demoSeed") || DEMO_DEFAULT_SEED;
  }
  if (params.has("smoke")) {
    return "smoke";
  }
  return `${DEMO_DEFAULT_SEED}:${Date.now()}:${Math.random()}`;
}
```

- README states the determinism rule:

```markdown
README.md:731 - Web Audio sound-effect variants and battle music now cycle deterministically...
README.md:732 - Added `npm run verify:runtime-determinism` to catch random or wall-clock API usage...
```

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Confirm current failure | `npm run verify:runtime-determinism` | before editing, fails only on `src/wargus/demoScenario.ts:246` unless already fixed |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0, no output |
| Determinism | `npm run verify:runtime-determinism` | prints deterministic verification success |
| Static source scan | `rg -n "Math\\.random|Date\\.now|crypto\\.getRandomValues" src` | no matches after the fix |
| Browser smoke | `npm run verify:browser-runtime-smoke` | exits 0 |

## Scope

**In scope**:

- `src/wargus/demoScenario.ts`
- `README.md` only if the demo description must be updated to match deterministic default behavior
- `plans/README.md`

**Out of scope**:

- Broad fixed-demo design changes
- Randomizing enemy/player starts by another runtime API
- Editing unrelated verifier scripts
- Netlify deployment

## Steps

### Step 1: Confirm The Red Baseline

Run the focused verifier before editing unless another executor has already completed this plan.

**Verify**: `npm run verify:runtime-determinism` -> fails only with `src/wargus/demoScenario.ts:246: return \`${DEMO_DEFAULT_SEED}:${Date.now()}:${Math.random()}\`;`, or exits 0 if the plan was already completed.

If the command fails for additional files, add those files to this plan only if they are the same class of runtime nondeterminism. Otherwise STOP and report the expanded scope.

### Step 2: Make The Default Demo Seed Deterministic

In `src/wargus/demoScenario.ts`, change `fixedDemoSeed()` so the default path returns `DEMO_DEFAULT_SEED` instead of combining `Date.now()` and `Math.random()`.

Keep the existing explicit overrides:

- `?demoSeed=<value>` should continue to choose a deterministic user-provided seed.
- `?smoke=1` should continue to return `"smoke"`.

Target shape:

```ts
function fixedDemoSeed(): string {
  const search = typeof globalThis.location?.search === "string" ? globalThis.location.search : "";
  const params = new URLSearchParams(search);
  if (params.has("demoSeed")) {
    return params.get("demoSeed") || DEMO_DEFAULT_SEED;
  }
  if (params.has("smoke")) {
    return "smoke";
  }
  return DEMO_DEFAULT_SEED;
}
```

**Verify**: `npm run verify:runtime-determinism` -> prints `Runtime determinism verified (no random wall-clock APIs in src/**/*.ts).`

**Verify**: `rg -n "Math\\.random|Date\\.now|crypto\\.getRandomValues" src` -> no matches.

### Step 3: Update README Only If Needed

If README still describes randomized default starts, update only the relevant sentence. Do not rewrite the large changelog.

The current README first slice also says the fixed demo has "a starting Ballista"; that is handled by plan 005 unless you are already editing the exact same line for seed wording. If you touch it here, keep the edit limited to factual current-state wording.

**Verify**: `rg -n "random default|randomized default|Date\\.now|Math\\.random" README.md src/wargus/demoScenario.ts` -> no default-seed randomness claim remains.

### Step 4: Run Focused Runtime Smoke

Run the lightweight browser smoke after changing start selection. It uses `?smoke=1`, so it should not depend on default seed behavior, but it protects the fixed-demo load path.

**Verify**: `npm run verify:browser-runtime-smoke` -> exits 0 and prints browser runtime smoke success.

## Test Plan

- Existing verifier: `npm run verify:runtime-determinism`
- Existing browser smoke: `npm run verify:browser-runtime-smoke`
- Typecheck: `./node_modules/.bin/tsc --noEmit`

No new verifier is required for this narrow change because the existing determinism script directly covers the bug.

## Done Criteria

- [ ] `src/wargus/demoScenario.ts` contains no `Date.now()` or `Math.random()`.
- [ ] `rg -n "Math\\.random|Date\\.now|crypto\\.getRandomValues" src` returns no matches.
- [ ] `?demoSeed=` and `?smoke=1` behavior remains in `fixedDemoSeed()`.
- [ ] `npm run verify:runtime-determinism` exits 0.
- [ ] `./node_modules/.bin/tsc --noEmit` exits 0.
- [ ] `npm run verify:browser-runtime-smoke` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report back if:

- Product requirements demand random default starts without URL input.
- The determinism verifier reports additional runtime files outside `src/wargus/demoScenario.ts`.
- The browser smoke fails for reasons unrelated to start seed selection after two reasonable fix attempts.
- Fixing the verifier requires changing the determinism policy itself.

## Maintenance Notes

Future demo variation should be driven through explicit seed input, stored scenario configuration, or deterministic world state, not runtime wall-clock/random APIs under `src/**/*.ts`.
