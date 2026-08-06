# Demo Cut and Full-Port Archive Design

**Date:** 2026-08-06  
**Status:** Approved design direction (user); ready for implementation plan after user review of this spec  
**Scope:** Product boundary, archive preservation, agent discoverability, and slim-down strategy for `main`. Does not implement the cut in this document.

## Context

This repository grew through long automated porting loops aimed at full Wargus/Stratagus browser fidelity. Directed product work later produced a **usable fixed browser demo** on the Garden of war ladder map. The demo works but is unoptimized, and the tree is still organized like a full-port program:

- Large simulation/view modules (notably `src/simulation/orders.ts` and `src/main.ts`)
- ~200 package scripts and a default `npm run verify` with on the order of 165 steps, many `source-*` full-fidelity gates
- Historical multi-wave plans, performance matrix machinery, and a full `public/wargus` asset pack

The problem is not that prior work was useless. The problem is that **product scope and repository surface no longer match**. Future work should perfect one ladder match, not re-optimize an entire unscoped port. Prior code must remain easy to find and lift when scope expands later.

## Goals

1. **Product on `main`:** one polished, playable Garden of war fixed 1v1 ladder match.
2. **Preserve all prior work** in an immutable, named archive that any agent can restore from.
3. **Make the archive discoverable by default** so cold sessions do not reinvent subsystems that already exist.
4. **Shrink cognitive and gate load** so agents navigate the demo surface without multi-hour digs.
5. **Defer performance play-session work** until after the product cut, so optimization targets the real demo path.

## Non-goals (this design)

- Rewriting the engine from scratch in a new stack or repo.
- Expanding content beyond one ladder match (extra maps, campaign, full races) without a later explicit product decision.
- Deleting git history or force-rewriting the archive snapshot.
- Replacing playtest/performance measurement systems wholesale (they may be slimmed; they are not the primary subject of the cut).
- Deploying to production/Netlify as part of the cut.

## Product boundary (locked for now)

### In scope — Fixed ladder demo

| Area | Requirement |
|------|-------------|
| Map | `maps/ladder/Garden of war BNE.pud.smp.gz` only (existing fixed demo path) |
| Match | Human vs computer 1v1 on that map |
| Loop | Harvest / economy basics, train and build enough for a match, combat, AI pressure, win by defeating the enemy (existing demo victory semantics) |
| Shell | Load into playable world, HUD/commands needed for that loop, audio/cursors as needed for feel |
| Quality | Stability, legibility, and performance of **this** match |
| Verification | Short **demo gate** only (map load, playable session, demo-critical interactions, demo assets, determinism if still required for the demo) |

### Out of scope — Archived, liftable later

- Additional maps, campaigns, mission chains
- Full source UI / source button / source panel parity suites as default gates
- Full unit/tech/naval/oil/spell surface beyond what the demo actually uses
- Default multi-profile successor performance matrix as standing work
- Active multi-wave roadmap execution (Plans 001–027 as living program)
- Re-expanding `npm run verify` to full-port fidelity without an explicit product decision

### Future scope increase

Any expansion (more maps, races, campaign, full-port fidelity) requires:

1. Explicit user product decision  
2. Update of the demo product contract and this design’s successor notes  
3. Lift from the archive (see below), not greenfield reimplementation  
4. Only then grow default verify and docs  

## Archive strategy (nothing goes to waste)

### Immutable freeze (source of truth)

Immediately **before** any mass delete or verify collapse, create:

| Artifact | Name (canonical) | Purpose |
|----------|------------------|---------|
| Annotated git tag | `archive/full-port-pre-demo-cut` | Permanent, immovable pointer to the complete tree |
| Branch | `archive/full-port` | Same commit; easy path restore and browsing |
| Record in docs | SHA + date in `docs/ARCHIVE.md` | Agent-readable identity of the freeze |

Rules:

- Do not move or delete the tag.
- Do not rewrite history of the freeze commit.
- `main` may diverge aggressively after the freeze; the tag remains the museum of the full port.

### Restore patterns (agents must use these)

```bash
# Inspect a file from the full port
git show archive/full-port:src/simulation/orders.ts | less

# Restore a path into the working tree (lift)
git checkout archive/full-port -- path/to/file

# List a directory at freeze
git ls-tree -r --name-only archive/full-port -- src/wargus
```

### In-repo pointer (no second live codebase on `main`)

Prefer **tag + docs**, not a full source dump under `main` (that would reintroduce bulk and confusion).

On `main` after the cut:

```text
docs/ARCHIVE.md              # canonical agent map: how/why/what/how-to-lift
archive/README.md            # short pointer to tag, branch, and docs/ARCHIVE.md
archive/MANIFEST.md          # subsystem inventory + demo status
```

Optional later (only if browse-without-git becomes painful): a one-time snapshot tree under `archive/full-port-snapshot/`. Default is **not** to copy tens of thousands of lines onto `main`.

### Lift recipe

When a missing behavior is needed for an **approved** scope expansion (or a demo hole that already existed in the full port):

1. Find the subsystem in `docs/ARCHIVE.md` / `archive/MANIFEST.md`.
2. Restore the smallest path set from `archive/full-port`.
3. Trim to types/units/UI the demo (or new product slice) actually needs.
4. Add or extend **demo-scoped** verification only.
5. Record the lift in `docs/lifts/YYYY-MM-DD-<topic>.md` (what path, what kept, what left behind).
6. Do **not** re-enable full-port `source-*` gates as the default `npm run verify` unless the product contract says so.

### Package signal

Add a small discoverability aid, e.g. `npm run archive:info`, that prints:

- tag name and resolved SHA (if present)
- path to `docs/ARCHIVE.md`
- one-line product boundary reminder

## Agent navigation contract

### Files agents must load first

| File | Role |
|------|------|
| `AGENTS.md` | Host rules + **product = one ladder demo** + archive pointer |
| `docs/ARCHIVE.md` | Full-port freeze identity, restore commands, inventory, lift rules |
| `docs/DEMO-MAP.md` (or `docs/ARCHITECTURE.md`) | Demo runtime map: entry → load → tick → render → input; file owners |
| Demo product contract section (in `AGENTS.md` or `docs/DEMO-PRODUCT.md`) | Explicit in/out list |

### Hard rules for future agents (copy into `AGENTS.md`)

1. **Default product** is the fixed Garden of war ladder demo only.
2. **Do not reintroduce full-port scope** (campaigns, all maps, 100+ source verifiers, wave roadmap execution) without an explicit user decision.
3. **Before inventing a missing subsystem**, open `docs/ARCHIVE.md` and search `archive/full-port`; prefer lift-and-trim over rewrite.
4. **Archive is reference and extract source**, not a second live product to keep in sync.
5. **Performance and polish** target the one ladder match until scope is deliberately expanded.
6. **When lifting**, write a short `docs/lifts/…` note so the next agent knows what returned to `main`.

### Target demo layout (direction)

Not a mandatory big-bang restructure in one PR; the direction after the cut:

```text
Product path (live):
  src/main.ts (thin shell) → demo load → simulation tick → view/audio
  src/wargus/demoScenario.ts, demoMission.ts
  simulation/view modules actually reached by the demo

Reference (not live product):
  git tag/branch archive/full-port*
  docs/ARCHIVE.md + archive/MANIFEST.md
```

God-file splits (`orders.ts`, `main.ts`, `renderHud.ts`) happen **after** freeze and **along demo boundaries**, not as an open-ended full-port cleanup.

## Slim-down strategy on `main`

### Order of operations

1. **Freeze** tag `archive/full-port-pre-demo-cut` and branch `archive/full-port` on the complete tree.  
2. **Write navigation docs** (`docs/ARCHIVE.md`, `archive/*`, `docs/DEMO-MAP.md`, product contract; update `AGENTS.md`).  
3. **Establish a short demo verify gate** and make it the default critical path before large deletes.  
4. **Dependency-trace** from the fixed demo entry to used modules and assets; mark unused surface.  
5. **Remove or quarantine** out-of-scope scripts, default verify steps, and unreachable product code from `main` (full copies remain on the archive tag).  
6. **Optionally slim** `public/wargus` to demo-needed assets (separate, high-value, careful step with asset verify).  
7. **Split** large modules only as needed for agent navigability on the demo path.  
8. **Then** play-session profiling and targeted performance work on the real demo.

### Default verification after cut

`npm run verify` (or a clearly named default such as `npm run verify:demo` wired as the documented gate) should prove only:

- Demo map/assets load  
- Playable browser session for the fixed demo  
- Demo-critical interactions (e.g. harvest/train/combat/victory as already product-relevant)  
- Runtime determinism if still required for this demo  
- No requirement to pass the historical full `source-*` matrix  

Full-port verifiers remain recoverable from `archive/full-port` (`package.json` + `scripts/` at that tag). They are not the standing definition of “green” on `main`.

### What stays vs goes (principles)

| Keep on `main` | Move off default path / delete from `main` after freeze |
|----------------|--------------------------------------------------------|
| Fixed demo scenario and mission | Historical plan execution as active roadmap |
| Simulation/view/audio used by demo | Unreachable full-port-only features after trace |
| Demo-scoped verifiers | Default 100+ source-fidelity verify steps |
| Thin perf/playtest hooks useful for demo polish | Synthetic multi-row matrix as mandatory standing work |
| Agent docs + archive pointers | Duplicate full source trees on `main` |

Deletes from `main` after freeze are **safe with respect to loss** because the tag holds the bytes. Deletes are unsafe only if they break the demo gate—hence demo gate first.

## Success criteria

1. Tag and branch exist; `docs/ARCHIVE.md` records SHA and restore commands.  
2. A cold agent reading `AGENTS.md` + `docs/ARCHIVE.md` knows the product boundary and how to pull prior code.  
3. `archive/MANIFEST.md` lists major subsystems with status `in-demo` | `partial` | `archived`.  
4. Default verify is a short demo gate, not full-port fidelity.  
5. Demo still loads and plays the one ladder match.  
6. No requirement that `main` contain a second copy of the entire old tree.  
7. Ready for play-session performance work scoped only to that match.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Delete breaks a demo path | Demo gate before mass removal; restore from tag |
| Agents ignore archive and rewrite | Hard rules in `AGENTS.md`; inventory in `MANIFEST.md`; lift notes |
| Archive tag forgotten / never pushed | Implementation plan includes push of tag+branch; `archive:info` script |
| Soft quarantine leaves same mess | Prefer real removal from `main` after freeze, not endless `legacy/` without deletion |
| Premature asset slimming breaks art | Asset slim as separate step with `verify:wargus-assets` / demo load proof |
| Scope creeps back via “just one more verifier” | Product contract + rule: no full-port gate re-expansion without user decision |

## Alternatives considered

| Approach | Decision |
|----------|----------|
| **A. Archive tag/branch + surgical cut on `main`** | **Chosen.** Fastest path to a shippable demo; preserves all work; matches existing working demo. |
| **B. New slim package/repo + freeze old monorepo** | Rejected for now. High re-integration cost; risk of re-breaking behavior. Revisit only if coupling blocks (A). |
| **C. Soft quarantine only (docs + folders, almost no deletes)** | Rejected as end state. Acceptable as a temporary step inside (A), not the goal. |
| **Full source dump under `archive/` on `main`** | Rejected as default. Git tag is source of truth; dump optional later. |

## Implementation plan (next artifact)

This design does not authorize silent bulk deletion. After user review of this spec, produce an implementation plan that includes:

1. Exact freeze commands (tag message, branch, push).  
2. File list for navigation docs and initial `MANIFEST.md` inventory rows.  
3. Proposed demo verify script set (explicit names).  
4. Ordered delete/quarantine batches with demo-gate check after each batch.  
5. God-file split criteria (demo-only, no drive-by refactors).  
6. Exit criteria matching the success section above.  
7. Hand-off note: play-session performance workflow starts only after the cut exit criteria pass.

## Approval

- **Product boundary:** one Garden of war fixed ladder match (user, 2026-08-06).  
- **Archive approach:** immutable tag + branch + `docs/ARCHIVE.md` / `archive/*` pointers; lift-over-rewrite; no full dump on `main` by default (user, 2026-08-06).  
- **This document:** written for user review before the implementation plan and before any freeze/cut execution.
