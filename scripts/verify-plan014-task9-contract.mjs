import { existsSync, readFileSync } from "node:fs";

const runnerPath = "scripts/verify-browser-plan014-task9.mjs";
const failures = [];

function requireFile(path, label) {
  if (!existsSync(path)) {
    failures.push(`${label} is missing: ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function expectIncludes(label, source, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      failures.push(`${label} missing contract fragment: ${fragment}`);
    }
  }
}

function expectExcludes(label, source, fragments) {
  for (const fragment of fragments) {
    if (source.includes(fragment)) {
      failures.push(`${label} contains forbidden fragment: ${fragment}`);
    }
  }
}

const runner = requireFile(runnerPath, "Plan 014 Task 9 runner");
const packageSource = requireFile("package.json", "package manifest");
const hudSource = requireFile("src/view/renderHud.ts", "HUD source");
const mainSource = requireFile("src/main.ts", "browser smoke source");
const ordersSource = requireFile("src/simulation/orders.ts", "AI evidence source");

expectIncludes("package manifest", packageSource, [
  '"verify:browser-plan014-task9": "node scripts/verify-browser-plan014-task9.mjs"',
  '"verify:plan014-task9-contract": "node scripts/verify-plan014-task9-contract.mjs"'
]);

expectIncludes("Task 9 runner fixed scenario", runner, [
  'const DEMO_SEED = "ai-staged-pressure"',
  'const VIEWPORT = { width: 1280, height: 720 }',
  "const PAGE_LIMIT_MS = 25_000",
  "const SEGMENT_LIMIT_MS = 30_000",
  "WARGUS_PLAN014_TASK9_ARTIFACT_DIR",
  "WARGUS_PLAN014_TASK9_MAX_SEGMENTS",
  "assertArtifactDirectoryOutsideRepo",
  "--strictPort",
  '"preview"',
  "chromium.executablePath()",
  "process.env.CHROME_BIN",
  "chromium.launchServer",
  "browser.newContext",
  "storageState:",
  "context.storageState",
  "context.pages().length !== 1",
  "processTreePids",
  "stopExactPids",
  "isPortOpen",
  "port-clear"
]);

expectIncludes("Task 9 visible input", runner, [
  'page.keyboard.press("F10")',
  'page.keyboard.press("F11")',
  'page.keyboard.press("F12")',
  "page.mouse.click",
  '"game-options"',
  '"speed-options"',
  '"easier-ai"',
  '"harder-ai"',
  '"speed-options-ok"',
  '"toggle-pause"',
  '"slower-game"',
  '"faster-game"',
  '"build-basic-page"',
  '"source-build:unit-town-hall"',
  '"source-build:unit-farm"',
  '"source-build:unit-human-barracks"',
  '"source-train:unit-footman"',
  "menuButtonControls",
  "mapButtonControls",
  "commandButtons",
  "ownedUnitScreenPoints"
]);

expectIncludes("Task 9 checkpoint protocol", runner, [
  "wargus-ts-save-slot-v1-1",
  "readSaveSlot",
  "slotIdentity",
  "assertSlotIdentity",
  "assertLoadedCheckpoint",
  "saveAcceptedCheckpoint",
  "acceptedCheckpoint",
  "acceptedSegment",
  "storageStatePath",
  "candidateLedger",
  "checkpointTick",
  "visibilityPlayerUnitRecords",
  "sourceGameSpeedDefault",
  "visibilityPlayerResources",
  "paused === true",
  "Interrupted before accepted F11 save"
]);

expectIncludes("Task 9 M08/M09 evidence", runner, [
  "const DIFFICULTY_SEQUENCE = [1, 2, 3, 4, 5, 3]",
  "const EXPECTED_DIFFICULTY_FACTORS = new Map",
  "const EXPECTED_LAUNCH_SIZES = [1, 4, 16]",
  "difficulty 2 produced 1/3/15",
  "source-neutral difficulty 3",
  "pendingBuildOrders",
  "constructions",
  "productionQueues",
  "scoutDestinations",
  "visibilityPlayerDamagedUnits",
  "visibilityPlayerContactOrders",
  "averageUpdateMs",
  "averageRenderMs",
  "unmetMilestone"
]);

expectExcludes("Task 9 runner hidden mutation surface", runner, [
  "__WARGUS_TS_EXECUTE_HUD_COMMAND__",
  "__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__",
  "__WARGUS_TS_LOAD_MAP__",
  "__WARGUS_TS_RUN_",
  "executeMapCommand(",
  "executeHudCommand(",
  "localStorage.setItem",
  "localStorage.removeItem",
  "localStorage.clear",
  "pkill",
  "killall",
  "lsof -t",
  "fuser -k"
]);

expectIncludes("HUD rendered menu debug", hudSource, [
  "menuOverlay: HudMenuOverlayId | null",
  "menuButtonControls: Array<HudRect & {",
  "const MAX_MENU_BUTTON_CONTROLS = 64",
  "debug.menuOverlay = menu",
  "debug.menuButtonControls.push({",
  "id: button.command as HudMapCommandId",
  "disabled: button.disabled === true"
]);

expectIncludes("browser smoke checkpoint identity", mainSource, [
  "aiDifficulty: number | null",
  "tickRate: number | null",
  "tileSize: number | null",
  "visibilityPlayerUnitRecords: BrowserSmokeUnitRecord[]",
  "browserSmokeVisibilityPlayerUnitRecords()",
  "aiDifficulty: world?.engineSettings.lastDifficultyDefault ?? null"
]);

expectIncludes("AI contact evidence", ordersSource, [
  "visibilityPlayerDamagedUnits",
  "visibilityPlayerContactOrders",
  ".slice(0, 64)"
]);

if (failures.length > 0) {
  console.error(`Plan 014 Task 9 static contract failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Plan 014 Task 9 static contract verified (visible input, segmented save/load, bounded evidence, exact cleanup, no hidden mutation hooks).");
