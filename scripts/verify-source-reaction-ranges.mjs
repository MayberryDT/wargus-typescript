import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const stratagusUnitDrawSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/unit/unit_draw.cpp", "utf8");
const sourceUnitFiles = [
  "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/units.lua",
  "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/human/units.lua",
  "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts/orc/units.lua"
];
const unitSource = sourceUnitFiles.map((file) => readFileSync(file, "utf8")).join("\n");

const errors = [];
const units = manifest.units ?? [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function expectUnitRange(id, computerReactionRange, personReactionRange) {
  const unit = units.find((candidate) => candidate.id === id);
  expect(Boolean(unit), `Missing source unit ${id}.`);
  expect(
    unit?.computerReactionRange === computerReactionRange,
    `Expected ${id} ComputerReactionRange=${computerReactionRange}, found ${unit?.computerReactionRange}.`
  );
  expect(
    unit?.personReactionRange === personReactionRange,
    `Expected ${id} PersonReactionRange=${personReactionRange}, found ${unit?.personReactionRange}.`
  );
}

expect(/ComputerReactionRange\s*=\s*7,\s*PersonReactionRange\s*=\s*5/.test(unitSource), "Source unit.lua archer reaction ranges were not found.");
expect(/ComputerReactionRange\s*=\s*11,\s*PersonReactionRange\s*=\s*9/.test(unitSource), "Source unit.lua siege reaction ranges were not found.");
expect(/ComputerReactionRange\s*=\s*8,\s*PersonReactionRange\s*=\s*6/.test(unitSource), "Source unit.lua dragon reaction ranges were not found.");
expect(stratagusUnitDrawSource.includes("Preference.ShowReactionRange"), "Stratagus unit draw should still gate reaction range rendering on ShowReactionRange.");
expect(stratagusUnitDrawSource.includes("if (IsOnlySelected(unit))"), "Stratagus unit draw should still show range overlays only for the sole selected unit.");
expect(stratagusUnitDrawSource.includes("unit.Player->Type == PlayerTypes::PlayerPerson"), "Stratagus reaction range rendering should still branch on player type.");
expect(stratagusUnitDrawSource.includes("type.ReactRangePerson : type.ReactRangeComputer"), "Stratagus reaction range rendering should still choose person/computer range by owner type.");
expect(stratagusUnitDrawSource.includes("(type.TileWidth - 1) * PixelTileSize.x / 2"), "Stratagus range rendering should still include the tile-width radius offset.");
expect(stratagusUnitDrawSource.includes("if (type.CanAttack)"), "Stratagus reaction/attack range rendering should still be gated by CanAttack.");

expectUnitRange("unit-archer", 7, 5);
expectUnitRange("unit-ballista", 11, 9);
expectUnitRange("unit-dragon", 8, 6);
expectUnitRange("unit-grunt", 6, 4);

const nonZeroComputerRanges = units.filter((unit) => (unit.computerReactionRange ?? 0) > 0).length;
const nonZeroPersonRanges = units.filter((unit) => (unit.personReactionRange ?? 0) > 0).length;
expect(nonZeroComputerRanges > 40, `Expected many source ComputerReactionRange values, found ${nonZeroComputerRanges}.`);
expect(nonZeroPersonRanges > 40, `Expected many source PersonReactionRange values, found ${nonZeroPersonRanges}.`);

for (const [source, fragment] of [
  [indexSource, "ComputerReactionRange\\s*=\\s*(-?\\d+)"],
  [indexSource, "PersonReactionRange\\s*=\\s*(-?\\d+)"],
  [indexSource, "computerReactionRange,"],
  [indexSource, "personReactionRange,"],
  [indexSource, "computerReactionRange: next.computerReactionRange !== 0 ? next.computerReactionRange : existing.computerReactionRange"],
  [typesSource, "computerReactionRange?: number"],
  [typesSource, "personReactionRange?: number"],
  [worldSource, "computerReactionRange: number"],
  [worldSource, "personReactionRange: number"],
  [worldSource, "computerReactionRange: Math.max(0, unit.computerReactionRange ?? 0) * 32"],
  [worldSource, "personReactionRange: Math.max(0, unit.personReactionRange ?? 0) * 32"],
  [saveSource, "unit.computerReactionRange = Math.max(0, definition.computerReactionRange ?? 0) * 32"],
  [saveSource, "unit.personReactionRange = Math.max(0, definition.personReactionRange ?? 0) * 32"],
  [ordersSource, "export function sourceDeclaredReactionRangeForUnit"],
  [ordersSource, "function sourceReactionRangeForUnit"],
  [ordersSource, "const sourceRange = sourceDeclaredReactionRangeForUnit(world, unit)"],
  [ordersSource, "isComputerControlledPlayer(world, unit.player)"],
  [ordersSource, "? unit.computerReactionRange"],
  [ordersSource, ": unit.personReactionRange"],
  [ordersSource, "return Math.max(unit.attackRange + world.tileSize * 2, unit.sightRangeTiles * world.tileSize)"],
  [ordersSource, "const radius = sourceReactionRangeForUnit(world, unit)"],
  [ordersSource, "target = findNearestEnemyInAggroRange(world, unit)"],
  [ordersSource, "isDefensiveBuilding(unit) ? findNearestEnemyInRange(world, unit) : findNearestEnemyInAggroRange(world, unit)"],
  [renderWorldSource, "const sourceRangeRadiusOffset = ((unit.tileWidth - 1) * world.tileSize) / 2"],
  [renderWorldSource, "if (selected.size === 1)"],
  [renderWorldSource, "drawSourceSelectedRangeMarkers(graphics, world, unit)"],
  [renderWorldSource, "unit.sightRangeTiles * world.tileSize + sourceRangeRadiusOffset"],
  [renderWorldSource, "unit.canAttack && world.engineSettings.showAttackRangeDefault"],
  [renderWorldSource, "unit.attackRange + sourceRangeRadiusOffset"],
  [renderWorldSource, "unit.canAttack && world.engineSettings.showReactionRangeDefault"],
  [renderWorldSource, "import { sourceControlGroupNumberForUnit, sourceDeclaredReactionRangeForUnit } from \"../simulation/orders\""],
  [renderWorldSource, "const reactionRange = sourceDeclaredReactionRangeForUnit(world, unit)"],
  [renderWorldSource, "reactionRange + sourceRangeRadiusOffset"]
]) {
  expect(source.includes(fragment), `Missing expected implementation fragment: ${fragment}`);
}

expect(!renderWorldSource.includes("Math.max(unit.personReactionRange, unit.computerReactionRange)"), "Reaction range overlay should not use the max of person/computer ranges.");
expect(!renderWorldSource.includes("function sourceRenderReactionRangeForUnit"), "Reaction range overlay should use the simulation declared-range helper instead of a renderer copy.");
expect(!renderWorldSource.includes("function isSourceComputerPlayer"), "Reaction range overlay should not duplicate source player-type detection in the renderer.");

if (errors.length > 0) {
  console.error(`Source reaction range verification errors: ${errors.length}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Source reaction ranges verified (${nonZeroComputerRanges} computer ranges, ${nonZeroPersonRanges} person ranges indexed and used for auto-acquire).`);
