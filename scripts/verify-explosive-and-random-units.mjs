import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const selectionInputSource = readFileSync("src/view/selectionInput.ts", "utf8");
const sourceSelection = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/stratagus/selection.cpp", "utf8");
const sourceCommand = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const sourceStill = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_still.cpp", "utf8");
const sourceDemolish = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/spell/spell_demolish.cpp", "utf8");

const randomUnits = (manifest.units ?? []).filter((unit) => (unit.randomMovementProbability ?? 0) > 0);
const randomDistanceUnits = randomUnits.filter((unit) => Number.isFinite(unit.randomMovementDistance) && unit.randomMovementDistance >= 0);
const clickExplosiveUnits = (manifest.units ?? []).filter((unit) => (unit.clicksToExplode ?? 0) > 0);
const volatileUnits = (manifest.units ?? []).filter((unit) => unit.volatile === true);
const suicideSpellUnits = (manifest.units ?? []).filter((unit) => (unit.canCastSpells ?? []).includes("spell-suicide-bomber"));
const errors = [];

if (randomUnits.length === 0) {
  errors.push("Wargus manifest has no RandomMovementProbability units.");
}
if (randomDistanceUnits.length !== randomUnits.length) {
  errors.push(`Expected every random mover to preserve RandomMovementDistance, found ${randomDistanceUnits.length}/${randomUnits.length}.`);
}
if (clickExplosiveUnits.length === 0) {
  errors.push("Wargus manifest has no ClicksToExplode units.");
}
if (volatileUnits.length === 0) {
  errors.push("Wargus manifest has no volatile demolition units.");
}
if (suicideSpellUnits.length !== volatileUnits.length) {
  errors.push(`Expected volatile demolition units to match spell-suicide-bomber units (${volatileUnits.length} volatile, ${suicideSpellUnits.length} spell-capable).`);
}

for (const fragment of [
  "static void HandleSuicideClick(CUnit &unit)",
  "static int NumClicks = 0",
  "if (IsOnlySelected(unit))",
  "NumClicks++",
  "NumClicks = 1",
  "if (NumClicks == unit.Type->ClicksToExplode)",
  "SendCommandDismiss(unit)",
  "NumClicks = 0"
]) {
  if (!sourceSelection.includes(fragment)) {
    errors.push(`Stratagus selection source missing ClicksToExplode fragment: ${fragment}`);
  }
}
for (const fragment of [
  "void CommandDismiss(CUnit &unit)",
  "LetUnitDie(unit, true)"
]) {
  if (!sourceCommand.includes(fragment)) {
    errors.push(`Stratagus command source missing dismiss/suicide fragment: ${fragment}`);
  }
}
for (const fragment of [
  "static bool MoveRandomly(CUnit &unit)",
  "unit.Type->RandomMovementProbability == false",
  "(SyncRand() % 100) > unit.Type->RandomMovementProbability",
  "unit.Type->RandomMovementDistance * 2 + 1",
  "CommandMove(unit, pos, EFlushMode::On)"
]) {
  if (!sourceStill.includes(fragment)) {
    errors.push(`Stratagus still-action source missing random-movement fragment: ${fragment}`);
  }
}
for (const fragment of [
  "if (SquareDistance(ipos, goalPos) > square(this->Range))",
  "mf.isAWall() || mf.RockOnMap() || mf.ForestOnMap()",
  "Map.ClearTile(ipos)",
  "unit->Type->MoveType != EMovement::Fly",
  "unit->MapDistanceTo(goalPos) <= this->Range",
  "HitUnit(&caster, *unit, this->Damage)"
]) {
  if (!sourceDemolish.includes(fragment)) {
    errors.push(`Stratagus demolish source missing terrain/unit fragment: ${fragment}`);
  }
}

const requiredWorldFragments = [
  "volatile: unit.volatile ?? false",
  "randomMovementProbability: Math.max(0, unit.randomMovementProbability ?? 0)",
  "randomMovementDistance: Math.max(0, unit.randomMovementDistance ?? 1)",
  "clicksToExplode: Math.max(0, unit.clicksToExplode ?? 0)",
  "explodeClickCount: 0",
  "lastExplodeClickAtMs: 0"
];
for (const fragment of requiredWorldFragments) {
  if (!worldSource.includes(fragment)) {
    errors.push(`World creation missing source explosive/random metadata fragment: ${fragment}`);
  }
}

const requiredOrderFragments = [
  "stepRandomMovement(world, unit)",
  "unit.randomMovementProbability <= 0",
  "unit.player !== 15",
  "unit.nextRandomMoveTick = world.tick + sourceRandomMovementCooldownTicks(world)",
  "function sourceRandomMovementCooldownTicks(world: WorldState): number",
  "return sourceOrderRetryTicks(world, 60)",
  "sourceRandomMovementChance(world, unit)",
  "function sourceRandomMovementChance(world: WorldState, unit: WorldUnit): boolean",
  "const probability = Math.max(0, Math.floor(unit.randomMovementProbability))",
  "if (probability <= 0)",
  "Math.floor(world.tick / sourceOrderRetryTicks(world, 30))",
  "return bucket <= probability",
  "const distance = Math.max(0, Math.floor(unit.randomMovementDistance))",
  "offsetTilesX * world.tileSize",
  "offsetTilesY * world.tileSize",
  "export function registerUnitClick",
  "isOnlySelected = false",
  "unit.explodeClickCount = isOnlySelected",
  "? Math.min(unit.clicksToExplode, unit.explodeClickCount + 1)",
  ": 1",
  "detonateClickExplosiveUnit(world, unit)",
  "const missileId = unit.missile ?? unit.explosionType ?? \"missile-explosion\"",
  "sourceMissileVisualRadius(missile, fallbackRadius)",
  "sourceMissileAnimationDuration(world, missile, 0.45)",
  "missile?.firedSound ?? definition?.sounds.dead ?? \"explosion\"",
  "function detonateDemolitionUnit",
  "canIssueDetonateOrder(world, unit)",
  "sourceDemolishAction(world, spellId)",
  "clearDemolishableTerrainInBlast(world, attacker.x, attacker.y, blastRadius)",
  "function clearDemolishableTerrainInBlast",
  "function clearDemolishableTerrainTile",
  "sourceTerrainFlagsForTile(world, tile)",
  "!flags.includes(\"forest\") && !flags.includes(\"rock\") && !flags.includes(\"wall\")",
  "world.tiles[index] = 80",
  "world.forestRegrowth = (world.forestRegrowth ?? []).filter((entry) => entry.x !== tileX || entry.y !== tileY)",
  "sourceDemolishSpellForUnit(world, unit)",
  "if (target.volatile)"
];
for (const fragment of requiredOrderFragments) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation missing explosive/random runtime fragment: ${fragment}`);
  }
}

if (ordersSource.includes("random-move:${Math.floor(tick / 30)}")) {
  errors.push("Random movement chance should scale its source-cycle bucket through the browser tick rate.");
}
if (ordersSource.includes("unit.nextRandomMoveTick = world.tick + world.tickRate * 2")) {
  errors.push("Random movement cooldown should scale its source 60-cycle delay through the browser tick rate.");
}

if (ordersSource.includes("Math.round(20 + unit.basicDamage * falloff)")) {
  errors.push("ClicksToExplode should follow Stratagus dismiss/suicide behavior instead of applying browser-local splash damage.");
}
if (ordersSource.includes("function isDemolitionUnitName") || ordersSource.includes("/demol|sap|explod|bomb/")) {
  errors.push("Demolition unit classification should use volatile, ClicksToExplode, and source suicide-bomber spell metadata instead of name fragments.");
}
for (const fragment of [
  "world.engineSettings.holdClickDelayMsDefault",
  "clickAtMs - unit.lastExplodeClickAtMs > holdDelay",
  "const holdDelay ="
]) {
  if ((ordersSource.match(/export function registerUnitClick[\s\S]*?export function issueHealOrder/)?.[0] ?? "").includes(fragment)) {
    errors.push(`ClicksToExplode should not expire the Stratagus click counter with browser-local timing: ${fragment}`);
  }
}

const requiredSaveFragments = [
  "tiles: world.tiles",
  "terrainVersion: world.terrainVersion",
  "world.tiles = normalizeNumberArray(save.world.tiles, map.width * map.height, world.tiles)",
  "world.terrainVersion = Math.max(0, Math.floor(finiteNumberOr(save.world.terrainVersion, 0)))",
  "forestRegrowth: world.forestRegrowth",
  "forestResources: world.forestResources",
  "world.forestRegrowth = normalizeForestRegrowth(world, save.world.forestRegrowth)",
  "world.forestResources = normalizeForestResources(world, save.world.forestResources)",
  "const tile = world.tiles[y * world.map.width + x] ?? 0",
  "if (!isSourceHarvestableWoodTile(world, tile))",
  "unit.volatile = definition.volatile ?? false",
  "unit.randomMovementProbability = Math.max(0, definition.randomMovementProbability ?? 0)",
  "unit.randomMovementDistance = Math.max(0, definition.randomMovementDistance ?? 1)",
  "unit.clicksToExplode = Math.max(0, definition.clicksToExplode ?? 0)",
  "unit.explodeClickCount = Math.min(unit.explodeClickCount ?? 0, unit.clicksToExplode)",
  "unit.explodeClickCount = Math.min(unit.clicksToExplode, Math.max(0, Math.floor(finiteNumberOr(unit.explodeClickCount, 0))))",
  "unit.lastExplodeClickAtMs = Math.max(0, unit.lastExplodeClickAtMs ?? 0)"
];
for (const fragment of requiredSaveFragments) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load normalization missing explosive/random fragment: ${fragment}`);
  }
}

if (!selectionInputSource.includes("registerUnitClick(world, unit.id, now, selectedUnitIds.length === 1 && selectedUnitIds[0] === unit.id)")) {
  errors.push("Selection input click handling does not route ClicksToExplode units through registerUnitClick.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Explosive/random unit verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Explosive/random units verified (${volatileUnits.length} volatile, ${clickExplosiveUnits.length} click-explosive, ${randomUnits.length} random movers).`);
