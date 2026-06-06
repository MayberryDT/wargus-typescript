import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const dataRoot = manifest.dataRoot;
const unitSources = [
  "scripts/human/units.lua",
  "scripts/orc/units.lua",
  "scripts/caanoo/units.lua",
  "scripts/units.lua",
  "scripts/lists/maps/void/units.lua",
  "scripts/lists/maps/mythic/units.lua"
]
  .map((file) => path.join(dataRoot, file))
  .filter((file) => existsSync(file))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const manifestSource = readFileSync("src/wargus/manifest.ts", "utf8");
const sourceActionsSource = readFileSync("src/wargus/sourceActions.ts", "utf8");
const atlasSource = readFileSync("src/view/unitTextureAtlas.ts", "utf8");
const lazyAtlasSource = readFileSync("src/view/unitAtlasLazyLoad.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];
function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function unit(id) {
  return manifest.units.find((candidate) => candidate.id === id);
}

for (const fragment of [
  "Elevated = true",
  "Shadow = ShadowDefinition(",
  "Teleporter = true",
  "NumDirections = 1",
  "OnReady = AiExploreUnit"
]) {
  expect(unitSources.includes(fragment), `Source unit files missing expected visual/ready fragment: ${fragment}`);
}

expect(manifest.units.filter((candidate) => candidate.elevated).length >= 10, "Manifest should preserve elevated tower metadata.");
expect(manifest.units.filter((candidate) => candidate.shadow !== null && candidate.shadow !== undefined).length >= 5, "Manifest should preserve source shadow definitions.");
expect(unit("unit-human-guard-tower")?.elevated === true, "unit-human-guard-tower should be elevated.");
expect(unit("unit-dragon")?.shadow === 2, `unit-dragon shadow is ${JSON.stringify(unit("unit-dragon")?.shadow)}, expected 2.`);
expect(unit("unit-eye-of-vision")?.shadow === 0, `unit-eye-of-vision shadow is ${JSON.stringify(unit("unit-eye-of-vision")?.shadow)}, expected 0.`);
expect(unit("unit-dark-portal")?.teleporter === true, "unit-dark-portal should preserve Teleporter=true.");
expect(unit("unit-human-start-location")?.numDirections === 1, "unit-human-start-location should preserve NumDirections=1.");
expect(unit("unit-orc-start-location")?.numDirections === 1, "unit-orc-start-location should preserve NumDirections=1.");
expect(unit("unit-balloon")?.onReady === "AiExploreUnit", `unit-balloon OnReady is ${JSON.stringify(unit("unit-balloon")?.onReady)}, expected AiExploreUnit.`);
expect(unit("unit-zeppelin")?.onReady === "AiExploreUnit", `unit-zeppelin OnReady is ${JSON.stringify(unit("unit-zeppelin")?.onReady)}, expected AiExploreUnit.`);
expect(unit("unit-skeleton")?.image === "neutral/units/skeleton.png", "unit-skeleton should preserve its source image instead of requiring a view-layer visual fallback.");
expect(JSON.stringify(unit("unit-skeleton")?.tileSize) === JSON.stringify([1, 1]), "unit-skeleton should preserve its source 1x1 tile size for atlas frame sizing.");

for (const [name, source, fragments] of [
  ["indexer", indexSource, [
    "const elevated = /Elevated\\s*=\\s*true/.test(body)",
    "const shadow = parseShadowDefinition(body)",
    "const teleporter = /Teleporter\\s*=\\s*true/.test(body)",
    "const teleportDestinations = []",
    "SetTeleportDestination",
    "function mapSetupUnitReferenceToIndex",
    "const numDirections = Number(body.match(/NumDirections",
    "const onReady = body.match(/OnReady",
    "function parseShadowDefinition(body)",
    "numDirections: next.numDirections !== 0 ? next.numDirections : existing.numDirections",
    "onReady: next.onReady ?? existing.onReady"
  ]],
  ["types", typesSource, [
    "elevated?: boolean",
    "shadow?: number | null",
    "teleporter?: boolean",
    "teleportDestinations: WargusTeleportDestination[]",
    "export interface WargusTeleportDestination",
    "numDirections?: number",
    "onReady?: string | null"
  ]],
  ["world state", worldSource, [
    "elevated: boolean",
    "shadow: number | null",
    "teleporter: boolean",
    "teleportDestinationId: string | null",
    "unit-teleported",
    "function applySourceTeleportDestinations",
    "numDirections: number",
    "onReady: string | null",
    "elevated: unit.elevated ?? false",
    "shadow: typeof unit.shadow === \"number\" ? Math.max(0, unit.shadow) : null",
    "teleporter: unit.teleporter ?? false",
    "numDirections: Math.max(0, unit.numDirections ?? 0)",
    "onReady: unit.onReady ?? null"
  ]],
  ["orders", ordersSource, [
    "import { isExploreOnReadyValue } from \"../wargus/sourceActions\"",
    "function tryTeleportThroughFollowTarget",
    "function isReadySourceTeleporter",
    "if (tryTeleportThroughFollowTarget(world, unit, followTarget))",
    "findUnloadTileNear(world, destinationTile, unit, [])",
    "world.events.push({ kind: \"unit-teleported\"",
    "canReceiveMoveOrders(target) || isReadySourceTeleporter(target)",
    "definition.onReady",
    "unit.onReady",
    "function issueOnReadyOrder(world: WorldState, unit: WorldUnit): void",
    "issueExploreOrder(world, unit.id)",
    "unit.elevated = definition.elevated ?? false",
    "unit.shadow = typeof definition.shadow === \"number\" ? Math.max(0, definition.shadow) : null",
    "unit.teleporter = definition.teleporter ?? false",
    "unit.numDirections = Math.max(0, definition.numDirections ?? 0)",
    "unit.onReady = definition.onReady ?? null"
  ]],
  ["save/load", saveSource, [
    "import { isExploreOnReadyValue } from \"./sourceActions\"",
    "unit.elevated = definition.elevated ?? false",
    "unit.shadow = typeof definition.shadow === \"number\" ? Math.max(0, definition.shadow) : null",
    "unit.teleporter = definition.teleporter ?? false",
    "unit.teleportDestinationId = normalizeTeleportDestinationId(unit.teleportDestinationId, world)",
    "function normalizeTeleportDestinationId",
    "unit.numDirections = Math.max(0, definition.numDirections ?? 0)",
    "unit.onReady = definition.onReady ?? null",
    "isExploreOnReadyValue(unit.onReady)"
  ]],
  ["manifest preload", manifestSource, [
    "import { isExploreOnReadyValue } from \"./sourceActions\"",
    "return isExploreOnReadyValue(unit.onReady)"
  ]],
  ["source actions", sourceActionsSource, [
    "const SOURCE_EXPLORE_ON_READY_ACTIONS = new Set([\"AiExploreUnit\"])",
    "export function isExploreOnReadyValue(onReady: string | null | undefined): boolean",
    "SOURCE_EXPLORE_ON_READY_ACTIONS.has(onReady)"
  ]],
  ["unit texture atlas", atlasSource, [
    "numDirections: Math.max(0, unit.numDirections ?? 0)",
    "const inferredDirections = unit.numDirections > 0 ? unit.numDirections : inferSourceUnitDirections(unit, columns, rows)",
    "numDirections: inferredDirections",
    "function inferSourceUnitDirections(unit: UnitTextureDescriptor, columns: number, rows: number): number",
    "return 5;",
    "return unitDefinitions.find((candidate) => candidate.id === unit.id) ?? unit;",
    "const tileWidth = Math.max(renderUnit.tileSize?.[0] ?? unit.tileSize?.[0] ?? 1, 1);",
    "const tileHeight = Math.max(renderUnit.tileSize?.[1] ?? unit.tileSize?.[1] ?? 1, 1);",
    "numDirections: Math.max(0, unit.numDirections ?? renderUnit.numDirections ?? 0)"
  ]],
  ["unit atlas lazy load", lazyAtlasSource, [
    "if (!definition?.image) {",
    "loadUnitTextureAtlasForDefinition(definition ?? unitDefinitionFromWorldUnit(unit), definitions, loadedWorld.map.setup?.tileset ?? null)"
  ]],
  ["world render", renderWorldSource, [
    "drawUnitShadow(graphics, unit)",
    "if (unit.elevated)",
    "if (unit.teleporter)",
    "unit.teleportDestinationId ? world.units.find",
    "graphics.lineTo(destination.x, destination.y)",
    "atlas.numDirections",
    "function drawUnitShadow",
    "unit.shadow === null || unit.shadow === undefined",
    "function spriteDirectionForFacing(facing: number, numDirections = 0)"
  ]],
  ["source UI helpers", sourceUiHelpersSource, [
    "if (unit.teleporter)",
    "unit.teleportDestinationId ? \"teleporter linked\" : \"teleporter\"",
    "if (unit.numDirections > 0)",
    "roles.push(`${unit.numDirections} dir`)",
    "if (unit.onReady)"
  ]],
  ["package scripts", packageSource, [
    "\"verify:source-unit-visuals\"",
    "npm run verify:source-unit-visuals"
  ]]
]) {
  for (const fragment of fragments) {
    expect(source.includes(fragment), `${name} missing source unit visual fragment: ${fragment}`);
  }
}

expect(!atlasSource.includes('unit.id !== "unit-skeleton"'), "Unit texture atlas should not special-case skeleton rendering now that source image metadata is indexed.");
expect(!atlasSource.includes('unit.id === "unit-skeleton"'), "Unit texture atlas frame sizing should come from source tile metadata instead of a skeleton id branch.");
expect(!lazyAtlasSource.includes('unit.typeId !== "unit-skeleton"'), "Lazy atlas loading should not bypass missing-image checks for a hardcoded skeleton id.");
expect(!saveSource.includes("unit.onReady?.toLowerCase().includes(\"explore\")"), "Save/load OnReady restoration should use the shared source action classifier instead of scanning action text.");
expect(!manifestSource.includes("onReady.toLowerCase().includes(\"explore\")"), "Manifest preload should use the shared source action classifier instead of scanning action text.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source unit visual metadata verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source unit visual metadata verified (Elevated, ShadowDefinition, Teleporter, NumDirections, and OnReady preserved and consumed).");
