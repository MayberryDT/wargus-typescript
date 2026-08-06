# Full-Port Archive

**Status:** Immutable reference freeze (not a second live product)  
**Product pivot date:** 2026-08-06  
**Active product on `main`:** [Demo Product Contract](./DEMO-PRODUCT.md)

This document is the agent map for the full Wargus-TypeScript port snapshot taken before the demo product cut. Use it before inventing missing subsystems or restoring historical gates.

## Freeze identity

| Artifact | Value |
|----------|--------|
| Freeze SHA | `10ab3d3892abd95ae05e3477004f99b847090022` |
| Annotated tag | `archive/full-port-pre-demo-cut` |
| Branch | `archive/full-port` |
| Date (UTC) | 2026-08-06 |
| Tip subject | `docs: add demo cut and archive implementation plan` |

Verify locally:

```bash
git rev-parse archive/full-port
# expect: 10ab3d3892abd95ae05e3477004f99b847090022

git rev-parse archive/full-port-pre-demo-cut^{}
# expect: 10ab3d3892abd95ae05e3477004f99b847090022
```

Rules:

- Do not move or delete the tag.
- Do not rewrite history of the freeze commit.
- `main` may diverge after the freeze; the tag remains the museum of the full port.

## Why this exists

On 2026-08-06 the product boundary locked to a single fixed Garden of war ladder demo. Prior full-port work remains valuable for later scope expansion, but it must not drive default gates, plans, or scope on `main`. The archive preserves every byte of that program without keeping a second live codebase in the working tree.

## Pointers on `main`

| Path | Role |
|------|------|
| [docs/DEMO-PRODUCT.md](./DEMO-PRODUCT.md) | Active product in/out contract |
| [docs/DEMO-MAP.md](./DEMO-MAP.md) | Demo runtime path (entry → tick → render) |
| [archive/README.md](../archive/README.md) | Short pointer; no full source dump |
| [archive/MANIFEST.md](../archive/MANIFEST.md) | Subsystem inventory and demo status |
| [docs/lifts/](./lifts/) | Notes for code lifted back onto `main` |

**Hard rule:** the archive is reference and extract source only. It is **not** a second live product to keep in sync with `main`.

## Restore commands

```bash
# Inspect a file from the full port
git show archive/full-port:src/simulation/orders.ts | less

# Restore a path into the working tree (lift)
git checkout archive/full-port -- path/to/file

# List a directory at freeze
git ls-tree -r --name-only archive/full-port -- src/wargus
```

Prefer `git show` for read-only inspection. Use `git checkout archive/full-port -- <path>` only when an approved lift or demo fix needs those bytes on `main`.

## Lift recipe

When a missing behavior is needed for an **approved** scope expansion (or a demo hole that already existed in the full port):

1. Find the subsystem in this file and [archive/MANIFEST.md](../archive/MANIFEST.md).
2. Restore the smallest path set from `archive/full-port`.
3. Trim to types/units/UI the demo (or new product slice) actually needs.
4. Add or extend **demo-scoped** verification only.
5. Record the lift in `docs/lifts/YYYY-MM-DD-<topic>.md` (what path, what kept, what left behind).
6. Do **not** re-enable full-port `source-*` gates as the default `npm run verify` unless the product contract says so.

## Related design

- Design: [docs/superpowers/specs/2026-08-06-demo-cut-and-archive-design.md](./superpowers/specs/2026-08-06-demo-cut-and-archive-design.md)
- Implementation plan: [docs/superpowers/plans/2026-08-06-demo-cut-and-archive.md](./superpowers/plans/2026-08-06-demo-cut-and-archive.md)
