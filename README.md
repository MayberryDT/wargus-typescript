# Wargus TypeScript

Browser-native TypeScript / PixiJS / Vite runtime for a **fixed Wargus ladder demo**.

This is not a WebAssembly wrap of desktop Stratagus. The active product on `main` is **one** map and match, not a full-game port.

## Product

**Garden of war** — human vs computer 1v1 on:

`maps/ladder/Garden of war BNE.pud.smp.gz`

In scope: load the match, harvest/economy basics, train and build enough to fight, AI pressure, win by defeating the enemy, HUD/audio needed for that loop, polish and performance of **this** match.

Out of scope for now: other maps, campaign, full source-UI parity as the default quality bar, re-expanding to full-port verify.

- Product contract: [docs/DEMO-PRODUCT.md](docs/DEMO-PRODUCT.md)
- How the demo boots (entry → tick → render): [docs/DEMO-MAP.md](docs/DEMO-MAP.md)
- Agent rules: [AGENTS.md](AGENTS.md)

## Full-port archive

Earlier work aimed at a broader Wargus/Stratagus port. That tree is frozen and liftable, not the standing product.

```bash
npm run archive:info
```

- Tag: `archive/full-port-pre-demo-cut`
- Branch: `archive/full-port`
- Docs: [docs/ARCHIVE.md](docs/ARCHIVE.md), [archive/MANIFEST.md](archive/MANIFEST.md)

Restore a file: `git show archive/full-port:path/to/file`  
Lift into the working tree: `git checkout archive/full-port -- path/to/file`

Plans 001–027 under `plans/` are **historical** only.

## Run locally

```bash
npm install
npm run dev
```

On host `halla`, bind Tailscale for remote play (see [AGENTS.md](AGENTS.md)):

```bash
npm run dev -- --host 100.105.117.93 --port <free-port> --strictPort
```

Build:

```bash
npm run build
```

## Verify

Default gate (demo only):

```bash
npm run verify
# same as
npm run verify:demo
```

Optional extended (includes command-card; not required for default green):

```bash
npm run verify:demo-extended
```

Browser steps on Halla usually need system Chrome, e.g. `CHROME_BIN=/usr/bin/google-chrome`, and may use the host’s video/render groups.

## Live / deploy

- Live demo: https://wargus.animasai.co/  
- Worker URL: https://wargus-typescript.mayberrydt.workers.dev/  
- Apex https://animasai.co/ is the studio site, not this game.

Cloudflare deploy uses committed [wrangler.jsonc](wrangler.jsonc) (`assets.directory` = `./dist`). See Deployment in [AGENTS.md](AGENTS.md).

```bash
npm run deploy:cf          # build + wrangler deploy
npm run deploy:cf:dist     # deploy existing dist/
```

Do not deploy unless you mean to ship.

## Stack

- TypeScript, Vite, PixiJS 8
- Indexed Wargus assets under `public/wargus/` (manifest is required at runtime)
- Simulation / view / audio under `src/`

The TypeScript tree is still large (full port still imported from the shell). Prefer demo-scoped changes; lift from the archive before rewriting old subsystems.
