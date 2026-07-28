# Plan 010: Convert Fixed-Demo Speed Verifier To A Layout Contract

> **Historical status — `DONE-HISTORICAL`:** This plan has already been
> executed. Its original executor instructions are retained as history and are
> not a current work order. See `plans/HISTORICAL-PLAN-AUDIT.md`.

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. When done, update the status row for this plan in `plans/README.md` unless a coordinator tells you they own the index.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- src/view/renderHud.ts src/main.ts scripts/verify-fixed-demo-polish.mjs scripts/verify-modern-hud-layout.mjs plans/010-convert-fixed-demo-speed-verifier-to-layout-contract.md plans/README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts below against live code before editing. If the relevant code no longer matches, STOP and report.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/008-include-omitted-verifiers-in-full-verify.md
- **Category**: tests
- **Planned at**: commit `3c35520`, 2026-06-16

## Why this matters

`scripts/verify-fixed-demo-polish.mjs` currently locks fixed-demo speed controls by matching source strings such as `const speedButtonWidth = 42;` and exact `drawFixedDemoButton(...)` calls. That caught the intended regression, but it is brittle: a behavior-preserving refactor can fail the verifier, while a copied string can satisfy it without proving the live HUD is clickable. This plan converts that one brittle cluster into a runtime layout contract using the existing modern HUD browser verifier and leaves broader static-verifier cleanup for later.

## Current state

Relevant files:

- `src/view/renderHud.ts` - renders fixed-demo HUD and publishes `latestModernHudLayoutDebug`.
- `src/main.ts` - includes `latestModernHudLayoutDebug` in `window.__WARGUS_TS_SMOKE_STATE__`.
- `scripts/verify-fixed-demo-polish.mjs` - large static verifier with source-string assertions.
- `scripts/verify-modern-hud-layout.mjs` - browser verifier that already reads `state.modernHud`.

Current debug shape:

```ts
// src/view/renderHud.ts:143
export interface ModernHudLayoutDebug extends ModernHudLayout {
  portrait: (HudRect & { filled: boolean; source: "icon" | "unit-sprite" | "initial" | "empty" }) | null;
  resourceChips: Array<HudRect & { key: string; value: string; textFits: boolean }>;
  commandButtons: Array<HudRect & { id: string; label: string; longLabel: string; statusText: string; textFits: boolean }>;
  messages: Array<HudRect & { text: string; severity: "info" | "warning" | "attack" }>;
  overlaps: string[];
}
```

Current speed-control source-string assertions:

```js
// scripts/verify-fixed-demo-polish.mjs:62
expect(files.hud, "const speedButtonWidth = 42;", "Fixed demo speed buttons should be large enough to click reliably.");
expect(files.hud, "const speedButtonHitPadding = 4;", "Fixed demo speed buttons should have padded hit targets.");
expect(files.hud, "drawFixedDemoButton(layer, graphics, speedControlsX, speedControlsY, speedButtonWidth, speedButtonHeight, \"-\", false, () => onMapCommand(\"slower-game\"), { hitPadding: speedButtonHitPadding, trigger: \"press\" });", "Fixed demo speed controls should present slower before faster and trigger immediately on press.");
expect(files.hud, "drawFixedDemoButton(layer, graphics, speedControlsX + speedButtonWidth + speedButtonGap, speedControlsY, speedButtonWidth, speedButtonHeight, \"+\", false, () => onMapCommand(\"faster-game\"), { hitPadding: speedButtonHitPadding, trigger: \"press\" });", "Fixed demo speed-up control should be the right-hand button and trigger immediately on press.");
expect(files.hud, "hit.rect(x - hitPadding, y - hitPadding, width + hitPadding * 2, height + hitPadding * 2);", "Fixed demo button hit targets should support explicit padding.");
expect(files.hud, "hit.on(trigger === \"press\" ? \"pointerdown\" : \"pointertap\"", "Fixed demo buttons should support pointer-down activation for responsive controls.");
```

Current browser layout verifier already uses modern HUD state:

```js
// scripts/verify-modern-hud-layout.mjs:185
const hud = state?.modernHud;
if (!hud) {
  throw new Error(`${label} did not expose modernHud layout: ${JSON.stringify(state)}`);
}
```

Repo conventions:

- Runtime smoke state is exposed only for verifier/debug use through `window.__WARGUS_TS_SMOKE_STATE__`.
- Fixed-demo layout debug should be data-only. Do not expose Pixi objects or functions.
- Static source-string verifiers are still allowed for source-parity invariants, but UI geometry should prefer live layout checks when the repo already has a browser verifier for that surface.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Fixed polish before | `npm run verify:fixed-demo-polish` | exits 0 before editing |
| Modern HUD before | `npm run verify:modern-hud-layout` | exits 0 before editing |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exits 0 |
| Static cleanup check | `rg -n "speedButtonWidth = 42|speedButtonHitPadding = 4|trigger: \\\"press\\\"" scripts/verify-fixed-demo-polish.mjs` | exits 1 after editing |
| Browser layout verifier | `npm run verify:modern-hud-layout` | exits 0 |
| Fixed polish verifier | `npm run verify:fixed-demo-polish` | exits 0 |

## Scope

**In scope**:

- `src/view/renderHud.ts`
- `src/main.ts`, only if TypeScript needs smoke-state typing adjusted
- `scripts/verify-modern-hud-layout.mjs`
- `scripts/verify-fixed-demo-polish.mjs`
- `plans/README.md`

**Out of scope**:

- Rewriting every source-fragment verifier
- Changing fixed-demo HUD appearance or button behavior
- Changing source game speed semantics
- Changing browser verifier harness infrastructure
- Changing app source outside fixed-demo HUD debug typing

## Git workflow

- Branch suggestion: `codex/fixed-demo-speed-layout-contract`
- Commit message style from repo history is short imperative, for example `Polish playable Wargus demo`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Establish a green baseline

Run:

```sh
npm run verify:fixed-demo-polish
npm run verify:modern-hud-layout
./node_modules/.bin/tsc --noEmit
```

Expected: all exit 0.

If any baseline check is red, STOP and report. Do not rewrite verifier contracts on a red baseline.

### Step 2: Extend modern HUD debug data

In `src/view/renderHud.ts`, add a fixed-demo map-control debug list to `ModernHudLayoutDebug`.

Suggested shape:

```ts
mapButtonControls: Array<HudRect & {
  id: HudMapCommandId;
  label: string;
  hitRect: HudRect;
  trigger: "tap" | "press";
}>;
```

Initialize it in `beginModernHudLayoutDebug`:

```ts
mapButtonControls: [],
```

Pass the debug object into `drawFixedDemoMapButtons(...)`.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exits 0 after the type/interface edits.

### Step 3: Record fixed-demo map-button controls

Modify `drawFixedDemoMapButtons(...)` so it records the Restart, Pause/Run, `slower-game`, and `faster-game` controls into `debug.mapButtonControls`.

Implementation guidance:

- Keep the visual layout exactly as it is.
- Do not change `onMapCommand` behavior.
- For each control, record the visual rect and the hit rect.
- For the speed controls, the recorded `hitRect.width` and `hitRect.height` must include the current hit padding.
- Record `trigger: "press"` for speed controls and `trigger: "tap"` for Restart/Pause unless the live behavior is intentionally changed.

One safe approach is to create a small local helper inside `drawFixedDemoMapButtons`:

```ts
const addButton = (
  id: HudMapCommandId,
  rect: HudRect,
  label: string,
  onTap: () => void,
  options: { hitPadding?: number; trigger?: "tap" | "press" } = {}
): void => {
  const hitPadding = Math.max(0, options.hitPadding ?? 0);
  debug.mapButtonControls.push({
    ...rect,
    id,
    label,
    hitRect: {
      x: rect.x - hitPadding,
      y: rect.y - hitPadding,
      width: rect.width + hitPadding * 2,
      height: rect.height + hitPadding * 2
    },
    trigger: options.trigger ?? "tap"
  });
  drawFixedDemoButton(layer, graphics, rect.x, rect.y, rect.width, rect.height, label, false, onTap, options);
};
```

If this makes `drawFixedDemoMapButtons` too busy, extract only this local helper. Do not introduce a broad HUD abstraction.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exits 0.

### Step 4: Move speed-control assertions into the browser layout verifier

In `scripts/verify-modern-hud-layout.mjs`, add checks inside the existing `verifyViewport` or layout validation path after `const hud = state?.modernHud`.

Assert:

- `hud.mapButtonControls` is an array.
- It contains `slower-game` and `faster-game`.
- Both controls have `width >= 42` and `height >= 28`.
- `faster-game.x > slower-game.x`, proving `+` remains on the right.
- Both controls have `trigger === "press"`.
- Both controls have `hitRect.width > width` and `hitRect.height > height`.
- The two hit rects do not overlap each other.
- The two hit rects remain inside or within 4 px of `hud.mapButtons`.

Keep errors explicit, for example:

```js
throw new Error(`${label} fixed-demo speed controls should be large press targets: ${JSON.stringify({ slower, faster })}`);
```

**Verify**: `npm run verify:modern-hud-layout` -> exits 0.

### Step 5: Remove the brittle speed-control source-string checks

In `scripts/verify-fixed-demo-polish.mjs`, remove the six speed-control assertions shown in "Current state":

- `const speedButtonWidth = 42;`
- `const speedButtonHitPadding = 4;`
- exact slower `drawFixedDemoButton(...)`
- exact faster `drawFixedDemoButton(...)`
- `hit.rect(x - hitPadding, ...)`
- `hit.on(trigger === "press" ? ...`

Do not remove unrelated fixed-demo polish assertions.

**Verify**:

```sh
rg -n "speedButtonWidth = 42|speedButtonHitPadding = 4|trigger: \\\"press\\\"" scripts/verify-fixed-demo-polish.mjs
```

Expected: exits 1, no matches.

**Verify**: `npm run verify:fixed-demo-polish` -> exits 0.

### Step 6: Close out

Run:

```sh
./node_modules/.bin/tsc --noEmit
npm run verify:modern-hud-layout
npm run verify:fixed-demo-polish
```

Expected: all exit 0.

Update this plan's row in `plans/README.md` from `TODO` to `DONE`.

## Test plan

- Type-level test: `./node_modules/.bin/tsc --noEmit` validates `ModernHudLayoutDebug` shape and smoke-state typing.
- Browser behavior/layout test: `npm run verify:modern-hud-layout` validates live fixed-demo speed control geometry, ordering, hit padding, and press trigger.
- Static cleanup test: `rg` confirms the old source-string checks are gone from `verify-fixed-demo-polish`.
- Existing polish test: `npm run verify:fixed-demo-polish` remains green for the other fixed-demo polish contracts.

## Done criteria

- [ ] `ModernHudLayoutDebug` includes `mapButtonControls`.
- [ ] Runtime smoke state exposes `modernHud.mapButtonControls`.
- [ ] `npm run verify:modern-hud-layout` asserts speed-button geometry and exits 0.
- [ ] `scripts/verify-fixed-demo-polish.mjs` no longer checks the speed controls by exact source strings.
- [ ] `npm run verify:fixed-demo-polish` exits 0.
- [ ] `./node_modules/.bin/tsc --noEmit` exits 0.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` marks plan 010 `DONE`.

## STOP conditions

Stop and report if:

- `latestModernHudLayoutDebug` is no longer included in `__WARGUS_TS_SMOKE_STATE__`.
- The modern HUD browser verifier cannot launch in the executor environment.
- Recording hit rectangles requires exposing Pixi objects or functions in smoke state.
- The fix requires changing speed-control behavior or game-speed semantics.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

This is a pilot conversion. Future static-verifier cleanup should use the same pattern: move contracts with live browser-visible behavior into browser smoke state and leave source-string assertions only where they protect source-parity invariants that are hard to observe at runtime.

## Optimizer notes

- **Final score**: 94/100
- **Score trajectory**: 72 -> 86 -> 92 -> 94 -> 94
- **Main improvements**: narrowed from a broad static-verifier rewrite to the fixed-demo speed-control cluster, used the existing modern HUD browser verifier, and added data-only smoke-state boundaries.
