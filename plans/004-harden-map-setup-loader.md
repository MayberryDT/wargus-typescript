# Plan 004: Harden Map Setup JSON Loading Against SPA Fallback HTML

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP Conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- src/wargus/mapSetup.ts scripts/verify-map-setup-loader.mjs package.json plans/004-harden-map-setup-loader.md plans/README.md`
> If any in-scope file changed since this plan was written, compare the "Current State" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3c35520`, 2026-06-16

## Why This Matters

This app is deployed as an SPA on Netlify, where unknown paths can return `index.html`. `loadWargusManifest()` already guards against HTML masquerading as JSON, but `loadMapSetup()` directly calls `response.json()`. If a setup JSON asset is missing or redirected to the SPA fallback, the app can throw an unhandled JSON parse error instead of returning `null` and keeping the map-load path controlled.

## Current State

Manifest loader has defensive JSON handling:

```ts
// src/wargus/manifest.ts:5
export async function loadWargusManifest(): Promise<WargusManifest> {
  const response = await fetch("/wargus/manifest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(missingWargusManifestMessage(response.status));
  }
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("text/html") || text.trimStart().startsWith("<")) {
    throw new Error(missingWargusManifestMessage(response.status));
  }
  ...
}
```

Map setup loader lacks the same guard:

```ts
// src/wargus/mapSetup.ts:19
async function loadSetupPath(path: string): Promise<WargusMapSetup | null> {
  const response = await fetch(`/wargus/${path}`, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  return response.json() as Promise<WargusMapSetup>;
}
```

Netlify SPA fallback:

```toml
# netlify.toml:8
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0, no output |
| Existing setup data | `npm run verify:map-setups` | exits 0 |
| New loader guard | `npm run verify:map-setup-loader` | exits 0 |
| Browser maps | `npm run verify:browser-map-loads` | exits 0 |

## Scope

**In scope**:

- `src/wargus/mapSetup.ts`
- `scripts/verify-map-setup-loader.mjs` (create)
- `package.json`
- `plans/README.md`

**Out of scope**:

- Changing Netlify routing
- Changing manifest loading behavior
- Changing indexed map setup data under `public/wargus`
- Netlify deployment

## Steps

### Step 1: Replace Direct response.json()

In `src/wargus/mapSetup.ts`, change `loadSetupPath()` to read text, reject HTML fallback, and catch JSON parse failure.

Target behavior:

- Return `null` on non-OK response.
- Return `null` if `content-type` includes `text/html`.
- Return `null` if response text starts with `<` after trimming leading whitespace.
- Return `null` if JSON parsing fails.
- Return the parsed `WargusMapSetup` on valid JSON.

Keep this helper local to `mapSetup.ts`; do not introduce a shared fetch abstraction unless another file needs it in the same change.

Target shape:

```ts
async function loadSetupPath(path: string): Promise<WargusMapSetup | null> {
  const response = await fetch(`/wargus/${path}`, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("text/html") || text.trimStart().startsWith("<")) {
    return null;
  }
  try {
    return JSON.parse(text) as WargusMapSetup;
  } catch {
    return null;
  }
}
```

**Verify**: `rg -n "response\\.json\\(\\)" src/wargus/mapSetup.ts` -> no matches.

### Step 2: Add A Focused Loader Guard Verifier

Create `scripts/verify-map-setup-loader.mjs`. Match the repo's existing lightweight verifier style: read `src/wargus/mapSetup.ts` as text, collect errors, print them, and exit 1 when any expected guard is missing.

Check for these fragments:

- `response.text()`
- `content-type`
- `text/html`
- `trimStart().startsWith("<")`
- `JSON.parse`
- `catch`
- absence of `response.json()`

This is intentionally narrow. Plan 005 handles broader verifier brittleness.

**Verify**: `node scripts/verify-map-setup-loader.mjs` -> prints a success message.

### Step 3: Wire The Verifier Into package.json

Add a script:

```json
"verify:map-setup-loader": "node scripts/verify-map-setup-loader.mjs"
```

Add it to the long `verify` chain near `verify:map-setups` so the loader regression runs with full verification.

**Verify**: `npm run verify:map-setup-loader` -> exits 0.

**Verify**: `node -e "const p=require('./package.json'); if(!p.scripts['verify:map-setup-loader'] || !p.scripts.verify.includes('verify:map-setup-loader')) process.exit(1)"` -> exits 0.

### Step 4: Run Runtime Checks

Run existing checks that cover setup data and browser map loading.

**Verify**: `npm run verify:map-setups` -> exits 0 and reports 301 setups.

**Verify**: `npm run verify:browser-map-loads` -> exits 0.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exits 0.

Do not run full `npm run verify` as part of this plan unless plans 002 and 005 are already complete, because recon showed the full chain currently has unrelated red checks.

## Test Plan

- New verifier: `npm run verify:map-setup-loader`
- Package script wiring: `node -e "const p=require('./package.json'); if(!p.scripts['verify:map-setup-loader'] || !p.scripts.verify.includes('verify:map-setup-loader')) process.exit(1)"`
- Existing setup verifier: `npm run verify:map-setups`
- Browser map load smoke: `npm run verify:browser-map-loads`
- Typecheck: `./node_modules/.bin/tsc --noEmit`

## Done Criteria

- [ ] `loadSetupPath()` no longer calls `response.json()` directly.
- [ ] HTML fallback and malformed JSON return `null`.
- [ ] `npm run verify:map-setup-loader` exists and passes.
- [ ] The new verifier is included in the full `verify` chain.
- [ ] `npm run verify:map-setups` passes.
- [ ] `npm run verify:browser-map-loads` passes.
- [ ] `./node_modules/.bin/tsc --noEmit` passes.
- [ ] `plans/README.md` status row updated.

## STOP Conditions

Stop and report back if:

- Existing callers rely on JSON parse exceptions from `loadMapSetup()`.
- The loader change requires modifying Netlify routing or asset generation.
- The package script edit requires reformatting or rewriting the entire long `verify` chain.
- Browser map loads fail for unrelated simulation/rendering reasons after the loader change.

## Maintenance Notes

If more JSON loaders are added under `src/`, prefer the manifest-style pattern: read text first, reject HTML fallback, then parse inside a controlled error path.
