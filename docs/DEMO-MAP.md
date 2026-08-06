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

## Related inventory

Subsystem status (`in-demo` / `partial` / `archived`) lives in [archive/MANIFEST.md](../archive/MANIFEST.md). Lift missing pieces from `archive/full-port` per [ARCHIVE.md](./ARCHIVE.md); do not invent a second engine.
