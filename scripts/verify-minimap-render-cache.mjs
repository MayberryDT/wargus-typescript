import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/view/renderHud.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("renderHud.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const mainSourceFile = ts.createSourceFile("main.ts", mainSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
assert.equal(source.match(/document\.createElement\("canvas"\)/g)?.length, 1, "Minimap cache should allocate one canvas only in its creation path");
assert.equal(source.match(/Texture\.from\(rasterCanvas, true\)/g)?.length, 1, "Minimap cache should allocate one uncached canvas texture only in its creation path");
assert.equal(source.match(/new Sprite\(rasterTexture\)/g)?.length, 1, "Minimap cache should allocate one raster sprite only in its creation path");
assert.match(source, /cache\.rasterTexture\.source\.update\(\)/, "Minimap redraw should update the existing texture source after compositing");

function loadFunction(name) {
  const declaration = sourceFile.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration, `Expected renderHud.ts to define ${name}`);
  const javascript = ts.transpileModule(declaration.getText(sourceFile), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return Function(`${javascript}\nreturn ${name};`)();
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

console.log("Minimap render cache invalidation, raster composition, interaction, and deterministic disposal verified.");
