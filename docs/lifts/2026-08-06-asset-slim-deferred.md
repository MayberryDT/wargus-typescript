# Asset slim deferred — `public/wargus`

**Date:** 2026-08-06  
**Plan task:** Task 8 (optional) — demo cut and archive  
**Decision:** **Do not slim** the asset pack in this cut. Prefer full pack + green gates over risky surgery.

## Investigation

| Check | Result |
|-------|--------|
| Pack size | ~275M under `public/wargus` |
| Manifest maps | 301 |
| Manifest units / sounds | 175 / 224 |
| Indexer | `scripts/index-wargus-data.mjs` (`npm run index:wargus`) |
| Sync | `scripts/sync-wargus-assets.mjs` — copies everything referenced by the full manifest |
| Gate | `npm run verify:wargus-assets` (release-blocking) |

### Why no safe automated path

1. **Indexer is full-catalog.** `index-wargus-data.mjs` walks the Wargus data root and emits the entire maps/units/sounds/UI/campaign surface into `public/wargus/manifest.json`. There is no demo-map filter, Garden-of-war-only mode, or “minimal pack” flag.
2. **Sync mirrors the full manifest.** `sync-wargus-assets.mjs` copies every unit, missile, construction, map, sound, and music entry listed — not a demo subset.
3. **Runtime and verifiers assume the full pack shape.** Browser smoke and asset verify treat `manifest.json` + asset routes as critical. Hand-deleting maps/units while keeping a full-shaped manifest (or rewriting the manifest by hand) risks black screens and gate failures with no easy rollback short of re-indexing from `WARGUS_DATA_ROOT`.
4. **Demo still loads through the full index.** Fixed map is `maps/ladder/Garden of war BNE.pud.smp.gz`, but unit graphics, tilesets, UI, and sounds are resolved from the shared catalog. Proving a minimal closure set needs a dedicated reachability pass (session load + texture/sound refs), not a one-shot delete.

## What was kept

- Entire `public/wargus/**` as-is on `main`
- Full freeze on `archive/full-port` (same assets at cut time; no separate slim branch)

## When to revisit

Only with an **explicit** product decision and a designed path, e.g.:

1. Add a demo-minimal filter mode to the indexer (or a post-process that builds a closed set from the fixed demo session).
2. Generate a slim pack on a branch; run `verify:wargus-assets` + full `verify:demo` (including browser smoke against critical asset routes).
3. Document the kept path list under `docs/lifts/` and update `archive/MANIFEST.md` map-catalog status if maps are dropped from the on-disk pack.

Until then: **do not hand-delete under `public/wargus`.** Disk cost is acceptable for demo polish work; correctness is not.

## Related

- Product: [docs/DEMO-PRODUCT.md](../DEMO-PRODUCT.md)
- Archive: [docs/ARCHIVE.md](../ARCHIVE.md)
- Runtime map: [docs/DEMO-MAP.md](../DEMO-MAP.md)
