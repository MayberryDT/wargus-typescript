import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const mainSource = readFileSync("src/main.ts", "utf8");
const stylesSource = readFileSync("src/styles.css", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");

const unitsWithActions = (manifest.units ?? []).filter((unit) => unit.rightMouseAction);
const sourceActions = new Set(unitsWithActions.map((unit) => unit.rightMouseAction));
const expectedActions = new Set(["attack", "harvest", "move", "sail", "spell-cast"]);
const errors = [];

if (unitsWithActions.length === 0) {
  errors.push("Wargus manifest has no source RightMouseAction entries.");
}
for (const action of sourceActions) {
  if (!expectedActions.has(action)) {
    errors.push(`Unexpected source RightMouseAction ${action}; add explicit browser handling or classify it.`);
  }
  if (!ordersSource.includes(`action === "${action}"`)) {
    errors.push(`Simulation smart-order path does not explicitly handle RightMouseAction ${action}.`);
  }
}
if (!worldSource.includes("rightMouseAction: unit.rightMouseAction ?? null")) {
  errors.push("World creation does not preserve source RightMouseAction.");
}
if (!saveSource.includes("unit.rightMouseAction = definition.rightMouseAction ?? null")) {
  errors.push("Save/load normalization does not restore source RightMouseAction.");
}
if (!ordersSource.includes("issueSourceRightMouseAction(world, unit, sourceAction, x, y)")) {
  errors.push("issueSmartOrder does not route through source RightMouseAction handling.");
}
for (const fragment of [
  "const gameBrowserGuardButtonMask = 2 | 4 | 8 | 16;",
  "const gameBrowserContainButtonMask = 2 | 8 | 16;",
  "let gameBrowserMouseGuardActive = false;",
  "function mouseEventButtonToMask(button: number): number",
  "case 2: return 2;",
  "function suppressGameBrowserMouseDefault(event: MouseEvent | PointerEvent): void",
  "function containGameBrowserMouseEvent(event: MouseEvent | PointerEvent): void",
  "function suppressGameBrowserWheelDefault(event: WheelEvent): void",
  "const browserMouseGuardOptions = { capture: true, passive: false } satisfies AddEventListenerOptions;",
  'const browserMouseGuardEventTypes = ["contextmenu", "auxclick", "mousedown", "mouseup", "mousemove", "pointerdown", "pointerup", "pointermove", "pointercancel", "pointerrawupdate"] as const;',
  "window.addEventListener(type, suppressGameBrowserMouseDefault as EventListener, browserMouseGuardOptions);",
  "document.addEventListener(type, containGameBrowserMouseEvent as EventListener);",
  'window.addEventListener("wheel", suppressGameBrowserWheelDefault, browserMouseGuardOptions);',
  'app.canvas.addEventListener("contextmenu", suppressGameBrowserMouseDefault);'
]) {
  if (!mainSource.includes(fragment)) {
    errors.push(`Browser right-click suppression is missing fragment: ${fragment}`);
  }
}
for (const fragment of [
  "overscroll-behavior: none;",
  "touch-action: none;",
  "user-select: none;",
  "-webkit-user-select: none;",
  "-webkit-touch-callout: none;"
]) {
  if (!stylesSource.includes(fragment)) {
    errors.push(`Browser gesture suppression CSS is missing fragment: ${fragment}`);
  }
}
if (!ordersSource.includes("function issueRightMouseAttackOrder")) {
  errors.push("RightMouseAction attack mode is not explicitly implemented.");
}
if (!ordersSource.includes("function issueGroupQueueAttackTargetAtOrder")) {
  errors.push("Queued right-button attack mode does not expose a group queued attack-target helper.");
}
if (!ordersSource.includes("? issueGroupQueueAttackTargetAtOrder(world, unitIds, x, y, playerId)")) {
  errors.push("Queued right-button attack mode should try queued attack-target orders before attack-move fallback.");
}
if (!ordersSource.includes("issueQueueAttackOrder(world, unit.id, target.id)")) {
  errors.push("Queued right-button attack-target helper should enqueue attack-target orders.");
}
for (const fragment of [
  "function findSourceRightMouseFollowTargetAt",
  "const target = findSourceRightMouseFollowTargetAt(world, unit, x, y);",
  "const followTarget = findSourceRightMouseFollowTargetAt(world, unit, x, y);",
  "return issueFollowOrder(world, unit.id, target.id);",
  "return issueFollowOrder(world, unit.id, followTarget.id);",
  "arePlayersAllied(world, unit.player, target.player)",
  "target.player === 15",
  "canTargetFollow(unit, target, world)"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`RightMouseAction source follow behavior is missing fragment: ${fragment}`);
  }
}
if (!saveSource.includes("canTargetFollow(unit, target, world)")) {
  errors.push("Save/load follow-order validation should preserve source allied/neutral follow targets.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`RightMouseAction verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`RightMouseAction usage verified (${unitsWithActions.length} units, ${sourceActions.size} source actions).`);
