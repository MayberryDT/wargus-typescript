import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const selectionHotkeySource = readFileSync("src/view/selectionHotkeys.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");

const pageButtons = manifest.buttons.filter((button) => button.action === "button");
const unsupported = pageButtons.filter((button) => button.value !== "0" && button.value !== "1" && button.value !== "2");
const missingValues = ["0", "1", "2"].filter((value) => !pageButtons.some((button) => button.value === value));
const errors = [];

for (const button of unsupported) {
  errors.push(`${button.id}: unsupported source button page value ${button.value ?? "<missing>"}`);
}
for (const value of missingValues) {
  errors.push(`source button page value ${value} is missing from indexed Wargus buttons`);
}
for (const value of ["0", "1", "2"]) {
  if (!hudSource.includes(`appendSourceBuildPageButton(commands, manifest, world, selectedUnits, playerId, "${value}")`)) {
    errors.push(`HUD command panel does not append source build-page button value ${value}`);
  }
}
if (!ordersSource.includes("export function sourceBuildPageForKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer): 0 | 1 | 2 | null") || !ordersSource.includes('button.action === "button"')) {
  errors.push("Simulation command path does not resolve Wargus source build-page buttons");
}
if (!ordersSource.includes("export function canOpenWorkerBuildPage(world: WorldState, unitIds: string[], page: 1 | 2, playerId = world.visibilityPlayer): boolean")) {
  errors.push("Simulation command path does not expose worker build-page availability");
}
if (!selectionHotkeySource.includes("sourceBuildPageForKey(world, code, selectedUnitIds)") || !selectionHotkeySource.includes("canOpenWorkerBuildPage(world, selectedUnitIds, 2)")) {
  errors.push("Keyboard command path does not call simulation source build-page helpers");
}
if (mainSource.includes("function sourceBuildPageForKey") || mainSource.includes("function canOpenWorkerBuildPage") || mainSource.includes("function townCenterTierForPlayer")) {
  errors.push("Main should use simulation source build-page helpers instead of local copies");
}
if (!hudSource.includes("function appendSourceBuildPageButton") || !hudSource.includes("sourceBuildPageButtonForHud(world, selectedUnits, playerId, pageValue)")) {
  errors.push("HUD command panel does not resolve Wargus source build-page buttons");
}
if (!ordersSource.includes("export function sourceBuildPageButtonForHud(world: WorldState, selectedUnits: WorldUnit[], playerId: number, pageValue: \"0\" | \"1\" | \"2\"): WargusButton | null") || !ordersSource.includes('button.action === "button" && button.value === pageValue')) {
  errors.push("Simulation command path should own HUD source build-page button lookup.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source button page errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source build-page buttons verified (${pageButtons.length} source button entries checked).`);
