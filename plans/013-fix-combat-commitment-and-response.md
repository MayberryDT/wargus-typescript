# Plan 013: Make Combat Commitments And Automatic Response Consistent — Implementation Plan

> **Historical status — `DONE-VERIFIED`:** This plan has already been executed.
> Its original executor instructions are retained as history and are not a
> current work order. See `plans/HISTORICAL-PLAN-AUDIT.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor instructions**: Follow every step and verification gate. Stop rather than inventing new combat rules. Update `plans/README.md` when complete unless a coordinator owns it.
>
> **Drift check (run first)**: `git diff --stat 6af2eeb..HEAD -- src/simulation/world.ts src/simulation/orders.ts src/wargus/saveGame.ts src/view/worldEventFeedback.ts src/main.ts scripts/verify-browser-combat-session.mjs scripts/verify-source-attack-action.mjs scripts/verify-source-fov-fog.mjs scripts/verify-source-event-audio-pan.mjs plans/evidence/013.md plans/013-fix-combat-commitment-and-response.md plans/README.md`
> If attack orders, projectile impact, area damage, or world-event feedback changed semantically, STOP and reconcile the plan.

**Goal:** Make attacks that were legal when launched resolve consistently
through fog, prevent attack-move from freezing on unreachable aggro, and make
idle mobile defenders engage nearby enemies then resume a saved return order.

**Architecture:** Visibility gates acquisition, not already-committed damage.
Preserve each missile class's fixed or tracking trajectory, restore Wargus's
actual ownership rules at impact, and let idle automatic attacks reuse the
existing attack order with a saved return origin instead of an invented radius
leash. Route combat through an attack-range-valid path result rather than
accepting general Move's range-expanded endpoint as a firing position.

**Tech Stack:** TypeScript 6 deterministic simulation, PixiJS 8 runtime/audio feedback, JSON save normalization, repo-native browser combat verifier.

## Global constraints

- Read `plans/MECHANICS-ACCEPTANCE.md` and `plans/EXECUTION-GATES.md` fully before editing; both are mandatory contracts.
- Preserve damage formulas, armor, piercing damage, cooldowns, missile speed,
  splash falloff, and imported missile metadata. Correct the port's
  interpretation of Wargus `FriendlyFire`; spell/autocast conditions remain
  pre-cast selection rules, not impact-victim filters.
- Do not make units acquire targets through fog.
- Automatic combat must restore its saved return order when the target dies,
  disappears, becomes invalid/unreachable, or leaves current reaction range
  without attacking the defender.
- Hold Position must remain stationary.
- Visible enemy combat should be audible; fully hidden combat should not reveal map information through sound.

---

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plans/012-make-movement-orders-reliable.md, plans/015-complete-demo-tech-paths.md (serialized smoke-fixture ownership)
- **Category**: bug
- **Planned at**: commit `6af2eeb`, 2026-07-10

## Player-visible contract and evidence

- Assigned scenarios: M05–M07; replay M02 and M04.
- Before: attack-move can freeze, idle defenders can sleep beside enemies, and fog can erase launched damage.
- After: attack-move continues, automatic defenders resume their saved origin,
  Hold Position stays put, and committed attacks resolve once with original
  Wargus area-friendly-fire behavior.
- Required handoff: `plans/evidence/013.md`, including HP, target-id,
  saved-return/current-reaction distance, visibility, area-ownership, and sound
  timelines.

## Current state

- `src/simulation/orders.ts:5936-5965` retains an attack-move target even when `sourceAttackTargetPath` stays empty.
- `src/simulation/orders.ts:9213-9231` finds a mobile unit's nearest enemy in reaction range but attacks only if it is already inside weapon range.
- `src/simulation/orders.ts:9341-9410` uses `canProjectileTrackTarget` for both tracking and whether normal direct impact exists; that helper requires current visibility.
- `src/simulation/orders.ts:14089-14110` and `14888-14906` filter splash/area victims by current caster visibility.
- `src/view/worldEventFeedback.ts:50-73` plays death and sound events only when `event.player` is the local player, even when an enemy event is currently visible.
- `WorldOrder` attack orders have no automatic saved-return metadata.
- Dead-target cleanup and save `orderReferencesMissingUnit` treat every attack
  target as a hard reference, so they would erase an automatic return before
  the attack step can restore it.

## Interfaces

Extend only the existing attack order:

```ts
type AutomaticAttackReturn = { x: number; y: number };

// Fields added to the existing attack order member.
autoReturn: AutomaticAttackReturn | null;
```

Every explicit player/AI attack sets `autoReturn: null`. Only
`stepDefensiveAutoAttack` captures the unit's exact current position. Save
normalization defaults missing data to `null` for backward compatibility.

Split projectile predicates by responsibility and preserve missile class:

```ts
function canCommittedProjectileHitStoredTarget(...): target is WorldUnit; // no visibility check
function sourceProjectileTracksTarget(projectile: WorldProjectile): boolean;
function canAcquireOrRevealTarget(...): boolean; // visibility remains here
```

Add a feedback predicate:

```ts
function isWorldEventAudibleToLocalPlayer(world: WorldState, event: { player: number; x?: number; y?: number }): boolean;
```

Keep a combat-private route classification whose accepted endpoint is inside
the attacker's weapon range:

```ts
type AttackTargetPathResult = {
  status: "ready" | "temporarily-blocked" | "unreachable";
  path: PathPoint[];
};
```

It may use Plan 012's path result internally, but it must reject any expanded
endpoint outside `isInAttackRange` and preserve terrain-only temporary intent.

## Design decision and rollback

- **Rejected:** re-check visibility at impact; that is the bug and makes legal attacks nondeterministically disappear.
- **Rejected:** an origin-radius auto leash. Installed Stratagus saves an
  attack-move return order and retains targets by reaction range around the
  moving defender; it has no anchor-distance cutoff.
- **Rejected:** make every projectile track a moving target. Ordinary Wargus
  arrows/axes snapshot their destination; only tracer-class missiles update it.
- **Chosen:** use optional saved-return metadata on ordinary attacks, preserve
  missile trajectory/impact class, use attack-range-valid path results, remove
  visibility from committed impact, and reproduce source ownership rules for
  area damage. Visible-enemy/hidden-enemy audio gating is a deliberate
  TypeScript anti-information-leak policy; installed Stratagus itself does not
  fog-gate combat sound.
- **Rollback trigger:** M06 damages a target that was never legal at launch,
  area victims contradict the source matrix, M07 leaks auto-return behavior
  into explicit attacks, or hidden enemy audio increments playback.

## Scope

**In scope**:

- `src/simulation/world.ts`
- `src/simulation/orders.ts`
- `src/wargus/saveGame.ts`
- `src/view/worldEventFeedback.ts`
- `src/main.ts` only to extend the smoke-mode M02–M07 mechanics scenario hook
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

- [x] Run `./node_modules/.bin/tsc --noEmit`.
- [x] Run `npm run verify:browser-combat-session`.
- [x] Run `npm run verify:source-attack-action`.
- [x] Run `npm run verify:source-fov-fog`.
- [x] Run `npm run verify:source-event-audio-pan`.

Expected: all exit 0. STOP on a pre-existing unrelated failure.

### Task 2: Recover attack-move from unreachable aggro

- [x] Add a private `sourceAttackTargetPathResult` that considers only
  deterministic candidate centers inside weapon range, preserves Plan 012's
  `temporarily-blocked` route status, and returns `unreachable` only when no
  attack-range candidate is statically reachable.
- [x] Never accept a general Move range-expanded endpoint unless the endpoint
  is still inside weapon range/line-of-fire. Do not modify shared
  repair/harvest/build interaction-path behavior.
- [x] In `stepAttackMoveOrder`, reject an acquired target only when the combat
  result is `unreachable`. Clear only `targetId`, rebuild the path to the
  attack-move destination already stored in `targetX/targetY`, and continue the
  original order.
- [x] Do not clear the whole attack-move order unless plan 012's static pathfinder says the original destination is itself unreachable.
- [x] A `temporarily-blocked` chase retains the target/order and waits through
  congestion; it is not static unreachability.

**Verify**: `./node_modules/.bin/tsc --noEmit` -> exit 0.

### Task 3: Add source-like idle auto-chase and saved return

- [x] Add `autoReturn` to the attack member of `WorldOrder` in
  `src/simulation/world.ts`.
- [x] Update every explicit player/AI attack constructor to set
  `autoReturn: null`.
- [x] In `stepDefensiveAutoAttack`, when an idle aggressive mobile unit finds a
  reachable enemy inside reaction range, capture the unit's exact current point
  and issue an automatic attack with that saved return.
- [x] While automatic combat is active, retain a valid target when it is inside
  reaction range of the defender's current position or is attacking the
  defender from its own weapon range. Do not compare target/defender distance
  with the saved origin.
- [x] When the target dies, disappears, becomes invalid/unreachable, or leaves
  current reaction range without the attacked-by-target exception, issue an
  attack-move back to `autoReturn`. This return may acquire another enemy; once
  it reaches the saved point the unit becomes idle.
- [x] Narrow dead/unavailable-unit cleanup so an attack with non-null
  `autoReturn` is restored or left for the attack step; explicit attacks remain
  hard references and clear normally.
- [x] Keep defensive buildings firing only at weapon range and keep Hold
  Position stationary.
- [x] Throttle acquisition with the existing `nextAutoActionTick`; do not scan
  every frame.

**Verify**: `npm run verify:source-attack-action` -> exits 0 after it asserts
saved-return shape, current-position reaction retention, explicit attacks'
`null` return, and Hold Position's no-move rule.

### Task 4: Preserve the automatic return across save/load

- [x] In `normalizeLoadedOrder`, normalize attack `autoReturn` when it is a
  finite world point inside map bounds; otherwise use `null`.
- [x] Old saves without the field must load as explicit ordinary attacks.
- [x] Treat a non-null automatic return as a soft target reference during load:
  a missing, hidden, out-of-reaction, or unreachable target must survive long
  enough to restore the return rather than being erased by
  `orderReferencesMissingUnit` or explicit-attack visibility validation.
- [x] Ensure `hasInvalidLoadedAttackOrder` validates target/path as before and
  does not reject a valid return solely because the target is temporarily
  outside current visibility.

Target normalization shape:

```ts
return targetId ? {
  kind,
  targetId,
  targetX,
  targetY,
  autoReturn: normalizeWorldPointOrNull(world, record.autoReturn),
  path,
  pathIndex
} : null;
```

**Verify**: `npm run verify:save-schema` -> exits 0.

### Task 5: Separate projectile commitment from visibility and trajectory

- [x] Replace `canProjectileTrackTarget` with a committed-target validity
  predicate that does not read current visibility and never acquires a new
  target.
- [x] Preserve trajectory class: ordinary point-to-point arrows/axes keep their
  launch-time impact coordinates; only tracer-class projectiles update target
  coordinates in flight.
- [x] On impact, apply direct damage once when the stored target is still alive
  and compatible only for zero-range direct missiles such as Wargus arrows and
  axes. They keep the fixed launch point but damage that stored live target
  once even if it moved or entered fog.
- [x] For nonzero-range siege/cannon/area missiles, resolve at immutable
  `targetX/targetY` against compatible units at the fixed ground point; do not
  grant a moved stored target an unconditional direct hit. If a zero-range
  target died or became incompatible, discard that ordinary direct impact.
- [x] Do not re-run acquisition, fog visibility, or pre-launch selection rules
  from the projectile step.

**Verify**: `rg -n 'isUnitVisibleToPlayer\(world, target, projectile.player\)' src/simulation/orders.ts` -> no match inside projectile continuation/impact logic.

### Task 6: Restore already-cast area damage and source ownership rules

- [x] In `applySplashDamage`, `tickAreaDamageSpell`, and
  `tickWhirlwindSpell`, remove current-visibility filtering.
- [x] Reproduce the installed source matrix rather than the TypeScript
  interpretation of the flag name:
  - Demolish damages every alive non-flying unit in range, including caster,
    owner, allies, enemies, and neutrals.
  - Wargus Blizzard, Death and Decay, Whirlwind, and default splash missiles
    have `friendlyFire: false`, which in Stratagus means no ownership filter;
    `canHitOwner: false` excludes only the actual caster/source unit.
  - When a missile explicitly sets `friendlyFire: true`, exclude the source
    player's units as Stratagus does; allied players are still targetable.
- [x] Preserve radius, liveness, target-kind/CanTarget rules, damage/falloff,
  and caster exclusion metadata. Do not reapply autocast/location-selection
  conditions to impact victims.
- [x] Do not change target selection before casting.

**Verify**: `npm run verify:source-fov-fog` -> exits 0 after its expectations distinguish acquisition visibility from committed damage.

### Task 7: Make visible enemy combat audible

- [x] Implement `isWorldEventAudibleToLocalPlayer` in `worldEventFeedback.ts`.
- [x] Record that visibility-gated enemy audio is the port's anti-leak policy,
  not original Stratagus sound behavior.
- [x] Return true for local-player events.
- [x] For enemy events with finite coordinates, return true only when the event position is currently visible to `world.visibilityPlayer`.
- [x] Use the predicate for generic `sound` events and enemy death sounds. Keep local help/alert messages ownership-gated.
- [x] Do not play coordinate-less enemy events; they could reveal hidden activity.

**Verify**: `npm run verify:source-event-audio-pan` -> exits 0 and covers local, visible enemy, and hidden enemy cases.

### Task 8: Add playable combat scenarios

- [x] Extend the smoke-mode-only `runMechanicsScenario` hook begun in plan 012
  with deterministic M05–M07 setup/actions/results. Use the in-app Browser for
  primary acceptance; the existing shell-launched verifier remains a guardrail.
- [x] Extend `scripts/verify-browser-combat-session.mjs` with actual-world scenarios:
  1. Launch an arrow, remove target visibility before impact, confirm HP still decreases once.
     Move the target laterally and confirm the fixed point-to-point destination
     does not turn into tracer motion; the zero-range stored target still takes
     exactly one committed hit.
  2. Start Blizzard/Death and Decay, move sight away during pulses, confirm valid units inside the area continue taking damage.
  3. Put an unreachable enemy inside attack-move reaction range, confirm the attacker resumes the original destination.
  4. Put an enemy just outside melee range but inside reaction range, confirm
     the idle defender chases, attacks, and attack-moves back within one tile of
     its saved origin after combat ends.
  5. Confirm Hold Position does not chase.
- [x] Add a nonzero-range projectile control: move the stored target away from
  the fixed ground impact and confirm only compatible units actually at the
  impact point are considered.
- [x] Add ownership fixtures for Demolish and one default area spell: own unit,
  allied unit, enemy, neutral, caster/source. Assert the source matrix above.
- [x] Record at least one visible-enemy combat audio start and confirm a hidden enemy event does not increment playback.

**Verify**: `npm run verify:browser-combat-session` -> exits 0 and reports all five scenarios.

### Task 9: Perform the playable acceptance session

- [x] Run the fixed demo in the in-app Browser.
- [x] Attack-move a small Footman group past an enemy separated by terrain, then fight a visible Archer/Footman skirmish at a fog boundary.

Expected observable behavior:

- Attack-move does not freeze on the inaccessible unit.
- Idle Footmen step forward to engage and return after automatic combat ends;
  Hold Position never moves.
- Launched missiles still land when sight changes.
- Visible enemy attacks and deaths have positional sound.

### Task 10: Close out

- [x] Run `./node_modules/.bin/tsc --noEmit`.
- [x] Run `npm run verify:browser-combat-session`.
- [x] Run `npm run verify:source-attack-action`.
- [x] Run `npm run verify:source-fov-fog`.
- [x] Run `npm run verify:source-event-audio-pan`.
- [x] Run `npm run verify:save-schema`.
- [x] Replay M02/M04 and record M05–M07 in `plans/evidence/013.md`; obtain a READY review decision.
- [x] Run `git diff --check` and confirm only in-scope files changed.
- [x] Update plan 013 to `DONE` in `plans/README.md`.

## Done criteria

- [x] Attack-move resumes after rejecting an unreachable aggro target.
- [x] Idle mobile attackers retain automatic targets by current reaction rules
  and resume an attack-move to their saved origin when combat ends.
- [x] Hold Position and defensive buildings retain their intended behavior.
- [x] Legal launched projectiles and active area effects are not cancelled by fog.
- [x] Visible enemy combat is audible without leaking fully hidden combat.
- [x] Old saves load attack orders with `autoReturn: null`.
- [x] Browser combat scenarios and manual fog-boundary skirmish pass.
- [x] M02 and M04–M07 evidence is recorded and plan 013 has a READY review decision.

## STOP conditions

- The fix requires changing damage, armor, cooldown, or missile-speed values.
- A committed projectile starts acquiring a new target after launch.
- Enemy audio cannot be visibility-gated without exposing hidden-unit information.
- Auto-response requires a new top-level order kind rather than optional saved
  return metadata on the existing attack order.
- A combat route cannot distinguish temporary congestion from static
  unreachability or cannot validate its endpoint inside weapon range without
  editing Plan 012-owned pathfinding.
- Dead-target cleanup or save validation clears a non-null automatic return
  before it can restore.
- A nonzero-range projectile implementation requires unconditionally hitting
  or tracking a moved stored target instead of resolving the fixed ground
  impact.
- Plan 012's movement behavior is not complete or attack-move still drops orders due transient blockers.
- Any focused verification fails twice after a reasonable correction.

## Maintenance notes

Reviewers should distinguish acquisition, trajectory, and impact; visibility
belongs only in acquisition. Ordinary point-to-point missiles are committed
without becoming tracers. Future stances should reuse saved-return semantics
rather than adding an independent radius leash.
