# Demo Cut and Archive — Closeout

**Date:** 2026-08-06  
**Host:** `halla`  
**Branch:** `main`  
**Plan:** [2026-08-06-demo-cut-and-archive.md](./2026-08-06-demo-cut-and-archive.md)  
**Design:** [2026-08-06-demo-cut-and-archive-design.md](../specs/2026-08-06-demo-cut-and-archive-design.md)

## Freeze identity

| Artifact | Value |
|----------|--------|
| Freeze SHA | `10ab3d3892abd95ae05e3477004f99b847090022` |
| Tag | `archive/full-port-pre-demo-cut` |
| Branch | `archive/full-port` |

```bash
git rev-parse archive/full-port archive/full-port-pre-demo-cut^{}
# both → 10ab3d3892abd95ae05e3477004f99b847090022
```

## Success checklist (Task 10)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Tag + branch same SHA | **pass** |
| 2 | Archive docs / gate contract | **pass** `npm run verify:demo-gate-contract` |
| 3 | Manifest has statuses | **pass** `archive/MANIFEST.md` |
| 4 | Default `verify` is demo | **pass** → `npm run verify:demo` |
| 5 | Demo gate green | **pass** `npm run verify:demo` EXIT 0 (~7.3 min) |
| 6 | No full source dump on main | **pass** no `archive/full-port-snapshot` |
| 7 | AGENTS points at product | **pass** `DEMO-PRODUCT` + `ARCHIVE` |
| 8 | `archive:info` works | **pass** |

Evidence log: `.artifacts/demo-cut/task-10-verify-demo-full.log` (local / gitignored).

## Demo gate composition

Default:

```text
npm run verify  →  npm run verify:demo
```

`verify:demo` chain:

1. `verify:demo-gate-contract`
2. `verify:wargus-assets`
3. `tsc --noEmit`
4. `verify:playtest-telemetry`
5. `verify:runtime-determinism`
6. `verify:browser-runtime-smoke`
7. `verify:browser-playable-session`
8. `verify:browser-demo-session` (fixed input → harvest → train → victory on Garden of war)
9. `verify:browser-combat-session`
10. `verify:fixed-demo-polish`
11. `verify:fixed-demo-random-ai`
12. `verify:fixed-demo-unit-portrait`

**Extended (not default):** `verify:demo-extended` = `verify:demo` + `verify:browser-command-card-session` (Task 3 Fallback B).

## What was deleted vs deferred

### Deleted / collapsed on `main`

| Area | What happened |
|------|----------------|
| Package scripts | Collapsed full-port verify surface (−187 package scripts; Task 5) |
| Script files | Removed full-port `verify-source-*` and non-demo browser matrices from `main` (recoverable from freeze) |
| Default verify | No longer a multi-hour full-port chain; demo gate only |
| Plans roadmap | Marked historical (Task 6) |

### Deferred (explicit)

| Area | Decision | Pointer |
|------|----------|---------|
| Unreachable TS deletes (batch C) | **Skipped** — 0 `safe-delete-candidate` (68/68 reachable) | `archive/MANIFEST.md` § Batch C; `.artifacts/demo-cut/batch-c-skipped.md` |
| `public/wargus` asset slim | **Deferred** — no safe automated filter; full pack kept (~275M) | [docs/lifts/2026-08-06-asset-slim-deferred.md](../../lifts/2026-08-06-asset-slim-deferred.md) |
| God-file splits | **Deferred** — candidates recorded; no pilot extract | [docs/DEMO-MAP.md](../../DEMO-MAP.md) §10 |
| Command-card in default gate | Stays on `verify:demo-extended` only | Task 3 Fallback B |
| Product shell unlink (campaign/map picker still static-wired) | Future cut after re-trace | Task 4 / MANIFEST |

### Not deleted (hard rules)

God files remain intact: `orders.ts`, `main.ts`, `world.ts`, `renderHud.ts`, `renderWorld.ts`, `saveGame.ts`. No full dump under `archive/` on main.

## Agent navigation (post-cut)

| Doc | Role |
|-----|------|
| [docs/DEMO-PRODUCT.md](../../DEMO-PRODUCT.md) | Product in/out contract |
| [docs/DEMO-MAP.md](../../DEMO-MAP.md) | Runtime path + module graph + split candidates |
| [docs/ARCHIVE.md](../../ARCHIVE.md) | Freeze identity, restore, lift recipe |
| [archive/MANIFEST.md](../../../archive/MANIFEST.md) | Subsystem status |
| `npm run archive:info` | Print freeze pointers |

## Handoff — play-session performance (next program)

Only start after this closeout is green.

1. Host demo on Halla Tailscale for human play  
   (`100.105.117.93` / `halla.tailaf7529.ts.net`, free high port; not `127.0.0.1` for the user)
2. Player exports `window.__WARGUS_TS_EXPORT_PLAYTEST_LOG__()`
3. Analyze jank reasons (update vs render vs frame)
4. Fix specific hot paths on the demo surface only
5. Re-run `npm run verify:demo` after each fix

Do **not** re-expand full-port verify, invent archived subsystems, or slim assets without an approved path.

## Plan commits (freeze → closeout)

Freeze base: `10ab3d3`. Implementation commits live on `main` after that (Tasks 2–10). Tag/branch `archive/full-port*` must remain at freeze SHA.
