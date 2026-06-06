import { readFileSync } from "node:fs";

const sourceRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus-local/share/games/stratagus/wargus";
const saveMenuSource = readFileSync(`${sourceRoot}/scripts/menus/save.lua`, "utf8");
const loadMenuSource = readFileSync(`${sourceRoot}/scripts/menus/load.lua`, "utf8");
const renderHudSource = readFileSync("src/view/renderHud.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const sourceUiHelpersSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const errors = [];

function expectIncludes(label, source, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      errors.push(`${label} missing save/load menu fragment: ${fragment}`);
    }
  }
}

expectIncludes("Wargus save.lua", saveMenuSource, [
  "function RunSaveMenu(isreturn)",
  "menu:resize(384, 256)",
  "menu:addLabel(_(\"Save Game\"), 384 / 2, 11)",
  "menu:addTextInputField(\"game.sav\"",
  "menu:addBrowser(\"~save\", \".sav.gz$\"",
  "menu:addHalfButton(_(\"~!Save\"), \"s\"",
  "menu:addHalfButton(_(\"Cancel (~<Esc~>)\"), \"escape\""
]);

expectIncludes("Wargus load.lua", loadMenuSource, [
  "function AddLoadGameItems(menu)",
  "menu:addLabel(_(\"Load Game\"), 384 / 2, 11)",
  "menu:addBrowser(\"~save\", \"^.*%.sav%.?g?z?$\"",
  "function RunGameLoadGameMenu()",
  "menu:resize(384, 256)",
  "menu.ingame = true",
  "menu:addHalfButton(_(\"~!Load\"), \"l\"",
  "menu:addHalfButton(_(\"Cancel (~<Esc~>)\"), \"escape\""
]);

expectIncludes("browser HUD menu type", renderHudSource, [
  "\"save-menu\"",
  "\"load-menu\"",
  "export type HudMenuOverlayId"
]);

expectIncludes("browser source UI helpers", sourceUiHelpersSource, [
  "case \"save-menu\":",
  "return \"Save Game\"",
  "case \"load-menu\":",
  "return \"Load Game\"",
  "if (menu === \"save-menu\")",
  "if (menu === \"load-menu\")",
  "{ label: \"Save\", command: \"save-game\" }",
  "{ label: \"Load\", command: \"load-game\" }",
  "{ label: \"Export\", command: \"export-save\" }",
  "{ label: \"Import\", command: \"import-save\" }",
  "{ label: \"Autosave\", command: \"load-autosave\" }",
  "{ label: \"Save\", command: \"save-menu\" }",
  "{ label: \"Load\", command: \"load-menu\" }"
]);

expectIncludes("browser map commands", mapCommandsSource, [
  "if (command === \"save-menu\")",
  "if (command === \"load-menu\")",
  "context.state.menuOverlay = \"save-menu\"",
  "context.state.menuOverlay = \"load-menu\"",
  "saveCurrentGame(context.saveCommandState, context.saveCommandContext())",
  "await loadCurrentSaveSlot(context.saveCommandState, context.saveCommandContext())",
  "exportSaveToFile(context.saveCommandState, context.saveCommandContext())",
  "await importSaveFromFile(context.saveCommandState, context.saveCommandContext())"
]);

if (!packageSource.includes("\"verify:source-save-load-menus\"")) {
  errors.push("package.json missing verify:source-save-load-menus script.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source save/load menu verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source save/load menus verified (Wargus Save/Load panels mirrored by browser-native slot overlays).");
