# Plan 013: Make Combat Commitments And Automatic Response Consistent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow every step and verification gate. Stop rather than inventing new combat rules. Update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/simulation/world.ts src/simulation/orders.ts src/wargus/saveGame.ts src/view/worldEventFeedback.ts scripts/verify-browser-combat-session.mjs scripts/verify-source-attack-action.mjs scripts/verify-source-fov-fog.mjs scripts/verify-source-event-audio-pan.mjs plans/evidence/013.md plans/013-fix-combat-commitment-and-response.md plans/README.md`
> If attack orders, projectile impact, area damage, or world-event feedback changed semantically, STOP and reconcile the plan.

**Goal:** Make attacks that were legal when launched resolve consistently through fog, prevent attack-move from freezing on unreachable aggro, and make idle mobile defenders engage nearby enemies with a bounded chase.

**Architecture:** Visibility gates target acquisition, not already-committed damage. Projectiles continue toward their validated target after launch, while idle automatic attacks reuse the existing attack order with explicit origin/leash metadata.

**Tech Stack:** TypeScript 6 deterministic simulation, PixiJS 8 runtime/audio feedback, JSON save normalization, repo-native browser combat verifier.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Preserve damage formulas, armor, piercing damage, cooldowns, missile speed, splash falloff, friendly-fire metadata, and spell condition rules.
- Do not make units acquire targets through fog.
- Do not make idle units chase indefinitely.
- Hold Position must remain stationary.
- Visible enemy combat should be audible; fully hidden combat should not reveal map information through sound.

---

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plans/012-make-movement-orders-reliable.md
- **Category**: bug
- **Planned at**: commit `6af2eeb`, 2026-07-10

## Player-visible contract and evidence

- Assigned scenarios: M05–M07; replay M02 and M04.
- Before: attack-move can freeze, idle defenders can sleep beside enemies, and fog can erase launched damage.
- After: attack-move continues, automatic pursuit is bounded, Hold Position stays put, and committed attacks resolve once.
- Required handoff: `plans/evidence/013.md`, including HP, target-id, leash-distance, visibility, and sound timelines.

## Current state

- `src/simulation/orders.ts:5936-5965` retains an attack-move target even when `sourceAttackTargetPath` stays empty.
- `src/simulation/orders.ts:9213-9231` finds a mobile unit's nearest enemy in reaction range but attacks only if it is already inside weapon range.
- `src/simulation/orders.ts:9341-9410` uses `canProjectileTrackTarget` for both tracking and whether normal direct impact exists; that helper requires current visibility.
- `src/simulation/orders.ts:14089-14110` and `14888-14906` filter splash/area victims by current caster visibility.
- `src/view/worldEventFeedback.ts:50-73` plays death and sound events only when `event.player` is the local player, even when an enemy event is currently visible.
- `WorldOrder` attack orders have no automatic-chase origin/leash metadata.

## Interfaces

Extend only the existing attack order:

```ts
type AttackLeash = {
  originX: number;
  originY: number;
  radius: number;
};

// Fields added to the existing attack order member.
autoLeash: AttackLeash | null;
```

Every explicit player/AI attack sets `autoLeash: null`. Only `stepDefensiveAutoAttack` creates a non-null leash. Save normalization must default missing data to `null` for backward compatibility.

Split projectile predicates by responsibility:

```ts
function canProjectileContinueToTarget(...): target is WorldUnit; // no visibility check
function canAcquireOrRevealTarget(...): boolean;                  // visibility remains here
```

Add a feedback predicate:

```ts
function isWorldEventAudibleToLocalPlayer(world: WorldState, event: { player: number; x?: number; y?: number }): boolean;
```

## Design decision and rollback

- **Rejected:** re-check visibility at impact; that is the bug and makes legal attacks nondeterministically disappear.
- **Rejected:** convert auto-response into a new top-level order kind; it duplicates the existing attack state machine and broadens save compatibility.
- **Chosen:** let validated projectiles track their committed target and add optional leash metadata to ordinary attack orders. Acquisition remains visibility-gated.
- **Rollback trigger:** M06 damages a target that was never legal at launch, M07 leaks auto-leash behavior into explicit player attacks, or hidden enemy audio increments playback. Restore the last isolated checkpoint and retain the other accepted combat slices.

## Scope

**In scope**:

- `src/simulation/world.ts`
- `src/simulation/orders.ts`
- `src/wargus/saveGame.ts`
- `src/view/worldEventFeedback.ts`
- `scripts/verify-browser-combat-session.mjs`
- `scripts/verify-source-attack-action.mjs`
- `scripts/verify-source-fov-fog.mjs`
- `scripts/verify-source-event-audio-pan.mjs`
- `plans/evidence/013.md` (create during execution)
- `plans/README.md`

**Out of scope**:

- Rebalancing unit damage, range, armor, or cooldowns
- New combat stances or UI buttons
- AI wave composition or difficulty
- New fog rendering
- Mission victory/defeat handling

## Git workflow

- Suggested branch: `codex/013-combat-consistency`
- Commit combat order behavior, committed damage, and feedback as separate logical commits.
- Do not push or open a PR unless instructed.

## Steps

### Task 1: Establish the combat baseline

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:browser-combat-session`.
- [ ] Run `npm run verify:source-attack-action`.
- [ ] Run `npm run verify:source-fov-fog`.
- [ ] Run `npm run verify:source-event-audio-pan`.

Expected: all exit 0. STOP on a pre-existing unrelated failure.

### Task 2: Recover attack-move from unreachable aggro

- [ ] In `stepAttackMoveOrder`, after replanning toward an acquired target, detect `path.length === 0 && !isInAttackRange(...)`.
- [ ] Clear only `targetId`, rebuild the path to the attack-move destination already stored in `targetX/targetY`, and continue the original order.
- [ ] Do not clear the whole attack-move order unless plan 012's static pathfinder says the original destination is itself unreachable.

Target branch:

```ts
const path = sourceAttackTargetPath(world, unit, target);
if (path.length === 0 && !isInAttackRange(unit, target, world)) {
  unit.order.targetId = null;
  unit.order.path = findPath(world, unit, unit.order.targetX, unit.order.targetY);
  unit.order.pathIndex = unit.order.path.length > 1 ? 1 : 0;
  stepMoveOrder(world, unit, tickSeconds);
  return;
}
```

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exit 0.

### Task 3: Add bounded idle auto-chase

- [ ] Add `autoLeash` to the attack member of `WorldOrder` in `src/simulation/world.ts`.
- [ ] Update every explicit attack-order constructor to set `autoLeash: null`.
- [ ] In `stepDefensiveAutoAttack`, when a mobile unit finds an enemy inside reaction range but outside weapon range, create an attack order whose leash origin is the unit's current point and whose radius is `sourceReactionRangeForUnit(world, unit)`.
- [ ] In `stepAttackOrder`, when `autoLeash` is non-null, abandon the target if the unit or target moves beyond the leash radius from the origin. Issue a normal move back to the origin; after arrival the unit becomes idle.
- [ ] Keep defensive buildings firing only at weapon range and keep Hold Position unchanged.
- [ ] Throttle reacquisition with the existing `nextAutoActionTick`; do not scan every frame.

**Verify**: `npm run verify:source-attack-action` -> exits 0 after it asserts the leash shape and explicit attacks' `null` leash.

### Task 4: Preserve the leash across save/load

- [ ] In `normalizeLoadedOrder`, normalize attack `autoLeash` when it is a finite object inside map bounds; otherwise use `null`.
- [ ] Clamp the radius to `0..64 * tileSize`.
- [ ] Old saves without the field must load as explicit ordinary attacks.
- [ ] Ensure `hasInvalidLoadedAttackOrder` validates the target/path as before and does not reject a valid leash solely because the target is temporarily outside current visibility.

Target normalization shape:

```ts
return targetId ? {
  kind,
  targetId,
  targetX,
  targetY,
  autoLeash: normalizeLoadedAttackLeash(world, record.autoLeash),
  path,
  pathIndex
} : null;
```

**Verify**: `npm run verify:save-schema` -> exits 0.

### Task 5: Separate projectile commitment from visibility

- [ ] Replace `canProjectileTrackTarget` with `canProjectileContinueToTarget` that checks only live target, ownership/friendly-fire legality, and target land/sea/air compatibility.
- [ ] Continue updating projectile target coordinates while that predicate is true, even after the target leaves vision.
- [ ] On impact, apply direct/splash damage when the committed target remains valid. If it died or transformed into an invalid target kind, retain the existing ground-impact behavior for siege/cannon/bounce projectiles and discard ordinary projectiles.
- [ ] Do not call target acquisition from the projectile step.

**Verify**: `rg -n 'isUnitVisibleToPlayer\(world, target, projectile.player\)' src/simulation/orders.ts` -> no match inside projectile continuation/impact logic.

### Task 6: Remove visibility from already-cast area damage

- [ ] In `applySplashDamage` and `tickAreaDamageSpell`, remove only the current-visibility filter.
- [ ] Preserve source spell condition checks, ownership/friendly-fire checks, radius, unit liveness, and unit-kind rules.
- [ ] Do not change spell target selection before casting.

**Verify**: `npm run verify:source-fov-fog` -> exits 0 after its expectations distinguish acquisition visibility from committed damage.

### Task 7: Make visible enemy combat audible

- [ ] Implement `isWorldEventAudibleToLocalPlayer` in `worldEventFeedback.ts`.
- [ ] Return true for local-player events.
- [ ] For enemy events with finite coordinates, return true only when the event position is currently visible to `world.visibilityPlayer`.
- [ ] Use the predicate for generic `sound` events and enemy death sounds. Keep local help/alert messages ownership-gated.
- [ ] Do not play coordinate-less enemy events; they could reveal hidden activity.

**Verify**: `npm run verify:source-event-audio-pan` -> exits 0 and covers local, visible enemy, and hidden enemy cases.

### Task 8: Add playable combat scenarios

- [ ] Extend `scripts/verify-browser-combat-session.mjs` with actual-world scenarios:
  1. Launch an arrow, remove target visibility before impact, confirm HP still decreases once.
  2. Start Blizzard/Death and Decay, move sight away during pulses, confirm valid units inside the area continue taking damage.
  3. Put an unreachable enemy inside attack-move reaction range, confirm the attacker resumes the original destination.
  4. Put an enemy just outside melee range but inside reaction range, confirm the idle defender chases, attacks, and returns within one tile of its origin.
  5. Confirm Hold Position does not chase.
- [ ] Record at least one visible-enemy combat audio start and confirm a hidden enemy event does not increment playback.

**Verify**: `npm run verify:browser-combat-session` -> exits 0 and reports all five scenarios.

### Task 9: Perform the playable acceptance session

- [ ] Run the fixed demo in the in-app Browser.
- [ ] Attack-move a small Footman group past an enemy separated by terrain, then fight a visible Archer/Footman skirmish at a fog boundary.

Expected observable behavior:

- Attack-move does not freeze on the inaccessible unit.
- Idle Footmen step forward to engage and return rather than sleeping or chasing forever.
- Launched missiles still land when sight changes.
- Visible enemy attacks and deaths have positional sound.

### Task 10: Close out

- [ ] Run `./node_modules/.bin/tsc --noEmit`.
- [ ] Run `npm run verify:browser-combat-session`.
- [ ] Run `npm run verify:source-attack-action`.
- [ ] Run `npm run verify:source-fov-fog`.
- [ ] Run `npm run verify:source-event-audio-pan`.
- [ ] Run `npm run verify:save-schema`.
- [ ] Replay M02/M04 and record M05–M07 in `plans/evidence/013.md`; obtain a READY review decision.
- [ ] Run `git diff --check` and confirm only in-scope files changed.
- [ ] Update plan 013 to `DONE` in `plans/README.md`.

## Done criteria

- [ ] Attack-move resumes after rejecting an unreachable aggro target.
- [ ] Idle mobile attackers chase within reaction range and return within a bounded leash.
- [ ] Hold Position and defensive buildings retain their intended behavior.
- [ ] Legal launched projectiles and active area effects are not cancelled by fog.
- [ ] Visible enemy combat is audible without leaking fully hidden combat.
- [ ] Old saves load attack orders with `autoLeash: null`.
- [ ] Browser combat scenarios and manual fog-boundary skirmish pass.
- [ ] M02 and M04–M07 evidence is recorded and plan 013 has a READY review decision.

## STOP conditions

- The fix requires changing damage, armor, cooldown, or missile-speed values.
- A committed projectile starts acquiring a new target after launch.
- Enemy audio cannot be visibility-gated without exposing hidden-unit information.
- Auto-chase requires a new top-level order kind rather than the optional leash metadata.
- Plan 012's movement behavior is not complete or attack-move still drops orders due transient blockers.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

Reviewers should distinguish acquisition, continuation, and impact; visibility belongs only in acquisition. Future stances should reuse `autoLeash` semantics rather than adding another independent chase implementation.
