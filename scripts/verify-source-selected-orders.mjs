import { readFileSync } from "node:fs";

const stratagusMapDraw = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/map/map_draw.cpp", "utf8");
const stratagusMouse = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus/src/ui/mouse.cpp", "utf8");
const renderWorld = readFileSync("src/view/renderWorld.ts", "utf8");
const sourceSelectedOrders = readFileSync("src/view/sourceSelectedOrders.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const errors = [];
function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

for (const fragment of [
  "Draw orders of selected units.",
  "for (const CUnit *unit : Selected)",
  "ShowOrder(*unit)",
  "Preference.ShowOrders < 0",
  "(ShowOrdersCount >= GameCycle)",
  "(KeyModifiers & ModifierShift)"
]) {
  expect(stratagusMapDraw.includes(fragment), `Stratagus selected-order drawing source missing fragment: ${fragment}`);
}

expect(stratagusMouse.includes("ShowOrdersCount = GameCycle + Preference.ShowOrders * CYCLES_PER_SECOND"), "Stratagus mouse command source missing ShowOrdersCount update.");

for (const fragment of [
  "const sourceSelectedOrdersVisible = world.engineSettings.showOrdersDefault && sourceShowOrdersVisible",
  "sourceShowOrdersVisible?: boolean",
  "import { sourceSelectedOrderRenderState } from \"./sourceSelectedOrders\"",
  "const visibleUnits = [...world.units]",
  "if (visibleUnits.length === 0)",
  "for (const stateUnit of visibleUnits)",
  "const unit = visualUnitForRender(stateUnit, world)",
  "const selectedOrder = sourceSelectedOrderRenderState(world, unit, selected, sourceSelectedOrdersVisible)",
  "selectedOrder.order?.kind === \"move\"",
  "selectedOrder.order?.kind === \"attack\"",
  "selectedOrder.order?.kind === \"attack-move\"",
  "selectedOrder.order?.kind === \"patrol\"",
  "selectedOrder.order?.kind === \"harvest\"",
  "selectedOrder.rallyPoint"
]) {
  expect(renderWorld.includes(fragment), `Browser renderer missing selected-order fragment: ${fragment}`);
}

for (const fragment of [
  "export function sourceSelectedOrderRenderState",
  "!sourceSelectedOrdersVisible || unit.player !== world.visibilityPlayer || !selectedUnitIds.has(unit.id)",
  "return { order: null, rallyPoint: null }",
  "return { order: unit.order ?? null, rallyPoint: unit.rallyPoint }"
]) {
  expect(sourceSelectedOrders.includes(fragment), `Browser selected-order helper missing source gate fragment: ${fragment}`);
}

for (const fragment of [
  "let sourceShowOrdersUntilTick = 0",
  "let sourceShowOrdersShiftHeld = false",
  "sourceShowOrdersShiftHeld || sourceShowOrdersUntilTick >= world.tick",
  "showSourceOrdersForCommand()",
  "sourceShowOrdersUntilTick = world.tick + sourceShowOrdersDurationTicks(world)",
  "function sourceShowOrdersDurationTicks(loadedWorld: WorldState): number",
  "return sourceDefaultGameSpeed(loadedWorld)",
  "event.code === \"ShiftLeft\" || event.code === \"ShiftRight\""
]) {
  expect(mainSource.includes(fragment), `Browser main loop missing source ShowOrders timing fragment: ${fragment}`);
}

expect(!mainSource.includes("sourceShowOrdersUntilTick = world.tick + Math.max(1, world.tickRate || 30)"), "Browser ShowOrders command timing should use sourceShowOrdersDurationTicks instead of inline browser tick-rate math.");
expect(!mainSource.includes("return Math.max(1, loadedWorld.tickRate || 30);"), "Browser ShowOrders duration helper should use sourceDefaultGameSpeed instead of local tick-rate fallback math.");
expect(!renderWorld.includes("showOrders && isOwned && unit.order"), "Browser renderer should not draw every owned unit order path when source selected-order gating is active.");
expect(!renderWorld.includes("sourceSelectedOrdersVisible && selected.has(unit.id) && isOwned && unit.order?.kind"), "Browser renderer should delegate selected order gating instead of repeating it per order kind.");
expect(!renderWorld.includes("if (isOwned && unit.rallyPoint)"), "Browser renderer should not draw unselected rally paths.");
expect(JSON.stringify(packageJson.scripts).includes("verify:source-selected-orders"), "package.json verify scripts missing verify:source-selected-orders.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source selected-order verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source selected-order rendering verified (selected unit order/rally paths only, source ShowOrders timing anchored).");
