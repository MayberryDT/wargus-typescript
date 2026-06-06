import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const sourceActionsSource = readFileSync("src/wargus/sourceActions.ts", "utf8");
const sourceExploreSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_explore.cpp", "utf8");

const onReadyUnits = (manifest.units ?? []).filter((unit) => unit.onReady);
const onReadyValues = new Set(onReadyUnits.map((unit) => unit.onReady));
const errors = [];

if (onReadyUnits.length === 0) {
  errors.push("Wargus manifest has no source OnReady entries.");
}
for (const value of onReadyValues) {
  if (value !== "AiExploreUnit") {
    errors.push(`Unexpected source OnReady action ${value}; add explicit browser behavior or classify it.`);
  }
}
if (!worldSource.includes("onReady: unit.onReady ?? null")) {
  errors.push("World creation does not preserve source OnReady metadata.");
}
if (!ordersSource.includes("issueOnReadyOrder(world, trainedUnit)")) {
  errors.push("Production completion does not dispatch source OnReady behavior for trained units.");
}
if (!sourceActionsSource.includes('const SOURCE_EXPLORE_ON_READY_ACTIONS = new Set(["AiExploreUnit"])')
  || !sourceActionsSource.includes("export function isExploreOnReadyValue")
  || !sourceActionsSource.includes("SOURCE_EXPLORE_ON_READY_ACTIONS.has(onReady)")) {
  errors.push("Shared Wargus source action classifier does not explicitly map AiExploreUnit OnReady metadata.");
}
if (!ordersSource.includes('import { isExploreOnReadyValue } from "../wargus/sourceActions"')
  || !ordersSource.includes("isExploreOnReadyValue(unit.onReady)")
  || !ordersSource.includes("issueExploreOrder(world, unit.id)")) {
  errors.push("Simulation does not map AiExploreUnit OnReady metadata to explore orders.");
}
if (!saveSource.includes('import { isExploreOnReadyValue } from "./sourceActions"') || !saveSource.includes("isExploreOnReadyValue(unit.onReady)") || !saveSource.includes("issueExploreOrder(world, unit.id)")) {
  errors.push("Save/load normalization does not restore source OnReady explore orders.");
}
if (sourceActionsSource.includes("toLowerCase().includes(\"explore\")") || saveSource.includes("unit.onReady?.toLowerCase().includes(\"explore\")")) {
  errors.push("OnReady restoration should use the shared source action classifier instead of scanning action text.");
}
if (!sourceExploreSource.includes("!field->playerInfo.IsExplored(player)") || !ordersSource.includes("function findUnexploredExplorationCandidates") || !ordersSource.includes("world.exploredTiles[y * world.map.width + x] !== 0")) {
  errors.push("Explore order targeting should preserve the source preference for unexplored map tiles before falling back to explored destinations.");
}
if (!sourceExploreSource.includes("this->Range++") || !ordersSource.includes("function findExplorationPath") || !ordersSource.includes("for (const target of candidates)") || !ordersSource.includes("if (path.length > 0)")) {
  errors.push("Explore order targeting should retry ordered candidates for a reachable path instead of failing on the first unreachable target.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`OnReady action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`OnReady actions verified (${onReadyUnits.length} units, ${onReadyValues.size} source actions).`);
