# Demo Runtime Map

**Status:** Agent navigation map for the fixed Garden of war demo  
**Product contract:** [DEMO-PRODUCT.md](./DEMO-PRODUCT.md)  
**Archive:** [ARCHIVE.md](./ARCHIVE.md)

Plain-language path from browser boot to a playable ladder match. Prefer these owners before hunting the full tree.

## 1. Entry

- `src/main.ts` boots Pixi, owns the app shell, and drives the fixed browser demo session.
- Manifest and map index load through `src/wargus/manifest.ts` (and related Wargus asset/index helpers).
- Critical runtime dependency: `public/wargus/manifest.json` and the `public/wargus` asset pack.

## 2. Demo map load

- Fixed map constant: `FIXED_BROWSER_DEMO_MAP_PATH` in `src/wargus/demoScenario.ts`  
  (`maps/ladder/Garden of war BNE.pud.smp.gz`).
- Mission/objectives and demo staging: `src/wargus/demoMission.ts`, `demoScenario.ts`.
- Map setup: `src/wargus/mapSetup.ts` applies `applyFixedBrowserDemoSetup` (and related `applyFixedBrowserDemo*` helpers) so the fixed 1v1 human-vs-computer staging wins over generic map setup.

## 3. World / simulation

- Initial world: `createInitialWorld` in `src/simulation/world.ts`.
- Tick loop: `simulateWorld` and related world update paths in `world.ts`.
- Orders, AI, combat, economy actions: `src/simulation/orders.ts` (large; treat as shared core, not full-port surface by default).
- Pathfinding: `src/simulation/pathfinding.ts`, `pathRequests.ts`.
- Occupancy / passability / terrain: `occupancyIndex.ts`, `passability.ts`, `terrainMetadata.ts`.
- Visibility / fog helpers: `visibilityCache.ts`.

## 4. Input

- Selection, HUD command dispatch, map/right-click commands, and save command wiring live under `src/view/*`.
- Hotkeys and command-card behavior hang off the same view layer plus demo-aware shell code in `main.ts`.

## 5. Render

- World drawing: `src/view/renderWorld.ts` (tiles, units, fog, overlays as used by the demo).
- HUD drawing: `src/view/renderHud.ts`.
- Texture/atlas resolution is driven by Wargus unit/tileset data already indexed into the manifest and loaded by the shell.

## 6. Audio

- Mixer and playback: `src/audio/audioEngine.ts`.
- Cue selection / unit feedback: `src/audio/audioCues.ts` (plus related audio helpers under `src/audio/*`).

## 7. Telemetry / performance hooks

- Playtest and session hooks are wired from `src/main.ts`.
- Runtime measurement helpers: `src/performance/*` (`runtimePerformance.ts`, profiles, display-object helpers).
- Use these for demo polish; multi-profile successor matrix work is archived, not standing product work.

## 8. Verify

- Demo-scoped gate (after Task 3): `npm run verify:demo` / short default `npm run verify` as documented in the product contract.
- Existing demo-critical browser checks that already exercise this path include fixed-demo session verifiers (e.g. `verify:browser-demo-session`).
- Full-port `scripts/verify-source-*.mjs` and multi-map production matrices are archive reference, not the default product definition of green.

## 9. Modules reached (static graph)

- Tracer: `node scripts/trace-demo-imports.mjs` (relative `import`/`export … from` only; ignores bare packages and dynamic `import()`).
- Result (Task 4): **68 / 68** `src/**/*.ts` files are reachable from `src/main.ts`. `src/wargus/demoScenario.ts` is in the set.
- Unreachable / static safe-delete candidates: **none**. Product-archived surfaces (e.g. campaign) can still be static-wired; unlink shell imports before deleting.
- Non-`.ts` graph edges: `src/styles.css`, `src/wargus/scoutProvenance.mjs`.
- Evidence (local): `.artifacts/demo-cut/demo-import-trace.json`, `demo-import-classification.json`.

## 10. God-file split candidates (Task 9)

Line counts as of 2026-08-06 demo cut. **No pilot extract in this plan** — defer splits until after play-session polish unless a future task meets all criteria below.

| File | ~Lines | Decision | Notes |
|------|-------:|----------|-------|
| `src/simulation/orders.ts` | 21257 | **split later** | Shared core + full-port residue; do not rewrite in demo-cut |
| `src/main.ts` | 6428 | **split later** | App shell still carries campaign / map-picker / full-port UI wiring |
| `src/view/renderHud.ts` | 4728 | **split later** | HUD surface is partial; extract only pure leaves when agents mis-edit repeatedly |
| `src/wargus/saveGame.ts` | 4464 | **split later** | Save path partial; keep with `scoutProvenance.mjs` |
| `src/simulation/world.ts` | 2955 | **leave** | Core world tick; large but coherent owner for demo |
| `src/view/renderWorld.ts` | 2840 | **leave** | World draw owner; no pilot unless hot-path polish forces a pure extract |

### Split criteria (all must hold)

1. File > ~1500 lines **and** agents repeatedly mis-edit it  
2. Extract has a clear single responsibility and stable exports  
3. No behavior change (`tsc --noEmit` + `npm run verify:demo` green)  
4. No renaming of public simulation semantics  
5. One pilot extract max per effort (pure types/constants or leaf helpers), not a full rewrite  

### Explicit defer

God-file splits deferred until after demo polish / play-session performance work. Prefer surgical fixes inside the owner file over speculative module moves.

## Related inventory

Subsystem status (`in-demo` / `partial` / `archived`) lives in [archive/MANIFEST.md](../archive/MANIFEST.md). Lift missing pieces from `archive/full-port` per [ARCHIVE.md](./ARCHIVE.md); do not invent a second engine.
