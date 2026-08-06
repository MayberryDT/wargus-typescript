# Demo Cut and Full-Port Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze the full port immutably, make the archive discoverable to every future agent, redefine `main` as the single Garden of war ladder demo with a short default verify gate, then slim unused surface so polish and performance work target only that product.

**Architecture:** Immutable git tag + branch hold the complete pre-cut tree. `main` gains agent navigation docs (`docs/ARCHIVE.md`, `docs/DEMO-PRODUCT.md`, `docs/DEMO-MAP.md`, `archive/*`) and a `verify:demo` gate that becomes `npm run verify`. Out-of-scope scripts and unreachable code are removed from `main` only after the freeze and only in batches that re-pass the demo gate. Full source remains liftable via `git show` / `git checkout archive/full-port -- <path>`. God-file splits are optional, criteria-bound, and deferred until after the gate is stable. Play-session performance work is **out of this plan** and starts only after exit criteria pass.

**Tech Stack:** Git, Node.js, existing Vite/Pixi browser app, existing `scripts/verify-*.mjs` browser harness on host `halla`.

**Design spec:** `docs/superpowers/specs/2026-08-06-demo-cut-and-archive-design.md`

## Global Constraints

- Host: all implementation, verify, and browser work on `halla` under `/home/halla/workspaces/`; confirm `hostname` is `halla`.
- Do not create the archive tag/branch after mass deletes — freeze must capture the complete tree first.
- Never move, delete, or retarget tag `archive/full-port-pre-demo-cut` once created.
- Never force-push rewrite of the freeze commit.
- Product on `main` is **only** the fixed demo map `maps/ladder/Garden of war BNE.pud.smp.gz` (human vs computer 1v1).
- Do not re-expand default `npm run verify` to full-port `source-*` fidelity without an explicit user product decision.
- Before inventing a missing subsystem, lift from `archive/full-port`; do not greenfield-rewrite archived behavior.
- No full source dump of the port onto `main` under `archive/` (pointers + manifest only).
- Do not deploy to Netlify unless the user explicitly asks.
- Do not stop unrelated Halla processes; track only owned PIDs; use free ports.
- Do not introduce `Math.random()`, `Date.now()`, or `crypto.getRandomValues()` under `src/**/*.ts` without redesigning the runtime determinism verifier.
- `public/wargus` asset slim is optional and last among cut tasks; skip if risky.
- Play-session performance optimization is **not** part of this plan’s tasks.

## File map (create / modify)

| Path | Role |
|------|------|
| Git tag `archive/full-port-pre-demo-cut` | Immutable full-tree freeze |
| Git branch `archive/full-port` | Same commit; easy restore |
| `docs/ARCHIVE.md` | Canonical archive identity, restore, lift rules |
| `docs/DEMO-PRODUCT.md` | Product in/out contract |
| `docs/DEMO-MAP.md` | Demo runtime map for agents |
| `docs/lifts/.gitkeep` | Placeholder for future lift notes |
| `archive/README.md` | Short pointer to tag + docs |
| `archive/MANIFEST.md` | Subsystem inventory + status |
| `scripts/print-archive-info.mjs` | `npm run archive:info` |
| `scripts/trace-demo-imports.mjs` | Dependency trace from demo entry |
| `scripts/verify-demo-gate-contract.mjs` | Static contract that default verify is demo-scoped |
| `package.json` | `verify:demo`, default `verify`, `archive:info`; retire full-port default chain |
| `AGENTS.md` | Product boundary + archive hard rules (prepend/keep host rules) |
| `plans/README.md` | Mark roadmap historical / not active execution |
| `README.md` | Point at demo product + archive docs (short) |
| `.artifacts/demo-cut/` | Trace outputs and batch evidence (gitignored if needed) |

---

### Task 1: Immutable full-port freeze

**Files:**
- Create: git tag `archive/full-port-pre-demo-cut`
- Create: git branch `archive/full-port`
- Produce: freeze SHA recorded later in Task 2 docs (print now)

**Interfaces:**
- Consumes: clean or intentionally committed `main` at freeze time (include design doc commit if already on `main`)
- Produces: tag and branch both resolve to the same full-tree commit SHA

- [ ] **Step 1: Confirm host and working tree**

```bash
hostname   # must be halla
cd /home/halla/workspaces/t3/Wargus-TypeScript
git status
git rev-parse HEAD
```

Expected: on project repo; note any uncommitted work. **Do not freeze with half-finished deletes.** Commit or stash unrelated WIP first. The design doc commit may already be on `main`.

- [ ] **Step 2: Ensure freeze commit is complete**

If there is uncommitted work that belongs in the museum (unlikely), commit it first. Prefer freezing a known good `main` tip that still has the full port + full `scripts/` + full `package.json` verify chain.

```bash
git log -1 --oneline
test -f src/simulation/orders.ts
test -f scripts/verify-source-pathfinding.mjs
npm run verify:playtest-telemetry
```

Expected: playtest telemetry contract still passes (sanity that tree is intact).

- [ ] **Step 3: Create annotated tag and branch**

```bash
FREEZE_SHA=$(git rev-parse HEAD)
git tag -a archive/full-port-pre-demo-cut -m "Full Wargus-TypeScript port snapshot before demo product cut.

Product pivot: main becomes Garden of war fixed ladder demo only.
Restore: git show archive/full-port:<path>
See docs/ARCHIVE.md after Task 2."

git branch archive/full-port "$FREEZE_SHA"
git rev-parse archive/full-port-pre-demo-cut^{}
git rev-parse archive/full-port
```

Expected: both resolve to the same SHA as `FREEZE_SHA`.

- [ ] **Step 4: Push tag and branch (requires remote write access)**

```bash
git push origin archive/full-port
git push origin refs/tags/archive/full-port-pre-demo-cut
```

If push is blocked (auth/network), stop and report; do not continue mass deletes until remote has the freeze **or** the user explicitly accepts a local-only freeze with a written risk note in `docs/ARCHIVE.md`.

- [ ] **Step 5: Record freeze locally for docs**

```bash
mkdir -p .artifacts/demo-cut
{
  echo "freezeSha=$(git rev-parse archive/full-port)"
  echo "tag=archive/full-port-pre-demo-cut"
  echo "branch=archive/full-port"
  echo "dateUtc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "hostname=$(hostname)"
} | tee .artifacts/demo-cut/freeze.env
```

- [ ] **Step 6: Commit artifact only if `.artifacts` is tracked; otherwise keep local**

Prefer **not** committing large artifacts. If `.artifacts` is gitignored, keep `freeze.env` local for Task 2. No source commit required for pure git tag/branch creation beyond any pre-freeze WIP commits.

**Stop condition:** Tag + branch exist and match. Remote push done or explicitly waived by user in writing in the next docs commit.

---

### Task 2: Agent navigation docs and product contract

**Files:**
- Create: `docs/ARCHIVE.md`
- Create: `docs/DEMO-PRODUCT.md`
- Create: `docs/DEMO-MAP.md`
- Create: `docs/lifts/.gitkeep`
- Create: `archive/README.md`
- Create: `archive/MANIFEST.md`
- Modify: `AGENTS.md` (add Product + Archive sections near top, after title/scope, before or after Execution Host)
- Modify: `plans/README.md` (banner: historical, not active)
- Modify: `README.md` (short Current product + Archive pointers)

**Interfaces:**
- Consumes: freeze SHA from Task 1 (`.artifacts/demo-cut/freeze.env` or `git rev-parse archive/full-port`)
- Produces: docs that any cold agent can follow without this plan

- [ ] **Step 1: Write `docs/DEMO-PRODUCT.md`**

Create the file with this content (adjust only if map path constant differs; verify against `src/wargus/demoScenario.ts`):

```markdown
# Demo Product Contract

**Status:** Active product definition for `main`  
**Map:** `maps/ladder/Garden of war BNE.pud.smp.gz`  
**Match:** Human (player 0) vs computer (player 1) fixed browser demo

## In scope

- Load the fixed Garden of war demo into a playable browser session
- Harvest / economy basics, train and build enough for a match, combat
- AI pressure sufficient for a ladder-style skirmish
- Victory by defeating the enemy (existing fixed-demo victory semantics)
- HUD, commands, audio, and cursors needed for that loop
- Short demo verification gate (`npm run verify` / `npm run verify:demo`)
- Performance and polish of **this** match only

## Out of scope (until explicit product expansion)

- Other maps, campaigns, multi-mission progression
- Full Wargus source UI / source-button parity as default gates
- Full unit, tech, naval, oil, and spell surface beyond what the demo uses
- Default multi-profile successor performance matrix as standing work
- Active execution of historical Plans 001–027 as a living roadmap
- Re-expanding default verify to full-port fidelity

## Expanding scope later

1. Explicit user decision  
2. Update this file and `docs/ARCHIVE.md`  
3. Lift code from `archive/full-port` (see lift recipe)  
4. Add demo-scoped tests only; do not restore full-port default gates unless decided  
```

- [ ] **Step 2: Write `docs/ARCHIVE.md`**

Include at minimum:

- Freeze tag name, branch name, SHA (`git rev-parse archive/full-port`)
- Why (product pivot date 2026-08-06)
- Restore commands (`git show`, `git checkout archive/full-port -- path`, `git ls-tree`)
- Lift recipe (from design)
- Link to `archive/MANIFEST.md` and `docs/lifts/`
- Rule: archive is not a second live product

Use the real SHA from Task 1 in the body.

- [ ] **Step 3: Write `archive/README.md`**

Short file (~20–40 lines): points to tag, branch, `docs/ARCHIVE.md`, `docs/DEMO-PRODUCT.md`. State that full source is **not** duplicated here.

- [ ] **Step 4: Write `archive/MANIFEST.md`**

Initial inventory table (status: `in-demo` | `partial` | `archived`). Seed rows (refine after Task 4 trace if needed):

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

- [ ] **Step 5: Write `docs/DEMO-MAP.md`**

Document the runtime path in plain language:

1. Entry: `src/main.ts` boots Pixi, loads manifest via `src/wargus/manifest.ts`
2. Demo map: `FIXED_BROWSER_DEMO_MAP_PATH` in `demoScenario.ts`; setup via `mapSetup.ts` + `applyFixedBrowserDemo*`
3. World: `createInitialWorld` / `simulateWorld` in `world.ts` + `orders.ts`
4. Input: selection, HUD commands, map commands under `src/view/*`
5. Render: `renderWorld.ts`, `renderHud.ts`, atlases
6. Audio: `audioEngine.ts`, cues
7. Telemetry: playtest hooks in `main.ts`, `src/performance/*`
8. Verify: `npm run verify:demo` (after Task 3)

- [ ] **Step 6: Create `docs/lifts/.gitkeep`**

Empty placeholder so the lifts directory exists.

- [ ] **Step 7: Update `AGENTS.md`**

Insert a **Product** section and an **Full-port archive** section near the top (after the opening scope line, before or immediately after Execution Host). Required bullets (verbatim intent):

1. Default product is the fixed Garden of war ladder demo only (`docs/DEMO-PRODUCT.md`).
2. Do not reintroduce full-port scope without explicit user decision.
3. Before inventing a missing subsystem, open `docs/ARCHIVE.md` and search `archive/full-port`; prefer lift-and-trim.
4. Archive is reference/extract source, not a second live product.
5. Performance and polish target the one ladder match until scope expands.
6. When lifting, write `docs/lifts/YYYY-MM-DD-<topic>.md`.

Keep all existing Halla/host/determinism/browser rules intact.

- [ ] **Step 8: Banner `plans/README.md`**

At the very top, add:

```markdown
> **Historical only (2026-08-06):** Plans 001–027 and the wave roadmap are frozen history of the full-port program.
> They are **not** active execution authority on `main`.
> Active product: [Demo Product Contract](../docs/DEMO-PRODUCT.md).
> Full tree at freeze: git tag `archive/full-port-pre-demo-cut` / branch `archive/full-port`.
```

Do not delete plan files in this task.

- [ ] **Step 9: Trim `README.md` intro**

Add near the top a short **Current product** blurb pointing at the fixed demo and the archive docs. Do not rewrite the entire historical feature list in this task (optional later cleanup).

- [ ] **Step 10: Commit**

```bash
git add docs/ARCHIVE.md docs/DEMO-PRODUCT.md docs/DEMO-MAP.md docs/lifts/.gitkeep \
  archive/README.md archive/MANIFEST.md AGENTS.md plans/README.md README.md
git commit -m "$(cat <<'EOF'
docs: define demo product contract and full-port archive map

Point agents at the immutable archive freeze, the single ladder-match
product boundary, and restore/lift rules before any slim-down deletes.
EOF
)"
```

---

### Task 3: Demo verify gate and package signals

**Files:**
- Create: `scripts/print-archive-info.mjs`
- Create: `scripts/verify-demo-gate-contract.mjs`
- Modify: `package.json` scripts: add `archive:info`, `verify:demo`, `verify:demo-gate-contract`; change default `verify` to demo gate; keep old full chain available only until Task 5 deletes scripts (optional temporary alias `verify:full-port-legacy` pointing at the **current** long chain for one transition commit, then remove in Task 5)

**Interfaces:**
- Consumes: existing verifier scripts listed below
- Produces: `npm run verify` === demo gate; `npm run archive:info` prints tag/SHA/docs

**Demo gate composition (explicit):**

```text
npm run verify:demo :=
  npm run verify:demo-gate-contract
  && npm run verify:wargus-assets
  && ./node_modules/.bin/tsc --noEmit
  && npm run verify:playtest-telemetry
  && npm run verify:runtime-determinism
  && npm run verify:browser-runtime-smoke
  && npm run verify:browser-playable-session
  && npm run verify:browser-demo-session
  && npm run verify:browser-command-card-session
  && npm run verify:browser-combat-session
  && npm run verify:fixed-demo-polish
  && npm run verify:fixed-demo-random-ai
  && npm run verify:fixed-demo-unit-portrait
```

Notes:

- `verify:browser-demo-session` already chains fixed-demo input, harvest, train, and victory on Garden of war.
- Combat session is included as a demo-critical interaction.
- Spell session and multi-map loads are **not** in the default demo gate.
- Production full-map matrix is **not** in the default demo gate.

- [ ] **Step 1: Implement `scripts/print-archive-info.mjs`**

```javascript
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const TAG = "archive/full-port-pre-demo-cut";
const BRANCH = "archive/full-port";

function rev(ref) {
  try {
    return execSync(`git rev-parse ${ref}`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const tagSha = rev(`${TAG}^{}`) ?? rev(TAG);
const branchSha = rev(BRANCH);

console.log("Wargus-TypeScript archive info");
console.log("Product: fixed Garden of war ladder demo only (see docs/DEMO-PRODUCT.md)");
console.log(`Tag: ${TAG} -> ${tagSha ?? "(missing — run freeze Task 1)"}`);
console.log(`Branch: ${BRANCH} -> ${branchSha ?? "(missing)"}`);
console.log("Docs: docs/ARCHIVE.md, docs/DEMO-PRODUCT.md, docs/DEMO-MAP.md, archive/MANIFEST.md");
if (!tagSha) process.exitCode = 1;
```

- [ ] **Step 2: Implement `scripts/verify-demo-gate-contract.mjs`**

Static checks:

1. `package.json` `scripts.verify` equals `npm run verify:demo` OR is exactly the same command string as `scripts["verify:demo"]`.
2. `scripts["verify:demo"]` includes each required step name: `verify:demo-gate-contract` may be first; remaining list as above.
3. `scripts["verify:demo"]` does **not** include `verify:source-pathfinding` or `verify:crestfall` or `verify:alterac-traitors` (full-port canaries).
4. Files exist: `docs/ARCHIVE.md`, `docs/DEMO-PRODUCT.md`, `docs/DEMO-MAP.md`, `archive/README.md`, `archive/MANIFEST.md`.
5. `AGENTS.md` contains the strings `docs/ARCHIVE.md` and `DEMO-PRODUCT` (or `docs/DEMO-PRODUCT.md`).

```javascript
import { readFileSync, existsSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const verify = pkg.scripts.verify;
const demo = pkg.scripts["verify:demo"];
if (!demo) throw new Error("package.json missing scripts.verify:demo");
if (verify !== "npm run verify:demo" && verify !== demo) {
  throw new Error(`scripts.verify must be demo gate; got: ${verify.slice(0, 120)}...`);
}
const required = [
  "verify:wargus-assets",
  "verify:playtest-telemetry",
  "verify:runtime-determinism",
  "verify:browser-runtime-smoke",
  "verify:browser-playable-session",
  "verify:browser-demo-session",
  "verify:browser-command-card-session",
  "verify:browser-combat-session",
  "verify:fixed-demo-polish",
  "verify:fixed-demo-random-ai",
  "verify:fixed-demo-unit-portrait",
  "tsc --noEmit"
];
for (const step of required) {
  if (!demo.includes(step)) throw new Error(`verify:demo missing step: ${step}`);
}
const forbidden = ["verify:crestfall", "verify:alterac-traitors", "verify:source-pathfinding"];
for (const step of forbidden) {
  if (demo.includes(step)) throw new Error(`verify:demo must not include full-port step: ${step}`);
}
for (const path of [
  "docs/ARCHIVE.md",
  "docs/DEMO-PRODUCT.md",
  "docs/DEMO-MAP.md",
  "archive/README.md",
  "archive/MANIFEST.md"
]) {
  if (!existsSync(path)) throw new Error(`missing ${path}`);
}
const agents = readFileSync("AGENTS.md", "utf8");
if (!agents.includes("docs/ARCHIVE.md") || !agents.includes("DEMO-PRODUCT")) {
  throw new Error("AGENTS.md must reference archive and demo product docs");
}
console.log("Demo gate contract OK");
```

- [ ] **Step 3: Wire `package.json`**

Add:

```json
"archive:info": "node scripts/print-archive-info.mjs",
"verify:demo-gate-contract": "node scripts/verify-demo-gate-contract.mjs",
"verify:demo": "npm run verify:demo-gate-contract && npm run verify:wargus-assets && ./node_modules/.bin/tsc --noEmit && npm run verify:playtest-telemetry && npm run verify:runtime-determinism && npm run verify:browser-runtime-smoke && npm run verify:browser-playable-session && npm run verify:browser-demo-session && npm run verify:browser-command-card-session && npm run verify:browser-combat-session && npm run verify:fixed-demo-polish && npm run verify:fixed-demo-random-ai && npm run verify:fixed-demo-unit-portrait",
"verify": "npm run verify:demo"
```

Optionally set one-line description to mention fixed browser demo (product), not only “full port.”

- [ ] **Step 4: Run contract + archive info**

```bash
npm run verify:demo-gate-contract
npm run archive:info
```

Expected: both exit 0; archive info prints freeze SHA.

- [ ] **Step 5: Run full demo gate**

```bash
npm run verify:demo
```

Expected: exit 0. If a step fails for environment reasons (browser/GPU), preserve logs under `.artifacts/demo-cut/`, fix only in-scope breakages, do not drop the step without user approval.

Browser steps may need `sg video` / `sg render` per existing project practice — use the same invocation pattern other browser verifiers on this host already use (inspect a recent successful evidence file or `plans/HALLA-EXECUTION-POLICY.md` if required). Example pattern used historically:

```bash
sg video -c 'sg render -c "npm run verify:demo"'
```

Use whatever is the **current** working pattern on Halla for browser verifiers; do not invent a new browser stack.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/print-archive-info.mjs scripts/verify-demo-gate-contract.mjs
git commit -m "$(cat <<'EOF'
build: make default verify the demo gate

Add archive:info and a static demo-gate contract so main is defined by
the Garden of war ladder product, not the full-port source suite.
EOF
)"
```

---

### Task 4: Demo dependency trace

**Files:**
- Create: `scripts/trace-demo-imports.mjs`
- Create: `.artifacts/demo-cut/demo-import-trace.json` (local evidence; commit only a summary if useful)
- Modify: `archive/MANIFEST.md` if trace contradicts seed status
- Optional commit: `docs/DEMO-MAP.md` “modules reached” section

**Interfaces:**
- Consumes: `src/main.ts` as entry
- Produces: list of reachable `src/**/*.ts` modules and candidates for deletion

- [ ] **Step 1: Implement a simple TS import tracer**

`scripts/trace-demo-imports.mjs` should:

1. Start from `src/main.ts`
2. Recursively resolve relative `from "./x"` / `from "../x"` imports (append `.ts`, try `/index.ts`)
3. Ignore `pixi.js` and other bare package imports
4. Write JSON: `{ entry, files: string[], count }`
5. Print files not under `src/` that were skipped
6. Print `src/**/*.ts` files **not** in the reachable set (deletion candidates — do not delete yet)

Keep the tracer dumb and dependency-free (regex on `import ... from "..."` and `export ... from "..."`).

- [ ] **Step 2: Run the tracer**

```bash
node scripts/trace-demo-imports.mjs | tee .artifacts/demo-cut/demo-import-trace.txt
```

Expected: `src/wargus/demoScenario.ts` reachable; print unreachable list for review.

- [ ] **Step 3: Classify unreachable files**

For each unreachable `src/**/*.ts` file, mark:

- `safe-delete-candidate` — no dynamic import string references in reachable code (`rg` the basename)
- `dynamic-or-asset-path` — keep
- `verify-only` — only used by scripts; keep until scripts deleted

Manually check dynamic loads (e.g. `import(/* ... */)`). When unsure, **keep**.

- [ ] **Step 4: Update `archive/MANIFEST.md` statuses** from the classification.

- [ ] **Step 5: Commit tracer + manifest updates**

```bash
git add scripts/trace-demo-imports.mjs archive/MANIFEST.md docs/DEMO-MAP.md
git commit -m "$(cat <<'EOF'
chore: add demo import tracer and refresh archive manifest

Produce a reachable module set from the fixed-demo entry so later delete
batches only remove proven-unused surface.
EOF
)"
```

---

### Task 5: Collapse full-port package scripts (batch A — scripts only)

**Files:**
- Modify: `package.json` (remove verify scripts not needed by demo gate or active demo tooling)
- Delete: corresponding `scripts/verify-*.mjs` (and related helpers **only if** nothing remaining references them)
- Keep: all scripts imported by the demo gate chain; browser execution controller; asset verify; playtest/perf metric scripts if still referenced by demo gate or docs agents may use for polish later (`verify:performance-metrics` optional keep)

**Interfaces:**
- Consumes: Task 3 demo gate must keep working
- Produces: drastically smaller `package.json` scripts section

**Keep list (minimum):**

- `dev`, `build`, `prebuild`, `preview`
- `verify`, `verify:demo`, `verify:demo-gate-contract`, `archive:info`
- Every script invoked by `verify:demo` transitively
- `verify:browser-execution-controller` if required by browser harness internals
- Browser session scripts pulled in by demo-session/combat/command-card
- `capture:*` / matrix runners: **delete from main** (recoverable from archive) OR keep but do not wire into default verify — prefer delete package script entries and leave files until batch B if shared libs needed

**Delete priority (package script entries + files):**

1. All `verify:source-*` not in keep list  
2. Campaign/map scenario verifiers (`alterac-traitors`, `tyrs-bay`, `mystic-sanctum`, `crestfall`, multi-map loads `:all`)  
3. Plan-numbered one-offs (`verify:browser-plan014-task9`, etc.)  
4. Full-port production map-load matrices  

- [ ] **Step 1: Generate keep/delete lists**

```bash
node -e '
const p=require("./package.json");
const demo=p.scripts["verify:demo"];
console.log(demo);
'
# Build delete candidates: verify:* not referenced by verify:demo string or keep list
```

Write `.artifacts/demo-cut/scripts-batch-a-keep.txt` and `scripts-batch-a-delete.txt`.

- [ ] **Step 2: Remove delete-list scripts from package.json and delete files**

For each deleted script file, ensure no remaining package script references it:

```bash
rg -n "verify-source-pathfinding" package.json scripts/ || true
```

- [ ] **Step 3: Re-run demo gate**

```bash
npm run verify:demo
```

Expected: exit 0. On failure, restore from archive:

```bash
git checkout archive/full-port -- package.json scripts/path-that-broke.mjs
```

Fix keep list and retry.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/
git commit -m "$(cat <<'EOF'
chore: drop full-port verifiers from main package surface

Default quality gate remains verify:demo. Full-port scripts remain on
archive/full-port for lift and historical reference.
EOF
)"
```

---

### Task 6: Quarantine historical plans noise (batch B — docs/process)

**Files:**
- Modify: `plans/README.md` (already bannered; ensure status table says historical)
- Optional: add `plans/HISTORICAL.md` one-pager pointing at archive tag
- Do **not** delete `plans/` content in this task (history is useful on main as read-only)
- Modify: `docs/superpowers/plans/*` — no bulk delete required; they are historical

**Interfaces:**
- Consumes: Task 2 banner
- Produces: agents do not treat plans/README as execution authority

- [ ] **Step 1: Add `plans/HISTORICAL.md`** stating active product docs live under `docs/DEMO-*.md` and archive under git tag.

- [ ] **Step 2: Soften `plans/README.md` “execution authorization” section**

Replace autonomous full-roadmap authorization language with: historical; do not execute Plans 018–027 on `main` unless user re-opens scope.

- [ ] **Step 3: Commit**

```bash
git add plans/README.md plans/HISTORICAL.md
git commit -m "$(cat <<'EOF'
docs: mark plans roadmap as historical after demo product cut

Stop treating full-port wave execution as active authority on main.
EOF
)"
```

---

### Task 7: Remove unreachable TypeScript (batch C — only safe candidates)

**Files:**
- Delete: only files classified `safe-delete-candidate` in Task 4 after dynamic-import review
- Modify: any imports broken by mistake (should be none if classification is correct)
- Modify: `archive/MANIFEST.md` statuses

**Interfaces:**
- Consumes: Task 4 trace
- Produces: smaller `src/` without breaking demo gate

**Hard rules:**

- Do **not** delete `orders.ts`, `main.ts`, `world.ts`, `renderHud.ts`, `renderWorld.ts`, `saveGame.ts` even if partially unused internally.
- Do **not** delete entire directories without re-running tracer + demo gate.
- Prefer leaving “dead exports inside a live file” alone (no drive-by god-file surgery here).

- [ ] **Step 1: Build final delete list (max caution)**

```bash
# Example process — replace with actual safe list from Task 4
# Only delete files with zero rg hits from remaining src/ and remaining scripts/
```

If the safe list is empty, **skip deletes**, document that in `.artifacts/demo-cut/batch-c-skipped.md`, and commit only the note under `docs/` or skip commit.

- [ ] **Step 2: Delete files and run tracer + tsc + demo gate**

```bash
node scripts/trace-demo-imports.mjs
./node_modules/.bin/tsc --noEmit
npm run verify:demo
```

- [ ] **Step 3: Commit or skip**

```bash
git add -A src archive/MANIFEST.md
git commit -m "$(cat <<'EOF'
chore: remove TypeScript modules unreachable from the fixed demo

Full implementations remain on archive/full-port for future lifts.
EOF
)"
```

---

### Task 8 (optional): Slim `public/wargus` assets

**Skip unless Task 7 is done and user still wants asset slim in this effort.**

**Files:**
- Modify: indexing/generation scripts if present; `public/wargus/**` content
- Must pass: `npm run verify:wargus-assets` and demo browser load

**Rules:**

- Keep Garden of war map, tileset, units/sounds/UI referenced by demo session
- Prefer generating a demo-minimal pack via existing index tooling over hand-deleting hundreds of files
- If no safe automated slim path exists, **abort this task** and document “asset slim deferred” in `docs/ARCHIVE.md`

- [ ] **Step 1: Investigate whether an existing indexer can filter to demo map**

```bash
rg -n "manifest|index" scripts/*.mjs package.json | head -40
```

- [ ] **Step 2: If safe path exists, produce slim pack on a branch, run demo gate**

- [ ] **Step 3: Commit only with green `verify:wargus-assets` + `verify:demo`**

If unsafe, write `docs/lifts/2026-08-06-asset-slim-deferred.md` explaining why and commit that note only.

---

### Task 9: God-file split criteria + optional pilot (navigation only)

**Files (pilot only if criteria met):**
- Possibly split extract of pure types/constants from a large file into a new module
- **Not required** to finish the plan if demo gate + docs + script cut already meet success criteria

**Split criteria (all must hold):**

1. File > ~1500 lines **and** agents repeatedly mis-edit it  
2. Extract has a clear single responsibility and stable exports  
3. No behavior change (tsc + demo gate green)  
4. No renaming of public simulation semantics  
5. One pilot extract max in this plan (e.g. move pure type aliases or a leaf helper group), not a full `orders.ts` rewrite  

- [ ] **Step 1: Record split candidates in `docs/DEMO-MAP.md`**

List: `orders.ts`, `main.ts`, `renderHud.ts`, `saveGame.ts`, `renderWorld.ts`, `world.ts` with “split later / pilot / leave”.

- [ ] **Step 2: Either perform one pilot extract OR explicitly skip**

If skip:

```bash
git commit --allow-empty -m "chore: defer god-file splits until after demo polish phase"
```

If pilot: extract, update imports, `tsc --noEmit`, `npm run verify:demo`, commit with message describing the single extract.

---

### Task 10: Exit criteria and handoff

**Files:**
- Modify: design spec status line optional (`Status: Implemented` / date)
- Create: `docs/superpowers/plans/2026-08-06-demo-cut-and-archive-closeout.md` (short evidence)

- [ ] **Step 1: Verify success checklist**

| # | Criterion | Command / check |
|---|-----------|-----------------|
| 1 | Tag + branch exist with same SHA | `git rev-parse archive/full-port archive/full-port-pre-demo-cut^{}` |
| 2 | Archive docs present | `npm run verify:demo-gate-contract` |
| 3 | Manifest has statuses | `head archive/MANIFEST.md` |
| 4 | Default verify is demo | `node -e "console.log(require('./package.json').scripts.verify)"` → `npm run verify:demo` |
| 5 | Demo gate green | `npm run verify:demo` |
| 6 | No full source dump on main | `test ! -d archive/full-port-snapshot` |
| 7 | Agents pointed at product | `rg -n "DEMO-PRODUCT|ARCHIVE" AGENTS.md` |
| 8 | Archive info works | `npm run archive:info` |

- [ ] **Step 2: Write closeout note** with freeze SHA, demo gate composition, what was deleted vs deferred (assets/splits), and explicit handoff:

```markdown
## Handoff — play-session performance (next program)

Only start after this closeout is green.

1. Host demo on Halla Tailscale for human play
2. Player exports `window.__WARGUS_TS_EXPORT_PLAYTEST_LOG__()`
3. Analyze jank reasons (update vs render vs frame)
4. Fix specific hot paths on the demo surface only
5. Re-run `npm run verify:demo` after each fix
```

- [ ] **Step 3: Commit closeout**

```bash
git add docs/superpowers/plans/2026-08-06-demo-cut-and-archive-closeout.md docs/superpowers/specs/2026-08-06-demo-cut-and-archive-design.md
git commit -m "$(cat <<'EOF'
docs: close out demo cut and archive implementation

Record freeze identity, demo gate evidence, and handoff to play-session
performance work on the single ladder match.
EOF
)"
```

- [ ] **Step 4: Push `main`** (when authorized)

```bash
git push origin main
```

Do not delete remote `archive/full-port` or the tag.

---

## Failure recovery (all tasks)

| Failure | Action |
|---------|--------|
| Demo gate red after delete | `git checkout archive/full-port -- <path>` for missing pieces; re-add to keep list; do not “fix” by dropping gate steps |
| Tag missing mid-plan | Stop; recreate only if tag never existed; never move existing tag |
| Browser verifier flaky | Preserve logs under `.artifacts/demo-cut/`; retry once; fix real regressions only |
| Unsure if file is used | Keep file; mark `partial` in manifest |

## Out of scope (do not do in this plan)

- Play-session performance optimization loops  
- Netlify deploy  
- Expanding to more maps/races  
- Full rewrite of `orders.ts`  
- Restoring full-port default verify  
- Copying entire freeze tree into `archive/full-port-snapshot/`

## Spec coverage (self-check)

| Design requirement | Task |
|--------------------|------|
| Freeze tag + branch before deletes | Task 1 |
| Push freeze | Task 1 |
| `docs/ARCHIVE.md`, `archive/*`, product + map docs | Task 2 |
| AGENTS hard rules | Task 2 |
| `archive:info` | Task 3 |
| Demo default verify | Task 3 |
| Dependency trace | Task 4 |
| Ordered delete batches + re-gate | Tasks 5–7 |
| Optional asset slim | Task 8 |
| God-file split criteria | Task 9 |
| Exit + perf handoff | Task 10 |
| No full dump on main | Tasks 2, 10 |
| Lift-over-rewrite rules | Tasks 2, recovery |

---

## Execution notes for agents

- Prefer **one task per session** or subagent; re-run `npm run verify:demo` after any delete batch.
- Do not start Task 5 until Tasks 1–3 are green.
- Do not start play-session perf work until Task 10 checklist is green.
