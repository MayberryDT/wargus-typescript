# Plan 020: Replace Hot Linear Unit Lookups With A Transient ID Index

> **Executor instructions**: Follow each gate. Preserve `world.units` as the
> authoritative ordered collection; the new index is derived and never saved.
>
> **Drift check (run first)**:
> `git diff --stat 8ac0006..HEAD -- src/simulation/orders.ts src/simulation/worldSelectors.ts scripts/verify-unit-index.mjs scripts/verify-save-schema.mjs package.json plans/020-add-transient-unit-id-index.md plans/evidence/020.md plans/README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/018-establish-runtime-performance-feedback-loop.md
- **Category**: perf
- **Planned at**: commit `8ac0006`, 2026-07-27

## Why this matters

Attackers, projectiles, pending attacks, selections, and helpers repeatedly
resolve IDs with a full `world.units.find`. Combat cost therefore grows with
active references multiplied by total units. A per-world transient map makes
these lookups constant-time while retaining array order for deterministic
iteration.

## Current state

```ts
// src/simulation/orders.ts:11297
function findUnit(world: WorldState, unitId: string): WorldUnit | undefined {
  return world.units.find((unit) => unit.id === unitId);
}

// src/simulation/orders.ts:10218
const attacker = findUnit(world, pendingAttack.sourceId);
const target = findUnit(world, pendingAttack.targetId);
```

`world.units` is replaced, filtered, and pushed at many runtime seams. Unit IDs
do not change after creation. Save/load creates a new `WorldState`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0 |
| Index parity | `npm run verify:unit-index` | exits 0 |
| Save schema | `npm run verify:save-schema` | exits 0 |
| Combat | `npm run verify:source-attack-action` | exits 0 |
| Browser combat | `npm run verify:browser-combat-session` | exits 0 |
| Determinism | `npm run verify:runtime-determinism` | exits 0 |
| Profile | Plan 018 `combat-100` | no regression; attach summary |

## Scope

**In scope**:

- `src/simulation/worldSelectors.ts`
- `src/simulation/orders.ts`, hot ID consumers only
- `scripts/verify-unit-index.mjs` (create)
- `scripts/verify-save-schema.mjs`, parity guard only
- `package.json`
- `plans/evidence/020.md` and `plans/README.md`

**Out of scope**:

- Replacing `world.units` with a Map
- Renderer/UI lookups
- Spatial/tile occupancy
- Save-format fields or unit iteration ordering
- Broad cleanup of every `.find` call

## Git workflow

- Suggested branch: `codex/020-unit-id-index`
- Land index/parity tests, then hot caller migration.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Establish baseline

Run typecheck, save, combat, browser combat, determinism, and `combat-100`.

**Verify**: all checks pass and baseline summary is recorded.

### Step 2: Implement a self-validating transient index

In `worldSelectors.ts`, add `findWorldUnitById` backed by a
`WeakMap<WorldState, Cache>`. Rebuild when any cache identity changes:

- `world.tick`;
- `world.units` array reference;
- `world.units.length`.

Add an explicit `invalidateWorldUnitIndex(world)` for mutations that can replace
same-length contents inside one tick. Reject duplicate IDs in test/debug mode;
production lookup must preserve the first-array-entry behavior until duplicate
IDs are proven impossible.

Do not add the cache to `WorldState` and do not serialize it.

**Verify**: `npm run verify:unit-index` covers push, filter/replacement,
same-length replacement+invalidation, tick change, death retained in array,
duplicate IDs, and independent worlds.

### Step 3: Migrate hot simulation consumers

Replace the private `findUnit` body in `orders.ts` with
`findWorldUnitById`. Keep the local wrapper initially to avoid a broad diff.
Audit all unit-list mutations before the fixture-only section and call explicit
invalidation only where tick/reference/length cannot detect a change.

Do not change ordered `.filter`, `.sort`, or target-selection loops.

**Verify**: index parity, attack action, and typecheck pass.

### Step 4: Verify persistence and performance

Run save-schema, browser combat, determinism, and two identical `combat-100`
captures. Record lookup rebuild/count diagnostics and before/after p95 in
`plans/evidence/020.md`.

## Test plan

- Cache lifecycle and invalidation cases listed in Step 2.
- Projectile target death/removal.
- Pending attack attacker/target resolution.
- Cargo load/unload and construction replacement.
- Save/load world replacement.
- Deterministic combat state equality before and after index use.

## Done criteria

- [ ] Hot `orders.ts` ID resolution uses one transient map per world/tick.
- [ ] `world.units` remains authoritative and ordered.
- [ ] Cache is not present in saves or determinism output.
- [ ] All focused tests and browser combat pass.
- [ ] `combat-100` does not regress and evidence is recorded.
- [ ] Only in-scope files changed; README row is DONE.

## STOP conditions

- Unit IDs mutate after insertion.
- Duplicate IDs are valid runtime behavior.
- Correct invalidation requires editing save data or every unit consumer.
- Browser combat or deterministic save output changes.
- The index rebuilds once per lookup rather than once per stable world/tick.

## Maintenance notes

Any future same-tick, same-length replacement of `world.units` must invalidate
the cache. Keep target-selection iteration on the array when array order is a
tie-breaker.
