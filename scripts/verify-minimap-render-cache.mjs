import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { assertMinimapRuntimeSmoke } from "./lib/browser-runtime-smoke-assertions.mjs";

const source = readFileSync(new URL("../src/view/renderHud.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("renderHud.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const mainSourceFile = ts.createSourceFile("main.ts", mainSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
assert.equal(source.match(/document\.createElement\("canvas"\)/g)?.length, 1, "Minimap cache should allocate one canvas only in its creation path");
assert.equal(source.match(/Texture\.from\(rasterCanvas, true\)/g)?.length, 1, "Minimap cache should allocate one uncached canvas texture only in its creation path");
assert.equal(source.match(/new Sprite\(rasterTexture\)/g)?.length, 1, "Minimap cache should allocate one raster sprite only in its creation path");
assert.match(source, /cache\.rasterTexture\.source\.update\(\)/, "Minimap redraw should update the existing texture source after compositing");
assert.match(source, /terrainRevision: cache\.terrainRebuildCount/, "Terrain rebuilds must invalidate the raster even when the derived terrain key is unchanged");

function loadFunction(name) {
  const declaration = sourceFile.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration, `Expected renderHud.ts to define ${name}`);
  const javascript = ts.transpileModule(declaration.getText(sourceFile), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return Function(`${javascript}\nreturn ${name};`)();
}

function loadFunctions(names) {
  const declarations = names.map((name) => {
    const declaration = sourceFile.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    assert.ok(declaration, `Expected renderHud.ts to define ${name}`);
    return declaration.getText(sourceFile);
  });
  const javascript = ts.transpileModule(declarations.join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return Function(`${javascript}\nreturn { ${names.join(", ")} };`)();
}

function loadMinimapCacheLifecycle() {
  const cacheMapDeclaration = sourceFile.statements.find((statement) => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "minimapRenderCaches"));
  const createDeclaration = sourceFile.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "createMinimapRenderCache");
  const destroyDeclaration = sourceFile.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "destroyMinimapRenderCache");
  assert.ok(cacheMapDeclaration, "Expected the bounded minimap cache map");
  assert.ok(createDeclaration, "Expected the minimap cache creation helper");
  assert.ok(destroyDeclaration, "Expected an explicit minimap cache disposal API");
  const javascript = ts.transpileModule([
    cacheMapDeclaration.getText(sourceFile),
    createDeclaration.getText(sourceFile),
    destroyDeclaration.getText(sourceFile)
  ].join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return Function("exports", `${javascript}\nreturn { minimapRenderCaches, createMinimapRenderCache, destroyMinimapRenderCache };`)({});
}

const minimapTerrainCacheKey = loadFunction("minimapTerrainCacheKey");
const minimapTerrainNeedsRebuild = loadFunction("minimapTerrainNeedsRebuild");
const drawMinimapRaster = loadFunction("drawMinimapRaster");

class MockDisplayObject {
  parent = null;
  destroyCount = 0;
  destroyOptions = [];
  destroy(options = false) {
    this.destroyCount += 1;
    this.destroyOptions.push(options);
  }
}
class MockGraphics extends MockDisplayObject {
  handlers = new Map();
  on(name, handler) {
    const handlers = this.handlers.get(name) ?? [];
    handlers.push(handler);
    this.handlers.set(name, handlers);
    return this;
  }
}
class MockContainer extends MockDisplayObject {
  children = [];
  addChild(...children) {
    for (const child of children) {
      child.parent?.removeChild(child);
      child.parent = this;
    }
    this.children.push(...children);
    return children[0];
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parent = null;
    }
    return child;
  }
  destroy(options = false) {
    super.destroy(options);
    if (typeof options === "boolean" ? options : options?.children) {
      for (const child of [...this.children]) {
        this.removeChild(child);
        child.destroy(options);
      }
    }
  }
}
class MockPointerEvent {
  constructor(button, shiftKey) {
    this.button = button;
    this.shiftKey = shiftKey;
  }
}
class MockTexture {
  static from(canvas, skipCache) {
    assert.equal(skipCache, true);
    return new MockTexture(canvas);
  }
  constructor(canvas) {
    this.destroyCalls = [];
    this.sourceDestroyCount = 0;
    this.source = {
      resize: (width, height) => {
        canvas.width = width;
        canvas.height = height;
      },
      update: () => {}
    };
  }
  destroy(destroySource = false) {
    this.destroyCalls.push(destroySource);
    if (destroySource) {
      this.sourceDestroyCount += 1;
    }
  }
}
class MockSprite extends MockDisplayObject {
  constructor(texture) {
    super();
    this.texture = texture;
  }
}
const createdCanvases = [];
const mockDocument = {
  createElement(tag) {
    assert.equal(tag, "canvas");
    const context = { imageSmoothingEnabled: true };
    const canvas = {
      width: 0,
      height: 0,
      getContext(kind) {
        assert.equal(kind, "2d");
        return context;
      }
    };
    createdCanvases.push(canvas);
    return canvas;
  }
};
globalThis.Graphics = MockGraphics;
globalThis.Container = MockContainer;
globalThis.PointerEvent = MockPointerEvent;
globalThis.Texture = MockTexture;
globalThis.Sprite = MockSprite;
globalThis.document = mockDocument;

const { minimapRenderCaches, createMinimapRenderCache, destroyMinimapRenderCache } = loadMinimapCacheLifecycle();
const renderCache = createMinimapRenderCache(4, 3);
assert.equal(createdCanvases.length, 1);
assert.equal(renderCache.rasterCanvas.width, 4);
assert.equal(renderCache.rasterCanvas.height, 3);
assert.equal(renderCache.rasterContext.imageSmoothingEnabled, false);
assert.equal(renderCache.rasterCanvasCreateCount, 1);
assert.equal(renderCache.rasterTextureCreateCount, 1);
assert.equal(renderCache.rasterSpriteCreateCount, 1);
assert.equal(renderCache.visualRoot.children.length, 2);
assert.deepEqual(renderCache.visualRoot.children, [renderCache.rasterSprite, renderCache.dynamic]);
assert.equal(renderCache.visualRoot.children.includes(renderCache.hit), false);
assert.equal(renderCache.hit.handlers.get("pointerdown")?.length, 1);
assert.equal(renderCache.hit.handlers.get("pointermove")?.length, 1);
assert.equal(renderCache.pointerDownListenerCount, 1);
assert.equal(renderCache.pointerMoveListenerCount, 1);
const firstInteractionCalls = [];
renderCache.interaction = {
  world: { map: { width: 8, height: 6 } },
  ox: 10,
  oy: 20,
  scale: 2,
  onMinimapPoint: (...args) => firstInteractionCalls.push(args)
};
renderCache.hit.handlers.get("pointerdown")[0]({
  nativeEvent: new MockPointerEvent(2, true),
  button: 0,
  global: { x: 15, y: 25 }
});
assert.deepEqual(firstInteractionCalls, [[2, 2, { button: 2, shiftKey: true }]]);
const secondInteractionCalls = [];
renderCache.interaction = {
  world: { map: { width: 2, height: 2 } },
  ox: 0,
  oy: 0,
  scale: 1,
  onMinimapPoint: (...args) => secondInteractionCalls.push(args)
};
renderCache.hit.handlers.get("pointerdown")[0]({
  nativeEvent: new MockPointerEvent(0, false),
  button: 0,
  global: { x: 99, y: 99 }
});
assert.equal(renderCache.hit.handlers.get("pointerdown")?.length, 1, "Persistent hit target must not accumulate handlers");
assert.deepEqual(firstInteractionCalls, [[2, 2, { button: 2, shiftKey: true }]]);
assert.deepEqual(secondInteractionCalls, [[1, 1, { button: 0, shiftKey: false }]]);

const hudLayer = new MockContainer();
hudLayer.addChild(renderCache.visualRoot, renderCache.hit);
minimapRenderCaches.set(hudLayer, renderCache);
destroyMinimapRenderCache(hudLayer);
assert.equal(minimapRenderCaches.has(hudLayer), false, "Disposal must delete the bounded WeakMap entry");
assert.deepEqual(hudLayer.children, [], "Disposal must detach both persistent display roots");
assert.equal(renderCache.visualRoot.destroyCount, 1);
assert.equal(renderCache.rasterSprite.destroyCount, 1);
assert.equal(renderCache.dynamic.destroyCount, 1);
assert.equal(renderCache.hit.destroyCount, 1);
assert.deepEqual(renderCache.rasterTexture.destroyCalls, [true], "Disposal must deterministically destroy the TextureSource");
assert.equal(renderCache.rasterTexture.sourceDestroyCount, 1);
destroyMinimapRenderCache(hudLayer);
assert.equal(renderCache.visualRoot.destroyCount, 1, "Repeated disposal must be a no-op");
assert.equal(renderCache.hit.destroyCount, 1, "Repeated disposal must not double-destroy the hit target");
assert.deepEqual(renderCache.rasterTexture.destroyCalls, [true], "Repeated disposal must not double-destroy the texture source");
const replacementCache = createMinimapRenderCache(2, 2);
minimapRenderCaches.set(hudLayer, replacementCache);
assert.notEqual(replacementCache, renderCache, "A later render must be able to create a fresh cache");
assert.equal(minimapRenderCaches.get(hudLayer), replacementCache);

const cleanupDeclaration = mainSourceFile.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "cleanupBeforeExit");
assert.ok(cleanupDeclaration, "Expected a shared exit cleanup function");
const cleanupSource = cleanupDeclaration.getText(mainSourceFile);
assert.ok(cleanupSource.indexOf("saveCurrentAutosave()") >= 0, "Exit cleanup must preserve autosave behavior");
assert.ok(cleanupSource.indexOf("saveCurrentAutosave()") < cleanupSource.indexOf("destroyMinimapRenderCache(hudLayer)"), "Exit cleanup must save before destroying the HUD cache");
assert.match(mainSource, /window\.addEventListener\("beforeunload", cleanupBeforeExit\)/, "beforeunload must exercise shared teardown");
assert.match(mainSource, /window\.addEventListener\("pagehide", cleanupBeforeExit\)/, "pagehide must exercise shared teardown");

const tiles = [1, 1, 2, 2];
const tileset = { name: "forest", slots: [{ slot: 0, flags: ["land"] }, { slot: 16, flags: ["forest"] }] };
const world = {
  map: { path: "maps/example.pud", width: 2, height: 2 },
  tiles,
  terrainVersion: 3,
  tilesetTerrain: tileset,
  engineSettings: { minimapWithTerrainDefault: true }
};
const key = minimapTerrainCacheKey(world, 160, 160, 1.25, 0, 0);
for (const changed of [
  { ...world, map: { ...world.map, path: "maps/other.pud" } },
  { ...world, map: { ...world.map, width: 3 } },
  { ...world, terrainVersion: 4 },
  { ...world, engineSettings: { minimapWithTerrainDefault: false } },
  { ...world, tilesetTerrain: { ...tileset, name: "winter" } },
  { ...world, tilesetTerrain: { ...tileset, slots: [{ slot: 0, flags: ["water"] }] } }
]) {
  assert.notEqual(minimapTerrainCacheKey(changed, 160, 160, 1.25, 0, 0), key);
}
assert.notEqual(minimapTerrainCacheKey(world, 161, 160, 1.25, 0, 0), key);
assert.notEqual(minimapTerrainCacheKey(world, 160, 160, 1.5, 0, 0), key);
assert.notEqual(minimapTerrainCacheKey(world, 160, 160, 1.25, 0.5, 0), key);

const currentCache = { terrainWorld: world, terrainMap: world.map, terrainTiles: tiles, terrainTileset: tileset, terrainKey: key };
assert.equal(minimapTerrainNeedsRebuild(currentCache, world, key), false);
assert.equal(minimapTerrainNeedsRebuild({ ...currentCache, terrainWorld: { ...world } }, world, key), true);
assert.equal(minimapTerrainNeedsRebuild({ ...currentCache, terrainMap: { ...world.map } }, world, key), true);
assert.equal(minimapTerrainNeedsRebuild({ ...currentCache, terrainTiles: [...tiles] }, world, key), true);
assert.equal(minimapTerrainNeedsRebuild({ ...currentCache, terrainTileset: { ...tileset } }, world, key), true);
assert.equal(minimapTerrainNeedsRebuild(currentCache, world, `${key}:changed`), true);

const operations = [];
const rasterContext = {
  fillStyle: "",
  globalAlpha: 1,
  clearRect: (...rect) => operations.push(["clear", ...rect]),
  fillRect(...rect) {
    operations.push(["fill", this.fillStyle, this.globalAlpha, ...rect]);
  }
};
const composite = drawMinimapRaster(
  rasterContext,
  3,
  3,
  ["#111111", "#222222", "#333333", "#444444"],
  [0, 1, 0, 1],
  2,
  2,
  1.5,
  true,
  true,
  (_col, row) => row === 0 ? 0.4 : 0.6
);
assert.deepEqual(composite, { terrainTileCount: 4, fogTileCount: 2 });
assert.deepEqual(operations, [
  ["clear", 0, 0, 3, 3],
  ["fill", "#111111", 1, 0, 0, 2, 2],
  ["fill", "#000000", 0.4, 0, 0, 2, 2],
  ["fill", "#222222", 1, 1.5, 0, 2, 2],
  ["fill", "#333333", 1, 0, 1.5, 2, 2],
  ["fill", "#000000", 0.6, 0, 1.5, 2, 2],
  ["fill", "#444444", 1, 1.5, 1.5, 2, 2]
]);
assert.equal(rasterContext.globalAlpha, 1);

const fogOnlyOperations = [];
const fogOnlyContext = {
  fillStyle: "",
  globalAlpha: 1,
  clearRect: (...rect) => fogOnlyOperations.push(["clear", ...rect]),
  fillRect(...rect) {
    fogOnlyOperations.push(["fill", this.fillStyle, this.globalAlpha, ...rect]);
  }
};
assert.deepEqual(drawMinimapRaster(fogOnlyContext, 1, 1, [], [0], 1, 1, 1, false, true, () => 0.5), { terrainTileCount: 0, fogTileCount: 1 });
assert.deepEqual(fogOnlyOperations, [
  ["clear", 0, 0, 1, 1],
  ["fill", "#000000", 0.5, 0, 0, 1, 1]
]);

const cachedBrowserMinimap = {
  drawCount: 20,
  terrainRebuildCount: 1,
  terrainKeyChangeCount: 1,
  terrainKey: "maps/example.pud|2x2",
  terrainTileCount: 4,
  fogTileCount: 3,
  rasterWidth: 3,
  rasterHeight: 3,
  rasterCanvasCreateCount: 1,
  rasterTextureCreateCount: 1,
  rasterSpriteCreateCount: 1,
  rasterResizeCount: 0,
  rasterUpdateCount: 1,
  visualRootAttached: true,
  hitTargetAttached: true,
  visualRootIndex: 1,
  hitTargetIndex: 19,
  visualRootChildCount: 2,
  visualRootMinChildCount: 2,
  visualRootMaxChildCount: 2,
  hitTargetChildCount: 0,
  pointerDownListenerCount: 1,
  pointerMoveListenerCount: 1
};
const cachedBrowserFailures = [];
assertMinimapRuntimeSmoke(cachedBrowserMinimap, 4, cachedBrowserFailures);
assert.deepEqual(cachedBrowserFailures, [], "Browser smoke must accept reuse of an unchanged minimap raster");
const redrawEveryFrameFailures = [];
assertMinimapRuntimeSmoke({ ...cachedBrowserMinimap, rasterUpdateCount: cachedBrowserMinimap.drawCount }, 4, redrawEveryFrameFailures);
assert.ok(redrawEveryFrameFailures.some((failure) => failure.startsWith("minimap stable raster objects/updates:")), "Browser smoke must reject a raster upload on every unchanged HUD draw");
const missingInitialUploadFailures = [];
assertMinimapRuntimeSmoke({ ...cachedBrowserMinimap, rasterUpdateCount: 0 }, 4, missingInitialUploadFailures);
assert.ok(missingInitialUploadFailures.some((failure) => failure.startsWith("minimap stable raster objects/updates:")), "Browser smoke must require the initial minimap raster upload");

class LiteralRasterContext {
  fillStyle = "#000000";
  globalAlpha = 1;
  clearCount = 0;
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = Array.from({ length: width * height }, () => [0, 0, 0, 0]);
  }
  clearRect(x, y, width, height) {
    this.clearCount += 1;
    for (let py = y; py < y + height; py += 1) {
      for (let px = x; px < x + width; px += 1) {
        this.pixels[py * this.width + px] = [0, 0, 0, 0];
      }
    }
  }
  fillRect(x, y, width, height) {
    const source = literalHexColor(this.fillStyle);
    for (let py = y; py < y + height; py += 1) {
      for (let px = x; px < x + width; px += 1) {
        const index = py * this.width + px;
        const target = this.pixels[index];
        const alpha = this.globalAlpha;
        this.pixels[index] = [
          Math.round(source[0] * alpha + target[0] * (1 - alpha)),
          Math.round(source[1] * alpha + target[1] * (1 - alpha)),
          Math.round(source[2] * alpha + target[2] * (1 - alpha)),
          255
        ];
      }
    }
  }
  colors() {
    return this.pixels.map(([red, green, blue]) => `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`);
  }
}

function literalHexColor(value) {
  const hex = value.slice(1);
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

const { renderMinimapRasterIfNeeded } = loadFunctions([
  "drawMinimapRaster",
  "minimapRasterBufferMatches",
  "minimapRasterSnapshotMatches",
  "captureMinimapRasterSnapshot",
  "renderMinimapRasterIfNeeded"
]);
const literalContext = new LiteralRasterContext(3, 1);
let literalUploadCount = 0;
const literalCache = {
  rasterContext: literalContext,
  rasterTexture: { source: { update: () => { literalUploadCount += 1; } } },
  rasterSnapshot: null,
  rasterUpdateCount: 0,
  terrainTileCount: 0,
  fogTileCount: 0
};
const literalVisible = new Uint8Array([0, 0, 1]);
const literalExplored = new Uint8Array([0, 1, 1]);
const literalInput = {
  rasterWidth: 3,
  rasterHeight: 1,
  terrainColors: ["#804020", "#804020", "#804020"],
  visibleTiles: literalVisible,
  exploredTiles: literalExplored,
  mapWidth: 3,
  mapHeight: 1,
  scale: 1,
  terrainEnabled: true,
  fogEnabled: true,
  revealMapMode: "hidden",
  visibilityPlayer: 0,
  fogLevels: [0, 128, 255],
  terrainKey: "literal-map-v1",
  terrainRevision: 0,
  fogAlphaForTile: (col) => literalVisible[col] === 1 ? 0 : literalExplored[col] === 1 ? 0.5 : 1
};
assert.equal(renderMinimapRasterIfNeeded(literalCache, literalInput), true, "First HUD render must compose and upload the minimap raster");
assert.deepEqual(literalContext.colors(), ["#000000", "#402010", "#804020"], "HUD seam must preserve unseen black, explored dim, and visible terrain pixels");
assert.equal(literalUploadCount, 1);
assert.equal(literalCache.rasterUpdateCount, 1);
assert.equal(literalContext.clearCount, 1);
assert.equal(renderMinimapRasterIfNeeded(literalCache, literalInput), false, "Identical HUD inputs must reuse the existing minimap texture");
assert.deepEqual(literalContext.colors(), ["#000000", "#402010", "#804020"]);
assert.equal(literalUploadCount, 1, "Identical HUD inputs must not upload the texture again");
assert.equal(literalCache.rasterUpdateCount, 1);
assert.equal(literalContext.clearCount, 1, "Identical HUD inputs must not rerun raster composition");

literalVisible[0] = 1;
assert.equal(renderMinimapRasterIfNeeded(literalCache, literalInput), true, "Revealing a tile through the existing visibility buffer must redraw on the next HUD render");
assert.deepEqual(literalContext.colors(), ["#804020", "#402010", "#804020"]);
assert.equal(literalUploadCount, 2);
assert.equal(literalCache.rasterUpdateCount, 2);
literalVisible[0] = 0;
literalExplored[0] = 1;
assert.equal(renderMinimapRasterIfNeeded(literalCache, literalInput), true, "Refogging a revealed tile through mutated buffers must redraw on the next HUD render");
assert.deepEqual(literalContext.colors(), ["#402010", "#402010", "#804020"]);
assert.equal(literalUploadCount, 3);
assert.equal(literalCache.rasterUpdateCount, 3);

const playerSwitchedInput = {
  ...literalInput,
  visibilityPlayer: 1,
  fogAlphaForTile: () => 1
};
assert.equal(renderMinimapRasterIfNeeded(literalCache, playerSwitchedInput), true, "Changing the HUD visibility player must invalidate the minimap raster");
assert.deepEqual(literalContext.colors(), ["#000000", "#000000", "#804020"]);
assert.equal(literalUploadCount, 4);

const mapDimensionInput = {
  ...playerSwitchedInput,
  mapWidth: 2,
  terrainColors: ["#804020", "#804020"],
  fogAlphaForTile: () => 0
};
assert.equal(renderMinimapRasterIfNeeded(literalCache, mapDimensionInput), true, "Changing map dimensions must invalidate the minimap raster");
assert.deepEqual(literalContext.colors(), ["#804020", "#804020", "#000000"]);
assert.equal(literalUploadCount, 5);

const rasterSizeInput = { ...mapDimensionInput, rasterWidth: 2 };
assert.equal(renderMinimapRasterIfNeeded(literalCache, rasterSizeInput), true, "Changing the minimap raster size must invalidate its texture contents");
assert.deepEqual(literalContext.colors(), ["#804020", "#804020", "#000000"]);
assert.equal(literalUploadCount, 6);

const shortenedVisible = new Uint8Array([0, 1]);
const shortenedExplored = new Uint8Array([1, 1]);
const bufferLengthInput = {
  ...rasterSizeInput,
  visibleTiles: shortenedVisible,
  exploredTiles: shortenedExplored,
  fogAlphaForTile: (col) => shortenedVisible[col] === 1 ? 0 : 0.5
};
assert.equal(renderMinimapRasterIfNeeded(literalCache, bufferLengthInput), true, "Changing visibility buffer lengths must invalidate the minimap raster");
assert.deepEqual(literalContext.colors(), ["#402010", "#804020", "#000000"]);
assert.equal(literalUploadCount, 7);

const fogDisabledInput = { ...bufferLengthInput, fogEnabled: false };
assert.equal(renderMinimapRasterIfNeeded(literalCache, fogDisabledInput), true, "Changing fog mode must invalidate the minimap raster");
assert.deepEqual(literalContext.colors(), ["#804020", "#804020", "#000000"]);
assert.equal(literalUploadCount, 8);

const fogEnabledInput = { ...bufferLengthInput, fogEnabled: true };
assert.equal(renderMinimapRasterIfNeeded(literalCache, fogEnabledInput), true, "Re-enabling fog must restore exact legacy pixels");
assert.deepEqual(literalContext.colors(), ["#402010", "#804020", "#000000"]);
assert.equal(literalUploadCount, 9);

const fogLevelsInput = {
  ...fogEnabledInput,
  fogLevels: [64, 96, 255],
  fogAlphaForTile: (col) => shortenedVisible[col] === 1 ? 0 : 0.25
};
assert.equal(renderMinimapRasterIfNeeded(literalCache, fogLevelsInput), true, "Changing fog opacity levels must invalidate the minimap raster");
assert.deepEqual(literalContext.colors(), ["#603018", "#804020", "#000000"]);
assert.equal(literalUploadCount, 10);

const terrainKeyInput = {
  ...fogLevelsInput,
  terrainColors: ["#204080", "#204080"],
  terrainKey: "literal-map-v2"
};
assert.equal(renderMinimapRasterIfNeeded(literalCache, terrainKeyInput), true, "Changing the terrain cache key must invalidate the minimap raster");
assert.deepEqual(literalContext.colors(), ["#183060", "#204080", "#000000"]);
assert.equal(literalUploadCount, 11);

const terrainRevisionInput = {
  ...terrainKeyInput,
  terrainColors: ["#408020", "#408020"],
  terrainRevision: 1
};
assert.equal(renderMinimapRasterIfNeeded(literalCache, terrainRevisionInput), true, "Rebuilding terrain with the same key must invalidate the minimap raster");
assert.deepEqual(literalContext.colors(), ["#306018", "#408020", "#000000"]);
assert.equal(literalUploadCount, 12);

const terrainDisabledInput = { ...terrainRevisionInput, terrainEnabled: false };
assert.equal(renderMinimapRasterIfNeeded(literalCache, terrainDisabledInput), true, "Changing terrain mode must invalidate the minimap raster");
assert.deepEqual(literalContext.colors(), ["#000000", "#000000", "#000000"]);
assert.equal(literalUploadCount, 13);
assert.equal(renderMinimapRasterIfNeeded(literalCache, terrainDisabledInput), false, "A stable dirty-state result must be reused on the following HUD render");
assert.equal(literalUploadCount, 13);

const revealContext = new LiteralRasterContext(2, 1);
let revealUploadCount = 0;
const revealCache = {
  rasterContext: revealContext,
  rasterTexture: { source: { update: () => { revealUploadCount += 1; } } },
  rasterSnapshot: null,
  rasterUpdateCount: 0,
  terrainTileCount: 0,
  fogTileCount: 0
};
const revealVisible = new Uint8Array([0, 1]);
const revealExplored = new Uint8Array([0, 1]);
const hiddenRevealInput = {
  rasterWidth: 2,
  rasterHeight: 1,
  terrainColors: ["#804020", "#804020"],
  visibleTiles: revealVisible,
  exploredTiles: revealExplored,
  mapWidth: 2,
  mapHeight: 1,
  scale: 1,
  terrainEnabled: true,
  fogEnabled: true,
  revealMapMode: "hidden",
  visibilityPlayer: 0,
  fogLevels: [64, 96, 255],
  terrainKey: "reveal-map",
  terrainRevision: 0,
  fogAlphaForTile: (col) => revealVisible[col] === 1 ? 0 : revealExplored[col] === 1 ? 0.25 : 1
};
assert.equal(renderMinimapRasterIfNeeded(revealCache, hiddenRevealInput), true);
assert.deepEqual(revealContext.colors(), ["#000000", "#804020"]);
assert.equal(revealUploadCount, 1);

const showpathRevealInput = {
  ...hiddenRevealInput,
  revealMapMode: "known",
  fogAlphaForTile: (col) => revealVisible[col] === 1 ? 0 : 0.25
};
assert.equal(renderMinimapRasterIfNeeded(revealCache, showpathRevealInput), true, "Showpath's hidden-to-known reveal mode change must redraw once without buffer mutation");
assert.deepEqual(revealContext.colors(), ["#603018", "#804020"], "Known reveal mode must use the legacy known-tile fog pixels");
assert.equal(revealUploadCount, 2);
assert.equal(renderMinimapRasterIfNeeded(revealCache, showpathRevealInput), false, "Stable showpath reveal mode must reuse its texture");
assert.equal(revealUploadCount, 2);

const exploredRevealInput = { ...showpathRevealInput, revealMapMode: "explored" };
assert.equal(renderMinimapRasterIfNeeded(revealCache, exploredRevealInput), true, "Known-to-explored reveal mode changes must redraw exactly once");
assert.deepEqual(revealContext.colors(), ["#603018", "#804020"]);
assert.equal(revealUploadCount, 3);
assert.equal(renderMinimapRasterIfNeeded(revealCache, exploredRevealInput), false);
assert.equal(revealUploadCount, 3);

assert.equal(renderMinimapRasterIfNeeded(revealCache, hiddenRevealInput), true, "Returning to hidden reveal mode must restore unseen pixels in one redraw");
assert.deepEqual(revealContext.colors(), ["#000000", "#804020"]);
assert.equal(revealUploadCount, 4);
assert.equal(renderMinimapRasterIfNeeded(revealCache, hiddenRevealInput), false);
assert.equal(revealUploadCount, 4);

console.log("Minimap render cache invalidation, raster composition, interaction, and deterministic disposal verified.");
