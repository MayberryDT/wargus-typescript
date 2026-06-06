import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const missileIds = new Set((manifest.missiles ?? []).map((missile) => missile.id));
const checks = [];
const errors = [];

function add(kind, owner, missileId) {
  if (missileId) {
    checks.push({ kind, owner, missileId });
  }
}

for (const unit of manifest.units ?? []) {
  add("unit missile", unit.id, unit.missile);
  add("unit explosion missile", unit.id, unit.explosionType);
}

for (const missile of manifest.missiles ?? []) {
  add("missile impact missile", missile.id, missile.impactMissile);
  for (const [field, value] of [
    ["speed", missile.speed],
    ["blizzardSpeed", missile.blizzardSpeed],
    ["range", missile.range],
    ["numBounces", missile.numBounces]
  ]) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`missile ${missile.id}: invalid ${field} ${String(value)}`);
    }
  }
  if (typeof missile.friendlyFire !== "boolean") {
    errors.push(`missile ${missile.id}: invalid friendlyFire ${String(missile.friendlyFire)}`);
  }
  if (typeof missile.canHitOwner !== "boolean") {
    errors.push(`missile ${missile.id}: invalid canHitOwner ${String(missile.canHitOwner)}`);
  }
}

const rune = (manifest.missiles ?? []).find((missile) => missile.id === "missile-rune");
if (rune?.canHitOwner !== true || rune?.friendlyFire !== false) {
  errors.push(`missile-rune should preserve source CanHitOwner=true and FriendlyFire=false, found ${JSON.stringify({ canHitOwner: rune?.canHitOwner, friendlyFire: rune?.friendlyFire })}.`);
}

for (const spell of manifest.spells ?? []) {
  for (const missileSpawn of spell.missileSpawns ?? []) {
    add("spell missile spawn", spell.id, missileSpawn.missile);
  }
  for (const missileId of spell.missiles ?? []) {
    add("spell missile", spell.id, missileId);
  }
  for (const missileDamage of spell.missileDamages ?? []) {
    add("spell missile damage", spell.id, missileDamage.missile);
  }
}

for (const stage of manifest.burningBuildings ?? []) {
  add("burning building missile", String(stage.percent), stage.missile);
}

add("engine click missile", "SetClickMissile", manifest.engineSettings?.clickMissileId);
add("engine damage missile", "SetDamageMissile", manifest.engineSettings?.damageMissileId);
add("engine source damage missile", "SetDamageMissile", manifest.engineSettings?.sourceDamageMissileId);
if (manifest.engineSettings?.clickMissileId !== "missile-green-cross") {
  errors.push(`Expected SetClickMissile missile-green-cross, found ${String(manifest.engineSettings?.clickMissileId)}`);
}
if (manifest.engineSettings?.sourceDamageMissileId !== "missile-hit") {
  errors.push(`Expected source SetDamageMissile missile-hit, found ${String(manifest.engineSettings?.sourceDamageMissileId)}`);
}
if (manifest.engineSettings?.showDamageDefault === true && manifest.engineSettings?.damageMissileId !== "missile-hit") {
  errors.push(`Expected active SetDamageMissile missile-hit when ShowDamage is true, found ${String(manifest.engineSettings?.damageMissileId)}`);
}
if (manifest.engineSettings?.showDamageDefault === false && manifest.engineSettings?.damageMissileId !== null) {
  errors.push(`Expected inactive SetDamageMissile null when ShowDamage is false, found ${String(manifest.engineSettings?.damageMissileId)}`);
}

for (const file of ["src/simulation/orders.ts", "src/simulation/world.ts", "src/wargus/saveGame.ts"]) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/"((?:missile-(?!class-))[^"]+)"/g)) {
    add("runtime missile literal", file, match[1]);
  }
}

const missing = checks.filter((check) => !missileIds.has(check.missileId));

if (missing.length > 0) {
  for (const check of missing) {
    errors.push(`${check.kind} ${check.owner}: missing ${check.missileId}`);
  }
}

const blizzard = (manifest.missiles ?? []).find((missile) => missile.id === "missile-blizzard");
if (!blizzard || blizzard.blizzardSpeed !== 4) {
  errors.push(`Expected missile-blizzard BlizzardSpeed = 4, found ${String(blizzard?.blizzardSpeed)}`);
}
if (blizzard?.damage?.expression !== "Rand(10)") {
  errors.push(`Expected missile-blizzard Damage = Rand(10), found ${String(blizzard?.damage?.expression)}`);
}
const deathAndDecay = (manifest.missiles ?? []).find((missile) => missile.id === "missile-death-and-decay");
if (deathAndDecay?.damage?.expression !== "Rand(10)") {
  errors.push(`Expected missile-death-and-decay Damage = Rand(10), found ${String(deathAndDecay?.damage?.expression)}`);
}

const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const sourceMissileVisualsSource = readFileSync("src/view/sourceMissileVisuals.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const sourceMissileFire = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/missile/missile_fire.cpp", "utf8");
const sourceMissilePointToPointBounce = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/missile/missile_pointtopointbounce.cpp", "utf8");
const sourceMissile = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/missile/missile.cpp", "utf8");
const sourceUnit = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/unit/unit.cpp", "utf8");
const sourceWargusMissiles = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/missiles.lua", "utf8");

for (const fragment of [
  "const int f = (100 * unit.Variable[HP_INDEX].Value) / unit.Variable[HP_INDEX].Max",
  "MissileType *fire = MissileBurningBuilding(f)"
]) {
  if (!sourceMissileFire.includes(fragment)) {
    errors.push(`Stratagus burning-building fire source missing HP percent fragment: ${fragment}`);
  }
}
for (const fragment of [
  "MissileType *MissileBurningBuilding(int percent)",
  "ranges::upper_bound(",
  "return std::prev(it)->Missile"
]) {
  if (!sourceMissile.includes(fragment)) {
    errors.push(`Stratagus burning-building lookup source missing fragment: ${fragment}`);
  }
}
for (const fragment of [
  "MissilePointToPointBounce::Action()",
  "this->destination += step * ((PixelTileSize.x + PixelTileSize.y) * 3) / 4 / this->TotalStep",
  "this->source = this->position",
  "this->MissileHit()"
]) {
  if (!sourceMissilePointToPointBounce.includes(fragment)) {
    errors.push(`Stratagus point-to-point bounce source missing fragment: ${fragment}`);
  }
}
for (const fragment of [
  "HitUnit_ShowDamageMissile(const CUnit &target, int damage)",
  "const PixelDiff offset(3, -mtype.Range)",
  "MakeLocalMissile(mtype, targetPixelCenter, targetPixelCenter + offset)->Damage = -damage"
]) {
  if (!sourceUnit.includes(fragment)) {
    errors.push(`Stratagus damage missile source missing fragment: ${fragment}`);
  }
}
for (const fragment of [
  '{"percent", 0, "missile", "missile-big-fire"}',
  '{"percent", 50, "missile", "missile-small-fire"}',
  '{"percent", 75 }'
]) {
  if (!sourceWargusMissiles.includes(fragment)) {
    errors.push(`Wargus burning-building stage source missing fragment: ${fragment}`);
  }
}
for (const fragment of [
  "blizzardSpeed: Number(body.match(/BlizzardSpeed",
  "canHitOwner: /CanHitOwner\\s*=\\s*true/.test(body)",
  "friendlyFire: /FriendlyFire\\s*=\\s*true/.test(body)",
  "missile.blizzardSpeed > 0 ? missile.blizzardSpeed : 10",
  "function sourceMissileDamageRoll",
  "deterministicHash(`${seed}:${missileId}:damage`)",
  "function damageAgainst(world: WorldState, attacker: WorldUnit, target: WorldUnit | null): number",
  "const basicDamage = attacker.basicDamage * (bloodlust ? 2 : 1)",
  "const piercingDamage = attacker.piercingDamage * (bloodlust ? 2 : 1)",
  "const maxDamage = Math.max(basicDamage - (target?.armor ?? 0), 1) + piercingDamage",
  "const randomRange = Math.floor((maxDamage + 2) / 2)",
  "deterministicHash(`${attacker.id}:${target?.id ?? \"ground\"}:${world.tick}:attack-damage`)",
  "function isSiegeEngine(world: WorldState, unit: WorldUnit): boolean",
  "unit.groundAttack && projectileKindForUnit(world, unit) === \"siege\"",
  "projectileKindForMissileDefinition(missileDefinitionForId(world, unit.missile), unit)",
  "function projectileKindForUnitTraits(unit: WorldUnit): WorldProjectile[\"kind\"]",
  "unit.kind === \"naval\" || isDefensiveBuilding(unit)",
  "unit.groundAttack && (unit.minAttackRange > 0 || unit.attackRange >= 160)",
  "function projectileKindForMissileDefinition(missile: WorldState[\"missileDefinitions\"][number] | undefined, unit: WorldUnit): WorldProjectile[\"kind\"] | null",
  "if (missile.splashFactor > 0 || missile.range > 1)",
  "return unit.kind === \"naval\" || isDefensiveBuilding(unit) ? \"cannon\" : \"siege\"",
  "missile.className === \"missile-class-point-to-point-bounce\"",
  "unit.kind === \"naval\" && missile.className === \"missile-class-point-to-point\" && missile.range === 1 && missile.splashFactor === 0 && Boolean(missile.impactMissile)",
  "missile.className === \"missile-class-point-to-point\" && missile.range === 0 && missile.splashFactor === 0 && !missile.impactMissile && missile.frames > 10",
  "missile.className === \"missile-class-point-to-point\" || missile.className === \"missile-class-point-to-point-with-hit\" || missile.className === \"missile-class-death-coil\"",
  "const source = findUnit(world, projectile.sourceId)",
  "return canAttackTarget(source, target, world)",
  "if (projectile.canTargetLand || projectile.canTargetSea || projectile.canTargetAir)",
  "return projectile.canTargetAir",
  "return projectile.canTargetSea",
  "return projectile.canTargetLand",
  "arePlayersEnemies(world, projectile.player, unit.player)",
  "applyProjectileDirectImpact(world, projectile, target)",
  "applyDamage(world, target, damage, projectile.player, projectile.sourceTypeId, projectile.sourceId)",
  "damageProjectileSplash(world, projectile, target.id)",
  "function applyProjectileDirectImpact",
  "projectile.className === \"missile-class-death-coil\"",
  "healProjectileSourceByDamageDealt(world, projectile, damage)",
  "function continueSourceBouncingProjectile(world: WorldState, projectile: WorldProjectile, hitUnitId: string | null): boolean",
  "function isSourcePointToPointBounceProjectile(projectile: Pick<WorldProjectile, \"className\" | \"bouncesRemaining\">): boolean",
  "projectile.className === \"missile-class-point-to-point-bounce\"",
  "function continueLinearBouncingProjectile(world: WorldState, projectile: WorldProjectile, hitUnitId: string | null): boolean",
  "const bounceDistance = sourcePointToPointBounceDistance(world)",
  "projectile.targetId = null",
  "function sourcePointToPointBounceDistance(world: WorldState): number",
  "return ((world.tileSize + world.tileSize) * 3) / 4",
  "} else if (isSourcePointToPointBounceProjectile(projectile)) {",
  "damageGroundImpact(world, projectile)",
  "function damageProjectileSplash(world: WorldState, projectile: WorldProjectile, ignoredUnitId: string | null = null): void",
  "if (projectile.range <= 0)",
  "const splashDivisor = sourceSplashDivisorForProjectileUnit(world, projectile, unit)",
  "sourceSplashDamageForProjectileUnit(world, projectile, unit, splashDivisor)",
  "function sourceSplashDamageForProjectileUnit(world: WorldState, projectile: WorldProjectile, unit: WorldUnit, splashDivisor: number): number",
  "return Math.max(1, Math.floor(projectileDamageAgainst(world, projectile, unit) / splashDivisor))",
  "function sourceSplashDivisorForProjectileUnit(world: WorldState, projectile: WorldProjectile, unit: WorldUnit): number | null",
  "const maxTileDistance = Math.max(0, Math.floor(projectile.range) - 1)",
  "return tileDistance === 0 ? 1 : tileDistance * Math.max(1, Math.floor(projectile.splashFactor))",
  "function mapTileDistanceToUnit(world: WorldState, unit: WorldUnit, tileX: number, tileY: number): number",
  "function projectileDamageAgainst(world: WorldState, projectile: WorldProjectile, target: WorldUnit | null): number",
  "friendlyFire: missileDefinition?.friendlyFire ?? false",
  "function projectileCanHitUnitBySourceOwnership(world: WorldState, projectile: WorldProjectile, unit: WorldUnit): boolean",
  "if (unit.id === projectile.sourceId)",
  "return projectile.canHitOwner",
  "return projectile.friendlyFire",
  "function sourceMissileCanHitUnitByOwnership(world: WorldState, missileId: string | null | undefined, player: number, unit: WorldUnit, sourceUnitId: string | null = null): boolean",
  "if (sourceUnitId && unit.id === sourceUnitId)",
  "return missile?.canHitOwner === true",
  "return missile?.friendlyFire === true",
  "function sourceLandMineTriggerUnit(world: WorldState, effect: NonNullable<WorldState[\"spellEffects\"]>[number], unit: WorldUnit, tileX: number, tileY: number): boolean",
  "function sourceLandMineMissileIdForSpell",
  "function sourceMissileIdForSpellByClass",
  "sourceMissileIdForSpellByClass(world, spellId, \"missile-class-land-mine\")",
  "sourceMissileIdForSpellByClass(world, spellId, \"missile-class-flame-shield\")",
  "const landMineMissileId = sourceLandMineMissileIdForSpell(world, spellId) ?? sourceSpellMissileId(world, spellId) ?? \"missile-rune\"",
  "missile?.canHitOwner !== true",
  "sourceMissileCanHitUnitByOwnership(world, effect.missileId ?? null, effect.player, unit, effect.sourceUnitId ?? null)",
  "sourceUnitId: string | null = null",
  "sourceUnitId,",
  "addSpellEffect(world, \"blizzard\", caster.player, x, y, areaBombardmentRadius(world, \"spell-blizzard\", 86), areaBombardmentDuration(world, \"spell-blizzard\", 4.8), caster.typeId, sourceSpellCastSound(world, \"spell-blizzard\"), sourceSpellMissileId(world, \"spell-blizzard\"), \"spell-blizzard\", caster.id)",
  "addSpellEffect(world, \"death-and-decay\", caster.player, x, y, areaBombardmentRadius(world, \"spell-death-and-decay\", 78), areaBombardmentDuration(world, \"spell-death-and-decay\", 5.2), caster.typeId, sourceSpellCastSound(world, \"spell-death-and-decay\"), sourceSpellMissileId(world, \"spell-death-and-decay\"), \"spell-death-and-decay\", caster.id)",
  "applyDamage(world, unit, runeFieldDamage(world, spellId), effect.player, effect.sourceTypeId ?? null, effect.sourceUnitId ?? null)",
  "applyDamage(world, unit, Math.round(edgeDamage + (centerDamage - edgeDamage) * falloff), effect.player, effect.sourceTypeId ?? null, effect.sourceUnitId ?? null)",
  "return source && source.hitPoints > 0",
  "? damageAgainst(world, source, target)",
  ": projectile.damage",
  "addSourceMissileImpactEffect(world, projectile.impactMissileId, projectile.player, projectile.targetX, projectile.targetY, splashRadiusForProjectile(projectile), null, projectile.sourceTypeId, projectile.sourceId)",
  "addSourceMissileImpactEffect(world, missile?.impactMissile ?? null, caster.player, x, y, radius, spellId, caster.typeId, caster.id)",
  "addSourceMissileImpactEffect(world, impactMissile, effect.player, effect.x, effect.y, sourceMissileSplashRadius(world, effect.missileId ?? null, 58), spellId, effect.sourceTypeId ?? null, effect.sourceUnitId ?? null)",
  "function addSourceMissileImpactEffect(world: WorldState, impactMissileId: string | null | undefined, player: number, x: number, y: number, radius: number, spellId: string | null = null, sourceTypeId: string | null = null, sourceUnitId: string | null = null): boolean",
  "sourceTypeId,",
  "sourceUnitId,",
  "if (projectile.impactSoundId)",
  "emitSourceMissileImpactSound(world, effect.missileId, effect.player, impacts[0]?.x ?? effect.x, impacts[0]?.y ?? effect.y)",
  "const impactSound = missileDefinitionForId(world, missileId ?? null)?.impactSound",
  "drawLevel: impactMissile?.drawLevel ?? 0",
  "drawLevel: sourceSpellEffectDrawLevel(world, missileIdOverride ?? null, spellId)",
  "function sourceSpellEffectDrawLevel",
  "function sourceMissileImpactEffectKind(world: Pick<WorldState, \"missileDefinitions\">, missile: WargusMissile | undefined)",
  "world.missileDefinitions.some((definition) => definition.impactMissile === missile.id)",
  "function launchGroundAttackNow(world: WorldState, attacker: WorldUnit, targetX: number, targetY: number): void",
  "updateUnitFacing(attacker, targetX - attacker.x, targetY - attacker.y)",
  "const launchPoint = projectileLaunchPoint(attacker, targetX, targetY)",
  "originX: launchPoint.x",
  "originY: launchPoint.y",
  "clickMissileId: uncommented.match(/SetClickMissile",
  "const sourceDamageMissileId = uncommented.match(/SetDamageMissile",
  "const damageMissileId = showDamageDefault ? sourceDamageMissileId : null",
  "function addClickMissileEffect",
  "kind: \"click-missile\"",
  "const issueWithClickFeedback = (issued: boolean): boolean =>",
  "addClickMissileEffect(world, x, y, commandFeedbackPlayer(world, unitIds))",
  "function commandFeedbackPlayer(world: WorldState, unitIds: string[]): number",
  "? issueGroupQueueBuildAtOrder(world, unitIds, command.buildingTypeId, x, y)",
  ": issueGroupBuildAtOrder(world, unitIds, command.buildingTypeId, x, y)",
  "? issueGroupQueueBuildOilPlatformAtOrder(world, unitIds, x, y)",
  ": issueGroupBuildOilPlatformAtOrder(world, unitIds, x, y)",
  "? issueGroupQueueTargetedSpellOrder(world, unitIds, command.command, x, y)",
  ": issueGroupTargetedSpellOrder(world, unitIds, command.command, x, y)",
  "? issueGroupQueueAttackGroundOrder(world, unitIds, x, y)",
  ": issueGroupAttackGroundOrder(world, unitIds, x, y)",
  "function addDamageMissileEffect",
  "if (!isUnitVisibleToPlayer(world, target, world.visibilityPlayer))",
  "const targetX = originX + 3",
  "const targetY = originY - Math.max(1, missile?.range ?? 16)",
  "displayDamage: -Math.max(1, amount)",
  "className: missile?.className ?? null",
  "world.engineSettings.clickMissileId"
]) {
  const source = fragment.includes("Number(body.match")
    || fragment.includes("CanHitOwner")
    || fragment.includes("FriendlyFire")
    || fragment.includes("SetClickMissile")
    || fragment.includes("SetDamageMissile")
    || fragment.includes("sourceDamageMissileId")
    || fragment.includes("showDamageDefault ? sourceDamageMissileId")
    ? indexSource
    : ordersSource;
  if (!source.includes(fragment)) {
    errors.push(`Missile BlizzardSpeed support is missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "const sourceUnit = world.units.find((unit) => unit.id === sourceId && unit.player === finiteNullableNumber(record.player))",
  "? sourceUnit.typeId",
  "[...new Set(record.hitUnitIds.filter((id): id is string => typeof id === \"string\" && liveTopLevelUnitIds.has(id)))]",
  "className: missileDefinition?.className ?? null",
  "drawLevel: Math.max(0, Math.floor(finiteNumberOr(record.drawLevel, missileDefinition?.drawLevel ?? 0)))",
  "canTargetLand: sourceUnit?.canTargetLand ?? sourceDefinition?.canTargetLand ?? kind !== \"torpedo\"",
  "canTargetSea: sourceUnit?.canTargetSea ?? sourceDefinition?.canTargetSea ?? (kind === \"siege\" || kind === \"cannon\" || kind === \"torpedo\")",
  "canTargetAir: sourceUnit?.canTargetAir ?? sourceDefinition?.canTargetAir ?? (kind === \"arrow\" || kind === \"axe\")",
  "bouncesRemaining: normalizeProjectileBouncesRemaining(record.bouncesRemaining, missileDefinition?.numBounces)",
  "const normalizedTtlSeconds = normalizeProjectileTtlSeconds(world, record.ttlSeconds, missileId)",
  "function sourceProjectileTtlSecondsForSave(world: WorldState, missileId: string | null): number | null",
  ".filter((action) => action.missile === missileId && typeof action.ttl === \"number\" && action.ttl > 0)",
  "delaySeconds: normalizeProjectileDelaySeconds(world, record.delaySeconds, missileId)",
  "function normalizeProjectileDelaySeconds(world: WorldState, value: unknown, missileId: string | null): number",
  ".flatMap((spell) => [...spell.missileSpawns, ...spell.missileDamages])",
  "return sourceBounces === undefined ? bouncesRemaining : Math.min(Math.max(0, Math.floor(sourceBounces)), bouncesRemaining)",
  "const displayDamage = normalizeProjectileDisplayDamage(projectile.className, damage)",
  "const damage = normalizeProjectileDamage(record.damage)",
  "function normalizeProjectileDamage(value: unknown): number | null",
  "return damage === null ? null : Math.max(1, Math.floor(damage))",
  "function normalizeProjectileDisplayDamage(className: string | null, damage: number): number | null",
  "return className === \"missile-class-hit\" ? -Math.max(1, Math.floor(damage)) : null"
]) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load projectile restoration is missing source missile fragment: ${fragment}`);
  }
}

for (const fragment of [
  "const missileId = restoredSpellEffectMissileId(world, record.missileId, kind, spellId)",
  "const clickMissileId = world.engineSettings.clickMissileId",
  "return clickMissileId && world.missileDefinitions.some((missile) => missile.id === clickMissileId) ? clickMissileId : null"
]) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load click missile restoration is missing source engine fragment: ${fragment}`);
  }
}

if (ordersSource.includes("addSpellEffect(world, \"explosion\", projectile.player, projectile.targetX, projectile.targetY, splashRadius, 0.45")) {
  errors.push("Projectile ground impacts should not invent browser-local explosion visuals when the source missile has no ImpactMissile.");
}
if (ordersSource.includes("projectile.impactSoundId ?? \"explosion\"")) {
  errors.push("Projectile ground impacts should not invent browser-local explosion sounds when the source missile has no ImpactSound.");
}
if (ordersSource.includes("projectile.impactSoundId ?? soundForProjectileImpact")) {
  errors.push("Projectile unit impacts should not invent browser-local impact sounds when the source missile has no ImpactSound.");
}
if (ordersSource.includes('impactMissileId.includes("explosion")') || ordersSource.includes('projectile.impactMissileId.includes("explosion")')) {
  errors.push("Projectile impact effect kinds should classify through source missile metadata instead of impact missile id fragments.");
}
if (ordersSource.includes('sourceFields.includes("explosion")') || ordersSource.includes('sourceFields.includes("impact")')) {
  errors.push("Projectile impact effect kinds should use source ImpactMissile relationships instead of source text scanning.");
}
if (ordersSource.includes('missile.id.toLowerCase().includes("cannon")')) {
  errors.push("Projectile cannon/siege source classification should use missile splash/range plus firing unit role, not a cannon id fragment.");
}
if (ordersSource.includes("function projectileKindForMissile(") || ordersSource.includes("missile.includes(")) {
  errors.push("Projectile fallback classification should use source missile definitions or firing-unit traits, not browser-local missile id fragments.");
}
if (ordersSource.includes('missile.id.toLowerCase().includes("submarine")') || ordersSource.includes('missile.id.toLowerCase().includes("turtle")')) {
  errors.push("Projectile torpedo source classification should use missile source/file metadata instead of exact id fragments.");
}
if (ordersSource.includes('sourceFields.includes("submarine")') || ordersSource.includes('sourceFields.includes("turtle")')) {
  errors.push("Projectile torpedo source classification should use naval unit and missile traits instead of source text scanning.");
}
if (ordersSource.includes('sourceFields.includes("axe")')) {
  errors.push("Projectile axe source classification should use indexed missile traits instead of source text scanning.");
}
if (ordersSource.includes('sourceFields.includes("bounce")')) {
  errors.push("Projectile bounce source classification should use the indexed point-to-point-bounce class instead of source text scanning.");
}
if (ordersSource.includes("sourceMissileClassificationText") || ordersSource.includes("sourceFields.includes(")) {
  errors.push("Projectile source classification should use indexed missile traits instead of source text scanning.");
}
if (ordersSource.includes("addSpellEffect(world, \"fireball\", effect.player, effect.x, effect.y, 58, 0.7")) {
  errors.push("Rune impacts should not invent browser-local fireball visuals when the source missile has no ImpactMissile.");
}
if (ordersSource.includes("return !projectile.friendlyFire || (projectile.canHitOwner && unit.id === projectile.sourceId)")) {
  errors.push("Projectile ownership filtering should not invert FriendlyFire=false into allied splash damage.");
}
if (ordersSource.includes("return unit.player === player && missile?.friendlyFire !== true")) {
  errors.push("Source spell missile ownership filtering should not invert FriendlyFire=false into same-player area damage.");
}
for (const fragment of [
  "kind === \"fireball\"",
  "kind === \"explosion\"",
  "kind === \"death-coil\""
]) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load should preserve missile-impact source attribution for effect kind: ${fragment}`);
  }
}

for (const fragment of [
  "function burningBuildingMissileFrame",
  "isRuntimeSourceBuildingUnit",
  "!isRuntimeSourceBuildingUnit(unit)",
  "Math.floor(world.tick / sourceMissileSleepTicks(atlas)) % atlas.framesPerDirection",
  "const healthPercent = Math.max(0, Math.min(100, Math.floor((100 * unit.hitPoints) / unit.maxHitPoints)))",
  "for (const stage of [...(manifest.burningBuildings ?? [])].sort((a, b) => a.percent - b.percent))",
  "if (healthPercent >= stage.percent)",
  "const animationFrame = Math.floor(projectile.age * frameRate) % atlas.framesPerDirection",
  "function sourceMissileSleepTicks(atlas: Pick<MissileTextureAtlas, \"sleep\">): number",
  "return Math.max(1, sourceDefaultGameSpeed(world) / sourceMissileSleepTicks(atlas))",
  "drawAreaSpellMissiles(layer, world, effect, atlas, alpha)",
  "const impacts = sourceAreaBombardmentVisualImpacts(world, effect, sourceArea)",
  "const frameTick = Math.floor(effect.age * missileFrameRate(world, atlas))",
  "function sourceAreaBombardmentForEffect",
  "function sourceAreaBombardmentVisualImpacts",
  "const shards = Math.max(1, Math.floor(sourceArea?.shards ?? Math.max(5, Math.min(14, Math.round(effect.radius / 10)))))",
  "const startOffsetX = sourceArea?.startOffsetX ?? -fieldSize / 2",
  "function sourceAreaBombardmentVisualPulseTick",
  "missile && missile.blizzardSpeed > 0 ? missile.blizzardSpeed : 10",
  "sourceStableVisualHash(`${effect.id}:${pulseTick}:${index}:x`)",
  "return Math.min(atlas.framesPerDirection - 1, Math.floor(effect.age * frameRate))",
  "const effects = [...world.spellEffects].sort(compareSpellEffectDrawOrder)",
  "function compareSpellEffectDrawOrder",
  "return left.drawLevel - right.drawLevel",
  "unitLayer.removeChildren();",
  "renderer.unitLayer.removeChildren();",
  "drawProjectiles(unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 })",
  "drawSpellEffects(unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 })",
  "drawProjectiles(unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 })",
  "drawSpellEffects(unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 })",
  "drawProjectiles(renderer.unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 })",
  "drawSpellEffects(renderer.unitLayer, world, viewport, missileAtlases, { maxDrawLevel: 39 })",
  "drawProjectiles(renderer.unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 })",
  "drawSpellEffects(renderer.unitLayer, world, viewport, missileAtlases, { minDrawLevel: 40 })",
  "let drewFallbackGraphics = false",
  "if (drewFallbackGraphics)",
  "import { sourceMissileVisualRole } from \"./sourceMissileVisuals\"",
  "isLightningLikeProjectile(world, projectile)",
  "isFireLikeProjectile(world, projectile)",
  "sourceMissileVisualRole(world, projectile) === \"hammer\""
]) {
  if (!renderWorldSource.includes(fragment)) {
    errors.push(`Missile renderer timing is missing fragment: ${fragment}`);
  }
}
if (renderWorldSource.includes("function missileVisualText(") || renderWorldSource.includes("const { text } = missileVisualText")) {
  errors.push("Missile renderer should use a single source visual-role helper instead of ad hoc visual text checks.");
}
if (renderWorldSource.includes("function sourceMissileVisualRole(")) {
  errors.push("Missile renderer should import sourceMissileVisualRole instead of owning source visual-role classification.");
}
const projectileRenderBody = renderWorldSource.match(/function drawProjectiles[\s\S]*?\n}\n\nfunction isDamageHitProjectile/)?.[0] ?? "";
if (!projectileRenderBody.includes("let drewFallbackGraphics = false") || !projectileRenderBody.includes("if (drewFallbackGraphics)")) {
  errors.push("Projectile renderer should only attach fallback Graphics when fallback geometry was drawn.");
}
if (!projectileRenderBody.includes("strata: { minDrawLevel?: number; maxDrawLevel?: number } = {}") || !projectileRenderBody.includes("projectile.drawLevel < (strata.minDrawLevel ?? 0)")) {
  errors.push("Projectile renderer should filter source draw-level strata instead of drawing every missile over units.");
}
const spellEffectsRenderBody = renderWorldSource.match(/function drawSpellEffects[\s\S]*?\n}\n\nfunction compareSpellEffectDrawOrder/)?.[0] ?? "";
if (!spellEffectsRenderBody.includes("let drewFallbackGraphics = false") || !spellEffectsRenderBody.includes("if (drewFallbackGraphics)")) {
  errors.push("Spell-effect renderer should only attach fallback Graphics when fallback geometry was drawn.");
}
if (!spellEffectsRenderBody.includes("strata: { minDrawLevel?: number; maxDrawLevel?: number } = {}") || !spellEffectsRenderBody.includes("effect.drawLevel < (strata.minDrawLevel ?? 0)")) {
  errors.push("Spell-effect renderer should filter source draw-level strata instead of drawing every effect over units.");
}
for (const fragment of [
  "export function sourceMissileVisualRole(world: Pick<WorldState, \"missileDefinitions\">, projectile: WorldProjectile): SourceMissileVisualRole",
  "export function sourceMissileVisualRoleForDefinition(missile: WargusMissile | undefined, projectile: Pick<WorldProjectile, \"className\" | \"kind\" | \"bouncesRemaining\">): SourceMissileVisualRole",
  "className === \"missile-class-parabolic\" || projectile.kind === \"siege\"",
  "className === \"missile-class-point-to-point-with-hit\"",
  "(missile?.numBounces ?? projectile.bouncesRemaining) > 0",
  "return sourceMissileUsesHammerVisual(missile) ? \"hammer\" : \"flame\"",
  "export function sourceMissileDefinitionForProjectile(world: Pick<WorldState, \"missileDefinitions\">, projectile: Pick<WorldProjectile, \"missileId\">): WargusMissile | undefined"
]) {
  if (!sourceMissileVisualsSource.includes(fragment)) {
    errors.push(`Source missile visual helper is missing fragment: ${fragment}`);
  }
}
for (const fragment of [
  "function isDamageHitProjectile(projectile: WorldState[\"projectiles\"][number]): boolean",
  "projectile.className === \"missile-class-hit\" && typeof projectile.displayDamage === \"number\"",
  "function drawDamageHitProjectile",
  "text: String(projectile.displayDamage ?? -projectile.damage)"
]) {
  if (!renderWorldSource.includes(fragment)) {
    errors.push(`Missile-hit renderer is missing source damage display fragment: ${fragment}`);
  }
}
for (const fragment of [
  "missileId.includes(\"lightning\")",
  "missileId.includes(\"touch-of-death\")",
  "missileId.includes(\"dragon\")",
  "missileId.includes(\"fire\")",
  "missileId.includes(\"griffon\")",
  "missileId.includes(\"rock\")",
  "projectile.missileId?.toLowerCase().includes(\"griffon\")"
]) {
  if (renderWorldSource.includes(fragment)) {
    errors.push(`Missile renderer should classify fallback visuals through source missile metadata before id fragments: ${fragment}`);
  }
}
if (renderWorldSource.includes("damagePercent") || renderWorldSource.includes("healthPercent <= stage.percent")) {
  errors.push("Burning-building fire should select source stages from remaining health percent, not accumulated damage percent.");
}
const burningBuildingBody = renderWorldSource.match(/function drawBurningBuilding[\s\S]*?\n}\n/)?.[0] ?? "";
if (burningBuildingBody.includes('unit.kind !== "building"')) {
  errors.push("Burning-building renderer should use source Building semantics instead of browser-local kind text.");
}
const fancyBuildingBody = renderWorldSource.match(/function sourceFancyBuildingMirror[\s\S]*?\n}\n/)?.[0] ?? "";
if (!fancyBuildingBody.includes("isRuntimeSourceBuildingUnit(unit)") || fancyBuildingBody.includes('kind === "building"')) {
  errors.push("Fancy-building mirroring should use source Building semantics for live units.");
}
if (!renderWorldSource.includes("function sourceLastSeenFancyBuildingMirror")) {
  errors.push("Last-seen building mirroring should use its own source-building path after last-seen filtering.");
}
if (renderWorldSource.includes("Math.floor(world.tick / Math.max(1, atlas.sleep)) % atlas.framesPerDirection")
  || renderWorldSource.includes("world.tickRate / Math.max(1, atlas.sleep)")) {
  errors.push("Missile renderer frame timing should route source Sleep through sourceMissileSleepTicks instead of inline sleep clamps.");
}
if (renderWorldSource.includes("world.tickRate / sourceMissileSleepTicks(atlas)")) {
  errors.push("Missile renderer frame timing should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Missile reference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Missile references verified (${checks.length} references checked).`);
