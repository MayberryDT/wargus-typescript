# Plan 001: Add Repository Agent Guidance

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP Conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3c35520..HEAD -- AGENTS.md plans/001-add-agent-guidance.md plans/README.md`
> If `AGENTS.md` changed since this plan was written, compare the "Current state" section against the live file before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `3c35520`, 2026-06-16

## Why This Matters

The repo did not have an on-disk `AGENTS.md`, so future agents would not reliably inherit project-specific rules. This project has two important operational constraints: browser automation should use the Codex in-app Browser plugin first, and `public/wargus/manifest.json` plus the asset pack are release-critical. Capturing those rules locally reduces repeated mistakes during future implementation plans.

This plan only adds guidance. It must not implement any of the runtime/security/refactor plans.

## Current State

- The user provided `/home/tyler/Downloads/CLAUDE.md` as the base behavioral guidance.
- No `AGENTS.md` existed at repo root during recon.
- Wargus-specific context from repo/memory:
  - `public/wargus/manifest.json` is a critical runtime dependency.
  - `npm run verify:wargus-assets` is the fail-closed asset-pack gate.
  - Browser automation must prefer the in-app Browser plugin with `iab`.

The new file should include:

```markdown
# AGENTS.md

Scope: this file applies to the entire repository.
```

And it should include the browser automation rule:

```markdown
When browser automation is needed, use the Codex in-app Browser plugin with the `iab` backend first.
```

Required AGENTS.md sections:

```markdown
# AGENTS.md

Scope: this file applies to the entire repository.

## Browser Automation

When browser automation is needed, use the Codex in-app Browser plugin with the `iab` backend first.

Do not fall back to standalone Playwright, external browser-control servers, shell-launched browsers, or Computer Use for browser work unless the user explicitly approves that fallback.

## Source Of Truth

- `public/wargus/manifest.json` and the `public/wargus` asset pack are critical runtime dependencies.
- Treat `npm run verify:wargus-assets` as a release-blocking gate for asset or build changes.
- Do not deploy to Netlify unless the user explicitly asks for deployment or live-site debugging.

## Coding Guidelines

Include the four sections from `/home/tyler/Downloads/CLAUDE.md`, adapted from Claude-specific wording to repository-neutral agent wording:

- Think Before Coding
- Simplicity First
- Surgical Changes
- Goal-Driven Execution

## Verification

Name the common commands:

- `./node_modules/.bin/tsc --noEmit`
- `npm run verify:wargus-assets`
- `npm run build`
- `npm run verify`

## Working With Plans

Tell executors to read full plan files under `plans/`, run drift checks first, honor STOP conditions, and update `plans/README.md` status when done.
```

## Commands You Will Need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Source reference | `sed -n '1,220p' /home/tyler/Downloads/CLAUDE.md` | Shows the base behavioral sections |
| Inspect | `sed -n '1,220p' AGENTS.md` | File exists and contains project guidance |
| Content check | `rg -n "iab|verify:wargus-assets|Math\\.random|Date\\.now|Working With Plans" AGENTS.md` | All required project rules are present |
| Git check | `git status --short` | Shows only intended docs/plans changes |

## Scope

**In scope**:

- `AGENTS.md`
- `plans/001-add-agent-guidance.md`
- `plans/README.md`

**Out of scope**:

- Runtime source files under `src/`
- Verification scripts under `scripts/`
- Package or lockfile changes

## Steps

### Step 1: Ensure AGENTS.md Exists

Create or update `AGENTS.md` at repo root. Base the generic behavioral sections on `/home/tyler/Downloads/CLAUDE.md`, but adapt language from "Claude" to repository-neutral agent guidance.

Include these project-specific sections:

- Browser Automation
- Source Of Truth
- Coding Guidelines
- Verification
- Working With Plans

Do not create source-code tasks, install dependencies, or run builds in this step.

**Verify**: `sed -n '1,220p' AGENTS.md` -> file exists and includes the Browser Automation and Verification sections.

### Step 2: Keep The Guidance Specific

Ensure `AGENTS.md` names concrete repo gates:

- `./node_modules/.bin/tsc --noEmit`
- `npm run verify:wargus-assets`
- `npm run build`
- `npm run verify`
- Browser smoke verifier scripts

Also include the rule that `Math.random()`, `Date.now()`, and `crypto.getRandomValues()` should not be introduced under `src/**/*.ts` without redesigning the determinism verifier.

**Verify**: `rg -n "verify:wargus-assets|runtime determinism|Math\\.random|Date\\.now|Browser plugin|iab" AGENTS.md` -> all patterns are present.

**Verify**: `git status --short -- . ':!plans'` -> only `?? AGENTS.md` or `M AGENTS.md` is listed.

### Step 3: Update Plan Index

Keep this plan row in `plans/README.md` marked `DONE` if `AGENTS.md` is present and matches the requirements above.

**Verify**: `rg -n "001 \\| Add repository agent guidance" plans/README.md` -> row exists.

## Test Plan

This is a documentation-only change. The tests are read-only content checks:

- `sed -n '1,220p' AGENTS.md`
- `rg -n "verify:wargus-assets|Browser plugin|iab|Working With Plans" AGENTS.md`
- `git status --short -- . ':!plans'`

## Done Criteria

- [ ] `AGENTS.md` exists at repo root.
- [ ] `AGENTS.md` includes the in-app Browser `iab` rule.
- [ ] `AGENTS.md` includes asset-pack and verification guidance.
- [ ] `plans/README.md` marks this plan as DONE.
- [ ] No runtime source files were modified for this plan.

## STOP Conditions

Stop and report back if:

- The user-provided `/home/tyler/Downloads/CLAUDE.md` is unavailable and `AGENTS.md` does not already exist.
- The requested browser automation rule conflicts with a newer user instruction.
- Completing this plan appears to require source changes outside docs/plans.
- You are tempted to implement any of plans 002-006 while writing `AGENTS.md`.

## Maintenance Notes

When future plans introduce new repo-wide rules, update `AGENTS.md` in the same PR. Keep it short enough that agents will actually read it before editing.
