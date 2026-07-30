import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import ts from "typescript";

const cacheSource = readFileSync(new URL("../src/view/worldRenderCache.ts", import.meta.url), "utf8");
const rendererSource = readFileSync(new URL("../src/view/renderWorld.ts", import.meta.url), "utf8");
const trackerSource = readFileSync(new URL("../src/performance/displayObjectPerformance.ts", import.meta.url), "utf8");
const trackedPixiConstructors = new Set(["Container", "Graphics", "Sprite", "Text", "BitmapText"]);
const assertNoDirectPixiConstruction = (source, fileName) => {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const localConstructors = [];
  const namespaces = [];
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "pixi.js") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (trackedPixiConstructors.has(imported)) localConstructors.push(element.name.text);
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.push(bindings.name.text);
    }
  }
  for (const name of localConstructors) {
    assert.doesNotMatch(source, new RegExp(`new\\s+${name}\\s*\\(`), `${fileName} must not directly construct imported Pixi ${name}`);
  }
  for (const namespace of namespaces) {
    assert.doesNotMatch(source, new RegExp(`new\\s+${namespace}\\s*\\.\\s*(?:Container|Graphics|Sprite|Text|BitmapText)\\s*\\(`), `${fileName} must not directly construct qualified Pixi objects through ${namespace}`);
  }
  assert.doesNotMatch(source, /\.destroy\s*\(/, `${fileName} must not bypass tracked destruction`);
};
assertNoDirectPixiConstruction(cacheSource, "worldRenderCache.ts");
assertNoDirectPixiConstruction(rendererSource, "renderWorld.ts");
assert.match(rendererSource, /drawUnits\(unitLayer,/, "Primary viewport must reconcile retained unit records");
assert.match(rendererSource, /drawUnits\(renderer\.unitLayer,/, "Secondary viewports must own independent retained unit records");
assert.match(rendererSource, /disposeRetainedWorldRenderCache\(renderers\[rendererIndex\]\.unitLayer\)/, "Closed secondary viewports must dispose their exact cache owner");
assert.match(rendererSource, /shapeKeyOf: \(unit\) => unitRenderShapeKey\(/, "Unit records must recreate only from an explicit complete child-shape key");
assert.match(rendererSource, /beginRetainedUnitRender\(record\)[\s\S]*finishRetainedUnitRender\(record\)/, "Changed units must update reusable child slots in one bounded render pass");
assert.doesNotMatch(rendererSource, /destroyLayerChildren\(record\.root\)/, "Visual-state updates must not destroy retained unit children");
assert.match(rendererSource, /takeRetainedRenderSlot\(objects, "graphics"/, "Retained unit graphics must clear and reuse their stable identity");
assert.match(rendererSource, /takeRetainedRenderSlot\(objects, "sprites"/, "Retained unit sprites must update texture without recreation");
assert.match(rendererSource, /takeRetainedRenderSlot\(objects, "texts"/, "Retained unit text must update content without recreation");
assert.match(rendererSource, /retainedSceneOrder\(records, \(record\) => record\.root, \(record\) => record\.unitObjects\.graphics\)/, "Unit painter order must flatten roots before graphics overlays");
assert.match(rendererSource, /const root = createWorldRenderRecordRoot\(\);\s*retainedWorldDisplayRoots\.add\(root\)/, "Every retained unit root must register before immediate-layer cleanup");
assert.match(rendererSource, /const graphics = createTrackedGraphics\(\);\s*retainedWorldDisplayRoots\.add\(graphics\)/, "Every flattened retained Graphics overlay must register before immediate-layer cleanup");
assert.match(rendererSource, /if \(!\(child instanceof Container \&\& retainedWorldDisplayRoots\.has\(child\)\)\) \{\s*destroyImmediateWorldDisplayObject\(child, \{ children: true \}\);\s*\}/, "Immediate-layer cleanup must preserve registered retained objects and destroy only immediate objects");
assert.match(rendererSource, /replaceWorldRenderCacheOwner\(existing, world, detachRetainedWorldDisplayRecord, destroyRetainedWorldDisplayRecord\)/, "Production cache lookup must execute world-owner replacement disposal");
assert.match(rendererSource, /function unitRenderSignature[\s\S]*sourceDeclaredReactionRangeForUnit\(world, unit\)/, "Unit signature must include the live AI/person reaction-range dependency");
assert.equal((rendererSource.match(/kind: "lastSeenBuilding"/g) ?? []).length, 1, "Last-seen buildings must reconcile exactly once for both draw strata");
assert.match(rendererSource, /kind: "lastSeenBuilding"[\s\S]*liveKeys: new Set\(world\.lastSeenBuildings\.map\(\(building\) => building\.unitId\)\)[\s\S]*keyOf: \(building\) => building\.unitId/, "Last-seen building lifecycle must use stable unitId keys");
assert.match(rendererSource, /shapeKeyOf: \(building\) => unitAtlases\.has\(building\.typeId\) \? "last-seen-sprite-v1" : "last-seen-graphics-v1"/, "Last-seen records must distinguish sprite and fallback child shapes");
assert.match(rendererSource, /function drawLastSeenBuildingVisual[\s\S]*takeLastSeenBuildingSprite[\s\S]*takeLastSeenBuildingGraphics/, "Last-seen visuals must update retained Sprite and Graphics slots");
assert.match(rendererSource, /function takeLastSeenBuildingGraphics[\s\S]*retainedWorldDisplayRoots\.add\(graphics\)/, "Last-seen fallback Graphics must register for immediate-layer preservation");
assert.match(rendererSource, /disposeRetainedWorldRenderCache\(layer: Container\)[\s\S]*retainedLastSeenBuildings\.delete\(layer\)/, "Exact cache disposal must clear the last-seen prepared-list memo");

const sourceFile = ts.createSourceFile("worldRenderCache.ts", cacheSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const executableSource = sourceFile.statements
  .filter((statement) => !ts.isImportDeclaration(statement) && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement))
  .map((statement) => statement.getText(sourceFile))
  .join("\n");
const javascript = ts.transpileModule(executableSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;
const load = Function("exports", `${javascript}\nreturn { beginRetainedRenderSlots, createRetainedRenderSlots, createWorldRenderCache, disposeWorldRenderCache, finishRetainedRenderSlots, planWorldRenderReconciliation, reconcileWorldRenderKind, replaceWorldRenderCacheOwner, retainedSceneOrder, takeRetainedRenderSlot };`);
const { beginRetainedRenderSlots, createRetainedRenderSlots, createWorldRenderCache, disposeWorldRenderCache, finishRetainedRenderSlots, planWorldRenderReconciliation, reconcileWorldRenderKind, replaceWorldRenderCacheOwner, retainedSceneOrder, takeRetainedRenderSlot } = load({});

const rendererFile = ts.createSourceFile("renderWorld.ts", rendererSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const retainedLastSeenFunctionNames = new Set([
  "drawLastSeenBuildings",
  "drawLastSeenBuildingVisual",
  "takeLastSeenBuildingGraphics",
  "takeLastSeenBuildingSprite"
]);
const retainedLastSeenExecutable = rendererFile.statements
  .filter((statement) => ts.isFunctionDeclaration(statement) && statement.name && retainedLastSeenFunctionNames.has(statement.name.text))
  .map((statement) => statement.getText(rendererFile))
  .join("\n");
assert.equal((retainedLastSeenExecutable.match(/function /g) ?? []).length, retainedLastSeenFunctionNames.size, "Executable fixture must load every production last-seen renderer function");
const retainedLastSeenJavascript = ts.transpileModule(retainedLastSeenExecutable, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;
const loadRetainedLastSeenRenderer = Function(
  "dependencies",
  `const { ${[
    "beginRetainedUnitRender", "circleIntersectsViewport", "compareLastSeenBuildingDrawOrder", "createRetainedWorldDisplayRecord",
    "createTrackedGraphics", "createTrackedSprite", "detachRetainedWorldDisplayRecord", "destroyRetainedWorldDisplayRecord",
    "finishRetainedUnitRender", "getFrameTexture", "getLastSeenBuildingFrameNumber", "isLastSeenBuildingVisible",
    "reconcileWorldRenderKind", "retainedLastSeenBuildings", "retainedRenderResourceId", "retainedSceneOrder",
    "retainedWorldDisplayRoots", "retainedWorldRenderCacheFor", "sourceLastSeenFancyBuildingMirror", "spriteDirectionForFacing",
    "takeRetainedRenderSlot"
  ].join(", ")} } = dependencies;\n${retainedLastSeenJavascript}\nreturn { drawLastSeenBuildings };`
);

const trackerFile = ts.createSourceFile("displayObjectPerformance.ts", trackerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const trackerExecutable = trackerFile.statements
  .filter((statement) => !ts.isImportDeclaration(statement) && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement))
  .map((statement) => statement.getText(trackerFile))
  .join("\n");
const trackerJavascript = ts.transpileModule(trackerExecutable, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;
const loadTracker = Function("exports", "Container", "Graphics", "Sprite", "Text", `${trackerJavascript}\nreturn { createTrackedContainer, createTrackedGraphics, createTrackedSprite, createTrackedText, destroyTrackedDisplayObject, resetDisplayObjectPerformance, setDisplayObjectPerformanceCapture, snapshotDisplayObjectPerformance };`);
const tracked = loadTracker({}, Container, Graphics, Sprite, Text);

tracked.resetDisplayObjectPerformance();
tracked.setDisplayObjectPerformanceCapture(true);
const createPixiRecord = () => ({ root: tracked.createTrackedContainer(), slots: createRetainedRenderSlots() });
const renderPixiRecord = (record, frame) => {
  record.root.removeChildren();
  beginRetainedRenderSlots(record.slots);
  const graphics = takeRetainedRenderSlot(
    record.slots,
    "graphics",
    () => tracked.createTrackedGraphics(),
    (value) => value.clear()
  );
  graphics.rect(frame, frame, 8, 8);
  graphics.fill(0xffffff);
  const texture = frame % 2 === 0 ? Texture.EMPTY : Texture.WHITE;
  const sprite = takeRetainedRenderSlot(
    record.slots,
    "sprites",
    () => tracked.createTrackedSprite(texture),
    (value) => { value.texture = texture; }
  );
  sprite.position.set(frame, frame + 1);
  const text = takeRetainedRenderSlot(
    record.slots,
    "texts",
    () => tracked.createTrackedText({ text: String(frame), style: { fontSize: 12 } }),
    (value) => { value.text = String(frame); }
  );
  text.position.set(frame + 2, frame + 3);
  finishRetainedRenderSlots(record.slots);
  record.root.addChild(sprite, text, graphics);
  return { graphics, sprite, text };
};
const pixiA = createPixiRecord();
const pixiB = createPixiRecord();
const pixiAFirst = renderPixiRecord(pixiA, 0);
const pixiBFirst = renderPixiRecord(pixiB, 0);
assert.notEqual(pixiAFirst.graphics, pixiBFirst.graphics, "Independent views must not share mutable Pixi objects");
assert.equal(tracked.snapshotDisplayObjectPerformance().trackedCreated, 8, "Two unit records must track root plus graphics, sprite, and text creation");
for (let frame = 1; frame <= 300; frame += 1) {
  const currentA = renderPixiRecord(pixiA, frame);
  const currentB = renderPixiRecord(pixiB, frame);
  assert.equal(currentA.graphics, pixiAFirst.graphics, "Unit Graphics identity must remain stable while geometry changes");
  assert.equal(currentA.sprite, pixiAFirst.sprite, "Unit Sprite identity must remain stable while texture and transform change");
  assert.equal(currentA.text, pixiAFirst.text, "Unit Text identity must remain stable while content and transform change");
  assert.equal(currentB.graphics, pixiBFirst.graphics, "Split-view Graphics identity must remain stable");
}
assert.equal(tracked.snapshotDisplayObjectPerformance().trackedCreated, 8, "300 changed frames must create zero additional tracked unit display objects");
assert.equal(pixiAFirst.sprite.texture, Texture.EMPTY, "Retained sprite texture must reflect the latest frame");
assert.equal(pixiAFirst.text.text, "300", "Retained text must reflect the latest frame");
assert.deepEqual(
  retainedSceneOrder([pixiA, pixiB], (record) => record.root, (record) => record.slots.graphics),
  [pixiA.root, pixiB.root, pixiAFirst.graphics, pixiBFirst.graphics],
  "Accepted painter order must place all prepared unit roots before all graphics overlays"
);
beginRetainedRenderSlots(pixiA.slots);
takeRetainedRenderSlot(pixiA.slots, "graphics", () => assert.fail("Existing graphics must be reused"), (value) => value.clear());
assert.throws(() => finishRetainedRenderSlots(pixiA.slots), /shape mismatch/i, "Incomplete child reset must fail closed");
renderPixiRecord(pixiA, 300);
for (const record of [pixiA, pixiB]) {
  record.root.removeChildren();
  for (const object of [...record.slots.graphics, ...record.slots.sprites, ...record.slots.texts]) tracked.destroyTrackedDisplayObject(object, { children: true });
  tracked.destroyTrackedDisplayObject(record.root, { children: true });
}
assert.deepEqual(tracked.snapshotDisplayObjectPerformance(), {
  scope: "instrumented-pixi-scene-objects-textures-excluded", captureActive: true, trackedCreated: 8, trackedDestroyed: 8, windowLiveDelta: 0
}, "Tracked retained record disposal must return exact tree counts to zero");
tracked.setDisplayObjectPerformanceCapture(false);

tracked.resetDisplayObjectPerformance();
tracked.setDisplayObjectPerformanceCapture(true);
const productionWorld = {};
const productionCacheA = createWorldRenderCache(productionWorld);
const productionCacheB = createWorldRenderCache(productionWorld);
const productionLayerA = new Container();
const productionLayerB = new Container();
const detachPixiRecord = (record) => {
  record.root.removeFromParent();
  for (const graphics of record.slots.graphics) graphics.removeFromParent();
};
const destroyPixiRecord = (record) => {
  detachPixiRecord(record);
  record.root.removeChildren();
  for (const object of [...record.slots.graphics, ...record.slots.sprites, ...record.slots.texts]) tracked.destroyTrackedDisplayObject(object, { children: true });
  tracked.destroyTrackedDisplayObject(record.root, { children: true });
};
const productionOptions = (cache, layer, items, liveKeys, worldIdentity = productionWorld) => ({
  cache,
  worldIdentity,
  kind: "unit",
  items,
  liveKeys,
  keyOf: (item) => item.key,
  shapeKeyOf: (item) => item.shape,
  create: () => ({ ...createPixiRecord(), signature: null }),
  update: (record, item) => {
    if (record.signature === item.signature) return;
    renderPixiRecord(record, item.frame);
    record.signature = item.signature;
  },
  attach: (record) => layer.addChild(record.root),
  detach: detachPixiRecord,
  destroy: destroyPixiRecord,
  reorder: (records) => {
    for (const object of retainedSceneOrder(records, (record) => record.root, (record) => record.slots.graphics)) layer.addChild(object);
  }
});
const stableUnit = { key: "u1", shape: "unit-record-v1", signature: "stable", frame: 0 };
const firstProductionA = reconcileWorldRenderKind(productionOptions(productionCacheA, productionLayerA, [stableUnit], new Set(["u1"]))).records[0].value;
const firstProductionB = reconcileWorldRenderKind(productionOptions(productionCacheB, productionLayerB, [stableUnit], new Set(["u1"]))).records[0].value;
assert.notEqual(firstProductionA.root, firstProductionB.root, "Primary and split reconciliation must create independent roots for the same world ID");
assert.deepEqual(productionLayerA.children, [firstProductionA.root, firstProductionA.slots.graphics[0]], "Production reconciliation must install root then graphics overlay");
assert.deepEqual(firstProductionA.root.children, [firstProductionA.slots.sprites[0], firstProductionA.slots.texts[0]], "Flattening must preserve nested Sprite/Text ownership");
for (let frame = 0; frame < 300; frame += 1) {
  productionLayerA.removeChildren();
  productionLayerB.removeChildren();
  const stableA = reconcileWorldRenderKind(productionOptions(productionCacheA, productionLayerA, [stableUnit], new Set(["u1"]))).records[0].value;
  const stableB = reconcileWorldRenderKind(productionOptions(productionCacheB, productionLayerB, [stableUnit], new Set(["u1"]))).records[0].value;
  assert.equal(stableA.root, firstProductionA.root);
  assert.equal(stableA.slots.graphics[0], firstProductionA.slots.graphics[0]);
  assert.equal(stableA.slots.sprites[0], firstProductionA.slots.sprites[0]);
  assert.equal(stableA.slots.texts[0], firstProductionA.slots.texts[0]);
  assert.equal(stableB.root, firstProductionB.root);
}
assert.equal(tracked.snapshotDisplayObjectPerformance().trackedCreated, 8, "Production reconciliation must create zero display objects across 300 unchanged primary/split frames");
productionLayerA.removeChildren();
const cullActions = reconcileWorldRenderKind(productionOptions(productionCacheA, productionLayerA, [], new Set(["u1"]))).actions;
assert.ok(cullActions.some(({ type, key }) => type === "detach" && key === "u1"));
assert.deepEqual(firstProductionA.root.children, [firstProductionA.slots.sprites[0], firstProductionA.slots.texts[0]], "Cull detach must preserve nested retained children");
const reenteredProductionA = reconcileWorldRenderKind(productionOptions(productionCacheA, productionLayerA, [stableUnit], new Set(["u1"]))).records[0].value;
assert.equal(reenteredProductionA.root, firstProductionA.root, "Unchanged dormant re-entry must retain root identity");
assert.deepEqual(reenteredProductionA.root.children, [firstProductionA.slots.sprites[0], firstProductionA.slots.texts[0]], "Unchanged dormant re-entry must restore the complete unit visual");
assert.deepEqual(productionLayerA.children, [firstProductionA.root, firstProductionA.slots.graphics[0]], "Dormant re-entry must restore accepted painter order");
const replacementWorld = {};
const replacementCache = replaceWorldRenderCacheOwner(productionCacheA, replacementWorld, detachPixiRecord, destroyPixiRecord);
assert.equal(replacementCache.worldIdentity, replacementWorld, "World replacement must install the exact new owner");
assert.equal(firstProductionA.root.destroyed, true, "World replacement must synchronously destroy the old same-key record");
const replacementLayer = new Container();
const replacementRecord = reconcileWorldRenderKind(productionOptions(replacementCache, replacementLayer, [stableUnit], new Set(["u1"]), replacementWorld)).records[0].value;
assert.notEqual(replacementRecord.root, firstProductionA.root, "Same stable ID after world replacement must create a new record identity");
disposeWorldRenderCache(replacementCache, detachPixiRecord, destroyPixiRecord);
disposeWorldRenderCache(productionCacheB, detachPixiRecord, destroyPixiRecord);
assert.deepEqual(tracked.snapshotDisplayObjectPerformance(), {
  scope: "instrumented-pixi-scene-objects-textures-excluded", captureActive: true, trackedCreated: 12, trackedDestroyed: 12, windowLiveDelta: 0
}, "Production world replacement and split closure disposal must return exact tracked counts to zero");
tracked.setDisplayObjectPerformanceCapture(false);

tracked.resetDisplayObjectPerformance();
tracked.setDisplayObjectPerformanceCapture(true);
const lastSeenPrepared = new WeakMap();
const lastSeenRoots = new WeakSet();
const lastSeenCaches = new WeakMap();
const lastSeenResources = new WeakMap();
let nextLastSeenResourceId = 1;
let lastSeenReconciliations = 0;
let currentLastSeenFrame = 0;
const createLastSeenRecord = () => {
  const root = tracked.createTrackedContainer();
  lastSeenRoots.add(root);
  return { root, signature: "", unitAtlases: null, unitObjects: createRetainedRenderSlots() };
};
const detachLastSeenRecord = (record) => {
  record.root.removeFromParent();
  for (const graphics of record.unitObjects.graphics) graphics.removeFromParent();
};
const destroyLastSeenRecord = (record) => {
  detachLastSeenRecord(record);
  record.root.removeChildren();
  for (const object of [...record.unitObjects.graphics, ...record.unitObjects.sprites, ...record.unitObjects.texts]) {
    tracked.destroyTrackedDisplayObject(object, { children: true });
  }
  tracked.destroyTrackedDisplayObject(record.root, { children: true });
};
const lastSeenCacheFor = (layer, world) => {
  const existing = lastSeenCaches.get(layer);
  const owned = replaceWorldRenderCacheOwner(existing, world, detachLastSeenRecord, destroyLastSeenRecord);
  if (owned !== existing) lastSeenCaches.set(layer, owned);
  return owned;
};
const beginLastSeenRender = (record) => {
  record.root.removeChildren();
  for (const graphics of record.unitObjects.graphics) graphics.removeFromParent();
  beginRetainedRenderSlots(record.unitObjects);
};
const finishLastSeenRender = (record) => finishRetainedRenderSlots(record.unitObjects);
const retainedLastSeen = loadRetainedLastSeenRenderer({
  beginRetainedUnitRender: beginLastSeenRender,
  circleIntersectsViewport: (_x, _y, _radius, viewport) => viewport.includes !== false,
  compareLastSeenBuildingDrawOrder: (left, right) => left.drawLevel - right.drawLevel || left.y - right.y || left.unitId.localeCompare(right.unitId),
  createRetainedWorldDisplayRecord: createLastSeenRecord,
  createTrackedGraphics: tracked.createTrackedGraphics,
  createTrackedSprite: tracked.createTrackedSprite,
  detachRetainedWorldDisplayRecord: detachLastSeenRecord,
  destroyRetainedWorldDisplayRecord: destroyLastSeenRecord,
  finishRetainedUnitRender: finishLastSeenRender,
  getFrameTexture: (_atlas, frame) => frame === 0 ? Texture.WHITE : Texture.EMPTY,
  getLastSeenBuildingFrameNumber: () => currentLastSeenFrame,
  isLastSeenBuildingVisible: (_world, building) => building.visible === true,
  reconcileWorldRenderKind: (options) => {
    lastSeenReconciliations += 1;
    return reconcileWorldRenderKind(options);
  },
  retainedLastSeenBuildings: lastSeenPrepared,
  retainedRenderResourceId: (resource) => {
    if (!resource) return 0;
    let id = lastSeenResources.get(resource);
    if (!id) {
      id = nextLastSeenResourceId++;
      lastSeenResources.set(resource, id);
    }
    return id;
  },
  retainedSceneOrder,
  retainedWorldDisplayRoots: lastSeenRoots,
  retainedWorldRenderCacheFor: lastSeenCacheFor,
  sourceLastSeenFancyBuildingMirror: () => false,
  spriteDirectionForFacing: () => ({ mirror: false, offset: 0 }),
  takeRetainedRenderSlot
});
const spriteAtlas = { numDirections: 1 };
const lastSeenAtlases = new Map([["sprite", spriteAtlas]]);
const building = (unitId, drawLevel, typeId, overrides = {}) => ({
  unitId, drawLevel, typeId, x: drawLevel, y: drawLevel, radius: 12, frameWidth: 32, frameHeight: 32, facing: 4, ...overrides
});
const originalLastSeenBuildings = [
  building("lower-sprite", 10, "sprite"), building("lower-fallback", 20, "fallback"),
  building("upper-sprite", 40, "sprite"), building("upper-fallback", 50, "fallback")
];
const lastSeenWorld = { lastSeenBuildings: originalLastSeenBuildings, engineSettings: { useFancyBuildingsDefault: false } };
const primaryLastSeenLayer = new Container();
const splitLastSeenLayer = new Container();
const unitSentinel = new Container();
const drawLastSeenFrame = (layer, world = lastSeenWorld, viewport = { includes: true }) => {
  layer.removeChildren();
  retainedLastSeen.drawLastSeenBuildings(layer, world, lastSeenAtlases, viewport, { maxDrawLevel: 39 }, new Map());
  layer.addChild(unitSentinel);
  retainedLastSeen.drawLastSeenBuildings(layer, world, lastSeenAtlases, viewport, { minDrawLevel: 40 }, new Map());
};
drawLastSeenFrame(primaryLastSeenLayer);
assert.equal(lastSeenReconciliations, 1, "Production last-seen renderer must reconcile once across lower and upper calls");
const primaryLastSeenCache = lastSeenCaches.get(primaryLastSeenLayer);
const primaryRecords = primaryLastSeenCache.kinds.lastSeenBuilding.active;
const lowerSprite = primaryRecords.get("lower-sprite").value;
const lowerFallback = primaryRecords.get("lower-fallback").value;
const upperSprite = primaryRecords.get("upper-sprite").value;
const upperFallback = primaryRecords.get("upper-fallback").value;
assert.deepEqual(primaryLastSeenLayer.children, [
  lowerSprite.root, lowerFallback.root, lowerFallback.unitObjects.graphics[0], unitSentinel,
  upperSprite.root, upperFallback.root, upperFallback.unitObjects.graphics[0]
], "Production last-seen renderer must preserve exact lower/unit/upper painter order");
assert.deepEqual(lowerSprite.root.children, [lowerSprite.unitObjects.sprites[0]], "Sprite must remain nested under its retained root");
const retainedLastSeenSprite = lowerSprite.unitObjects.sprites[0];
assert.equal(retainedLastSeenSprite.texture, Texture.WHITE, "Retained last-seen Sprite must install the current frame texture");
assert.equal(retainedLastSeenSprite.anchor.x, 0.5, "Retained last-seen Sprite must reset anchor x");
assert.equal(retainedLastSeenSprite.anchor.y, 0.72, "Retained last-seen Sprite must reset anchor y");
assert.equal(retainedLastSeenSprite.position.x, 10, "Retained last-seen Sprite must reset x");
assert.equal(retainedLastSeenSprite.position.y, 20, "Retained last-seen Sprite must reset y offset");
assert.equal(retainedLastSeenSprite.scale.x, 0.72, "Retained last-seen Sprite must reset horizontal scale");
assert.equal(retainedLastSeenSprite.scale.y, 0.72, "Retained last-seen Sprite must reset vertical scale");
assert.equal(retainedLastSeenSprite.alpha, 0.42, "Retained last-seen Sprite must reset alpha");
currentLastSeenFrame = 1;
drawLastSeenFrame(primaryLastSeenLayer);
assert.equal(primaryRecords.get("lower-sprite").value.unitObjects.sprites[0], retainedLastSeenSprite, "Animation-frame change must retain Sprite identity");
assert.equal(retainedLastSeenSprite.texture, Texture.EMPTY, "Animation-frame change must update the retained Sprite texture");
const retainedLastSeenFallback = lowerFallback.unitObjects.graphics[0];
assert.equal(lastSeenRoots.has(retainedLastSeenFallback), true, "Fallback Graphics must register for immediate-layer preservation");
assert.deepEqual(
  [retainedLastSeenFallback.getLocalBounds().minX, retainedLastSeenFallback.getLocalBounds().minY, retainedLastSeenFallback.getLocalBounds().maxX, retainedLastSeenFallback.getLocalBounds().maxY],
  [7, 7, 33, 33],
  "Fallback Graphics must draw the current building geometry"
);
Object.assign(originalLastSeenBuildings[1], { x: 80, y: 30, radius: 5 });
drawLastSeenFrame(primaryLastSeenLayer);
assert.equal(primaryRecords.get("lower-fallback").value.unitObjects.graphics[0], retainedLastSeenFallback, "Changed fallback input must retain Graphics identity");
assert.deepEqual(
  [retainedLastSeenFallback.getLocalBounds().minX, retainedLastSeenFallback.getLocalBounds().minY, retainedLastSeenFallback.getLocalBounds().maxX, retainedLastSeenFallback.getLocalBounds().maxY],
  [74, 24, 86, 36],
  "Changed fallback input must clear stale geometry before redraw"
);
const createdAfterWarmup = tracked.snapshotDisplayObjectPerformance().trackedCreated;
for (let frame = 0; frame < 300; frame += 1) drawLastSeenFrame(primaryLastSeenLayer);
assert.equal(tracked.snapshotDisplayObjectPerformance().trackedCreated, createdAfterWarmup, "300 unchanged production last-seen frames must create zero display objects");
assert.equal(primaryRecords.get("lower-sprite").value.root, lowerSprite.root, "Production Sprite root identity must remain stable");
assert.equal(primaryRecords.get("lower-fallback").value.unitObjects.graphics[0], lowerFallback.unitObjects.graphics[0], "Production fallback Graphics identity must remain stable");
drawLastSeenFrame(splitLastSeenLayer);
const splitLowerSprite = lastSeenCaches.get(splitLastSeenLayer).kinds.lastSeenBuilding.active.get("lower-sprite").value;
assert.notEqual(splitLowerSprite.root, lowerSprite.root, "Split viewport must own independent last-seen display objects");
originalLastSeenBuildings[0].visible = true;
drawLastSeenFrame(primaryLastSeenLayer);
assert.equal(primaryLastSeenCache.kinds.lastSeenBuilding.dormant.get("lower-sprite").value.root, lowerSprite.root, "Visibility suppression must detach a live last-seen record");
originalLastSeenBuildings[0].visible = false;
drawLastSeenFrame(primaryLastSeenLayer);
assert.equal(primaryLastSeenCache.kinds.lastSeenBuilding.active.get("lower-sprite").value.root, lowerSprite.root, "Visibility re-entry must retain identity");
drawLastSeenFrame(primaryLastSeenLayer, lastSeenWorld, { includes: false });
assert.equal(primaryLastSeenCache.kinds.lastSeenBuilding.dormant.get("lower-fallback").value.root, lowerFallback.root, "Viewport cull must detach to dormant");
drawLastSeenFrame(primaryLastSeenLayer);
lastSeenWorld.lastSeenBuildings = originalLastSeenBuildings.filter(({ unitId }) => unitId !== "upper-sprite");
drawLastSeenFrame(primaryLastSeenLayer);
assert.equal(upperSprite.root.destroyed, true, "Last-seen disappearance must destroy its exact record");
const replacementLastSeenWorld = { lastSeenBuildings: [building("lower-sprite", 10, "sprite")], engineSettings: { useFancyBuildingsDefault: false } };
drawLastSeenFrame(primaryLastSeenLayer, replacementLastSeenWorld);
assert.notEqual(lastSeenCaches.get(primaryLastSeenLayer).kinds.lastSeenBuilding.active.get("lower-sprite").value.root, lowerSprite.root, "World replacement with the same stable key must create a new identity");
assert.equal(lowerSprite.root.destroyed, true, "World replacement must destroy the old record synchronously");
for (const [layer, cache] of [[primaryLastSeenLayer, lastSeenCaches.get(primaryLastSeenLayer)], [splitLastSeenLayer, lastSeenCaches.get(splitLastSeenLayer)]]) {
  disposeWorldRenderCache(cache, detachLastSeenRecord, destroyLastSeenRecord);
  lastSeenCaches.delete(layer);
  lastSeenPrepared.delete(layer);
}
assert.equal(tracked.snapshotDisplayObjectPerformance().windowLiveDelta, 0, "Production last-seen split/world-replacement disposal must return tracked live delta to zero");
tracked.setDisplayObjectPerformanceCapture(false);

let nextIdentity = 1;
const created = [];
const destroyed = [];
const detached = [];
const attached = [];
const orders = [];
const makeRecord = (item) => {
  const value = { identity: nextIdentity++, key: item.key, shape: item.shape };
  created.push(value.identity);
  return value;
};
const options = (cache, kind, items, liveKeys = new Set(items.map(({ key }) => key))) => ({
  cache,
  worldIdentity: cache.worldIdentity,
  kind,
  items,
  keyOf: (item) => item.key,
  shapeKeyOf: (item) => item.shape,
  liveKeys,
  create: makeRecord,
  update: (value, item) => { value.key = item.key; value.shape = item.shape; },
  attach: (value) => attached.push(value.identity),
  detach: (value) => detached.push(value.identity),
  destroy: (value) => destroyed.push(value.identity),
  canResetForPool: (value, item) => value.shape === item.shape,
  reorder: (values) => orders.push(values.map(({ identity }) => identity))
});
const snapshotCache = (cache) => ({
  clock: cache.clock,
  kinds: Object.fromEntries(Object.entries(cache.kinds).map(([kind, state]) => [kind, {
    active: [...state.active.keys()], dormant: [...state.dormant.keys()], pool: state.pool.map(({ key }) => key)
  }]))
});

const worldA = {};
const cacheA = createWorldRenderCache(worldA);
const first = reconcileWorldRenderKind(options(cacheA, "unit", [
  { key: "u1", shape: "unit" }, { key: "u2", shape: "unit" }
]));
assert.deepEqual(first.actions.map(({ type }) => type), ["create", "create", "reorder"], "First reconciliation must create ordered records");
const identities = first.records.map(({ value }) => value.identity);
for (let frame = 0; frame < 300; frame += 1) {
  const stable = reconcileWorldRenderKind(options(cacheA, "unit", [
    { key: "u1", shape: "unit" }, { key: "u2", shape: "unit" }
  ]));
  assert.deepEqual(stable.records.map(({ value }) => value.identity), identities);
}
assert.equal(created.length, 2, "300 unchanged frames must create zero additional records");

const culled = reconcileWorldRenderKind(options(cacheA, "unit", [{ key: "u2", shape: "unit" }], new Set(["u1", "u2"])));
assert.ok(culled.actions.some(({ type, key }) => type === "detach" && key === "u1"));
const reentered = reconcileWorldRenderKind(options(cacheA, "unit", [
  { key: "u1", shape: "unit" }, { key: "u2", shape: "unit" }
]));
assert.ok(reentered.actions.some(({ type, key }) => type === "reattach" && key === "u1"));
assert.deepEqual(reentered.records.map(({ value }) => value.identity), identities, "Cull re-entry must reuse dormant identity");

const duplicateBefore = snapshotCache(cacheA);
const duplicateCallbacks = [created.length, destroyed.length, detached.length, attached.length, orders.length];
assert.throws(() => reconcileWorldRenderKind(options(cacheA, "unit", [
  { key: "duplicate", shape: "unit" }, { key: "duplicate", shape: "unit" }
])), /duplicate/i);
assert.deepEqual(snapshotCache(cacheA), duplicateBefore, "Duplicate keys must fail before cache mutation");
assert.deepEqual([created.length, destroyed.length, detached.length, attached.length, orders.length], duplicateCallbacks, "Duplicate keys must fail before callbacks");

const ownerBefore = snapshotCache(cacheA);
const ownerCallbacks = [created.length, destroyed.length, detached.length, attached.length, orders.length];
assert.throws(() => reconcileWorldRenderKind({
  ...options(cacheA, "unit", [{ key: "u1", shape: "unit" }]), worldIdentity: {}
}), /owner mismatch/i);
assert.deepEqual(snapshotCache(cacheA), ownerBefore, "World replacement must fail before cache mutation");
assert.deepEqual([created.length, destroyed.length, detached.length, attached.length, orders.length], ownerCallbacks, "World replacement must fail before callbacks");

for (let index = 0; index < 258; index += 1) {
  reconcileWorldRenderKind(options(cacheA, "unit", [{ key: `d${index}`, shape: "unit" }], new Set(Array.from({ length: index + 1 }, (_, current) => `d${current}`))));
}
reconcileWorldRenderKind(options(cacheA, "unit", [], new Set(Array.from({ length: 258 }, (_, index) => `d${index}`))));
assert.deepEqual([...cacheA.kinds.unit.dormant.keys()], Array.from({ length: 256 }, (_, index) => `d${index + 2}`), "Dormant LRU must evict deterministic oldest records");

const removalCache = createWorldRenderCache({});
const removedUnit = reconcileWorldRenderKind(options(removalCache, "unit", [{ key: "removed", shape: "unit" }])).records[0].value;
const removal = reconcileWorldRenderKind(options(removalCache, "unit", [], new Set()));
assert.deepEqual(removal.actions.map(({ type }) => type), ["detach", "retire", "destroy", "reorder"], "Removal must destroy rather than enter dormancy");
assert.ok(destroyed.includes(removedUnit.identity));

const lastSeenCache = createWorldRenderCache({});
const stableLastSeen = { key: "building-1", shape: "last-seen-sprite-v1" };
const firstLastSeen = reconcileWorldRenderKind(options(lastSeenCache, "lastSeenBuilding", [stableLastSeen])).records[0].value;
for (let frame = 0; frame < 300; frame += 1) {
  const stable = reconcileWorldRenderKind(options(lastSeenCache, "lastSeenBuilding", [stableLastSeen])).records[0].value;
  assert.equal(stable.identity, firstLastSeen.identity, "Unchanged last-seen building must retain identity");
}
const lastSeenLiveKeys = new Set();
for (let index = 0; index < 130; index += 1) {
  const key = `last-seen-${index}`;
  lastSeenLiveKeys.add(key);
  reconcileWorldRenderKind(options(lastSeenCache, "lastSeenBuilding", [{ key, shape: "last-seen-graphics-v1" }], new Set(lastSeenLiveKeys)));
}
reconcileWorldRenderKind(options(lastSeenCache, "lastSeenBuilding", [], lastSeenLiveKeys));
assert.deepEqual(
  [...lastSeenCache.kinds.lastSeenBuilding.dormant.keys()],
  Array.from({ length: 128 }, (_, index) => `last-seen-${index + 2}`),
  "Last-seen dormant cache must retain the newest 128 records"
);

for (const startingState of ["active", "dormant"]) {
  const shapeCache = createWorldRenderCache({});
  const firstShape = reconcileWorldRenderKind(options(shapeCache, "unit", [{ key: "shape", shape: "a" }])).records[0].value;
  if (startingState === "dormant") reconcileWorldRenderKind(options(shapeCache, "unit", [], new Set(["shape"])));
  const changed = reconcileWorldRenderKind(options(shapeCache, "unit", [{ key: "shape", shape: "b" }]));
  assert.notEqual(changed.records[0].value.identity, firstShape.identity, `${startingState} incompatible shape must recreate`);
  assert.ok(changed.actions.some(({ type }) => type === "destroy"));
  assert.ok(changed.actions.some(({ type }) => type === "create"));
}

const projectileCache = createWorldRenderCache({});
const projectile = reconcileWorldRenderKind(options(projectileCache, "projectile", [{ key: "p1", shape: "arrow" }])).records[0].value;
reconcileWorldRenderKind(options(projectileCache, "projectile", [], new Set()));
const pooled = reconcileWorldRenderKind(options(projectileCache, "projectile", [{ key: "p2", shape: "arrow" }])).records[0].value;
assert.equal(pooled.identity, projectile.identity, "Exact-shape pool must reuse a resettable record");
reconcileWorldRenderKind(options(projectileCache, "projectile", [], new Set()));
const mismatch = reconcileWorldRenderKind(options(projectileCache, "projectile", [{ key: "p3", shape: "cannon" }])).records[0].value;
assert.notEqual(mismatch.identity, projectile.identity, "Pool shape mismatch must create");
reconcileWorldRenderKind(options(projectileCache, "projectile", [], new Set()));
const resetFailure = reconcileWorldRenderKind({ ...options(projectileCache, "projectile", [{ key: "p4", shape: "cannon" }]), canResetForPool: () => false });
assert.notEqual(resetFailure.records[0].value.identity, mismatch.identity, "Reset failure must destroy then create");
assert.ok(resetFailure.actions.some(({ type }) => type === "destroy"));

const noResetCache = createWorldRenderCache({});
const noResetRecord = reconcileWorldRenderKind({ ...options(noResetCache, "spellEffect", [{ key: "effect", shape: "burst" }]), canResetForPool: undefined }).records[0].value;
const noResetRetirement = reconcileWorldRenderKind({ ...options(noResetCache, "spellEffect", [], new Set()), canResetForPool: undefined });
assert.equal(noResetCache.kinds.spellEffect.pool.length, 0, "Absent reset contract must disable pooling");
assert.ok(noResetRetirement.actions.some(({ type, key }) => type === "destroy" && key === "effect"));
assert.ok(destroyed.includes(noResetRecord.identity));

const poolCapCache = createWorldRenderCache({});
const poolItems = Array.from({ length: 65 }, (_, index) => ({ key: `pool-${index}`, shape: `shape-${index}` }));
reconcileWorldRenderKind(options(poolCapCache, "projectile", poolItems));
const poolOverflow = reconcileWorldRenderKind(options(poolCapCache, "projectile", [], new Set()));
assert.deepEqual(poolCapCache.kinds.projectile.pool.map(({ key }) => key), poolItems.slice(0, 64).map(({ key }) => key), "Pool overflow must retain deterministic first records");
assert.ok(poolOverflow.actions.some(({ type, key }) => type === "destroy" && key === "pool-64"));

const deterministicRun = () => {
  let identity = 0;
  const order = [];
  const cache = createWorldRenderCache({});
  const result = reconcileWorldRenderKind({
    cache, worldIdentity: cache.worldIdentity, kind: "corpse",
    items: [{ key: "b", shape: "corpse" }, { key: "a", shape: "corpse" }], liveKeys: new Set(["a", "b"]),
    keyOf: (item) => item.key, shapeKeyOf: (item) => item.shape, create: () => ({ identity: ++identity }),
    update: () => {}, attach: () => {}, detach: () => {}, destroy: () => {}, reorder: (values) => order.push(values.map(({ identity: value }) => value))
  });
  return { actions: result.actions, order };
};
const deterministic = deterministicRun();
assert.deepEqual(deterministic, deterministicRun(), "Actions and reorder callbacks must be deterministic");
assert.deepEqual(deterministic.order, [[1, 2]], "Reorder callback must preserve literal prepared [b,a] order");
assert.equal(deterministic.actions.at(-1)?.key, "b,a", "Reorder action must name literal prepared order");

const pureInput = {
  kind: "unit", clock: 4, active: [], dormant: [], pool: [],
  items: [{ key: "b", shapeKey: "unit" }, { key: "a", shapeKey: "unit" }],
  liveKeys: new Set(["a", "b"]), poolingEnabled: false
};
const pureBefore = { ...pureInput, items: pureInput.items.map((item) => ({ ...item })), liveKeys: [...pureInput.liveKeys] };
const purePlan = planWorldRenderReconciliation(pureInput);
assert.deepEqual(purePlan.active.map(({ key }) => key), ["b", "a"], "Pure planner must preserve prepared order");
assert.equal(purePlan.actions.at(-1)?.key, "b,a");
assert.deepEqual({ ...pureInput, liveKeys: [...pureInput.liveKeys] }, pureBefore, "Pure planner must not mutate its input");

const cacheB = createWorldRenderCache({});
reconcileWorldRenderKind(options(cacheB, "unit", [{ key: "isolated", shape: "unit" }]));
assert.equal(cacheA.kinds.unit.active.has("isolated"), false, "Independent cache mutation must not leak");

const failureWorld = {};
const failureCache = createWorldRenderCache(failureWorld);
let failureIdentity = 0;
const failureLog = [];
const failureOptions = (items, reorder) => ({
  cache: failureCache,
  worldIdentity: failureWorld,
  kind: "unit",
  items,
  liveKeys: new Set(items.map(({ key }) => key)),
  keyOf: (item) => item.key,
  shapeKeyOf: () => "unit",
  create: (item) => ({ identity: ++failureIdentity, key: item.key }),
  update: (value, item) => { value.key = item.key; },
  attach: (value) => failureLog.push(`attach:${value.identity}`),
  detach: (value) => failureLog.push(`detach:${value.identity}`),
  destroy: (value) => failureLog.push(`destroy:${value.identity}`),
  reorder
});
reconcileWorldRenderKind(failureOptions([{ key: "existing" }], () => {}));
failureLog.length = 0;
assert.throws(() => reconcileWorldRenderKind(failureOptions(
  [{ key: "existing" }, { key: "created" }],
  () => { throw new Error("injected reorder failure"); }
)), /injected reorder failure/);
assert.equal(failureCache.kinds.unit.active.size, 0, "Callback failure must clear active cache state");
assert.equal(failureCache.kinds.unit.dormant.size, 0, "Callback failure must clear dormant cache state");
assert.equal(failureCache.kinds.unit.pool.length, 0, "Callback failure must clear pooled cache state");
for (const identity of [1, 2]) {
  const detachIndex = failureLog.indexOf(`detach:${identity}`);
  const destroyIndex = failureLog.indexOf(`destroy:${identity}`);
  assert.ok(detachIndex >= 0 && destroyIndex > detachIndex, `Failure cleanup must detach ${identity} before destroy`);
  assert.equal(failureLog.filter((entry) => entry === `destroy:${identity}`).length, 1, `Failure cleanup must destroy ${identity} exactly once`);
}

const disposalCache = createWorldRenderCache({});
reconcileWorldRenderKind(options(disposalCache, "unit", [{ key: "dormant", shape: "unit" }]));
reconcileWorldRenderKind(options(disposalCache, "unit", [{ key: "active", shape: "unit" }], new Set(["active", "dormant"])));
reconcileWorldRenderKind(options(disposalCache, "projectile", [{ key: "pooled", shape: "arrow" }]));
reconcileWorldRenderKind(options(disposalCache, "projectile", [], new Set()));
const expectedDestroyed = Object.values(disposalCache.kinds).flatMap((state) => [...state.active.values(), ...state.dormant.values(), ...state.pool]).map(({ value }) => value.identity).sort((a, b) => a - b);
const activeKeys = Object.values(disposalCache.kinds).flatMap((state) => [...state.active.keys()]);
const disposalDetached = [];
const disposalDestroyed = [];
const disposalActions = disposeWorldRenderCache(disposalCache, (value) => disposalDetached.push(value.identity), (value) => disposalDestroyed.push(value.identity));
assert.equal(disposalDetached.length, activeKeys.length, "Disposal must detach every active record exactly once");
assert.deepEqual(disposalDestroyed.sort((a, b) => a - b), expectedDestroyed, "Disposal must destroy every record exactly once");
for (const key of activeKeys) {
  const detachIndex = disposalActions.findIndex((action) => action.type === "detach" && action.key === key);
  const destroyIndex = disposalActions.findIndex((action) => action.type === "destroy" && action.key === key);
  assert.ok(detachIndex >= 0 && destroyIndex > detachIndex, `${key} must detach before destroy`);
}
assert.deepEqual(disposeWorldRenderCache(disposalCache, () => assert.fail("Second detach must be a no-op"), () => assert.fail("Second destroy must be a no-op")), []);

disposeWorldRenderCache(cacheA, (value) => detached.push(value.identity), (value) => destroyed.push(value.identity));
assert.equal(cacheA.kinds.unit.active.size + cacheA.kinds.unit.dormant.size + cacheA.kinds.unit.pool.length, 0);

console.log("World render cache lifecycle verified (identity, ownership, order, bounds, pooling, and disposal).");
