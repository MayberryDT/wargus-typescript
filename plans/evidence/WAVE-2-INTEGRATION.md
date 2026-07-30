# Wave 2 Integration Evidence

**Verdict: READY — incremental Wave 2 integration accepted.**

## Exact integrated target

- Combined SHA: `6c5e0faa861e1ba7a931c913e561fb837c2afb01`.
- Integrated accepted implementation inputs:
  - Plan 019 target `5935a17f456868051c2c16b2f0d8d2b4da56d115`,
    [evidence](019.md), packet `20260730T090753875Z`;
  - Plan 020 target `9bab6b0e3f7d260148cc1c0f5c1c231098046e19`,
    [evidence](020.md), packet `20260730T092706827Z`;
  - Plan 021 target `a97eae19fff6516eff7bb3b582d35923d9f67992`,
    [evidence](021.md), packet `20260730T101718413Z`.
- Coordinator integration includes the accepted runtime commits, final
  fail-closed Plan 021 source gate, combined targeted-proof identity, and no
  rejected diagnostic packet or raw artifact.

## Combined verification gate

The exact combined SHA passed these commands:

| Result | Exact command |
| --- | --- |
| PASS | `npm run verify:terrain-metadata-cache` |
| PASS | `npm run verify:unit-index` |
| PASS | `npm run verify:render-preparation` |
| PASS | `./node_modules/.bin/tsc --noEmit` |
| PASS | `WARGUS_ORIGINAL_SOURCE_ROOT=/home/halla/workspaces/t3/Wargus-TypeScript npm run verify:source-pathfinding` |
| PASS | `WARGUS_ORIGINAL_STRATAGUS_SOURCE=/home/halla/workspaces/t3/Wargus-TypeScript/stratagus npm run verify:source-fov-fog` |
| PASS | `WARGUS_ORIGINAL_STRATAGUS_SOURCE=/home/halla/workspaces/t3/Wargus-TypeScript/stratagus npm run verify:source-attack-action` |
| PASS | `npm run verify:save-schema` |
| PASS | `npm run verify:runtime-determinism` |
| PASS — 1,182 files | `npm run verify:wargus-assets` |
| PASS | `npm run build` |
| PASS | `npm run verify:performance-acceptance-contract` |
| PASS | `npm run verify:successor-capture-contract` |
| PASS | `sg video -c 'sg render -c "npm run verify:browser-runtime-smoke && npm run verify:browser-combat-session && WARGUS_ORIGINAL_SOURCE_ROOT=/home/halla/workspaces/t3/Wargus-TypeScript npm run verify:browser-native-viewport && WARGUS_VISUAL_INTEGRATION_TARGET=6c5e0faa861e1ba7a931c913e561fb837c2afb01 npm run verify:wave2-render-visual-parity"'` |
| PASS — schema-v4, 49/49 qualified, `ready: true` | `sg video -c 'sg render -c "env WARGUS_PERF_PLAN=WAVE-2-INTEGRATION WARGUS_PERF_ACCEPTANCE_MODE=incremental WARGUS_ARTIFACT_WORKSPACE=/home/halla/workspaces/t3/Wargus-TypeScript-retained-artifacts WARGUS_ARTIFACT_ROOT=/home/halla/workspaces/t3/Wargus-TypeScript-retained-artifacts/.artifacts WARGUS_ARTIFACT_PRESERVATION_OWNER=wave2-integration npm run capture:wave2-integration"'` |

The browser gate covered runtime smoke, combat session, and native viewport,
including source fullscreen and viewport-mode checks. Exact visual parity against
accepted Plan 018 was 1280×720 DPR 1, zero changed pixels, maximum channel delta
zero, and 10,089 distinct RGB colors.

Visual packet:
`.artifacts/performance/WAVE-2-INTEGRATION/6c5e0faa861e1ba7a931c913e561fb837c2afb01/20260730T110019Z/visual-parity/`.
Its manifest SHA-256 is
`fe803a7ee1105f6b02794f2340e4ef6f3da9da707f063c168ed7c598f67785ed`.

## Full schema-v4 incremental matrix

Retained packet:
`.artifacts/performance/WAVE-2-INTEGRATION/6c5e0faa861e1ba7a931c913e561fb837c2afb01/20260730T110136185Z/`.
The 62-member manifest independently matched the exact directory member set
with zero hash mismatches. Manifest SHA-256:
`36aeaf093cdb4c2764715ee7dc0b33cc5f8170bda48217aa22292d258305f396`.

- Schema version 4; `incremental`; `ready: true`; 49/49 qualified trials.
- One retained row-5 slot-3 attempt was invalid because one command issue
  exceeded the 250 ms schedule tolerance. Its complete 20-outcome/40+40-sample
  diagnostics remain in the packet; the permitted replacement qualified.
- Every row had no new budget-failure key. Both robust frame-p95 components
  passed on every row: median-trial regression ranged from -0.20% to 0%, and
  pooled raw-frame regression was 0% throughout.
- The combined targeted proof passed terrain metadata parity/cache reuse, 600
  stable-tick unit-index reuse with one rebuild and zero ID writes, and render
  preparation ordering/culling/strata/index/frame/counter parity.
- Fixed-tick proof, environment and fingerprint comparability, checksum
  finalization, lock release, and exact process/port cleanup all passed.
  Owned PIDs `171757` and `171779` terminated; residual PIDs and open ports
  were empty. The disposable worktree and capture lock are absent.

## Remaining absolute failures

`absoluteBudgetsPass` and `absoluteReleaseAccepted` remain false, as expected
before Waves 3–5. The combined packet inherited only Plan 018 failures:

- rows 1–2: frame p95, frame p99, frames over 50 ms, heap;
- row 3: those keys plus scheduler dropped;
- row 4: those keys plus scheduler dropped and scheduler backlog;
- rows 5–7: frame p95, frame p99, frames over 50 ms, scheduler backlog, heap.

No threshold was changed and no inherited failure was relabeled as passing.
Wave 5 still requires `absolute-release` with every absolute shared budget
passing.

## Barrier result

The combined SHA satisfies the Wave 2 post-integration gate. After this durable
closeout lands, Plans 022 and 023 may refresh their concrete drift bases against
`6c5e0fa` and begin Wave 3 under their frozen ownership table. Performance
captures remain serial.
