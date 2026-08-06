# Full-port archive pointer

This directory is **not** a second live product and does **not** contain a full source dump of the pre-cut tree.

## Freeze coordinates

| Artifact | Value |
|----------|--------|
| Freeze SHA | `10ab3d3892abd95ae05e3477004f99b847090022` |
| Annotated tag | `archive/full-port-pre-demo-cut` |
| Branch | `archive/full-port` |
| Pivot date | 2026-08-06 |

## Where the full tree lives

All full-port source, scripts, plans, and assets at freeze time live in git:

```bash
git show archive/full-port:<path>
git checkout archive/full-port -- <path>
git ls-tree -r --name-only archive/full-port
```

## Agent docs

| Doc | Role |
|-----|------|
| [docs/ARCHIVE.md](../docs/ARCHIVE.md) | Canonical freeze identity, restore commands, lift recipe |
| [docs/DEMO-PRODUCT.md](../docs/DEMO-PRODUCT.md) | Active product boundary on `main` |
| [docs/DEMO-MAP.md](../docs/DEMO-MAP.md) | Demo runtime map |
| [archive/MANIFEST.md](./MANIFEST.md) | Subsystem inventory and demo status |
| [docs/lifts/](../docs/lifts/) | Lift notes when code returns to `main` |

## Rule

Treat this archive as **reference and extract source** only. Do not reintroduce full-port scope, gates, or roadmap execution on `main` without an explicit product decision.
