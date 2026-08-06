# AGENTS.md

Scope: this file applies to the entire repository.

## Execution Host

When an in-scope command genuinely requires sudo, use the host-local configured authentication non-interactively. Do not pause to ask Tyler for sudo credentials; keep credential values out of Git and logs.

All future implementation, build, test, verifier, game-runtime, and browser work for this project must run on the SSH host `halla`, not on the local workstation.

- Use an isolated checkout under `/home/halla/workspaces/` and confirm `hostname` is `halla` before starting project processes.
- Keep local work limited to lightweight coordination, Git/artifact transfer, and reviewing results returned from Halla.
- Before choosing ports or starting processes on Halla, inspect its current listeners and processes. Use unique unoccupied ports.
- Do not stop, restart, reconfigure, or otherwise interfere with any pre-existing Halla automation, app, container, service, or process.
- Track every project process started on Halla by its exact PID, and clean up only those exact PIDs. Never use broad `pkill`, `killall`, container-wide cleanup, or port-owner termination.
- If Halla is unavailable, stop and report the blocker instead of falling back to resource-intensive local execution.

### Remote access (user is not on Halla)

Agents run on `halla`. The human opens the app from their local machine over Tailscale. `http://127.0.0.1:...` only works on Halla itself and is useless for the user.

When starting a dev/preview server the user should open in a browser:

1. Bind to Halla's Tailscale address (or MagicDNS host), not loopback. Prefer:
   - IP: `100.105.117.93`
   - MagicDNS: `halla.tailaf7529.ts.net`
2. Use a free high port after checking listeners (example pattern: `npm run dev -- --host 100.105.117.93 --port <free-port> --strictPort`).
3. Give the user a Tailscale URL they can open, e.g. `http://halla.tailaf7529.ts.net:<port>/` or `http://100.105.117.93:<port>/`.
4. Do not present `127.0.0.1` / `localhost` links as if the user can use them.

## Automation First

- Resolve routine, safe, in-scope prerequisites autonomously when the required
  information or host-local access is already available.
- Do not pause for confirmation on reversible actions already authorized by an
  approved plan. Preserve failure evidence, exhaust safe remedies, correct the
  cause, and continue through the roadmap.
- Use credentials only transiently for their intended host-local action. Never
  write credential values to Git, plans, evidence, logs, or generated artifacts.
- Ask the user only when progress requires unavailable external input, a
  destructive or security-sensitive choice, or authority beyond the approved
  task.

## Browser Automation

When browser automation is needed, use the Codex in-app Browser plugin with the `iab` backend first.

Do not fall back to standalone Playwright, external browser-control servers, shell-launched browsers, or Computer Use for browser work unless the user explicitly approves that fallback.

References to `tab.playwright` inside the Browser plugin are acceptable only after the in-app Browser runtime is connected, because that still controls the in-app Browser.

## Source Of Truth

- `public/wargus/manifest.json` and the `public/wargus` asset pack are critical runtime dependencies.
- Treat `npm run verify:wargus-assets` as a release-blocking gate for asset or build changes.
- A `200` from the app shell is not enough to prove the demo works; verify critical asset routes such as `/wargus/manifest.json` when debugging black screens.
- Do not deploy to Netlify unless the user explicitly asks for deployment or live-site debugging.
- Do not introduce `Math.random()`, `Date.now()`, or `crypto.getRandomValues()` under `src/**/*.ts` without redesigning the runtime determinism verifier.

## Coding Guidelines

### Think Before Coding

Do not assume, do not hide confusion, and surface tradeoffs.

Before implementing:

- State assumptions explicitly when they affect the implementation.
- If multiple interpretations exist, present them instead of silently choosing.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, investigate repository and durable project evidence first, make the safest reversible in-scope assumption when possible, and continue. Ask only when unavailable external input or new authority is genuinely required.

### Simplicity First

Write the minimum code that solves the problem. Do not add speculative behavior.

- Do not add features beyond what was asked.
- Do not add abstractions for single-use code.
- Do not add flexibility or configurability that was not requested.
- Do not add error handling for impossible scenarios.
- If a solution is much longer than it needs to be, simplify it before finishing.

Ask: would a senior engineer say this is overcomplicated? If yes, simplify.

### Surgical Changes

Touch only what is necessary. Clean up only your own changes.

When editing existing code:

- Do not improve adjacent code, comments, or formatting unless required.
- Do not refactor unrelated code.
- Match existing style, even when a different style seems preferable.
- If unrelated dead code is noticed, mention it instead of deleting it.

When your changes create orphans:

- Remove imports, variables, functions, files, or tests that your changes made unused.
- Do not remove pre-existing dead code unless explicitly asked.

Every changed line should trace directly to the user's request.

### Goal-Driven Execution

Define success criteria and loop until verified.

Transform tasks into verifiable goals:

- "Add validation" means write tests for invalid inputs, then make them pass.
- "Fix the bug" means reproduce it with a test or focused verification, then make it pass.
- "Refactor X" means ensure relevant tests or checks pass before and after.

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let agents proceed independently. Weak criteria such as "make it work" require clarification.

## Verification

Common checks:

- `./node_modules/.bin/tsc --noEmit`
- `npm run verify:wargus-assets`
- `npm run build`
- `npm run verify`

Browser smoke verifier scripts include:

- `npm run verify:browser-runtime-smoke`
- `npm run verify:browser-playable-session`
- `npm run verify:browser-demo-session`
- `npm run verify:browser-map-loads`
- `npm run verify:browser-production`
- `npm run verify:browser-native-viewport`

Choose the smallest relevant check for the change, then broaden when the touched surface affects shared runtime, assets, build output, or browser behavior.

## Working With Plans

- Read full plan files under `plans/` before editing.
- Run each plan's drift checks first and compare live files against the plan's stated current state.
- Treat plan failure conditions as autonomous recovery triggers: preserve evidence, diagnose the cause, make the smallest in-scope correction, and rerun the failed gate. Do not pause for user approval or abandon the roadmap because a gate fails. Keep safety controls, ownership boundaries, and correctness requirements intact.
- Do not implement adjacent plans while executing a scoped plan.
- Update `plans/README.md` status when the plan assigns that responsibility, unless a coordinator explicitly owns shared status rows.
