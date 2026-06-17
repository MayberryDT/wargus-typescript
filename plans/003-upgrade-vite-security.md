# Plan 003: Upgrade Vite Out Of The Vulnerable Range

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP Conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- package.json package-lock.json plans/003-upgrade-vite-security.md plans/README.md`
> If any in-scope file changed since this plan was written, compare the "Current State" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `3c35520`, 2026-06-16

## Why This Matters

`npm audit --omit=dev --audit-level=high --json` reports one high advisory affecting the installed Vite range. Vite is the dev server and production bundler for this browser app, so keeping it in a known vulnerable range is not worth carrying when npm reports a fix is available. The expected change should be limited to `package.json` and `package-lock.json`.

This plan requires npm registry access. If the executor's environment blocks network access, it should request approval for the npm command instead of editing package files by hand.

## Current State

`package.json`:

```json
"dependencies": {
  "@types/node": "^24.10.1",
  "pixi.js": "^8.18.1",
  "typescript": "^6.0.3",
  "vite": "^8.0.14"
}
```

`package-lock.json`:

```json
"node_modules/vite": {
  "version": "8.0.14",
  "resolved": "https://registry.npmjs.org/vite/-/vite-8.0.14.tgz"
}
```

Audit evidence from recon:

- A high advisory affects `vite` range `>=8.0.0 <=8.0.15`.
- `fixAvailable` was true.

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Audit before | `npm audit --omit=dev --audit-level=high --json` | currently reports Vite high advisory |
| Upgrade | `npm install vite@^8.0.16` | exits 0 and updates package files |
| Version check | `node -p "require('./package-lock.json').packages['node_modules/vite'].version"` | prints a version greater than `8.0.15` |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0, no output |
| Build | `npm run build` | exits 0; prebuild asset gate passes |
| Production smoke | `npm run verify:browser-production-smoke` | exits 0 |
| Audit after | `npm audit --omit=dev --audit-level=high` | exits 0 or reports no high vulnerabilities |

## Scope

**In scope**:

- `package.json`
- `package-lock.json`
- `plans/README.md`

**Out of scope**:

- Source code changes under `src/`
- Replacing Vite or changing build tooling
- Upgrading PixiJS, TypeScript, or unrelated dependencies
- Netlify deployment

## Steps

### Step 1: Confirm The Advisory Still Applies

Run the audit command before changing anything.

**Verify**: `npm audit --omit=dev --audit-level=high --json` -> reports only the expected Vite advisory, or no high advisories. If it reports no high advisories, skip to Step 4 and mark the plan DONE with a note.

If the audit command fails because registry access is unavailable, request network approval and retry. Do not infer the advisory state from stale local data.

### Step 2: Upgrade Only Vite

Run:

```bash
npm install vite@^8.0.16
```

This should update the Vite dependency range and lockfile. If npm says `8.0.16` does not exist or tries to perform a broader major migration, STOP and report.

**Verify**: `git diff -- package.json package-lock.json` -> only Vite and its transitive lockfile entries changed.

**Verify**: `node -p "require('./package-lock.json').packages['node_modules/vite'].version"` -> prints a version greater than `8.0.15`.

### Step 3: Verify Build Compatibility

Run the normal checks that cover Vite's role in this repo.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exit 0.

**Verify**: `npm run build` -> exits 0. Expected build behavior includes `npm run verify:wargus-assets` as `prebuild`.

**Verify**: `npm run verify:browser-production-smoke` -> exits 0. This catches production-bundle/dev-server behavior changes from the Vite update.

### Step 4: Verify The Advisory Is Gone

Run the audit again.

**Verify**: `npm audit --omit=dev --audit-level=high` -> exits 0 or reports no high vulnerabilities.

## Test Plan

- `./node_modules/.bin/tsc --noEmit`
- `npm run build`
- `npm run verify:browser-production-smoke`
- `npm audit --omit=dev --audit-level=high`

No source tests are required unless the Vite upgrade changes runtime or build behavior.

## Done Criteria

- [ ] Vite is no longer installed at `8.0.14`.
- [ ] `npm audit --omit=dev --audit-level=high` has no high Vite advisory.
- [ ] `./node_modules/.bin/tsc --noEmit` exits 0.
- [ ] `npm run build` exits 0.
- [ ] `npm run verify:browser-production-smoke` exits 0.
- [ ] No files outside `package.json`, `package-lock.json`, and plan status were modified.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report back if:

- The registry does not provide a patched `8.x` Vite version.
- The upgrade requires changing application source code.
- Audit reports a different high/critical advisory that is not Vite.
- `git diff -- package.json package-lock.json` shows unrelated dependency upgrades.
- `npm run build` fails due to Vite behavior after two reasonable fix attempts.

## Maintenance Notes

If this repo adds CI later, include `npm audit --omit=dev --audit-level=high` in a scheduled or release check rather than every local hot loop.
