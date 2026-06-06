import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const hudCommandExecutionSource = readFileSync("src/view/hudCommandExecution.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const commandKeySource = readFileSync("src/simulation/commandKeys.ts", "utf8");
const stratagusSourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src";
const sourceTrain = readFileSync(`${stratagusSourceRoot}/action/action_train.cpp`, "utf8");
const sourceResearch = readFileSync(`${stratagusSourceRoot}/action/action_research.cpp`, "utf8");
const sourceUpgradeTo = readFileSync(`${stratagusSourceRoot}/action/action_upgradeto.cpp`, "utf8");
const sourceBuilt = readFileSync(`${stratagusSourceRoot}/action/action_built.cpp`, "utf8");
const sourceMouse = readFileSync(`${stratagusSourceRoot}/ui/mouse.cpp`, "utf8");

const cancelActions = ["cancel-build", "cancel-train-unit", "cancel-upgrade", "cancel"];
const errors = [];

if (!sourceTrain.includes("#define CancelTrainingCostsFactor  100")) {
  errors.push("Stratagus source no longer has the expected 100% training cancel refund.");
}
if (!sourceResearch.includes("#define CancelResearchCostsFactor  100")) {
  errors.push("Stratagus source no longer has the expected 100% research cancel refund.");
}
if (!sourceUpgradeTo.includes("#define CancelUpgradeCostsFactor   100")) {
  errors.push("Stratagus source no longer has the expected 100% upgrade-to cancel refund.");
}
if (!sourceBuilt.includes("#define CancelBuildingCostsFactor  75")) {
  errors.push("Stratagus source no longer has the expected 75% construction cancel refund.");
}
for (const fragment of [
  "if (TransformUnitIntoType(unit, newtype) == 0)",
  "player.AddCosts(newstats.Costs)"
]) {
  if (!sourceUpgradeTo.includes(fragment)) {
    errors.push(`Stratagus source no longer has the expected failed upgrade-to refund fragment: ${fragment}`);
  }
}
for (const fragment of [
  "ButtonAreaUnderCursor == ButtonArea::Training",
  "SendCommandCancelTraining(*Selected[0], ButtonUnderCursor, &order.GetUnitType())",
  "ButtonAreaUnderCursor == ButtonArea::Upgrading",
  "SendCommandCancelUpgradeTo(*Selected[0])",
  "ButtonAreaUnderCursor == ButtonArea::Researching",
  "SendCommandCancelResearch(*Selected[0])"
]) {
  if (!sourceMouse.includes(fragment)) {
    errors.push(`Stratagus source no longer has expected progress-icon cancel fragment: ${fragment}`);
  }
}

for (const action of cancelActions) {
  const buttons = manifest.buttons.filter((button) => button.action === action);
  if (buttons.length === 0) {
    errors.push(`Wargus manifest is missing source cancel action ${action}`);
  }
  if (!ordersSource.includes(`"${action}"`)) {
    errors.push(`simulation command handling does not reference source cancel action ${action}`);
  }
}

const requiredHudFragments = [
  "sourceCancelButtonForSelection(world, selectedUnits)",
  "sourceButton: sourceCancelButton",
  "sourceButtonForHudCommand(world, commandId, playerId, selectedUnits, readyUnits, typeIds)"
];
for (const fragment of requiredHudFragments) {
  if (!hudSource.includes(fragment)) {
    errors.push(`HUD cancel source wiring missing fragment: ${fragment}`);
  }
}

const requiredHudCommandExecutionFragments = [
  "executeDirectHudCommand(world, selectedUnitIds, command, world.visibilityPlayer, input.shiftKey === true)"
];
for (const fragment of requiredHudCommandExecutionFragments) {
  if (!hudCommandExecutionSource.includes(fragment)) {
    errors.push(`HUD command execution cancel source wiring missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "issueBroadcastCommandByKey(loadedWorld, code, unitIds, loadedWorld.visibilityPlayer, queue)"
]) {
  if (!commandKeySource.includes(fragment)) {
    errors.push(`Command-key cancel source wiring missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "issueCancelConstructionOrder",
  "issueCancelProductionOrder",
  "issueCancelResearchOrder"
]) {
  if (commandKeySource.includes(fragment)) {
    errors.push(`Command-key cancel handling should route through simulation source/broadcast cancel wiring instead of importing ${fragment}.`);
  }
}

for (const fragment of [
  "const SOURCE_CANCEL_ACTIONS = new Set",
  "export function sourceCancelButtonForSelection(world: WorldState, selectedUnits: WorldUnit[]): WargusButton | null",
  "export function sourceButtonForHudCommand(world: WorldState, commandId: string, playerId: number, selectedUnits: WorldUnit[], readyUnits: WorldUnit[], typeIds: Iterable<string>): WargusButton | null",
  "if (commandId === \"cancel-queue\")",
  "return sourceCancelButtonForSelection(world, selectedUnits);",
  "export function issueSourceCancelByKey(world: WorldState, code: string, unitIds: string[], playerId = world.visibilityPlayer): boolean | null",
  "function sourceCancelButtonMatchesUnit",
  "function issueSourceCancelAction",
  "export function executeDirectHudCommand(world: WorldState, unitIds: string[], command: string",
  "function issueSourceDirectHudCommand(world: WorldState, unitIds: string[], command: string",
  'if (command === "cancel-queue")'
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation cancel source wiring missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "refundCosts(world, player, unitDefinition.costs, 1)",
  "export function issueCancelProductionOrder(world: WorldState, buildingId: string, queueIndex = 0): boolean",
  "const slot = Math.max(0, Math.floor(queueIndex));",
  "building.productionQueue.splice(slot, 1)",
  "refundCosts(world, player, upgradeCostPairs(upgrade), 1)",
  "refundCosts(world, player, definition.costs, 0.75)"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation cancel refund factor missing source fragment: ${fragment}`);
  }
}

for (const fragment of [
  "refundFailedSourceUpgradeTo(world, unit, unitDefinition)",
  "function refundFailedSourceUpgradeTo(world: WorldState, unit: WorldUnit, unitDefinition: WargusUnit): void",
  "function canTransformUnitTypeAtSourcePosition(world: WorldState, unit: WorldUnit, definition: WargusUnit): boolean",
  "return canPlaceBuilding(world, definition, tileX, tileY, unit.id);",
  "refundCosts(world, player, unitDefinition.costs, 1)"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation failed upgrade-to refund missing source fragment: ${fragment}`);
  }
}

for (const fragment of [
  "const SOURCE_CANCEL_ACTIONS = new Set",
  "function sourceCancelButtonForSelection",
  "function sourceCancelButtonMatchesUnit",
  "function issueSourceCancelAction"
]) {
  if (mainSource.includes(fragment)) {
    errors.push(`Main should use simulation cancel source wiring instead of local fragment: ${fragment}`);
  }
}

if (hudSource.includes("function sourceCancelButtonForSelection")) {
  errors.push("HUD should use simulation source cancel button lookup instead of a local copy.");
}

for (const fragment of [
  "onProductionQueuePick: (buildingId: string, item: { kind: \"production\"; index: number } | { kind: \"research\" }) => void",
  "drawProductionQueuePanel(hudLayer, frame",
  "wargusBitmapFontAtlas, onProductionQueuePick)",
  "cancel: { kind: \"production\" as const, index }",
  "cancel: { kind: \"research\" as const }",
  "onProductionQueuePick(selected.id, item.cancel)"
]) {
  if (!hudSource.includes(fragment)) {
    errors.push(`HUD progress-icon cancel wiring missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "issueCancelProductionOrder,",
  "issueCancelResearchOrder,",
  "onProductionQueuePick: (buildingId, item) =>",
  "issueCancelProductionOrder(world, buildingId, item.index)",
  "issueCancelResearchOrder(world, buildingId)"
]) {
  if (!mainSource.includes(fragment)) {
    errors.push(`Main progress-icon cancel callback missing fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source cancel action errors: ${errors.length}`);
  process.exit(1);
}

const checked = manifest.buttons.filter((button) => cancelActions.includes(button.action)).length;
console.log(`Source cancel actions verified (${checked} source cancel buttons checked).`);
