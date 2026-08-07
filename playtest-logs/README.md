# Playtest logs

Human play sessions are **auto-captured** when the game runs under `npm run dev` or `vite preview` (Vite middleware on this repo).

You do **not** need to export JSON from the browser. Speak commentary in chat; agents read these files on disk.

## Layout

| Path | Purpose |
|---|---|
| `latest.json` | Pointer to the most recently updated session |
| `index.json` | Newest-first index of recent sessions (capped) |
| `sessions/<sessionId>.json` | Full entry list for one browser page load |

Session files grow for the whole playthrough (not limited to the 240-entry browser buffer). Automated `?smoke` verifier runs do not write here.

## Agent workflow

1. Start (or reuse) a Tailscale-bound dev server.
2. Human plays and comments in chat.
3. After the session (or mid-stream):

```bash
cat playtest-logs/latest.json
# then open the path it names under sessions/
```

4. Correlate chat commentary with `tick`, `wallTimeIso`, `jankReasons`, and unit/camera fields.
5. For patterns across sessions, scan `index.json` then the matching session files.

## Manual fallback (optional)

DevTools still works if needed:

```js
window.__WARGUS_TS_EXPORT_PLAYTEST_LOG__()
window.__WARGUS_TS_PLAYTEST_LOG__()
```
