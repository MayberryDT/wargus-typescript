import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = process.cwd();
const viewport = { width: 1280, height: 720 };
const require = createRequire(path.join(repo, "package.json"));
const ts = require("typescript");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith(".") || specifier.startsWith("/")) && context.parentURL) {
      const candidateUrl = new URL(specifier, context.parentURL);
      if (!path.extname(candidateUrl.pathname)) {
        for (const extension of [".ts", ".js", ".mjs"]) {
          const candidate = fileURLToPath(new URL(`${candidateUrl.href}${extension}`));
          if (existsSync(candidate)) {
            return { url: pathToFileURL(candidate).href, shortCircuit: true };
          }
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".ts")) {
      const source = readFileSync(fileURLToPath(url), "utf8");
      const outputText = ts.transpileModule(source, {
        fileName: fileURLToPath(url),
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          verbatimModuleSyntax: false
        }
      }).outputText;
      return { format: "module", source: outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  }
});

const { executeMapCommandForRuntime } = await import(pathToFileURL(path.join(repo, "src/view/mapCommands.ts")).href);
const { sourceIngameMapCommandForKey } = await import(pathToFileURL(path.join(repo, "src/view/sourceInput.ts")).href);
const { sourceMenuOverlayButtons } = await import(pathToFileURL(path.join(repo, "src/view/sourceUiHelpers.ts")).href);

const world = {
  engineSettings: { fastForwardCycleDefault: 0 },
  matchState: { status: "playing" }
};
const state = {
  paused: false,
  gameSpeed: 1,
  mapPicker: { open: false, query: "", maps: [] },
  menuOverlay: null,
  diplomacyDraft: null,
  preferencesDraft: null
};
const context = {
  manifest: { maps: [], titleTips: [] },
  activeMap: { path: "fixture" },
  world,
  saveCommandState: { activeSaveSlot: 1 },
  saveCommandContext: () => ({
    world,
    manifest: null,
    camera: { x: 0, y: 0, zoom: 1 },
    controlGroups: {},
    showStatus() {},
    async applyLoadedGame() {}
  }),
  state,
  addHudMessage() {},
  saveCurrentAutosave() {},
  syncAudioSettings() {},
  async loadPlayableMap() {}
};

const f8Command = sourceIngameMapCommandForKey({ code: "F8" });
assert.equal(f8Command, "preferences");
await executeMapCommandForRuntime(f8Command, context);
assert.deepEqual(runtimeState(), { paused: true, menuOverlay: "preferences", fastForwardCycleDefault: 0 });

const preferenceControls = sourceMenuControls("preferences");
const fastPlus = preferenceControls.find((control) => control.id === "fast-forward-cycle-up");
const ok = preferenceControls.find((control) => control.id === "preferences-ok");
assert.ok(fastPlus && ok, "Preferences must expose Fast + and OK controls.");
assert.equal(fastPlus.disabled, false);
assert.equal(ok.disabled, false);
assert.equal(fastPlus.centerInsideViewport, true, `Fast + center is off-canvas: ${JSON.stringify(fastPlus)}`);
assert.equal(ok.centerInsideViewport, true, `OK center is off-canvas: ${JSON.stringify(ok)}`);

for (let ordinal = 1; ordinal <= 16; ordinal += 1) {
  await executeMapCommandForRuntime(fastPlus.id, context);
}
assert.deepEqual(runtimeState(), { paused: true, menuOverlay: "preferences", fastForwardCycleDefault: 480 });

await executeMapCommandForRuntime(ok.id, context);
assert.deepEqual(runtimeState(), { paused: true, menuOverlay: "game-options", fastForwardCycleDefault: 480 });

const resume = sourceMenuControls("game-options").find((control) => control.id === "toggle-pause" && control.label === "Resume");
assert.ok(resume, "Game Options must expose Resume.");
assert.equal(resume.centerInsideViewport, true, `Resume center is off-canvas: ${JSON.stringify(resume)}`);
await executeMapCommandForRuntime(resume.id, context);
assert.deepEqual(runtimeState(), { paused: false, menuOverlay: null, fastForwardCycleDefault: 480 });

console.log(JSON.stringify({
  pid: process.pid,
  sequence: ["F8", "Fast + ×16", "OK", "Game Options: Resume"],
  controls: { fastPlus, ok, resume },
  final: runtimeState()
}, null, 2));

function runtimeState() {
  return {
    paused: state.paused,
    menuOverlay: state.menuOverlay,
    fastForwardCycleDefault: world.engineSettings.fastForwardCycleDefault
  };
}

function sourceMenuControls(menu) {
  const buttons = sourceMenuOverlayButtons(menu, world, null);
  const width = Math.min(460, Math.max(300, viewport.width - 40));
  const x = (viewport.width - width) / 2;
  const panelHeight = 362;
  const y = Math.max(32, (viewport.height - panelHeight) / 2);
  const buttonWidth = Math.min(132, Math.max(92, (width - 92) / 3));
  const gap = 16;
  const columns = Math.min(3, Math.max(1, buttons.length));
  const totalWidth = columns * buttonWidth + Math.max(0, columns - 1) * gap;
  const startX = x + (width - totalWidth) / 2;
  const rowGap = buttons.length > 12 ? 34 : 40;
  const startY = y + (buttons.length > 12 ? 210 : buttons.length > 3 ? 236 : 256);
  return buttons.slice(0, 64).map((button, index) => {
    const rect = {
      x: startX + (index % columns) * (buttonWidth + gap),
      y: startY + Math.floor(index / columns) * rowGap,
      width: buttonWidth,
      height: 34
    };
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    return {
      ...rect,
      center,
      id: button.command,
      label: button.label,
      disabled: button.disabled === true,
      centerInsideViewport: center.x >= 0 && center.x < viewport.width && center.y >= 0 && center.y < viewport.height
    };
  });
}
