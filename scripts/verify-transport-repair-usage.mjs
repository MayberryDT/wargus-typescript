import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const selectionHotkeySource = readFileSync("src/view/selectionHotkeys.ts", "utf8");
const commandKeySource = readFileSync("src/simulation/commandKeys.ts", "utf8");
const overlaySource = readFileSync("src/view/renderOverlays.ts", "utf8");
const hudCommandExecutionSource = readFileSync("src/view/hudCommandExecution.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const sourceUnloadSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_unload.cpp", "utf8");
const sourceMouseSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/ui/mouse.cpp", "utf8");
const sourceRepairStillSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_still.cpp", "utf8");

const transports = (manifest.units ?? []).filter((unit) => (unit.maxOnBoard ?? 0) > 0 || (unit.canTransport ?? []).length > 0);
const autoRepairers = (manifest.units ?? []).filter((unit) => (unit.autoRepairRange ?? 0) > 0);
const manualRepairers = (manifest.units ?? []).filter((unit) => (unit.repairRange ?? 0) > 0);
const repairableUnits = (manifest.units ?? []).filter((unit) => (unit.repairHp ?? 0) > 0 || (unit.repairCosts ?? []).length > 0);
const errors = [];

if (transports.length === 0) {
  errors.push("Wargus manifest has no transport-capable units.");
}
if (autoRepairers.length === 0) {
  errors.push("Wargus manifest has no AutoRepairRange units.");
}
if (manualRepairers.length === 0) {
  errors.push("Wargus manifest has no RepairRange units.");
}
if (repairableUnits.length === 0) {
  errors.push("Wargus manifest has no repair HP/cost metadata.");
}
for (const fragment of [
  "const int maxRange = 1;",
  "constexpr int maxUnloadRange = 1;",
  "FindUnloadPosition(transporter, *unit, pos, maxUnloadRange)"
]) {
  if (!sourceUnloadSource.includes(fragment)) {
    errors.push(`Stratagus unload source missing expected max-range fragment: ${fragment}`);
  }
}
for (const fragment of [
  "ButtonAreaUnderCursor == ButtonArea::Transporting",
  "UI.TransportingButtons[i].Contains(screenPos)",
  "SendCommandUnload(*Selected[0], Selected[0]->tilePos, uins, flush)"
]) {
  if (!sourceMouseSource.includes(fragment)) {
    errors.push(`Stratagus transport button source missing expected fragment: ${fragment}`);
  }
}
for (const fragment of [
  "unit->IsTeamed(*worker)",
  "unit->Type->RepairHP",
  "unit->Variable[HP_INDEX].Value < unit->Variable[HP_INDEX].Max",
  "unit->IsVisibleAsGoal(*worker->Player)",
  "UnitToRepairInRange(const CUnit &unit, int range)",
  "FindUnit_If(unit.tilePos - offset, unit.tilePos + offset, IsAReparableUnitBy(unit))"
]) {
  if (!sourceRepairStillSource.includes(fragment)) {
    errors.push(`Stratagus auto-repair source missing expected fragment: ${fragment}`);
  }
}

const requiredWorldFragments = [
  "canTransport: [...(unit.canTransport ?? [])]",
  "autoRepair: false",
  "autoRepairRange: Math.max(0, unit.autoRepairRange ?? 0) * 32",
  "repairRange: Math.max(0, unit.repairRange ?? 0) * 32",
  "repairHp: Math.max(0, unit.repairHp ?? 0)",
  "repairCosts: [...(unit.repairCosts ?? [])]",
  "cargoCapacityForUnit(unit)"
];
for (const fragment of requiredWorldFragments) {
  if (!worldSource.includes(fragment)) {
    errors.push(`World creation missing transport/repair metadata fragment: ${fragment}`);
  }
}

const requiredOrderFragments = [
  "function stepAutoRepair",
  "!worker.autoRepair",
  "worker.autoRepairRange <= 0",
  "export function canToggleAutoRepair(unit: WorldUnit): boolean",
  "export function setAutoRepairForSelection(world: WorldState, unitIds: string[], enabled: boolean, playerId = world.visibilityPlayer): boolean",
  "export function toggleAutoRepairForSelection(world: WorldState, unitIds: string[], playerId = world.visibilityPlayer): boolean",
  "const enabled = units.some((unit) => !unit.autoRepair)",
  "issueRepairOrder(world, worker.id, target.id)",
  "Math.max(10, unit.repairRange)",
  "export function canRepairUnit(unit: WorldUnit): boolean",
  "return unit.hitPoints > 0 && !isUnitHiddenInConstruction(unit) && !unit.construction && unit.repairRange > 0 && isWorker(unit)",
  "if (!canRepairUnit(worker))",
  "return canRepairUnit(worker)",
  "canRepairTarget(unit, target, world)",
  "canRepairTarget(worker, candidate, world)",
  "worker.player === target.player || arePlayersAllied(world, worker.player, target.player)",
  "target.repairHp > 0",
  "isUnitVisibleToPlayer(world, target, worker.player)",
  "function sourceAutoRepairRectScanTarget",
  "sourceAutoRepairRectScanTarget(world, worker",
  "for (let y = Math.max(0, minY); y <= Math.min(world.map.height - 1, maxY); y += 1)",
  "for (let x = Math.max(0, minX); x <= Math.min(world.map.width - 1, maxX); x += 1)",
  "function sourceAutoRepairRectContains",
  "function sourceUnitOccupiesTile",
  "Math.floor(worker.autoRepairRange / world.tileSize)",
  "export function issueRepairAtOrder(world: WorldState, unitId: string, x: number, y: number): boolean",
  "export function canSelectedIssueRepairAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean",
  "function repairHpForTarget",
  "return Math.max(1, Math.floor(target.repairHp || 5))",
  "function repairCostsForTarget",
  "return target.repairCosts",
  "function sourceConstructionRepairCosts",
  "return SOURCE_RESOURCES_MULTI_BUILDERS_MULTIPLIER > 0 ? target.repairCosts : []",
  "const SOURCE_RESOURCES_MULTI_BUILDERS_MULTIPLIER = 0",
  "repairCycle: 0",
  "unit.order.repairCycle = 0",
  "updateUnitFacing(unit, target.x - unit.x, target.y - unit.y)",
  "unit.order.repairCycle += sourceElapsedCycles(world, tickSeconds)",
  "const repairCycleTicks = sourceRepairCycleTicks(world, unit)",
  "target.construction || target.hitPoints < target.maxHitPoints",
  "if (target.construction) {",
  "progressConstruction(world, target, sourceCyclesToSeconds(world, repairCycleTicks), unit)",
  "if (!target.construction) {",
  "unit.order.repairCycle -= repairCycleTicks",
  "function sourceElapsedCycles(world: WorldState, tickSeconds: number): number",
  "return Math.max(0, tickSeconds * sourceDefaultGameSpeed(world))",
  "function sourceRepairCycleTicks(world: WorldState, unit: WorldUnit): number",
  "animation?.actions.Repair ?? []",
  "return Math.max(1, ticks || sourceOrderRetryTicks(world, 30))",
  "function isTransport",
  "unit.cargoCapacity > 0 && unit.canTransport.length > 0",
  "export function canIssueLoadTransport(transport: WorldUnit): boolean",
  "return isTransport(transport) && transport.cargo.length < transport.cargoCapacity",
  "if (!transport || !canIssueLoadTransport(transport))",
  "transport.cargo.length < transport.cargoCapacity",
  "canTransportCarryUnit(transport, unit)",
  "rule === \"LandUnit\"",
  "transport.cargo.push(unit)",
  "unloadTransportCargoNear",
  "export function canIssueUnloadTransport(transport: WorldUnit): boolean",
  "return isTransport(transport) && transport.cargo.length > 0",
  "if (!transport || !canIssueUnloadTransport(transport))",
  "if (!canIssueUnloadTransport(transport))",
  "function closestFreeDropZone",
  "function hasUnloadSpaceForAnyCargoNear",
  "function unloadableCargoUnits(transport: WorldUnit, cargoUnitId: string | null = null): WorldUnit[]",
  "return cargoUnitId ? transport.cargo.filter((unit) => unit.id === cargoUnitId) : transport.cargo",
  "unloadableCargoUnits(transport, cargoUnitId).some((unit) =>",
  "export function issueUnloadCargoUnitOrder(world: WorldState, transportId: string, cargoUnitId: string, queue = false): boolean",
  "export function canIssueUnloadCargoUnit(transport: WorldUnit, cargoUnitId: string): boolean",
  "unloadCargoUnitId: cargoUnitId",
  "target.cargoUnitId ?? null",
  "const SOURCE_UNLOAD_UNIT_MAX_RANGE = 1",
  "const SOURCE_UNLOAD_DROPZONE_MAX_RANGE = 20",
  "const SOURCE_UNLOAD_MAX_RETRIES = 20",
  "unloadState: \"find-dropzone\"",
  "unloadRetries: 0",
  "transport.order.unloadRetries += 1",
  "transport.order.unloadState = \"find-dropzone\"",
  "findUnloadTileNear(world, center, unit, unloaded, SOURCE_UNLOAD_UNIT_MAX_RANGE)",
  "const SPAWN_EXIT_MAX_RANGE = 6",
  "maxRange = SPAWN_EXIT_MAX_RANGE",
  "export function canSelectedIssueUnloadTransportAt(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean",
  "unit.order?.kind === \"follow\" && unit.order.attackTargetId && unavailableUnitIds.has(unit.order.attackTargetId)",
  "unit.order.attackTargetId = null",
  "const droppedCargo = unit.cargo.slice(unit.cargoCapacity)",
  "clearReferencesToUnavailableUnits(world, new Set(droppedCargo.map((cargoUnit) => cargoUnit.id)))",
  "normalizeTransformedCombatOrders(world, unit)",
  "order.kind !== \"attack-target\"",
  "order.kind !== \"attack-move\"",
  "order.kind !== \"attack-ground\"",
  "order.kind !== \"patrol\"",
  "if (unit.order.kind === \"attack-ground\" && !canAttackGround(unit))",
  "if (target && !canAttackTarget(unit, target, world))"
];
for (const fragment of requiredOrderFragments) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation missing transport/repair runtime fragment: ${fragment}`);
  }
}

const autoRepairMatch = ordersSource.match(/function findNearestAutoRepairTarget[\s\S]*?function repairPriority/);
const autoRepairSource = autoRepairMatch?.[0] ?? "";
if (!autoRepairSource) {
  errors.push("Simulation missing auto-repair target selection helper.");
} else if (autoRepairSource.includes(".sort(") || autoRepairSource.includes("repairPriority(") || autoRepairSource.includes("damageRatio(")) {
  errors.push("Auto repair should follow Stratagus rectangle scan instead of browser-local priority sorting.");
}
if (!autoRepairSource.includes("const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, world.tileSize)")
  || !autoRepairSource.includes("return right >= minX && left <= maxX && bottom >= minY && top <= maxY")) {
  errors.push("Auto repair rectangle prefilter should use source unit footprints instead of only target center tiles.");
}
if (autoRepairSource.includes("const tileX = Math.floor(unit.x / world.tileSize)") || autoRepairSource.includes("const tileY = Math.floor(unit.y / world.tileSize)")) {
  errors.push("Auto repair rectangle prefilter should not reject large footprint targets by center tile only.");
}

const requiredSaveFragments = [
  "unit.canTransport = [...(definition.canTransport ?? [])]",
  "unit.autoRepair = Boolean(unit.autoRepair)",
  "unit.autoRepairRange = Math.max(0, definition.autoRepairRange ?? 0) * 32",
  "unit.repairRange = Math.max(0, definition.repairRange ?? 0) * 32",
  "unit.repairHp = Math.max(0, definition.repairHp ?? 0)",
  "unit.repairCosts = [...(definition.repairCosts ?? [])]",
  "const sourceCapacity = Math.max(0, Math.floor(definition?.maxOnBoard ?? 0))",
  "canTargetTransportForLoading(transport, unit)"
];
for (const fragment of requiredSaveFragments) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load normalization missing transport/repair fragment: ${fragment}`);
  }
}

if (!ordersSource.includes('if (action === "repair") return canRepairUnit(unit);') || !ordersSource.includes('if (action === "unload") return canIssueUnloadTransport(unit);') || !hudSource.includes("selectedTransports.some(canIssueLoadTransport)") || !hudSource.includes('canEnterPendingWorldCommand(world, selectedReadyUnitIds, "unload-transport", selectedPlayer)') || !hudSource.includes("readyUnits.filter(isTransport)") || !ordersSource.includes("canIssueSourceActionButton(world, button, unit)")) {
  errors.push("HUD command availability does not expose source repair/transport capabilities.");
}

if (!ordersSource.includes("export function isTransport(unit: WorldUnit): boolean")) {
  errors.push("Simulation transport capability helper must be exported.");
}

if (!hudSource.includes("isTransport,")) {
  errors.push("HUD should import the simulation transport capability helper.");
}

if (!ordersSource.includes("export function issueFallbackUtilityCommandByKey(world: WorldState, unit: WorldUnit, code: string, unitDefinitions: WargusUnit[] = world.unitDefinitions, phase: \"early\" | \"late\" = \"early\", queue = false): boolean | null")) {
  errors.push("Simulation should expose fallback utility hotkey issuing.");
}

if (!commandKeySource.includes('issueFallbackUtilityCommandByKey(loadedWorld, unit, code, loadedManifest.units, "late", queue)')) {
  errors.push("Command-key path should call the simulation utility helper for late load/unload/oil hotkeys.");
}

if (!hudSource.includes("canEnterPendingWorldCommand,")) {
  errors.push("HUD should import the simulation pending-command entry helper for targetable unload/platform visibility.");
}

if (!hudSource.includes("canIssueLoadTransport,")) {
  errors.push("HUD should import the simulation load capability helper.");
}

for (const fragment of [
  "onCargoUnitPick: (transportId: string, cargoUnitId: string, queue: boolean) => void",
  "onCargoUnitPick(selected.id, unit.id, nativeEvent instanceof PointerEvent && nativeEvent.shiftKey)",
  "drawCargoPanel(hudLayer, frame",
  "onCargoUnitPick)"
]) {
  if (!hudSource.includes(fragment)) {
    errors.push(`HUD cargo button handling missing source transport fragment: ${fragment}`);
  }
}
for (const fragment of [
  "issueUnloadCargoUnitOrder,",
  "onCargoUnitPick: (transportId, cargoUnitId, queue) =>",
  "issueUnloadCargoUnitOrder(world, transportId, cargoUnitId, queue)"
]) {
  if (!mainSource.includes(fragment)) {
    errors.push(`Main cargo unload callback missing source transport fragment: ${fragment}`);
  }
}
for (const fragment of [
  "unloadCargoUnitId: string | null;",
  "cargoUnitId?: string | null;"
]) {
  if (!worldSource.includes(fragment)) {
    errors.push(`World order state missing cargo-specific unload fragment: ${fragment}`);
  }
}
if (!saveSource.includes('unloadCargoUnitId: typeof record.unloadCargoUnitId === "string" ? record.unloadCargoUnitId : null')) {
  errors.push("Save/load normalization should preserve cargo-specific unload targets.");
}
if (!saveSource.includes('const cargoUnitId = typeof record.cargoUnitId === "string" && unit.cargo.some((cargoUnit) => cargoUnit.id === record.cargoUnitId)') || !saveSource.includes("return { kind, x, y, cargoUnitId }")) {
  errors.push("Save/load normalization should preserve queued cargo-specific unload targets only when the cargo is still aboard.");
}
if (!saveSource.includes("if (order.unloadCargoUnitId && !unit.cargo.some((cargoUnit) => cargoUnit.id === order.unloadCargoUnitId))") || !saveSource.includes("order.unloadCargoUnitId = null")) {
  errors.push("Save/load normalization should clear cargo-specific unload targets that are no longer inside the transport.");
}

if (!ordersSource.includes("canRepairUnit(unit)")) {
  errors.push("Simulation source action capability should use the simulation repair capability helper.");
}
if (mainSource.includes("function isWorkerRepairUnit")) {
  errors.push("Main should use the simulation repair capability helper instead of a local repair-button predicate.");
}
if (!ordersSource.includes('if (command === "repair") {\n      return canRepairUnit(unit);\n    }')) {
  errors.push("Pending repair command entry should use the simulation canRepairUnit helper.");
}
if (!hudSource.includes('canEnterPendingWorldCommand(world, selectedReadyUnitIds, "build-oil-platform", selectedPlayer)')) {
  errors.push("HUD oil-platform command visibility should use the simulation pending-command entry helper.");
}
if (!hudSource.includes('canEnterPendingWorldCommand(world, selectedReadyUnitIds, "unload-transport", selectedPlayer)')) {
  errors.push("HUD unload command visibility should use the simulation pending-command entry helper.");
}
if (hudSource.includes("canStartOilPlatformPlacement(world, unit)") || hudSource.includes("selectedTransports.some(canIssueUnloadTransport)")) {
  errors.push("HUD pending command visibility should not duplicate oil-platform or unload capability checks.");
}
if (!overlaySource.includes("canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)")) {
  errors.push("Pending repair cursor/preview validity should delegate through the simulation selected pending-command helper.");
}
if (overlaySource.includes("canSelectedIssueRepairAt(world, selectedUnitIds, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)")) {
  errors.push("Pending repair cursor/preview validity should not duplicate repair checks outside the simulation pending-command helper.");
}
if (!mainSource.includes("onCommand: (command, input) => executeHudCommand(command, input)")) {
  errors.push("HUD command callback should preserve source Ctrl modifier input for repair auto-toggle handling.");
}
for (const fragment of [
  "toggleAutoRepairForSelection",
  'if (command === "repair" && input.ctrlKey)',
  "return acknowledge(toggleAutoRepairForSelection(world, selectedUnitIds));"
]) {
  if (!hudCommandExecutionSource.includes(fragment)) {
    errors.push(`HUD command execution missing source auto-repair toggle fragment: ${fragment}`);
  }
}
for (const fragment of [
  "canToggleAutoRepair,",
  'command.id === "repair" || command.sourceButton?.action === "repair"',
  "selectedUnits.every((unit) => canToggleAutoRepair(unit) && unit.autoRepair)",
  "world.engineSettings.autoCastBorderColorRgb"
]) {
  if (!sourceUiHelpersSource.includes(fragment)) {
    errors.push(`Source UI helpers missing source auto-repair border fragment: ${fragment}`);
  }
}
if (mainSource.includes("function canSelectedWorkerRepairAt")) {
  errors.push("Main should use the simulation selected repair helper instead of a local preview helper.");
}
if (!overlaySource.includes("canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)")) {
  errors.push("Pending unload cursor/preview validity should delegate through the simulation selected pending-command helper.");
}
if (overlaySource.includes("canSelectedIssueUnloadTransportAt(world, selectedUnitIds, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)")) {
  errors.push("Pending unload cursor/preview validity should not duplicate unload checks outside the simulation pending-command helper.");
}
if (mainSource.includes("function canSelectedTransportUnloadAt")) {
  errors.push("Main should use the simulation selected unload helper instead of a local preview helper.");
}

const groupRepair = ordersSource.match(/export function issueGroupRepairOrder[\s\S]*?export function issueRepairOrder/)?.[0] ?? "";
if (!ordersSource.includes("export function issueGroupRepairOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean")) {
  errors.push("Simulation should expose group repair issuing.");
}
if (!groupRepair.includes("canIssueRepairAt(world, unit, x, y)")) {
  errors.push("Group repair issuing should use the simulation canIssueRepairAt helper at the clicked target.");
}
if (!groupRepair.includes("issueRepairAtOrder(world, worker.id, x, y)")) {
  errors.push("Group repair issuing should use the simulation point-based repair issuing helper.");
}
if (mainSource.includes("function issueGroupRepairOrder")) {
  errors.push("Main should use the simulation group repair issuing helper instead of a local copy.");
}
if (groupRepair.includes("const target = findUnitAt") || groupRepair.includes("target.player !== loadedWorld.visibilityPlayer") || groupRepair.includes("target.hitPoints >= target.maxHitPoints") || groupRepair.includes("isWorkerRepairUnit(loadedWorld, unit)") || groupRepair.includes("issueRepairOrder(loadedWorld, worker.id, target.id)")) {
  errors.push("Group repair issuing should not duplicate repair target lookup or capability checks from simulation.");
}

const groupUnload = ordersSource.match(/export function issueGroupUnloadTransportOrder[\s\S]*?export function canIssueUnloadTransport/)?.[0] ?? "";
if (!ordersSource.includes("export function issueGroupUnloadTransportOrder(world: WorldState, unitIds: string[], x: number, y: number, playerId = world.visibilityPlayer): boolean")) {
  errors.push("Simulation should expose group unload issuing.");
}
if (!groupUnload.includes("canIssueUnloadTransportAt(world, transport, destination.x, destination.y)")) {
  errors.push("Group unload issuing should use the simulation canIssueUnloadTransportAt helper at formation destinations.");
}
if (mainSource.includes("function issueGroupUnloadTransportOrder")) {
  errors.push("Main should use the simulation group unload issuing helper instead of a local copy.");
}
if (groupUnload.includes("&& canIssueUnloadTransport(unit)")) {
  errors.push("Group unload issuing should not prefilter with cargo-only unload checks instead of the target-aware simulation helper.");
}

const groupOilPlatform = ordersSource.match(/export function issueGroupBuildOilPlatformAtOrder[\s\S]*?export function canStartOilPlatformPlacement/)?.[0] ?? "";
if (!ordersSource.includes("export function canIssueBuildOilPlatformAtPoint(world: WorldState, builder: WorldUnit, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean")) {
  errors.push("Simulation should expose a point-based oil-platform capability helper.");
}
if (!ordersSource.includes("export function canSelectedIssueBuildOilPlatformAt(world: WorldState, unitIds: string[], x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean")) {
  errors.push("Simulation should expose a selected-unit point-based oil-platform capability helper.");
}
if (!ordersSource.includes("export function issueBuildOilPlatformAtOrder(world: WorldState, builderId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean")) {
  errors.push("Simulation should expose a point-based oil-platform issuing helper.");
}
if (!ordersSource.includes("export function issueBuildNearestOilPlatformOrder(world: WorldState, builderId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean")) {
  errors.push("Simulation should expose a nearest-patch oil-platform issuing helper.");
}
if (!ordersSource.includes("function findNearestBuildableOilPatch(world: WorldState, unit: WorldUnit, unitDefinitions: WargusUnit[] = world.unitDefinitions): WorldUnit | undefined")) {
  errors.push("Nearest oil-platform issuing should use a buildable source oil-patch helper.");
}
if (!ordersSource.includes("const oilPatch = builder ? findNearestBuildableOilPatch(world, builder, unitDefinitions) : undefined;")) {
  errors.push("Nearest oil-platform issuing should choose the nearest buildable oil patch instead of the nearest visible patch.");
}
if (!ordersSource.includes(".filter((candidate) => canIssueBuildOilPlatformAt(world, unit, candidate, unitDefinitions))")) {
  errors.push("Nearest buildable oil-patch lookup should reuse the simulation point/source capability checks.");
}
if (!ordersSource.includes("export function findVisibleOilPatchAt(world: WorldState, x: number, y: number, playerId = world.visibilityPlayer): WorldUnit | undefined")) {
  errors.push("Simulation should expose visible oil-patch lookup for preview rendering.");
}
if (!ordersSource.includes("function isOilPlatformDefinition(definition: WargusUnit, unitDefinitions: WargusUnit[] = []): boolean")) {
  errors.push("Oil-platform definition classification should receive source unit definitions.");
}
if (!ordersSource.includes("isSourceResourcePatchDefinition,")) {
  errors.push("Oil-platform definition classification should import the shared source resource patch helper.");
}
if (!ordersSource.includes('isSourceResourcePatchDefinition(patchDefinition, "oil")')) {
  errors.push("Oil-platform definition classification should validate ontop targets through shared source oil patch metadata.");
}
if (!ordersSource.includes("Boolean(definition.replaceOnBuild && patchDefinition && isSourceResourcePatchDefinition")) {
  errors.push("Oil-platform definition classification should use source ReplaceOnBuild metadata.");
}
if (!ordersSource.includes("!platformDefinition?.replaceOnDie || !ontopRule || platform.resourcesHeld <= 0")) {
  errors.push("Oil-platform destruction should use source ReplaceOnDie metadata before restoring an oil patch.");
}
if (!ordersSource.includes("!platformDefinition.replaceOnBuild || !ontopRule || oilPatch.typeId !== ontopRule.typeId")) {
  errors.push("Oil-platform construction should use source ReplaceOnBuild metadata before replacing the oil patch.");
}
if (ordersSource.includes('ontopRule.typeId === "unit-oil-patch"')) {
  errors.push("Oil-platform definition classification still hardcodes the stock oil-patch id.");
}
if (ordersSource.includes('typeId === "unit-oil-patch"')) {
  errors.push("Oil resource patch classification should require source unit metadata instead of a stock oil-patch id fallback.");
}
if (ordersSource.includes("function isSourceResourcePatchDefinition(unitDefinitions")) {
  errors.push("Oil resource patch classification should use the shared world helper instead of a local duplicate.");
}
if (!worldSource.includes("export function isSourceResourcePatchDefinition") || !worldSource.includes("unit.givesResource === resource") || !worldSource.includes("unit.canHarvest !== true")) {
  errors.push("Shared oil resource patch classification should reject missing source definitions and then use GivesResource metadata.");
}
if (!ordersSource.includes("return issueBuildNearestOilPlatformOrder(world, unit.id, unitDefinitions);")) {
  errors.push("Oil-platform hotkey issuing should use the simulation nearest-patch helper through fallback utility issuing.");
}
if (!overlaySource.includes("canSelectedIssuePendingWorldCommandAt(world, selectedUnitIds, command, pointerWorldPosition.x, pointerWorldPosition.y, world.visibilityPlayer)")) {
  errors.push("Pending oil-platform cursor/preview validity should delegate through the simulation selected pending-command helper.");
}
if (overlaySource.includes("canSelectedIssueBuildOilPlatformAt(world, selectedUnitIds, pointerWorldPosition.x, pointerWorldPosition.y, world.unitDefinitions, world.visibilityPlayer)")) {
  errors.push("Pending oil-platform cursor/preview validity should not duplicate oil-platform checks outside the simulation pending-command helper.");
}
if (!ordersSource.includes("export function issueGroupBuildOilPlatformAtOrder(world: WorldState, unitIds: string[], x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean")) {
  errors.push("Simulation should expose group oil-platform issuing.");
}
if (!ordersSource.includes("export function issueGroupQueueBuildOilPlatformAtOrder(world: WorldState, unitIds: string[], x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions, playerId = world.visibilityPlayer): boolean")) {
  errors.push("Simulation should expose queued group oil-platform issuing.");
}
if (!ordersSource.includes("export function issueQueueBuildOilPlatformAtOrder(world: WorldState, builderId: string, x: number, y: number, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean")) {
  errors.push("Simulation should expose queued point-based oil-platform issuing.");
}
if (!ordersSource.includes('builder.moveQueue.push({ kind: "build-oil-platform", targetId: oilPatch.id, x: oilPatch.x, y: oilPatch.y })')) {
  errors.push("Queued oil-platform issuing should append a source target patch order.");
}
if (!ordersSource.includes("function startQueuedBuildOilPlatformOrder(world: WorldState, builder: WorldUnit, oilPatchId: string, unitDefinitions: WargusUnit[] = world.unitDefinitions): boolean")) {
  errors.push("Queued oil-platform execution should use a dedicated source target starter.");
}
if (!ordersSource.includes("preserveQueue: true")) {
  errors.push("Queued oil-platform travel orders should preserve following queued commands.");
}
if (!groupOilPlatform.includes("canIssueBuildOilPlatformAtPoint(world, unit, x, y, unitDefinitions)")) {
  errors.push("Group oil-platform issuing should use the simulation point-based oil-platform capability helper.");
}
if (!groupOilPlatform.includes("issueBuildOilPlatformAtOrder(world, tanker.id, x, y, unitDefinitions)")) {
  errors.push("Group oil-platform issuing should use the simulation point-based oil-platform issuing helper.");
}
if (mainSource.includes("function issueGroupBuildOilPlatformAtOrder")) {
  errors.push("Main should use the simulation group oil-platform issuing helper instead of a local copy.");
}
if (groupOilPlatform.includes("findVisibleOilPatchAt(loadedWorld, x, y)") || groupOilPlatform.includes("const patch =")) {
  errors.push("Group oil-platform issuing should not duplicate clicked oil-patch lookup from simulation.");
}
if (groupOilPlatform.includes("!unit.construction") || groupOilPlatform.includes("&& canStartOilPlatformPlacement(loadedWorld, unit)")) {
  errors.push("Group oil-platform issuing should not duplicate builder capability checks from simulation.");
}
if (mainSource.includes("function hasSelectedOilTankerAt") || mainSource.includes("function findNearestOilPatch") || mainSource.includes("function isUnbuiltOilPatch")) {
  errors.push("Main should use simulation oil-platform helpers instead of local oil-patch/selected tanker copies.");
}

if (mainSource.includes("function isTransportUnit")) {
  errors.push("Main should use the simulation isTransport helper instead of a local copy.");
}

if (mainSource.includes("isTransport(unit) && unit.cargo.length > 0") || hudSource.includes("isTransport(unit) && unit.cargo.length > 0") || mainSource.includes('code === "KeyU" && isTransport(unit)')) {
  errors.push("Main and HUD should use the simulation canIssueUnloadTransport helper instead of raw transport cargo checks.");
}

if (hudSource.includes("unit.cargo.length < unit.cargoCapacity") || mainSource.includes("code === \"KeyL\" && isTransport(unit)")) {
  errors.push("Main and HUD should use the simulation canIssueLoadTransport helper instead of raw transport capacity checks.");
}

if (hudSource.includes('action === "repair") return unit.repairRange > 0 || isHudBuilder(unit)')) {
  errors.push("HUD should use the simulation canRepairUnit helper for source repair buttons.");
}
if (ordersSource.includes('return isNavalOrFlyingUnit(target) ? ["wood", "1", "gold", "1"] : ["wood", "1"]')) {
  errors.push("Repair costs should not invent browser-local fallback resources when source RepairCosts is empty.");
}
if (ordersSource.includes("unit.order.repairBank += tickSeconds * 18")) {
  errors.push("Repair cadence should use source repair animation cycles instead of a browser-local HP bank rate.");
}
if (ordersSource.includes("unit.order.repairCycle += Math.max(0, tickSeconds * world.tickRate)")) {
  errors.push("Repair cycle accumulation should use sourceElapsedCycles instead of inline browser tick-rate math.");
}
if (ordersSource.includes("tickSeconds * world.tickRate")) {
  errors.push("Repair/build source elapsed conversion should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}
if (ordersSource.includes("ticks || Math.floor(world.tickRate)") || saveSource.includes("ticks || Math.floor(world.tickRate)")) {
  errors.push("Repair/build cycle fallbacks should use source cycle conversion instead of raw world.tickRate.");
}
if (!saveSource.includes("Math.max(0, Math.min(repairCycleTicks, finiteNumberOr(record.repairCycle, finiteNumberOr(record.repairBank, 0))))")) {
  errors.push("Save/load should preserve source repaircycle within the source animation cycle while accepting legacy repairBank saves.");
}

for (const fragment of [
  'canEnterPendingWorldCommand(world, selectedUnitIds, "unload-transport")',
  'canEnterPendingWorldCommand(world, selectedUnitIds, "build-oil-platform")',
  'pendingWorldCommand: "unload-transport"'
]) {
  if (!selectionHotkeySource.includes(fragment)) {
    errors.push(`Selection hotkey handling missing source unload pending fragment: ${fragment}`);
  }
}

for (const fragment of [
  'const SOURCE_PENDING_ACTIONS = new Set(["move", "attack", "attack-ground", "patrol", "repair", "unload"])',
  'if (action === "unload") {\n    return "unload-transport";\n  }',
  'if (command === "unload-transport") {\n      return canIssueUnloadTransport(unit);\n    }',
  'if (command === "build-oil-platform") {\n      return canStartOilPlatformPlacement(world, unit);\n    }'
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation command handling missing source unload pending fragment: ${fragment}`);
  }
}

if (mainSource.includes('"stop", "stand-ground", "explore", "harvest", "return-goods", "unload"')) {
  errors.push("Source unload action should enter pending unload mode, not the instant-action path.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Transport/repair verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Transport/repair usage verified (${transports.length} transports, ${autoRepairers.length} auto-repairers, ${manualRepairers.length} manual repairers, ${repairableUnits.length} repairable definitions).`);
