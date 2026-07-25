# Plan 014 independent-review fix report

- Date: 2026-07-23 (America/Chicago)
- Host/worktree: `halla` / `/home/halla/workspaces/Wargus-TypeScript-roadmap`
- Branch: `codex/gameplay-roadmap`
- Review base: `7de113cd152acf3185e9d76d85d2472977c17870`
- Final HEAD: `0bc5eb4a5d10c0aee26311d098719d990e442fee`
- Source review: `/home/halla/workspaces/Wargus-TypeScript-artifacts/plan014-final-review-report.md`
- Decision: **IN PROGRESS — NOT READY**. All accepted implementation findings are corrected and the non-browser gates pass. M07 reconciliation, the segmented Task 9 live M08/M09 session, progressed-stage budgets, and a new independent READY review remain pending.

## Commits

- `78e128d` — Fix Plan 014 AI construction requests.
- `0224d12` — Bound Plan 014 AI force state.
- `fedb8f5` — Make Plan 014 browser gate production honest.
- `154efa3` — Expose honest Plan 014 runtime evidence.
- `0bc5eb4` — Correct Plan 014 acceptance evidence.

No commit was pushed or deployed. Plans 016 and 017 were not changed.

## Accepted findings fixed

### Construction manager

All scripted and direct source-AI building requests use one shared request path. It counts completed buildings, foundations, and unpaid `to-site` orders; reserves every valid pending cost; selects deterministic source-eligible builders, including resource-travel workers; and leaves the opening Hall unpaid until arrival. The focused runtime verifier exercises the real manager for one Hall, a travelling-worker second Barracks, competing unpaid costs, and the real arrival transition.

### Force membership, launch safety, and loaded-state bounds

Scripted targets now require exact race-resolved types, with each unit id claimed once across target rows. A launch succeeds only after every assigned unit receives a real attack or attack-move order; an orderless/no-pressure attempt retains the slot and ids for retry. Save normalization replays the selected source script to cap script index, active forces, roles, targets, assigned ids, launches, and launch ids; it removes missing/wrong-type ids and prevents active/launch overlap. The verifier covers mixed cavalry-mage/mage membership, a blocked launch, and an oversized stale save loaded through the real loader.

### Production-honest browser gate

Playwright `1.61.1` is declared and locked, Chromium resolves portably, and production smoke now launches Vite `preview`. The focused browser-basics shard retains audio/music, fog, selection, right-click, and screenshot-transition checks. The static contract rejects Halla paths, an external `PLAYWRIGHT_MODULE`, dev-server production smoke, and removal of those focused assertions.

### Live evidence and artifact hook

The running-world smoke state now exposes bounded AI force/launch membership, build desires/completed/foundation/in-flight counts, unpaid orders and reserved resources, speed factors, AI-owned exploration/scout state, production queue durations, and construction durations. Plan 014 browser mode validates this live state and no longer invokes the synthetic script or knowledge fixtures. Those fixtures remain focused unit/integration tests under `verify:plan014-ai-runtime` and are no longer described as live progression.

An optional `WARGUS_BROWSER_RUNTIME_REPORT=/absolute/path.json` writes the final accepted browser payload, including full M01/M04/M07 output, live AI evidence, and update/render telemetry. This provides a reproducible M07/M09/progressed-performance artifact format for a separately authorized browser run; it was not invoked in this no-browser fix task.

### Evidence and scope corrections

The plan scope now includes the package/lockfile, minimap implementation/verifier, browser static contract, and focused Plan 014 verifier. `plans/evidence/014.md` explicitly de-labels the old synthetic M08/M09 row, treats the contradictory M07 record as pending, limits the accepted 20/24 ms sample to the opening, preserves Task 9 as mandatory, and records the historical checkpoint-review gap. The roadmap remains IN PROGRESS.

## TDD and correction evidence

- Construction fixture red PID `1922300`: focused fixture missing. Green PIDs `1935029`, `1947098` after shared request implementation.
- Force fixture red PID `1943119`: force-safety fixture missing. Green PID `1947098` after exact assignment/retry behavior.
- Save-bounds red PID `1951623`: `sourceAiScriptSaveBounds` missing. Green PIDs `1975427`, `1981392` after script-derived normalization.
- Live-evidence red PID `2002210`: `sourceAiRuntimeEvidence` missing. Green PID `2007850` after bounded evidence implementation.
- TypeScript correction PID `1286297` exposed nullable `world` closure capture; immutable `smokeWorld` fixed it, and PID `1287830` passed.
- Static-contract correction PID `1293216` exposed the stale `world` evidence fragment; PID `1293826` passed after matching the immutable snapshot.

No focused failure was hidden or waived.

## Final non-browser verification

Every project command ran serially with `nice -n 10` on Halla.

| PID | Command | Result |
|---:|---|---|
| 1298722 | `./node_modules/.bin/tsc --noEmit` | PASS |
| 1299214 | `npm run verify:plan014-ai-runtime` | PASS — manager/arrival, exact mixed force, blocked launch, bounded save |
| 1299680 | `npm run verify:fixed-demo-random-ai` | PASS |
| 1300096 | source-backed `npm run verify:source-ai-difficulty` | PASS |
| 1300367 | `npm run verify:source-ai-forces` | PASS — 74 plans across 40 maps |
| 1300777 | source-backed `npm run verify:source-ai-explores` | PASS |
| 1301075 | `npm run verify:save-schema` | PASS — 50 persisted fields |
| 1301340 | `npm run verify:minimap-render-cache` | PASS |
| 1301648 | `npm run verify:playtest-telemetry` | PASS |
| 1302018 | `npm run verify:runtime-determinism` | PASS |
| 1302328 | `node --check scripts/verify-browser-runtime-smoke.mjs` | PASS |
| 1302659 | `node --check scripts/verify-browser-native-viewport.mjs` | PASS |
| 1302948 | `node --check scripts/verify-plan014-ai-manager.mjs` | PASS |
| 1303207 | `node scripts/verify-browser-native-viewport.mjs` | PASS |
| 1303574 | `npm run build` | PASS — asset preflight, TypeScript, 764 Vite modules |
| 1304023 | `npm run verify:wargus-assets` | PASS — 1,182 files |

Final `git diff --check` passed before each commit, and the final worktree is clean at `0bc5eb4`.

## Deferred browser acceptance

No browser, game, Vite server, Task 9 segment, or runtime report was launched in this task, as required. The next acceptance pass must use the Codex in-app Browser and the segmented F12-load/Run/Pause/F11-save protocol in `plans/EXECUTION-GATES.md`, capturing:

1. level-3 selection and player-built defense from the one-Peasant opening;
2. Hall travel/foundation/completion with no duplicate or cancelled overcommit;
3. first and second production buildings;
4. literal 1-, 4-, and 16-unit launches and player contact with ids/ticks;
5. visible difficulty down/up and one real build/train duration;
6. an AI scout destination justified by its own exploration buffer; and
7. update/render averages at progressed milestones.

After that evidence lands, rerun the independent whole-plan review. Until it returns READY, Plan 014 must remain IN PROGRESS.
