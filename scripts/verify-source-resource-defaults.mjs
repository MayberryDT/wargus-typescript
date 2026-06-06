import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const source = readFileSync(path.join(manifest.dataRoot, "scripts/stratagus.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const uncommentedSource = source
  .replace(/--\[\[[\s\S]*?\]\]/g, "")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

const expected = {};
const defaultResourceBody = uncommentedSource.match(/DefineDefaultResourceAmounts\(([^)]*)\)/s)?.[1] ?? "";
for (const match of defaultResourceBody.matchAll(/"([^"]+)"\s*,\s*(-?\d+)/g)) {
  expected[match[1]] = Math.max(0, Number(match[2]));
}
const expectedNames = parseStringList("DefineDefaultResourceNames");
const expectedActions = parseStringList("DefineDefaultActions");
const expectedIncomes = parseNumberList("DefineDefaultIncomes");
const expectedMaxAmounts = parseNumberList("DefineDefaultResourceMaxAmounts");
const expectedUiLabels = parseResourceUiLabels();

const errors = [];
for (const [resource, amount] of Object.entries(expected)) {
  if (manifest.engineSettings?.defaultResourceAmounts?.[resource] !== amount) {
    errors.push(`engineSettings.defaultResourceAmounts.${resource}: expected ${amount}, found ${manifest.engineSettings?.defaultResourceAmounts?.[resource]}`);
  }
}
checkArray("defaultResourceNames", expectedNames);
checkArray("defaultResourceActions", expectedActions);
checkArray("defaultIncomes", expectedIncomes);
checkArray("defaultResourceMaxAmounts", expectedMaxAmounts);
checkArray("resourceUiLabels", expectedUiLabels);

const resourceSources = (manifest.units ?? []).filter((unit) => unit.givesResource && unit.canHarvest);
if (resourceSources.length === 0) {
  errors.push("Manifest has no harvestable resource source units.");
}

const setupUnitsWithDefaultableResources = [];
for (const map of manifest.maps ?? []) {
  if (!map.setupJson) continue;
  const setup = JSON.parse(readFileSync(path.join("public/wargus", map.setupJson), "utf8"));
  for (const unit of setup.units ?? []) {
    const definition = (manifest.units ?? []).find((candidate) => candidate.id === unit.typeId);
    if (definition?.givesResource && definition.canHarvest && unit.resourcesHeld === null) {
      setupUnitsWithDefaultableResources.push(`${map.path}:${unit.typeId}`);
    }
  }
}

const fragments = [
  [indexSource, "function parseDefaultResourceAmounts"],
  [indexSource, "function parseDefaultStringList"],
  [indexSource, "function parseDefaultNumberList"],
  [indexSource, "function parseResourceUiLabels"],
  [indexSource, "DefineDefaultResourceAmounts"],
  [indexSource, "DefineDefaultResourceNames"],
  [indexSource, "DefineDefaultActions"],
  [indexSource, "DefineDefaultIncomes"],
  [indexSource, "DefineDefaultResourceMaxAmounts"],
  [indexSource, "resourcesHeld: null"],
  [typesSource, "defaultResourceNames: string[]"],
  [typesSource, "defaultResourceActions: string[]"],
  [typesSource, "defaultIncomes: number[]"],
  [typesSource, "defaultResourceMaxAmounts: number[]"],
  [typesSource, "resourceUiLabels: string[]"],
  [typesSource, "defaultResourceAmounts: Record<string, number>"],
  [typesSource, "resourcesHeld: number | null"],
  [worldSource, "export function resourcesHeldForSourceUnit"],
  [worldSource, "engineSettings.defaultResourceAmounts[unit.givesResource]"],
  [worldSource, "resourcesHeldForSourceUnit(unit, setupUnit?.resourcesHeld, worldEngineSettings)"],
  [worldSource, "export function isSourceResourceSiteDefinition"],
  [worldSource, "export function isSourceResourcePatchDefinition"],
  [worldSource, "|| isSourceResourceSiteDefinition(unit)"],
  [worldSource, "|| isSourceResourcePatchDefinition(unit)"],
  [worldSource, "unit.givesResource.length > 0 && unit.canHarvest === true"],
  [worldSource, "&& unit.canHarvest !== true"],
  [ordersSource, "function sourceDefaultIncomePercent"],
  [ordersSource, "world.engineSettings.defaultIncomes[resourceIndex]"],
  [ordersSource, "function sourceDefaultResourceMaxAmount"],
  [ordersSource, "world.engineSettings.defaultResourceMaxAmounts[resourceIndex]"],
  [ordersSource, "export function addPlayerResource"],
  [ordersSource, "player.resources[resource] = maxAmount === null ? next : Math.min(maxAmount, next)"],
  [ordersSource, "addPlayerResource(world, player, unit.order.resource, delivered)"],
  [ordersSource, "addPlayerResource(world, player, resource, Math.floor(Number(costs[index + 1]) * fraction))"],
  [mapCommandsSource, "import { addPlayerResource,"],
  [mapCommandsSource, "refundSourceCosts(world, player, definition.costs)"],
  [mapCommandsSource, "addPlayerResource(world, player, resource, amount)"],
  [saveSource, "resourcesHeldForSourceUnit(unit, null, world.engineSettings)"],
  [saveSource, "if (!unit.carriedResource && !unit.givesResource)"],
  [sourceUiHelpersSource, "world.engineSettings.defaultResourceNames.indexOf(resource)"],
  [sourceUiHelpersSource, "world?.engineSettings.resourceUiLabels[resourceIndex]"],
  [sourceUiHelpersSource, "export function resourceUiLabel"],
  [sourceUiHelpersSource, "world.engineSettings.resourceUiLabels[resourceIndex]"],
  [sourceUiHelpersSource, "export function sourceResourceActionLabel"],
  [sourceUiHelpersSource, "world.engineSettings.defaultResourceActions[resourceIndex]"],
  [sourceUiHelpersSource, "export function sourcePreferredHarvestActionLabel"],
  [sourceUiHelpersSource, "sourceResourceActionLabel(world, selected.order.resource, \"Harvest\")"]
];
for (const [fileSource, fragment] of fragments) {
  if (!fileSource.includes(fragment)) {
    errors.push(`Missing source resource default fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Source resource default verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Source resource defaults verified (${Object.entries(expected).map(([resource, amount]) => `${resource}=${amount}`).join(", ")}, ${expectedNames.length} names, ${expectedUiLabels.length} UI labels, ${resourceSources.length} source units, ${setupUnitsWithDefaultableResources.length} setup fallbacks).`);

function readCallBody(functionName) {
  const start = uncommentedSource.indexOf(`${functionName}(`);
  if (start === -1) {
    return "";
  }
  const openIndex = uncommentedSource.indexOf("(", start);
  let depth = 0;
  let inString = false;
  for (let index = openIndex; index < uncommentedSource.length; index += 1) {
    const char = uncommentedSource[index];
    const previous = uncommentedSource[index - 1];
    if (char === '"' && previous !== "\\") inString = !inString;
    if (inString) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) return uncommentedSource.slice(openIndex + 1, index);
  }
  return "";
}

function parseStringList(functionName) {
  return [...readCallBody(functionName).matchAll(/_\("([^"]+)"\)|"([^"]+)"/g)]
    .map((match) => cleanSourceText(match[1] ?? match[2] ?? ""))
    .filter(Boolean);
}

function parseNumberList(functionName) {
  return [...readCallBody(functionName).matchAll(/-?\d+/g)].map((match) => Number(match[0]));
}

function parseResourceUiLabels() {
  const match = uncommentedSource.match(/ResourcesOnUI\s*=\s*\{([^}]*)\}/s);
  return [...(match?.[1] ?? "").matchAll(/_\("([^"]+)"\)|"([^"]+)"/g)]
    .map((labelMatch) => cleanSourceText(labelMatch[1] ?? labelMatch[2] ?? ""))
    .filter(Boolean);
}

function cleanSourceText(text) {
  return text.replace(/~!/g, "").replace(/~<([^~>]+)~>/g, "$1").replace(/~/g, "").replace(/\s+/g, " ").trim();
}

function checkArray(key, expectedValues) {
  const actual = manifest.engineSettings?.[key] ?? [];
  if (JSON.stringify(actual) !== JSON.stringify(expectedValues)) {
    errors.push(`engineSettings.${key}: expected ${JSON.stringify(expectedValues)}, found ${JSON.stringify(actual)}`);
  }
}
