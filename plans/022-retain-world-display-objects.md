# Plan 022: Retain World Display Objects

**Priority:** P1
**Effort:** L
**Risk:** Medium
**Depends on:** 018, 021
**Planned against:** `8ac0006` on 2026-07-27

## Problem

`renderWorld` destroys and reconstructs most Pixi world objects every frame. At line 74 of `src/view/renderWorld.ts`, `unitLayer.removeChildren()` is followed by recursive destruction through `destroyDisplayObject` at lines 440–444. Unit rendering then allocates new `Graphics`, `Sprite`, and `Container` instances beginning around line 567. Secondary world panes use the same teardown pattern around line 197.

This creates allocation, texture-binding, garbage-collection, and scene-graph churn proportional to the number of visible entities. The cost grows exactly when the game becomes crowded.

## Goal

Keep display objects alive across frames and update only properties that changed. After warm-up, an unchanged visible entity must not require a new Pixi display object.

## Non-goals

- Rewriting the HUD or minimap renderer.
- Changing simulation state, entity identity, save data, or draw semantics.
- Replacing Pixi or moving rendering to a worker.
- Optimizing fog; Plan 025 owns fog invalidation and chunking.

## Preconditions and Drift Checks

1. Confirm `hostname` is `halla`, the checkout is isolated under `/home/halla/workspaces/`, and the current branch/HEAD are recorded.
2. Read Plans 018 and 021 completely. Stop if either plan is not implemented or its relevant verification is failing.
3. Verify the renderer still destroys the world layer every frame and Plan 021 exposes a culled render snapshot with stable entity IDs and ordered partitions.
4. Run the smallest existing renderer and browser smoke checks. Record failures before editing.
5. Capture Plan 018 profiles for `army-100`, `army-200`, and `combat-100`, including frame percentiles, long frames, heap growth, and display-object create/destroy counters.

**STOP:** If rendered entities do not have deterministic stable IDs, repair Plan 021 or write a narrower prerequisite plan. Do not key retained objects by array position.

## Design

Add `src/view/worldRenderCache.ts` with a cache owned by a specific rendered world:

- One record per stable render entity ID and kind: unit, corpse, projectile, transient effect, and persistent world marker.
- Each record owns its Pixi container/sprite/graphics and the last applied render signature.
- Reconciliation consumes Plan 021's ordered, culled snapshot. It creates missing records, updates retained records, attaches them in snapshot order, and retires records no longer present.
- Short-lived effects use bounded pools by display-object shape where reuse is safe. Pools have hard caps and destroy overflow immediately.
- A world identity change explicitly disposes the complete cache. Normal frame reconciliation never calls recursive destruction for retained records.

Keep correctness explicit:

- Clear and redraw retained `Graphics` only when their geometry/style signature changes.
- Update transforms, tint, alpha, texture, animation frame, selection state, health bars, construction progress, and owner/team state independently.
- Detach an entity immediately when culled, hidden, loaded into transport, dead, or removed. A culled live entity may retain its record in a bounded dormant cache; it must not remain attached.
- Preserve Plan 021's deterministic draw order. Reordering children must not recreate them.
- Do not share mutable display objects between the primary viewport and secondary panes. Each view owns its own cache while sharing immutable preparation data.

The cache is renderer-local and must never enter `WorldState`, replays, hashes, or saves.

## Implementation Steps

### Checkpoint A — Retain primary unit objects

1. Add the cache and lifecycle types in `src/view/worldRenderCache.ts`.
2. Reconcile primary-view unit records by stable unit ID.
3. Replace per-frame primary unit teardown with create/update/detach/dispose operations.
4. Add explicit cache disposal on world replacement, renderer destruction, and fatal render reset.
5. Add development diagnostics for cache size, active records, dormant records, creates, reuses, retirements, and destroys. Feed the counters into Plan 018 telemetry.

**Verify:**

- A stationary unit keeps the same Pixi object identity for at least 300 frames.
- Moving, animating, selecting, damaging, hiding, killing, and removing a unit updates the retained object correctly.
- After warm-up, an unchanged `army-100` scene reports zero steady-state unit display-object creations.

### Checkpoint B — Retain other world entities and secondary views

1. Migrate corpses, projectiles, transient effects, and persistent markers one kind at a time.
2. Add bounded pooling only where object reset semantics are fully specified and tested.
3. Give each secondary world view its own cache and reconcile it from the same prepared snapshot.
4. Keep non-world overlays and HUD rendering on their existing paths.

**Verify:**

- Mixed combat preserves effects, projectiles, corpses, selection indicators, and draw order.
- Switching or closing secondary panes releases only their cache.
- Pool sizes remain within their declared caps after a five-minute effect churn fixture.

### Checkpoint C — Remove obsolete teardown paths

1. Remove only the per-frame destruction paths made obsolete by the retained cache.
2. Keep a single explicit complete-disposal path.
3. Add `scripts/verify-world-render-cache.mjs` and a package script that checks cache ownership, stable-key reconciliation, pool caps, and disposal wiring without relying only on source-string matching.
4. Document the cache lifecycle beside its owner.

**Verify:**

- No routine primary or secondary world render recursively destroys all entity children.
- World replacement returns all cache and pool counters to zero after disposal.
- Plan 018 heap-growth sampling shows no unbounded retained-object growth.

## Tests

- Unit tests for reconcile create/update/detach/reattach/retire/dispose behavior.
- Unit tests for texture and geometry signature changes.
- Tests for cull exit/re-entry, transport hide/unhide, death/removal, and ID reuse across world replacement.
- Tests for deterministic child order when depth keys change.
- Pool reset and cap tests for each pooled object kind.
- Renderer parity fixture comparing prepared entity order and visible state before and after the migration.

## Performance Acceptance

Run Plan 018's exact bounded profiles with the same seed, viewport, warm-up, and capture duration:

- `army-100`, `army-200`, and `combat-100` meet the frozen frame and heap budgets from Plan 018.
- After warm-up, unchanged stable IDs produce zero entity sprite/container creations.
- Display-object creation scales with entity entrances and actual effect births, not total visible entities per frame.
- World-cache size is bounded by active visible records plus declared dormant and pool caps.
- Report before/after p50, p95, p99 frame time, frames over 50 ms, long tasks, heap growth, and create/destroy counts.

Do not accept a mean-FPS improvement if p95/p99 latency or heap growth regresses.

## Verification Commands

```bash
./node_modules/.bin/tsc --noEmit
npm run verify:wargus-assets
npm run build
npm run verify
npm run verify:world-render-cache
npm run verify:browser-runtime-smoke
npm run verify:browser-playable-session
```

Use the Codex in-app Browser with the `iab` backend for the Plan 018 captures and visual checks. Do not substitute a standalone browser without explicit approval.

## Completion Criteria

- World display objects are reconciled by stable ID instead of rebuilt every frame.
- All caches and pools have explicit ownership, bounds, and disposal.
- Renderer parity, lifecycle tests, browser checks, and deterministic verification pass.
- The exact before/after Plan 018 artifacts are recorded in `plans/evidence/022/`.
- The acceptance budgets pass without reducing simulation frequency, game speed, or visual correctness.

## Rollback

The migration is isolated behind the render-cache boundary. If a checkpoint fails, revert only that entity kind to Plan 021's prepared immediate renderer while retaining the verified cache work for earlier kinds. Do not restore recursive destruction for already-retained kinds as a silent fallback.
