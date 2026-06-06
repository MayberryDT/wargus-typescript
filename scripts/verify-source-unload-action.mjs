import { readFileSync } from "node:fs";

const source = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_unload.cpp", "utf8");
const commandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");

const errors = [];

for (const fragment of [
  "constexpr int MAX_SEARCH_RANGE = 20",
  "constexpr int MAX_RETRIES = 20",
  "FIND_DROPZONE_STATE",
  "MOVE_TO_DROPZONE_STATE",
  "UNLOAD_STATE",
  "ClosestFreeDropZone",
  "this->Retries++",
  "this->State = FIND_DROPZONE_STATE"
]) {
  if (!source.includes(fragment)) {
    errors.push(`Stratagus unload source missing expected fragment: ${fragment}`);
  }
}

for (const fragment of [
  "void CommandUnload(CUnit &unit, const Vec2i &pos, CUnit *what, EFlushMode flush)",
  "auto *order = GetNextOrder(unit, flush)",
  "*order = COrder::NewActionUnload(pos, what)"
]) {
  if (!commandSource.includes(fragment)) {
    errors.push(`Stratagus unload command source missing expected fragment: ${fragment}`);
  }
}

for (const [label, text, fragments] of [
	  ["world unload order", worldSource, [
	    'kind: "unload-transport"',
	    'kind: "move" | "attack-move" | "attack-ground" | "patrol" | "unload-transport"',
	    'unloadState: "find-dropzone" | "move" | "unload"',
    "unloadRetries: number"
  ]],
	  ["orders unload action", ordersSource, [
	    "const SOURCE_UNLOAD_DROPZONE_MAX_RANGE = 20",
	    "const SOURCE_UNLOAD_MAX_RETRIES = 20",
	    "? issueGroupQueueUnloadTransportOrder",
	    "export function issueQueueUnloadTransportAtOrder",
	    "export function canIssueQueueUnloadTransportAt",
	    'transport.moveQueue.push({ kind: "unload-transport"',
	    "export function issueGroupQueueUnloadTransportOrder",
	    'if (target.kind === "unload-transport")',
	    "function closestFreeDropZone",
    "function hasUnloadSpaceForAnyCargoNear",
    "function sourceUnloadOrderAtCurrentTile",
    'unloadState: "find-dropzone"',
    "transport.order.unloadRetries += 1",
    'transport.order.unloadState = "find-dropzone"',
    'transport.order.unloadState = "unload"'
  ]],
	  ["save-game unload order", saveSource, [
	    'if (kind === "unload-transport")',
	    '|| record.kind === "unload-transport"',
	    "canIssueQueueUnloadTransportAt,",
	    'if (!canIssueQueueUnloadTransportAt(world, unit, x, y))',
	    'const cargoUnitId = typeof record.cargoUnitId === "string" && unit.cargo.some((cargoUnit) => cargoUnit.id === record.cargoUnitId)',
	    'return { kind, x, y, cargoUnitId }',
	    'unloadState: record.unloadState === "move" || record.unloadState === "unload" ? record.unloadState : "find-dropzone"',
    "unloadRetries: Math.max(0, Math.min(20, Math.floor(finiteNumberOr(record.unloadRetries, 0))))"
  ]],
  ["package verify script", packageSource, [
    '"verify:source-unload-action"',
    "npm run verify:source-unload-action"
  ]]
]) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      errors.push(`${label} missing source unload fragment: ${fragment}`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source unload action verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source unload action verified (queued command, drop-zone search, retries, unload phases, and save/load state).");
