import { existsSync, readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const constructions = manifest.constructions ?? [];
const constructionById = new Map(constructions.map((construction) => [construction.id, construction]));
const referencedConstructionIds = new Set(
  (manifest.units ?? [])
    .map((unit) => unit.constructionTypeId)
    .filter(Boolean)
);

const errors = [];

if (constructions.length < referencedConstructionIds.size) {
  errors.push(`Expected at least ${referencedConstructionIds.size} construction definitions, found ${constructions.length}`);
}

for (const id of referencedConstructionIds) {
  const construction = constructionById.get(id);
  if (!construction) {
    errors.push(`Unit construction reference ${id} has no indexed DefineConstruction entry`);
    continue;
  }
  if (!construction.image) {
    errors.push(`Construction ${id} has no image`);
  } else if (!existsSync(`public/wargus/graphics/${construction.image}`)) {
    errors.push(`Construction ${id} image missing: ${construction.image}`);
  }
  if (!construction.size || construction.size.some((value) => !Number.isFinite(value) || value <= 0)) {
    errors.push(`Construction ${id} has invalid frame size`);
  }
  if (!construction.stages?.some((stage) => stage.file === "construction")) {
    errors.push(`Construction ${id} has no construction sprite stage`);
  }
}

const textureLoader = readFileSync("src/view/unitTextureAtlas.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
if (!textureLoader.includes("preloadedConstructions") || !textureLoader.includes("textureDescriptorForConstruction")) {
  errors.push("Unit texture atlas loader does not preload construction atlases");
}

const renderer = readFileSync("src/view/renderWorld.ts", "utf8");
if (!renderer.includes("constructionFrameForUnit") || !renderer.includes('constructionFrame?.file === "construction"')) {
  errors.push("World renderer does not select construction frames for active construction");
}

const darkPortal = (manifest.units ?? []).find((unit) => unit.id === "unit-dark-portal");
const farm = (manifest.units ?? []).find((unit) => unit.id === "unit-farm");
if (darkPortal?.builderOutside !== true) {
  errors.push("Source BuilderOutside=true was not indexed for unit-dark-portal.");
}
if (farm?.builderOutside === true) {
  errors.push("Normal farm construction should not be marked BuilderOutside.");
}

for (const [name, source, fragments] of [
  ["world", worldSource, [
    "builderInside?: boolean",
    "hiddenInConstructionId?: string | null",
    "export function isUnitHiddenInConstruction"
  ]],
  ["orders", ordersSource, [
    "const builderInside = !buildingDefinition.builderOutside",
    "building.construction = { builderId: builder.id, builderInside, remainingSeconds: totalSeconds, totalSeconds }",
    "builder.hiddenInConstructionId = building.id",
    "function stepInsideConstructionStates",
    "function releaseBuilderFromConstruction",
    "updateUnitFacing(unit, building.x - unit.x, building.y - unit.y)",
    "platform.construction = { builderId: builder.id, builderInside: false, remainingSeconds: totalSeconds, totalSeconds }"
  ]],
  ["save", saveSource, [
    "unit.hiddenInConstructionId = typeof unit.hiddenInConstructionId === \"string\"",
    "builderInside: Boolean(record.builderInside) || definition.builderOutside !== true",
    "builder.hiddenInConstructionId = building.id"
  ]],
  ["renderer", renderer, [
    "isUnitHiddenInConstruction(unit)"
  ]]
]) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${name} missing BuilderOutside construction fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Construction definition verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Construction definitions verified (${constructions.length} definitions, ${referencedConstructionIds.size} referenced by units).`);
