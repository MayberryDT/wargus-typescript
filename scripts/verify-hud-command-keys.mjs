import { readFileSync } from "node:fs";

const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const hudCommandExecutionSource = readFileSync("src/view/hudCommandExecution.ts", "utf8");
const hudCommandKeySource = readFileSync("src/view/hudCommandKeys.ts", "utf8");

function normalizeHudKeyExpression(expression) {
  return expression
    .replace(/"([A-Z])"/g, '"Key$1"')
    .replace(/"Esc"/g, '"Escape"')
    .replace(/typeIds\.has\("unit-human-barracks"\)/g, "human")
    .replace(/selectedRace === "human"/g, "human")
    .replace(/human \?/g, "human ?")
    .trim();
}

const hudKeysByCommand = new Map();
for (const match of hudSource.matchAll(/commands\.push\(\{ id: "([^"]+)", key: ([^,}]+), label:/g)) {
  const [, commandId, keyExpression] = match;
  const keys = hudKeysByCommand.get(commandId) ?? new Set();
  keys.add(normalizeHudKeyExpression(keyExpression));
  hudKeysByCommand.set(commandId, keys);
}

const mapStart = hudCommandKeySource.indexOf("const codeByCommand");
const mapEnd = hudCommandKeySource.indexOf("return codeByCommand[command]", mapStart);
if (mapStart < 0 || mapEnd < 0) {
  console.error("Could not locate codeByCommand in src/view/hudCommandKeys.ts.");
  process.exit(1);
}

const dispatchKeysByCommand = new Map();
const mapSource = hudCommandKeySource.slice(mapStart, mapEnd);
for (const match of mapSource.matchAll(/"([^"]+)": ([^,\n]+)/g)) {
  const [, commandId, keyExpression] = match;
  dispatchKeysByCommand.set(commandId, keyExpression.trim());
}

const mismatches = [];
for (const [commandId, hudKeys] of [...hudKeysByCommand.entries()].sort()) {
  const dispatchKey = dispatchKeysByCommand.get(commandId);
  if (!dispatchKey) {
    continue;
  }
  const normalizedHudKeys = [...hudKeys].sort();
  if (!normalizedHudKeys.includes(dispatchKey)) {
    mismatches.push({ commandId, dispatchKey, hudKeys: normalizedHudKeys });
  }
}

if (!hudCommandExecutionSource.includes("hudCommandCode(command, selectedCommandRace(world, selectedUnitIds))")) {
  console.error("HUD command execution should delegate fallback key lookup to hudCommandCode.");
  process.exit(1);
}

if (mismatches.length > 0) {
  for (const mismatch of mismatches) {
    console.error(`${mismatch.commandId}: HUD ${mismatch.hudKeys.join(" | ")} dispatch ${mismatch.dispatchKey}`);
  }
  console.error(`HUD command key mismatches: ${mismatches.length}`);
  process.exit(1);
}

console.log(`HUD command key mappings verified (${hudKeysByCommand.size} HUD commands checked).`);
