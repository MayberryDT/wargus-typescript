# Full-port subsystem manifest

**Freeze:** `archive/full-port` @ `10ab3d3892abd95ae05e3477004f99b847090022`  
**Status values:** `in-demo` | `partial` | `archived`  
**Note:** Seed inventory for agent navigation. Refine after demo dependency trace if needed.

| Subsystem | Primary paths at freeze | Status |
|-----------|-------------------------|--------|
| Fixed demo scenario | `src/wargus/demoScenario.ts`, `demoMission.ts` | in-demo |
| App shell | `src/main.ts` | partial |
| World / visibility | `src/simulation/world.ts`, `visibilityCache.ts` | in-demo |
| Orders / AI / combat | `src/simulation/orders.ts` | partial |
| Pathfinding | `src/simulation/pathfinding.ts`, `pathRequests.ts` | in-demo |
| Occupancy / passability | `occupancyIndex.ts`, `passability.ts`, `terrainMetadata.ts` | in-demo |
| Render world / HUD | `src/view/renderWorld.ts`, `renderHud.ts` | partial |
| Audio | `src/audio/*` | partial |
| Save / load | `src/wargus/saveGame.ts`, `src/view/saveCommands.ts` | partial |
| Campaign | `src/wargus/campaignProgress.ts` | archived |
| Full map catalog | manifest maps beyond Garden of war | archived (data may remain until asset slim) |
| Source UI parity suite | `scripts/verify-source-*.mjs` | archived |
| Perf matrix harness | `scripts/run-successor-performance-matrix.mjs`, plans 018–025 | archived |
| Historical roadmap | `plans/001`–`027` | archived |

## How to use

1. Check status before expanding work: `in-demo` / `partial` may already live on `main`; `archived` is lift-from-tag territory.
2. Inspect or restore paths with the commands in [docs/ARCHIVE.md](../docs/ARCHIVE.md).
3. After a lift, update this table if ownership or status changed, and write `docs/lifts/YYYY-MM-DD-<topic>.md`.
