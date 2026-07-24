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
const pre30bPreferenceCommands = pre30bPreferences();

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
const frameSkipDown = preferenceControls.find((control) => control.id === "frame-skip-down");
assert.ok(fastPlus && ok, "Preferences must expose Fast + and OK controls.");
assert.ok(frameSkipDown, "Preferences must retain Frame -.");
assert.equal(fastPlus.disabled, false);
assert.equal(ok.disabled, false);
assert.equal(fastPlus.centerInsideViewport, true, `Fast + center is off-canvas: ${JSON.stringify(fastPlus)}`);
assert.equal(ok.fullyInsideViewport, true, `OK rect is not fully inside the viewport: ${JSON.stringify(ok)}`);
assert.deepEqual(
  preferenceControls.map((control) => control.id),
  pre30bPreferenceCommands,
  "Preferences command order must stay identical to the pre-30b control order."
);
for (let index = 0; index < pre30bPreferenceCommands.length; index += 1) {
  const command = pre30bPreferenceCommands[index];
  if (command === "preferences-ok") continue;
  const expected = flowRect(index, pre30bPreferenceCommands.length);
  const control = preferenceControls.find((candidate) => candidate.id === command);
  assert.ok(control, `Missing pre-existing Preferences control ${command}.`);
  assert.deepEqual(pickRect(control), expected, `${control.id} moved from its pre-30b rectangle.`);
}
assert.deepEqual(pickRect(frameSkipDown), flowRect(29, pre30bPreferenceCommands.length), "Frame - must remain at its pre-30b index-29 rectangle.");
for (const control of preferenceControls) {
  if (control.id === ok.id) continue;
  assert.equal(rectsOverlap(ok, control), false, `OK overlaps ${control.id}: ${JSON.stringify({ ok, control })}`);
}

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
  controls: { fastPlus, frameSkipDown, ok, resume },
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
  const layout = menuLayout(buttons.length);
  return buttons.slice(0, 64).map((button, index) => {
    const rect = button.command === "preferences-ok"
      ? { x: layout.x + layout.width + layout.gap, y: layout.y + layout.panelHeight - 34 - layout.gap, width: layout.buttonWidth, height: 34 }
      : flowRect(index, buttons.length);
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    return {
      ...rect,
      center,
      id: button.command,
      label: button.label,
      disabled: button.disabled === true,
      centerInsideViewport: pointInsideViewport(center),
      fullyInsideViewport: rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height
    };
  });
}

function flowRect(index, buttonCount) {
  const layout = menuLayout(buttonCount);
  return {
    x: layout.startX + (index % layout.columns) * (layout.buttonWidth + layout.gap),
    y: layout.startY + Math.floor(index / layout.columns) * layout.rowGap,
    width: layout.buttonWidth,
    height: 34
  };
}

function menuLayout(buttonCount) {
  const width = Math.min(460, Math.max(300, viewport.width - 40));
  const x = (viewport.width - width) / 2;
  const panelHeight = 362;
  const y = Math.max(32, (viewport.height - panelHeight) / 2);
  const buttonWidth = Math.min(132, Math.max(92, (width - 92) / 3));
  const gap = 16;
  const columns = Math.min(3, Math.max(1, buttonCount));
  const totalWidth = columns * buttonWidth + Math.max(0, columns - 1) * gap;
  const startX = x + (width - totalWidth) / 2;
  const rowGap = buttonCount > 12 ? 34 : 40;
  const startY = y + (buttonCount > 12 ? 210 : buttonCount > 3 ? 236 : 256);
  return {
    width,
    x,
    panelHeight,
    y,
    buttonWidth,
    gap,
    columns,
    startX,
    rowGap,
    startY
  };
}

function pointInsideViewport(point) {
  return point.x >= 0 && point.x < viewport.width && point.y >= 0 && point.y < viewport.height;
}

function pickRect(control) {
  return { x: control.x, y: control.y, width: control.width, height: control.height };
}

function rectsOverlap(left, right) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function pre30bPreferences() {
  return [
    "toggle-messages",
    "toggle-command-keys",
    "toggle-button-popups",
    "toggle-status-line-tooltips",
    "toggle-map-grid",
    "toggle-show-orders",
    "toggle-show-damage",
    "toggle-show-sight-range",
    "toggle-show-attack-range",
    "toggle-show-reaction-range",
    "toggle-single-player-walls",
    "toggle-highlight-passability",
    "toggle-minimap-terrain",
    "toggle-mine-notifications",
    "toggle-show-tips",
    "next-title-tip",
    "toggle-keyboard-scrolling",
    "toggle-mouse-scrolling",
    "cycle-group-keys",
    "key-scroll-speed-down",
    "key-scroll-speed-up",
    "mouse-scroll-speed-down",
    "mouse-scroll-speed-up",
    "mouse-pressed-scroll-speed-down",
    "mouse-pressed-scroll-speed-up",
    "mouse-control-scroll-speed-down",
    "mouse-control-scroll-speed-up",
    "fast-forward-cycle-down",
    "fast-forward-cycle-up",
    "frame-skip-down",
    "frame-skip-up",
    "toggle-formation-movement",
    "toggle-big-screen",
    "toggle-keep-ratio",
    "toggle-ally-deposits",
    "toggle-ai-dependencies",
    "toggle-ai-explores",
    "toggle-inside-mode",
    "edit-player-name",
    "toggle-fullscreen",
    "video-size-down",
    "video-size-up",
    "toggle-grab-mouse",
    "toggle-hardware-cursor",
    "toggle-icon-shift",
    "toggle-grayscale-icons",
    "toggle-video-shader",
    "cycle-viewport-mode",
    "toggle-right-button-action",
    "toggle-deselect-in-mine",
    "toggle-simplified-auto-targeting",
    "toggle-fancy-buildings",
    "toggle-enhanced-effects",
    "toggle-pause-on-leave",
    "toggle-leave-stop-scrolling",
    "toggle-training-queue",
    "cycle-selection-style",
    "double-click-delay-down",
    "double-click-delay-up",
    "hold-click-delay-down",
    "hold-click-delay-up",
    "preferences-ok",
    "preferences-cancel"
  ];
}
