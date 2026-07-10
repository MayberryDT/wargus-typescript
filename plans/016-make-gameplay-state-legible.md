# Plan 016: Make Commands, Queues, Supply, And Input State Legible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow this plan in slices and run the browser/layout gates after each slice. Do not redesign the HUD. Stop on any STOP condition and update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/simulation/world.ts src/simulation/orders.ts src/wargus/saveGame.ts src/view/renderHud.ts src/view/sourceUiHelpers.ts src/view/iconTextureAtlas.ts src/view/selectionInput.ts src/main.ts scripts/verify-modern-hud-layout.mjs scripts/verify-browser-command-card-session.mjs scripts/verify-browser-train-session.mjs scripts/verify-source-selection-mixing.mjs scripts/verify-source-status-line-tooltips.mjs scripts/verify-icon-references.mjs plans/evidence/016.md plans/016-make-gameplay-state-legible.md plans/README.md`
> If command availability, fixed-HUD queue rendering, production order shape, pointer tracking, or additive selection changed, STOP and reconcile.

**Goal:** Make mechanics understandable and source-correct: icons load,
disabled commands say why, the paid queue is visible/cancellable, queued units
do not reserve food, completion explains real supply/limit blocks, trained units
find source-like egress, time/stats are truthful, selection obeys Wargus
categories/ownership, and camera movement cannot leave stale targeting state.

**Architecture:** Keep simulation eligibility authoritative while labelling UI
explanations as usability enhancements. Return structured command reasons,
correct supply from enqueue reservation to completion-time retry, search outward
for spawn egress, extend production orders with save-safe completion blocks,
reuse indexed queue rendering, implement source selection categories, and
normalize imported display identifiers only at presentation boundaries.

**Tech Stack:** TypeScript 6 simulation/UI, PixiJS 8 HUD and input, JSON save normalization, generated Wargus manifest, repo-native browser/layout verifiers.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Keep the fixed-demo visual composition; this is clarity and control work, not a reskin.
- Keep the one-Peasant start. Explain `Food 1/0`; do not add starting supply.
- Preserve the source-faithful 127-entry queue limit.
- Preserve source prerequisite/resource/supply checks: enqueue checks current
  supply but does not reserve queued demand; completion rechecks supply/limits.
- Do not alter costs, durations, damage, or tech dependencies.
- Browser-visible behavior is the acceptance criterion; static verifiers are guardrails.

---

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/014-make-ai-execute-its-strategy.md, plans/015-complete-demo-tech-paths.md
- **Category**: bug, direction
- **Planned at**: commit `6af2eeb`, 2026-07-10

## Player-visible contract and evidence

- Assigned scenarios: M11–M12; replay M01, M04, and M10.
- Before: icons fail, disabled commands hide their reason, paid queue entries are hidden, queued food is incorrectly reserved, completion can stall silently, nearby obstruction can falsely look terminal, and input state can become invalid/stale.
- After: command and queue state is truthful, queued food follows source timing, completion blocks have feedback, trained units search outward for egress, selections obey source categories/ownership, and targeting follows the camera.
- Required handoff: `plans/evidence/016.md`, including screenshots, queue/resource/supply deltas, console scan, and pointer/selection snapshots.

## Current state

- `iconTextureAtlas.ts` uses `scripts/tilesets/summer.lua` directly in `/wargus/graphics/tilesets/${tilesetName}/icons.png`, producing a live load warning and text-only command buttons.
- `HudCommand` carries only a `disabled` boolean; `sourceCommandDisabled` discards which dependency, resource, supply, limit, or busy state failed.
- The fixed HUD renders only `selected.productionQueue[0]` and cancels only index zero; the general HUD already renders `slice(0, visibleProductionSlots)` with real indices.
- Queued demand is included in `getPlayerSupply().queued` and used to reject
  later queue entries. Original Wargus does not reserve queued food; each paid
  head rechecks supply only at completion.
- A production order that cannot spawn or violates a completion limit silently resets `remainingSeconds` and retries. `findSpawnTile` checks only a narrow ring, while source `DropOutOnSide` expands outward.
- `sourceCommandStatusLineText` prints the raw `time` cost; runtime duration is `time / 5 / speedFactor`.
- `drawFixedDemoSelectedStats` displays any positive `attackRange`, even for `canAttack === false` buildings.
- `sourceHintText` strips markup but preserves the imported typo `SET ZTOP`.
- `completeSelectionDrag` additive-merges rectangle ids directly, bypassing `sourceCanToggleUnitIntoSelection`.
- Plain rectangle selection can return every visible id in the box instead of applying source ownership/category priority.
- `pointerWorldPosition` changes only on pointer movement while the camera changes every frame.

## Interfaces

Structured command block reason:

```ts
export type SourceCommandBlockReason =
  | { kind: "busy" }
  | { kind: "dependency"; ids: string[] }
  | { kind: "resource"; shortages: Array<{ resource: "gold" | "wood" | "oil"; amount: number }> }
  | { kind: "supply"; amount: number }
  | { kind: "limit" }
  | { kind: "unavailable" };

export function firstSourceCommandBlockReason(
  world: WorldState,
  button: WargusButton,
  selectedUnits: WorldUnit[]
): SourceCommandBlockReason | null;
```

`HudCommand` gains `disabledReason?: string`. `BrowserSmokeCommand` and `ModernHudLayoutDebug.commandButtons` expose the rendered string for behavioral verification.

Production status:

```ts
export interface ProductionOrder {
  unitTypeId: string;
  remainingSeconds: number;
  totalSeconds: number;
  blockedReason: "supply" | "limit" | "no-egress" | null;
}
```

`no-egress` is a TypeScript safety fallback only when no valid tile exists on
the entire map; an ordinarily surrounded producer must find the nearest tile
beyond the ring. Old saves normalize missing `blockedReason` to `null`.

## Design decision and rollback

- **Rejected:** infer English failure reasons independently in the HUD; duplicated rules will drift from simulation eligibility.
- **Rejected:** preserve queued-supply reservation because it already exists in
  the port. It contradicts Wargus enqueue/completion timing and makes cancel
  appear to refund food that source never reserved.
- **Rejected:** report `Exit blocked` for a one-ring surround. Original
  `DropOutOnSide` expands outward until a valid tile is found.
- **Chosen:** structured usability reasons, indexed compact queue slots,
  completion-time supply/limit state, bounded whole-map egress with a terminal
  safety diagnostic, source category/ownership selection, and narrow display
  normalization.
- **Rollback trigger:** an enabled command shows a failure reason, cancelling slot N affects another slot, a save loses queue state, or the fixed HUD overlaps at a required viewport. Roll back the failing UI/state checkpoint without removing already-accepted icon/input fixes.

## Scope

**In scope**:

- `src/simulation/world.ts`
- `src/simulation/orders.ts`
- `src/wargus/saveGame.ts`
- `src/view/renderHud.ts`
- `src/view/sourceUiHelpers.ts`
- `src/view/iconTextureAtlas.ts`
- `src/view/selectionInput.ts`
- `src/main.ts`
- `scripts/verify-modern-hud-layout.mjs`
- `scripts/verify-browser-command-card-session.mjs`
- `scripts/verify-browser-train-session.mjs`
- `scripts/verify-source-selection-mixing.mjs`
- `scripts/verify-source-status-line-tooltips.mjs`
- `scripts/verify-icon-references.mjs`
- `plans/evidence/016.md` (create during execution)
- `plans/README.md`

**Out of scope**:

- New HUD art or layout system
- Queue-limit reduction
- Changing source dependency rules
- Audio behavior owned by plan 013
- AI or pacing changes
- Asset-pack regeneration

## Git workflow

- Suggested branch: `codex/016-gameplay-legibility`
- Land the checkpoints below as separate reviewable commits. Do not begin a
  checkpoint until the preceding checkpoint is READY in `plans/evidence/016.md`.
- Do not push or open a PR unless instructed.

## Landing checkpoints

| Checkpoint | Tasks | Allowed result | Acceptance before continuing |
|---|---|---|---|
| 016-A — icon baseline | 2 | The atlas id is normalized only at the presentation boundary; real command icons load. | Icon verifier passes, the live warning is absent, required viewports fit, and no simulation/world/save files change. |
| 016-B — actionable commands | 3–4 | Simulation returns structured usability reasons and the fixed opening explains `Food 1/0` without changing supply. | Dependency/resource/supply/busy/limit fixtures agree with authoritative eligibility; enabled commands never show a reason; Hall warning fits and clears. |
| 016-C — queue and status truth | 5–7 | Six indexed entries and overflow are visible/cancellable; food is unreserved until completion; supply/limit blocks, source-like egress, duration, and selected stats are truthful and save-safe. | Cancel index 2 refunds only its resources; a supply-blocked head retries and clears; one-ring obstruction ejects beyond the ring; text fixtures and save round-trip pass. |
| 016-D — input correctness | 8–10 | Additive and plain selection obey source ownership/categories and stationary-cursor targeting tracks camera movement. | M12 and full M11 playable session pass with no required-viewport overlap or drag discontinuity; replay M01/M04/M10. |

If a checkpoint fails twice, revert only that checkpoint and keep the last READY
commit. A presentation checkpoint may not weaken simulation eligibility to pass.

## Steps

### Task 1: Establish the presentation/input baseline

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:modern-hud-layout`.
- [ ] Run `npm run verify:browser-command-card-session`.
- [ ] Run `npm run verify:browser-train-session`.
- [ ] Run `npm run verify:source-selection-mixing`.
- [ ] Run `npm run verify:source-status-line-tooltips`.
- [ ] Run `npm run verify:icons`.

Expected: all exit 0. STOP on a pre-existing unrelated failure.

### Task 2: Normalize the icon-atlas tileset id

- [ ] Add a local `normalizeIconTilesetName` helper to `iconTextureAtlas.ts`.
- [ ] Strip `scripts/tilesets/`, optional `wargus/`, and `.lua`, then fall back to `summer` for an empty result.
- [ ] Use the normalized name for both the asset URL and warning text.

Target helper:

```ts
function normalizeIconTilesetName(value: string | null | undefined): string {
  return (value ?? "summer")
    .replace(/^scripts\/tilesets\//, "")
    .replace(/^wargus\//, "")
    .replace(/\.lua$/, "") || "summer";
}
```

- [ ] Extend `scripts/verify-icon-references.mjs` with the same four manifest tileset variants already used by sound normalization.

**Verify**: `npm run verify:icons` -> exits 0.

**Verify**: live console no longer prints `Unable to load icon atlas for tileset: scripts/tilesets/summer.lua`.

### Task 3: Return an actionable disabled reason without changing source eligibility

- [ ] Implement `firstSourceCommandBlockReason` in `orders.ts` beside source command eligibility.
- [ ] Preserve the existing authoritative action/dependency/check-limit/resource evaluation order for build, train, upgrade-to, and research buttons. Do not rearrange mechanics merely to produce friendlier text.
- [ ] Treat always-visible grayscale buttons and English reasons as a TypeScript usability enhancement: source usually omits unavailable buttons and reports some resource/supply/limit failures only when clicked.
- [ ] For dependency alternatives, inspect the first declared invalid alternative and return all of its missing ids in declaration order. Do not choose a different alternative because it has fewer missing ids, and do not hardcode Archer/Lumber Mill examples.
- [ ] For affordability, return every insufficient resource in gold/wood/oil order and each shortfall amount, matching source's multi-resource report rather than hiding later shortages.
- [ ] For supply, return the additional demand required.
- [ ] Keep `sourceButtonHasExecutableContext` authoritative for the final enabled boolean.

Target formatting in `renderHud.ts`:

```ts
function commandBlockReasonText(manifest: WargusManifest, reason: SourceCommandBlockReason): string {
  switch (reason.kind) {
    case "busy": return "Production busy";
    case "dependency": return `Requires ${reason.ids.map((id) => id.startsWith("unit-")
      ? unitTypeName(manifest, id)
      : upgradeName(manifest, id)).join(" + ")}`;
    case "resource": return reason.shortages.map(({ resource, amount }) =>
      `Need ${amount} ${resource[0].toUpperCase()}${resource.slice(1)}`).join("; ");
    case "supply": return `Needs ${reason.amount} Food`;
    case "limit": return "Unit limit reached";
    case "unavailable": return "Unavailable in this battle";
  }
}
```

- [ ] Add `disabledReason` to `HudCommand` and prefer it in `commandStatusText` when a command is disabled.
- [ ] Expose it through browser smoke state and modern HUD debug.

**Verify**: `npm run verify:browser-command-card-session` -> exits 0 after checking prerequisite, supply, resource, and busy reasons.

### Task 4: Explain the intentional `Food 1/0` opening

- [ ] Record that the explicit `Build Hall` warning is a TypeScript usability enhancement; original Wargus leaves the player to infer the remedy from source command/supply feedback.
- [ ] In the fixed top bar only, when `supply.used > supply.cap` and the selected player has no completed main facility, append a compact `Build Hall` warning adjacent to Food.
- [ ] Keep the numeric display `1/0`; it is truthful. Do not grant temporary supply.
- [ ] Remove the warning automatically when the Hall completes.
- [ ] Record the warning in `ModernHudLayoutDebug.resourceChips` or a dedicated data-only field so layout verification can inspect it.

**Verify**: `npm run verify:modern-hud-layout` -> exits 0 and asserts the opening warning fits without overlap at all covered viewports.

### Task 5: Render and cancel the visible production queue by index

- [ ] Replace the fixed HUD's single `activeProduction` row with up to six compact queue slots, following the indexed model at `renderHud.ts:1867-1897`.
- [ ] Slot zero includes the progress bar; later slots show icon/short label and their queue index.
- [ ] Each slot calls `onProductionQueuePick(selected.id, { kind: "production", index })` with its actual index.
- [ ] If more than six entries exist, show `+N` after the sixth slot.
- [ ] Extend `ModernHudLayoutDebug` with data-only queue rectangles and indices; do not expose Pixi objects.

**Verify**: `npm run verify:modern-hud-layout` -> exits 0 and verifies indices 0..5, no overlap, and `+N` behavior.

- [ ] Extend `scripts/verify-browser-train-session.mjs` to queue at least four Peasants while current free food permits each enqueue, cancel index 2, and confirm only that order's resources are refunded while supply used/cap stay unchanged and indices 0, 1, and former 3 remain.

**Verify**: `npm run verify:browser-train-session` -> exits 0.

### Task 6: Restore source supply timing and source-like production egress

- [ ] Add `blockedReason` to `ProductionOrder` and every constructor with default `null`.
- [ ] Remove queued demand from supply eligibility. Enqueue checks current used/cap but paying for another queued order does not reserve food and cancellation never refunds food.
- [ ] When the head reaches completion, recheck supply and unit/type/total limits. Keep the paid order at the head with `"supply"` or `"limit"`, retry deterministically, and complete once the block clears.
- [ ] Replace the narrow-ring `findSpawnTile` with deterministic outward expansion equivalent to source `DropOutOnSide`: search beyond a surrounded producer until the nearest valid map tile is found.
- [ ] Bound the outward search by the whole map. Set `"no-egress"` only when no valid tile exists anywhere; this is a TypeScript safety divergence from source's unbounded retry, not the normal result of a one-ring surround.
- [ ] Clear the field as soon as production can complete, when the block changes, or when an old order is loaded without a block.
- [ ] Show `Needs N Food`, `Unit limit reached`, or `No valid exit` on slot zero instead of a misleading completed progress label.
- [ ] Normalize the field in `saveGame.ts`; old saves use `null`.

**Verify**: extend the browser train session so several same-demand units can be paid while only current supply is checked; the head waits at completion when food is exhausted, then completes after supply is added.

**Verify**: surround a producer's immediate ring. Expected: the unit exits on the nearest valid tile beyond the ring without a normal blocked-exit state. Add a whole-map-invalid fixture for the bounded `no-egress` safety case.

**Verify**: `npm run verify:save-schema` -> exits 0.

### Task 7: Display real elapsed time and truthful stats

- [ ] Treat `Time Ns`, `Provides N Food`, and the exact `ZTOP` presentation correction as TypeScript clarity enhancements; source command status omits time entirely.
- [ ] Change `sourceCommandStatusLineText` to accept enough world/player context to use `sourceBuildDurationSecondsForPlayer`, `sourceTrainDurationSecondsForPlayer`, `sourceUpgradeDurationSecondsForPlayer`, or `sourceResearchDurationSecondsForPlayer`.
- [ ] Omit the raw `time` pair from `sourceCostListText`; append `Time Ns` using the correct helper and `Math.ceil`.
- [ ] Keep Gold/Wood/Oil display unchanged.
- [ ] Update all call sites consistently.
- [ ] In `drawFixedDemoSelectedStats`, display Range only when `selected.canAttack` is true.
- [ ] For Farms/supply buildings, show `Provides N Food` when `selected.supply > 0`.
- [ ] In `sourceHintText`, normalize the exact imported token `ZTOP` to `STOP` after stripping source markup. Do not add general spell-checking.

**Verify**: `npm run verify:source-status-line-tooltips` -> exits 0 and checks Town Hall 51s / Footman 12s at factor 1.

**Verify**: `npm run verify:modern-hud-layout` -> exits 0 and a Farm fixture shows no Range plus its supply contribution.

### Task 8: Apply source category, ownership, and mixing rules to rectangle selection

- [ ] Define a source building category from the unit definition's actual `building`/`Building` flag. Do not infer buildings from zero speed or tile size; 2×2 mobile siege/ships remain mobile.
- [ ] Preserve the source selection cap of 18.
- [ ] For additive rectangle and same-type selection, filter candidates to local/teamed, usable, rectangle-selectable units before applying mixing: a first selected building admits only its exact type; a mobile-first selection admits mixed mobile types but no buildings.
- [ ] Starting from `currentIds`, add legal candidates in deterministic selection order through one shared helper.
- [ ] For plain rectangle replacement, prefer local/teamed mobile units. If none exist, select same-type buildings; if neither exists, select one static, neutral, or enemy object. Do not return every visible id in the rectangle.

Keep the category/ownership predicate and deterministic merge in shared pure
helpers; both input paths must call those helpers instead of separately
reimplementing source rules.

**Verify**: `npm run verify:source-selection-mixing` -> exits 0 and covers soldier+Hall, same/different building types, a 2×2 mobile plus another mobile, enemy-only rectangles, plain-selection priority, ownership/usability filters, and the 18-unit cap.

### Task 9: Recompute pointer world position after camera movement

- [ ] Immediately after `updateCamera`, if `pointerScreenPosition` exists, recompute `pointerWorldPosition` through `worldPointForScreenPosition`.
- [ ] If a drag is active, update its current world point after the recompute.
- [ ] Remove no pointer event handlers; normal mouse movement still updates both screen and world positions.
- [ ] Ensure overlays and hover detection consume the recomputed value later in the same frame.

Target placement:

```ts
updateCamera(...);
if (pointerScreenPosition) {
  pointerWorldPosition = worldPointForScreenPosition(pointerScreenPosition.x, pointerScreenPosition.y);
  if (pointerWorldPosition) updateSelectionDrag(selectionDrag, pointerWorldPosition.x, pointerWorldPosition.y);
}
```

**Verify**: extend `scripts/verify-modern-hud-layout.mjs` or the fixed-demo input verifier to hold the cursor still, pan the camera, and confirm the hovered/build-preview world tile changes with the camera.

### Task 10: Perform the playable clarity session

- [ ] In the in-app Browser, play from one Peasant through Hall, Farm, Barracks, and a four-item worker queue.
- [ ] Inspect disabled Archer/Keep/advanced commands before and after prerequisites.
- [ ] Pan the camera while leaving the cursor over a build preview.

Expected observable behavior:

- Real command icons load.
- `Food 1/0` visibly explains `Build Hall` without changing the premise.
- Disabled buttons state the actual missing thing.
- Four paid queue entries are visible and any one can be cancelled directly; cancellation returns resources only and does not change used/cap food.
- Multiple units may be queued against the same currently-free food; the head reports a supply block at completion and proceeds after a Farm completes.
- A producer surrounded on its immediate ring ejects the trained unit at the nearest valid tile beyond it.
- Town Hall time is approximately 51s at 1x; Farm has no attack range line.
- Shift-drag never creates a building/mobile mixed selection.
- Build preview remains under the stationary screen cursor while the world beneath it pans.

### Task 11: Close out

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:modern-hud-layout`.
- [ ] Run `npm run verify:browser-command-card-session`.
- [ ] Run `npm run verify:browser-train-session`.
- [ ] Run `npm run verify:source-selection-mixing`.
- [ ] Run `npm run verify:source-status-line-tooltips`.
- [ ] Run `npm run verify:icons`.
- [ ] Run `npm run verify:save-schema`.
- [ ] Replay M01/M04/M10 and record M11–M12 in `plans/evidence/016.md`; obtain a READY review decision.
- [ ] Run `git diff --check` and confirm only in-scope files changed.
- [ ] Update plan 016 to `DONE` in `plans/README.md`.

## Done criteria

- [ ] Icon atlas loads from normalized tileset paths.
- [ ] Disabled source commands expose a specific actionable reason.
- [ ] The one-Peasant `1/0` state explains the Hall requirement without changing supply.
- [ ] Up to six queue entries are visible and cancel by real index; overflow count is shown.
- [ ] Queued units do not reserve food; supply/limit completion blocks report and clear their reason.
- [ ] Trained units search outward past an occupied ring; `no-egress` is reserved for a whole-map-invalid safety case.
- [ ] Time/status/stat text reflects actual mechanics.
- [ ] Additive and plain rectangle selection obey source category, ownership, priority, and mixing rules.
- [ ] Stationary-cursor targeting follows camera movement correctly.
- [ ] Browser verification and the playable clarity session pass.
- [ ] M01, M04, and M10–M12 evidence is recorded and plan 016 has a READY review decision.

## STOP conditions

- Producing disabled reasons requires duplicating dependency graphs in `renderHud.ts`.
- Queue rendering requires reducing the source queue limit.
- Icon normalization requires changing or regenerating the asset pack.
- Production blocked state or corrected no-reservation supply timing cannot be added backward-compatibly to saves.
- Camera recomputation creates a selection-drag discontinuity.
- The fixed HUD needs a wholesale layout redesign to fit six compact slots.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

Keep reasons structured until the presentation boundary so future localization or alternate HUDs do not parse English. Source command omission/click-time feedback and TypeScript always-visible reasons are intentionally distinct; do not change eligibility to make the enhancement easier. Queued food is derived from completed units, never paid orders. Any new production-block cause should extend `blockedReason` instead of overloading remaining time. Selection category comes from definitions, not movement heuristics.
