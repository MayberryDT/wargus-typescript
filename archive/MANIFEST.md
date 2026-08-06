# Full-port subsystem manifest

**Freeze:** `archive/full-port` @ `10ab3d3892abd95ae05e3477004f99b847090022`  
**Status values:** `in-demo` | `partial` | `archived`  
**Static graph:** Task 4 demo import trace (`scripts/trace-demo-imports.mjs`) — **68 / 68** `src/**/*.ts` reachable from `src/main.ts`; **0** unreachable; **0** `safe-delete-candidate`. Evidence: `.artifacts/demo-cut/demo-import-trace.json`, `demo-import-classification.json`.

| Subsystem | Primary paths at freeze | Status |
|-----------|-------------------------|--------|
| Fixed demo scenario | `src/wargus/demoScenario.ts`, `demoMission.ts` | in-demo |
| App shell | `src/main.ts` | partial (still carries full-port UI / campaign / map-picker wiring) |
| World / visibility | `src/simulation/world.ts`, `visibilityCache.ts` | in-demo |
| Orders / AI / combat | `src/simulation/orders.ts` | partial (demo uses core; plan fixtures + full AI surface remain) |
| Pathfinding | `src/simulation/pathfinding.ts`, `pathRequests.ts` | in-demo |
| Occupancy / passability | `occupancyIndex.ts`, `passability.ts`, `terrainMetadata.ts` | in-demo |
| Render world / HUD | `src/view/renderWorld.ts`, `renderHud.ts` | partial |
| Audio | `src/audio/*` | partial |
| Save / load | `src/wargus/saveGame.ts`, `src/view/saveCommands.ts` | partial |
| Campaign | `src/wargus/campaignProgress.ts` (+ `nextCampaignMapFor` in `manifest.ts`) | partial (static-wired from `main.ts`; product campaign surface archived — unlink before delete) |
| Full map catalog | manifest maps beyond Garden of war | archived (data may remain until asset slim) |
| Source UI parity suite | `scripts/verify-source-*.mjs` | archived |
| Perf matrix harness | `scripts/run-successor-performance-matrix.mjs`, plans 018–025 | archived |
| Historical roadmap | `plans/001`–`027` | archived |

## Static import graph (Task 4)

- Entry: `src/main.ts`
- Reachable `src/**/*.ts`: **68** (entire tree)
- Unreachable: **none** → no static `safe-delete-candidate` set
- Non-`.ts` edges kept with the graph: `src/styles.css`, `src/wargus/scoutProvenance.mjs`
- Bare packages: `pixi.js`
- Dynamic `import()` under `src/`: none found
- Implication: later delete batches need product-surface / dead-shell cuts (unlink imports first), not “file never imported”

## How to use

1. Check status before expanding work: `in-demo` / `partial` may already live on `main`; `archived` is lift-from-tag territory.
2. Inspect or restore paths with the commands in [docs/ARCHIVE.md](../docs/ARCHIVE.md).
3. Re-run the graph after large shell cuts: `node scripts/trace-demo-imports.mjs`
4. After a lift, update this table if ownership or status changed, and write `docs/lifts/YYYY-MM-DD-<topic>.md`.
