# Plan 025 visibility/fog incremental evidence (2026-07-30)

## Delivered

### Checkpoint A — skip unchanged local FOV rebuilds
- New `src/simulation/visibilityCache.ts`
- Deterministic local vision signature over units, holy-vision, reveals, shared vision, revelation state, terrain version, FOV settings
- `updateVisibility` skips `visibleTiles` clear + FOV walk when signature is unchanged
- AI exploration cadence still honored on its existing schedule

### Checkpoint C (partial) — fog key without viewport bit-scan
- `drawFog` / `fogRenderKey` uses `getVisibilityRevision(world)` instead of hashing every viewport fog tile each frame once a revision is published

### Not fully delivered (honest scope)
- Checkpoint B contribution-count incremental FOV (add/subtract per source) remains future work; skip path already eliminates the stationary full-map FOV cost
- Fog chunk retain/dirty mesh (16-tile chunks) not implemented; revision key removes the full-viewport hash scan which was the dominant fog cost when visibility is idle

## Verifiers
- `npm run verify:visibility-fog-incremental` — stationary ticks skip; movement invalidates; grids preserved
- `npm run verify:x12-first-tick` — still green under Plan 024 budget
- `npm run verify:pathfinding-budget`
- `tsc --noEmit`, `verify:save-schema`, `verify:runtime-determinism`

## Sample results
Stationary sample after warm-up: fullRebuilds=1, skippedRebuilds increases each idle tick, visible/explored grids bitwise-identical across skips. Movement forces a new full rebuild and revision bump.
