import { readFileSync } from "node:fs";

const mainSource = readFileSync("src/main.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const selectionInputSource = readFileSync("src/view/selectionInput.ts", "utf8");
const sourceSelection = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/stratagus/selection.cpp", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

const rectangleSelection = ordersSource.match(/export function selectUnitsInRect[\s\S]*?export function mergeSelection/)?.[0] ?? "";
expect(selectionInputSource.includes("selectUnitsInRect(world,"), "Selection input should delegate rectangle selection to simulation orders.");
expect(!mainSource.includes("function selectUnitsInRect"), "Main should not keep its own rectangle selection implementation.");
expect(ordersSource.includes("canReceiveMoveOrders(unit)"), "Selection/order eligibility should delegate to simulation canReceiveMoveOrders.");
expect(rectangleSelection.includes("unit.player === playerId"), "Rectangle selection should prefer local-player units first.");
expect(rectangleSelection.includes("canReceiveMoveOrders(unit)"), "Rectangle selection should only select orderable local units in the owned-unit branch.");
expect(rectangleSelection.includes("isUnitVisibleToPlayer(world, unit, playerId)"), "Rectangle selection must not bypass fog visibility.");
expect(rectangleSelection.includes("const visibleUnits = world.units"), "Rectangle selection should keep the visible fallback branch.");
expect(rectangleSelection.match(/isUnitVisibleToPlayer\(world, unit, playerId\)/g)?.length >= 2, "Both rectangle selection branches should apply the visibility predicate.");

const pointSelection = ordersSource.match(/export function findSelectableUnitAt[\s\S]*?export function selectUnitsInRect/)?.[0] ?? "";
expect(selectionInputSource.includes("findSelectableUnitAt(world,"), "Selection input should delegate point selection to simulation orders.");
expect(!mainSource.includes("function findUnitAt"), "Main should not keep its own point selection implementation.");
expect(pointSelection.includes("!isUnitVisibleToPlayer(world, unit, playerId)"), "Point selection must reject invisible units.");

const doubleClickSelection = ordersSource.match(/export function selectVisibleUnitsOfType[\s\S]*?export function canSelectedIssueMoveAt/)?.[0] ?? "";
const sourceSelectUnitsByType = sourceSelection.match(/int SelectUnitsByType[\s\S]*?int ToggleUnitsByType/)?.[0] ?? "";
const sourceToggleUnitsByType = sourceSelection.match(/int ToggleUnitsByType[\s\S]*?NetworkSendSelection\(&Selected\[0\], Selected\.size\(\)\);/)?.[0] ?? "";
expect(selectionInputSource.includes("selectVisibleUnitsOfType(world, unit.id,"), "Selection input should delegate same-type selection to simulation orders with the clicked base unit.");
expect(selectionInputSource.includes("selectedUnitIds, drag.additive"), "Selection input should pass additive state into same-type selection.");
expect(!mainSource.includes("function selectVisibleUnitsOfType"), "Main should not keep its own same-type selection implementation.");
expect(doubleClickSelection.includes("isUnitVisibleToPlayer(world, unit, playerId)"), "Double-click same-type selection must stay visibility-gated.");
expect(sourceSelectUnitsByType.includes("UnSelectAll();"), "Source same-type selection should clear selection before selecting the base.");
expect(sourceSelectUnitsByType.includes("Selected.push_back(&base);"), "Source same-type selection should always anchor on the base unit first.");
expect(sourceSelectUnitsByType.includes("!CanSelectMultipleUnits(*base.Player) || !type.BoolFlag[SELECTABLEBYRECTANGLE_INDEX].value"), "Source same-type selection should return base-only for non-multiple/non-rectangle units.");
expect(sourceSelectUnitsByType.includes("if (unit == &base)"), "Source same-type selection should avoid adding the base twice.");
expect(sourceSelectUnitsByType.includes("Selected.size() == MaxSelectable"), "Source same-type selection should stop at MaxSelectable.");
expect(sourceToggleUnitsByType.includes("if (!SelectUnit(base))"), "Source additive same-type selection should leave selection unchanged if the base was already selected.");
expect(doubleClickSelection.includes("const base = world.units.find((unit) => unit.id === baseUnitId)"), "Browser same-type selection should be anchored on the clicked base unit.");
expect(doubleClickSelection.includes("if (!base.selectableByRectangle)"), "Browser same-type selection should branch on source rectangle-selectability.");
expect(doubleClickSelection.includes("return additive ? fallbackUnitIds : [base.id];"), "Browser same-type selection should return base-only for non-additive static units.");
expect(doubleClickSelection.includes("fallbackUnitIds.includes(base.id)"), "Browser additive same-type selection should leave selection unchanged when the base is already selected.");
expect(doubleClickSelection.includes("sourceCanToggleUnitIntoSelection(world, fallbackUnitIds, base.id)"), "Browser additive same-type selection should reuse source mixing rules for the base.");
expect(doubleClickSelection.includes("sourceCanToggleUnitIntoSelection(world, additive ? [...fallbackUnitIds, ...sameType] : sameType, unit.id)"), "Browser same-type selection should reuse source mixing rules for added units.");
expect(doubleClickSelection.includes("maxSelectableForEngine(world.engineSettings)"), "Browser same-type selection should stop at the source selection cap.");

expect(JSON.stringify(packageJson.scripts).includes("verify:source-selection-visibility"), "package.json verify scripts missing verify:source-selection-visibility.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source selection visibility verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source selection visibility verified (point, rectangle, and same-type selection are fog-gated).");
