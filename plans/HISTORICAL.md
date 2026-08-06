# Plans directory is historical

**Status:** Read-only history on `main` (not execution authority)  
**Product pivot date:** 2026-08-06

This directory holds the frozen full-port roadmap (Plans 001–027), wave evidence, and execution-policy documents from before the demo product cut. Agents must **not** treat `plans/README.md` or any plan under `plans/` as active work orders on `main`.

## Active product (use these instead)

| Doc | Role |
|-----|------|
| [docs/DEMO-PRODUCT.md](../docs/DEMO-PRODUCT.md) | In/out product boundary for `main` |
| [docs/DEMO-MAP.md](../docs/DEMO-MAP.md) | Fixed Garden of war ladder runtime map |
| [docs/ARCHIVE.md](../docs/ARCHIVE.md) | Full-port freeze identity and lift guidance |
| [AGENTS.md](../AGENTS.md) | Agent rules for the demo-only product |

## Full-port freeze

| Artifact | Value |
|----------|--------|
| Annotated tag | `archive/full-port-pre-demo-cut` |
| Branch | `archive/full-port` |
| Map | [docs/ARCHIVE.md](../docs/ARCHIVE.md) |

```bash
git rev-parse archive/full-port-pre-demo-cut^{}
# see docs/ARCHIVE.md for the expected freeze SHA
```

## What stays here

- Plan files `001`–`027` and their evidence under `plans/evidence/`
- Status ledger in [README.md](README.md) (historical record only)
- [HISTORICAL-PLAN-AUDIT.md](HISTORICAL-PLAN-AUDIT.md) for Plans 001–017 classification
- Host/performance contracts as **reference** for how the full-port program was run; they do not authorize new wave work on `main`

Do not delete these files for “cleanup.” History is useful on `main` as read-only context. Re-open scope only after an explicit user decision and an update to `docs/DEMO-PRODUCT.md` / `docs/ARCHIVE.md`.

## Do not execute on `main`

- Plans **018–027** (performance waves, browser foundation, drifted-gate repair roadmap work)
- Wave 0–5 coordinator barriers, parallel worktree ownership, or absolute-release Wave 5 sequences
- Any language in older plan docs that grants autonomous full-roadmap execution

If a future task needs full-port behavior, lift from the archive tag/branch per [docs/ARCHIVE.md](../docs/ARCHIVE.md); do not resume the wave roadmap from this index.
