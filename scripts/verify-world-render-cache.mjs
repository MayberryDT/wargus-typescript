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
assert.equal((rendererSource.match(/kind: "corpse"/g) ?? []).length, 1, "Corpses must reconcile exactly once for both draw strata");
assert.match(rendererSource, /kind: "corpse"[\s\S]*liveKeys: new Set\(world\.corpses\.map\(\(corpse\) => corpse\.id\)\)[\s\S]*keyOf: \(corpse\) => corpse\.id/, "Corpse lifecycle must use stable corpse IDs");
assert.match(rendererSource, /function takeCorpseGraphics[\s\S]*retainedWorldDisplayRoots\.add\(graphics\)/, "Corpse fallback Graphics must register for immediate-layer preservation");
assert.match(rendererSource, /shapeKeyOf: \(corpse\) => \{[\s\S]*"corpse-sprite-v1" : "corpse-graphics-v1"/, "Corpse shape key must distinguish Sprite and fallback Graphics records");
assert.equal((rendererSource.match(/kind: "projectile"/g) ?? []).length, 1, "Projectiles must reconcile exactly once for both draw strata");
assert.match(rendererSource, /kind: "projectile"[\s\S]*liveKeys: new Set\(world\.projectiles\.map\(\(projectile\) => projectile\.id\)\)[\s\S]*keyOf: \(projectile\) => projectile\.id/, "Projectile lifecycle must use stable projectile IDs");
assert.match(rendererSource, /const signature = JSON\.stringify\(\[[\s\S]*world\.missileDefinitions[\s\S]*retainedRenderResourceId\(atlas\)/, "Projectile signature must include missile definitions and atlas identity");
assert.match(rendererSource, /projectileRenderShapeKey[\s\S]*"projectile-text-v1"[\s\S]*"projectile-sprite-v1"[\s\S]*"projectile-graphics-v1"/, "Projectile shape key must distinguish Text, Sprite, and Graphics records");
assert.match(rendererSource, /function takeProjectileGraphics[\s\S]*retainedWorldDisplayRoots\.add\(graphics\)/, "Projectile fallback Graphics must register for immediate-layer preservation");
const projectileReconciliationSource = rendererSource.match(/function drawProjectiles[\s\S]*?(?=function projectileRenderShapeKey)/)?.[0] ?? "";
assert.doesNotMatch(projectileReconciliationSource, /canResetForPool:/, "Projectile pooling must stay disabled without a complete reset contract");
assert.equal((rendererSource.match(/kind: "spellEffect"/g) ?? []).length, 1, "Spell effects must reconcile exactly once for both draw strata");
assert.match(rendererSource, /kind: "spellEffect"[\s\S]*liveKeys: new Set\(world\.spellEffects\.map\(\(effect\) => effect\.id\)\)[\s\S]*keyOf: \(effect\) => effect\.id/, "Spell-effect lifecycle must use stable effect IDs");
assert.match(rendererSource, /spellEffectRenderShapeKey[\s\S]*"spell-effect-graphics-v1"[\s\S]*`spell-effect-sprites-\$\{impacts\.length\}-v1`[\s\S]*"spell-effect-sprite-1-v1"/, "Spell-effect shape key must distinguish Graphics, single-Sprite, and exact multi-Sprite records");
assert.match(rendererSource, /function takeSpellEffectGraphics[\s\S]*retainedWorldDisplayRoots\.add\(graphics\)/, "Spell-effect Graphics must register for immediate-layer preservation");
assert.match(rendererSource, /const signature = JSON\.stringify\(\[effect, world\.tick, world\.tickRate, world\.engineSettings, world\.spellDefinitions, world\.missileDefinitions, world\.tileSize, retainedRenderResourceId\(atlas\)\]\)/, "Spell-effect signature must include every world/resource dependency");
const spellEffectReconciliationSource = rendererSource.match(/function drawSpellEffects[\s\S]*?(?=function spellEffectRenderShapeKey)/)?.[0] ?? "";
assert.doesNotMatch(spellEffectReconciliationSource, /canResetForPool:/, "Spell-effect pooling must stay disabled without a complete reset contract");

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
  "takeLastSeenBuildingSprite",
  "drawCorpses",
  "drawCorpseVisual",
  "takeCorpseGraphics",
  "takeCorpseSprite",
  "drawProjectiles",
  "projectileRenderShapeKey",
  "drawProjectileVisual",
  "takeProjectileGraphics",
  "takeProjectileSprite",
  "takeProjectileText",
  "drawDamageHitProjectile",
  "drawSpellEffects",
  "spellEffectRenderShapeKey",
  "drawSpellEffectVisual",
  "takeSpellEffectGraphics",
  "takeSpellEffectSprite",
  "drawAreaSpellMissiles",
  "sourceAreaBombardmentForEffect",
  "sourceAreaBombardmentVisualImpacts",
  "sourceAreaBombardmentVisualPulseTick",
  "sourceStableVisualHash",
  "spellEffectMissileFrame",
  "spellEffectSpriteScale",
  "spellColor",
  "missileFrameRate",
  "sourceMissileSleepTicks"
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
    "createTrackedGraphics", "createTrackedSprite", "createTrackedText", "detachRetainedWorldDisplayRecord", "destroyRetainedWorldDisplayRecord",
    "finishRetainedUnitRender", "getCorpseFrameNumber", "getFrameTexture", "getMissileFrameTexture", "getLastSeenBuildingFrameNumber", "isDamageHitProjectile", "isFireLikeProjectile", "isLastSeenBuildingVisible", "isLightningLikeProjectile",
    "missileFrameNumber", "missileSpriteScale", "projectileDrawPosition", "reconcileWorldRenderKind", "retainedCorpseStrata", "retainedProjectileStrata", "retainedSpellEffectStrata", "retainedLastSeenBuildings", "retainedRenderResourceId", "retainedSceneOrder",
    "retainedWorldDisplayRoots", "retainedWorldRenderCacheFor", "siegeProjectileFallbackColor", "sourceDefaultGameSpeed", "sourceLastSeenFancyBuildingMirror", "sourceMissileVisualRole", "sourcePlayerColor", "spriteDirectionForFacing",
    "takeRetainedRenderSlot"
  ].join(", ")} } = dependencies;\n${retainedLastSeenJavascript}\nreturn { drawCorpses, drawLastSeenBuildings, drawProjectiles, drawSpellEffects };`
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
const corpsePrepared = new WeakMap();
const projectilePrepared = new WeakMap();
const spellEffectPrepared = new WeakMap();
let currentProjectileFrame = 0;
const lastSeenRoots = new WeakSet();
const lastSeenCaches = new WeakMap();
const lastSeenResources = new WeakMap();
let nextLastSeenResourceId = 1;
let lastSeenReconciliations = 0;
let currentLastSeenFrame = 0;
let currentCorpseFrame = 0;
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
  createTrackedText: tracked.createTrackedText,
  detachRetainedWorldDisplayRecord: detachLastSeenRecord,
  destroyRetainedWorldDisplayRecord: destroyLastSeenRecord,
  finishRetainedUnitRender: finishLastSeenRender,
  getCorpseFrameNumber: (corpse) => corpse.animation ? currentCorpseFrame : null,
  getFrameTexture: (_atlas, frame) => frame === 0 ? Texture.WHITE : Texture.EMPTY,
  getMissileFrameTexture: (_atlas, frame) => frame === 0 ? Texture.WHITE : Texture.EMPTY,
  getLastSeenBuildingFrameNumber: () => currentLastSeenFrame,
  isDamageHitProjectile: (projectile) => projectile.className === "missile-class-hit" && typeof projectile.displayDamage === "number",
  isFireLikeProjectile: (_world, projectile) => projectile.visualRole === "flame" || projectile.visualRole === "hammer",
  isLastSeenBuildingVisible: (_world, building) => building.visible === true,
  isLightningLikeProjectile: (_world, projectile) => projectile.visualRole === "lightning",
  missileFrameNumber: () => currentProjectileFrame,
  missileSpriteScale: () => 1,
  projectileDrawPosition: (projectile) => ({ x: projectile.x, y: projectile.y }),
  reconcileWorldRenderKind: (options) => {
    lastSeenReconciliations += 1;
    return reconcileWorldRenderKind(options);
  },
  retainedCorpseStrata: corpsePrepared,
  retainedProjectileStrata: projectilePrepared,
  retainedSpellEffectStrata: spellEffectPrepared,
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
  siegeProjectileFallbackColor: () => 0x5f554b,
  sourceDefaultGameSpeed: (world) => world.tickRate,
  sourceLastSeenFancyBuildingMirror: () => false,
  sourceMissileVisualRole: (_world, projectile) => projectile.visualRole ?? "arrow",
  sourcePlayerColor: (world) => world.engineSettings.projectileColor ?? 0xd6d0a3,
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

tracked.resetDisplayObjectPerformance();
tracked.setDisplayObjectPerformanceCapture(true);
const corpse = (id, drawLevel, typeId, overrides = {}) => ({
  id, drawLevel, typeId, player: 0, x: drawLevel, y: drawLevel, radius: 12,
  visibleUnderFog: true, facing: 4, animation: typeId === "sprite" ? "death" : null,
  age: 0.25, duration: 1, ...overrides
});
let corpseBelow40 = [corpse("lower-corpse-sprite", 10, "sprite"), corpse("lower-corpse-fallback", 20, "fallback")];
let corpseAtLeast40 = [corpse("upper-corpse-sprite", 40, "sprite"), corpse("upper-corpse-fallback", 50, "fallback")];
const corpseWorld = { corpses: [...corpseBelow40, ...corpseAtLeast40], engineSettings: { gameSpeed: 30 } };
const primaryCorpseLayer = new Container();
const splitCorpseLayer = new Container();
const corpseUnitSentinel = new Container();
const drawCorpseFrame = (layer, world = corpseWorld, below40 = corpseBelow40, atLeast40 = corpseAtLeast40) => {
  layer.removeChildren();
  corpsePrepared.set(layer, { world, corpses: { below40, atLeast40 } });
  retainedLastSeen.drawCorpses(layer, world, lastSeenAtlases, below40, new Map());
  layer.addChild(corpseUnitSentinel);
  retainedLastSeen.drawCorpses(layer, world, lastSeenAtlases, atLeast40, new Map());
};
const corpseReconciliationsBefore = lastSeenReconciliations;
drawCorpseFrame(primaryCorpseLayer);
assert.equal(lastSeenReconciliations, corpseReconciliationsBefore + 1, "Production corpse renderer must reconcile once across lower and upper calls");
const primaryCorpseCache = lastSeenCaches.get(primaryCorpseLayer);
const corpseRecords = primaryCorpseCache.kinds.corpse.active;
const lowerCorpseSprite = corpseRecords.get("lower-corpse-sprite").value;
const lowerCorpseFallback = corpseRecords.get("lower-corpse-fallback").value;
const upperCorpseSprite = corpseRecords.get("upper-corpse-sprite").value;
const upperCorpseFallback = corpseRecords.get("upper-corpse-fallback").value;
assert.deepEqual(primaryCorpseLayer.children, [
  lowerCorpseSprite.root, lowerCorpseFallback.root, lowerCorpseFallback.unitObjects.graphics[0], corpseUnitSentinel,
  upperCorpseSprite.root, upperCorpseFallback.root, upperCorpseFallback.unitObjects.graphics[0]
], "Production corpse renderer must preserve exact lower/unit/upper painter order");
const retainedCorpseSprite = lowerCorpseSprite.unitObjects.sprites[0];
assert.equal(retainedCorpseSprite.texture, Texture.WHITE, "Retained corpse Sprite must install the current frame texture");
assert.equal(retainedCorpseSprite.anchor.x, 0.5);
assert.equal(retainedCorpseSprite.anchor.y, 0.72);
assert.equal(retainedCorpseSprite.position.x, 10);
assert.equal(retainedCorpseSprite.position.y, 20);
assert.equal(retainedCorpseSprite.scale.x, 0.72);
assert.equal(retainedCorpseSprite.scale.y, 0.72);
assert.equal(retainedCorpseSprite.alpha, 0.69, "Retained corpse Sprite must update age-based alpha");
currentCorpseFrame = 1;
corpseBelow40[0].age = 0.75;
drawCorpseFrame(primaryCorpseLayer);
assert.equal(corpseRecords.get("lower-corpse-sprite").value.unitObjects.sprites[0], retainedCorpseSprite, "Corpse frame change must retain Sprite identity");
assert.equal(retainedCorpseSprite.texture, Texture.EMPTY, "Corpse frame change must update the retained Sprite texture");
assert.ok(Math.abs(retainedCorpseSprite.alpha - 0.43) < 1e-12, "Changed corpse age must update retained Sprite alpha");
const retainedCorpseFallback = lowerCorpseFallback.unitObjects.graphics[0];
assert.equal(lastSeenRoots.has(retainedCorpseFallback), true, "Corpse fallback Graphics must register for immediate-layer preservation");
const initialCorpseBounds = retainedCorpseFallback.getLocalBounds();
assert.ok(initialCorpseBounds.width > 0 && initialCorpseBounds.height > 0, "Corpse fallback must draw non-empty geometry");
Object.assign(corpseBelow40[1], { x: 80, y: 30, radius: 5, age: 0.75 });
drawCorpseFrame(primaryCorpseLayer);
assert.equal(corpseRecords.get("lower-corpse-fallback").value.unitObjects.graphics[0], retainedCorpseFallback, "Changed corpse fallback must retain Graphics identity");
assert.ok(retainedCorpseFallback.getLocalBounds().minX > 70, "Changed corpse fallback must clear stale geometry before redraw");
const corpseFallbackAlphas = retainedCorpseFallback.context.instructions.filter(({ action }) => action === "fill").map(({ data }) => data.style.alpha);
assert.ok(Math.abs(corpseFallbackAlphas[0] - 0.265) < 1e-12 && Math.abs(corpseFallbackAlphas[1] - 0.212) < 1e-12, "Changed corpse age must update both fallback fill alphas");
const corpseCreatedAfterWarmup = tracked.snapshotDisplayObjectPerformance().trackedCreated;
for (let frame = 0; frame < 300; frame += 1) drawCorpseFrame(primaryCorpseLayer);
assert.equal(tracked.snapshotDisplayObjectPerformance().trackedCreated, corpseCreatedAfterWarmup, "300 unchanged production corpse frames must create zero display objects");
const shapeCorpseLayer = new Container();
const shapeCorpse = corpse("shape-corpse", 10, "sprite");
const shapeCorpseWorld = { corpses: [shapeCorpse], engineSettings: { gameSpeed: 30 } };
drawCorpseFrame(shapeCorpseLayer, shapeCorpseWorld, [shapeCorpse], []);
const shapeSpriteRecord = lastSeenCaches.get(shapeCorpseLayer).kinds.corpse.active.get("shape-corpse").value;
shapeCorpse.animation = null;
drawCorpseFrame(shapeCorpseLayer, shapeCorpseWorld, [shapeCorpse], []);
const shapeGraphicsRecord = lastSeenCaches.get(shapeCorpseLayer).kinds.corpse.active.get("shape-corpse").value;
assert.notEqual(shapeGraphicsRecord.root, shapeSpriteRecord.root, "Sprite-to-fallback shape transition must replace corpse record identity");
assert.equal(shapeSpriteRecord.root.destroyed, true, "Sprite-to-fallback shape transition must destroy the incompatible record");
shapeCorpse.animation = "death";
drawCorpseFrame(shapeCorpseLayer, shapeCorpseWorld, [shapeCorpse], []);
const shapeSpriteReentry = lastSeenCaches.get(shapeCorpseLayer).kinds.corpse.active.get("shape-corpse").value;
assert.notEqual(shapeSpriteReentry.root, shapeGraphicsRecord.root, "Fallback-to-Sprite shape transition must replace corpse record identity");
assert.equal(shapeGraphicsRecord.root.destroyed, true, "Fallback-to-Sprite shape transition must destroy the incompatible record");
disposeWorldRenderCache(lastSeenCaches.get(shapeCorpseLayer), detachLastSeenRecord, destroyLastSeenRecord);
lastSeenCaches.delete(shapeCorpseLayer);
corpsePrepared.delete(shapeCorpseLayer);
drawCorpseFrame(splitCorpseLayer);
assert.notEqual(lastSeenCaches.get(splitCorpseLayer).kinds.corpse.active.get("lower-corpse-sprite").value.root, lowerCorpseSprite.root, "Split viewport must own independent corpse display objects");
drawCorpseFrame(primaryCorpseLayer, corpseWorld, corpseBelow40.filter(({ id }) => id !== "lower-corpse-sprite"), corpseAtLeast40);
assert.equal(primaryCorpseCache.kinds.corpse.dormant.get("lower-corpse-sprite").value.root, lowerCorpseSprite.root, "Culled corpse must detach to dormant");
drawCorpseFrame(primaryCorpseLayer);
assert.equal(primaryCorpseCache.kinds.corpse.active.get("lower-corpse-sprite").value.root, lowerCorpseSprite.root, "Corpse cull re-entry must retain identity");
corpseWorld.corpses = corpseWorld.corpses.filter(({ id }) => id !== "upper-corpse-sprite");
corpseAtLeast40 = corpseAtLeast40.filter(({ id }) => id !== "upper-corpse-sprite");
drawCorpseFrame(primaryCorpseLayer);
assert.equal(upperCorpseSprite.root.destroyed, true, "Corpse expiry/removal must destroy its exact record");
const replacementCorpseBelow = [corpse("lower-corpse-sprite", 10, "sprite")];
const replacementCorpseWorld = { corpses: replacementCorpseBelow, engineSettings: { gameSpeed: 30 } };
drawCorpseFrame(primaryCorpseLayer, replacementCorpseWorld, replacementCorpseBelow, []);
assert.notEqual(lastSeenCaches.get(primaryCorpseLayer).kinds.corpse.active.get("lower-corpse-sprite").value.root, lowerCorpseSprite.root, "World replacement with the same corpse ID must create a new identity");
assert.equal(lowerCorpseSprite.root.destroyed, true, "Corpse world replacement must destroy the old record synchronously");
for (const [layer, cache] of [[primaryCorpseLayer, lastSeenCaches.get(primaryCorpseLayer)], [splitCorpseLayer, lastSeenCaches.get(splitCorpseLayer)]]) {
  disposeWorldRenderCache(cache, detachLastSeenRecord, destroyLastSeenRecord);
  lastSeenCaches.delete(layer);
  corpsePrepared.delete(layer);
}
assert.equal(tracked.snapshotDisplayObjectPerformance().windowLiveDelta, 0, "Production corpse split/world-replacement disposal must return tracked live delta to zero");
tracked.setDisplayObjectPerformanceCapture(false);

tracked.resetDisplayObjectPerformance();
tracked.setDisplayObjectPerformanceCapture(true);
const projectileFixture = (id, drawLevel, kind, overrides = {}) => ({
  id, drawLevel, kind, sourceId: "source", targetId: null, sourceTypeId: "unit",
  player: 0, x: drawLevel, y: drawLevel, originX: 0, originY: 0, targetX: drawLevel + 20, targetY: drawLevel,
  speed: 100, damage: 7, missileId: null, className: null, impactSoundId: null, impactMissileId: null,
  splashFactor: 0, range: 1, canHitOwner: false, friendlyFire: false, canTargetLand: true, canTargetSea: false,
  canTargetAir: false, bouncesRemaining: 0, hitUnitIds: [], age: 0.25, delaySeconds: 0, ttlSeconds: 1,
  ...overrides
});
let projectileBelow40 = [
  projectileFixture("lower-projectile-sprite", 10, "arrow", { missileId: "missile", targetY: 30 }),
  projectileFixture("lower-projectile-graphics", 20, "cannon"),
  projectileFixture("lower-projectile-text", 30, "melee", { className: "missile-class-hit", displayDamage: 12 })
];
let projectileAtLeast40 = [projectileFixture("upper-projectile-graphics", 40, "axe")];
const projectileWorld = {
  projectiles: [...projectileBelow40, ...projectileAtLeast40], elapsed: 1,
  engineSettings: { playerColors: [], playerColorIndex: { count: 1 } }, missileDefinitions: []
};
const projectileAtlases = new Map([["missile", { numDirections: 1 }]]);
const primaryProjectileLayer = new Container();
const splitProjectileLayer = new Container();
const projectileUnitSentinel = new Container();
const drawProjectileFrame = (layer, world = projectileWorld, below40 = projectileBelow40, atLeast40 = projectileAtLeast40, atlases = projectileAtlases) => {
  layer.removeChildren();
  projectilePrepared.set(layer, { world, projectiles: { below40, atLeast40 } });
  retainedLastSeen.drawProjectiles(layer, world, atlases, below40);
  layer.addChild(projectileUnitSentinel);
  retainedLastSeen.drawProjectiles(layer, world, atlases, atLeast40);
};
const projectileReconciliationsBefore = lastSeenReconciliations;
drawProjectileFrame(primaryProjectileLayer);
assert.equal(lastSeenReconciliations, projectileReconciliationsBefore + 1, "Production projectile renderer must reconcile once across lower and upper calls");
const primaryProjectileCache = lastSeenCaches.get(primaryProjectileLayer);
const projectileRecords = primaryProjectileCache.kinds.projectile.active;
const projectileSpriteRecord = projectileRecords.get("lower-projectile-sprite").value;
const projectileGraphicsRecord = projectileRecords.get("lower-projectile-graphics").value;
const projectileTextRecord = projectileRecords.get("lower-projectile-text").value;
const upperProjectileRecord = projectileRecords.get("upper-projectile-graphics").value;
assert.deepEqual(primaryProjectileLayer.children, [
  projectileSpriteRecord.root, projectileGraphicsRecord.root, projectileTextRecord.root,
  projectileGraphicsRecord.unitObjects.graphics[0], projectileUnitSentinel,
  upperProjectileRecord.root, upperProjectileRecord.unitObjects.graphics[0]
], "Production projectile renderer must preserve exact lower/unit/upper painter order");
const retainedProjectileSprite = projectileSpriteRecord.unitObjects.sprites[0];
const retainedProjectileGraphics = projectileGraphicsRecord.unitObjects.graphics[0];
const retainedProjectileText = projectileTextRecord.unitObjects.texts[0];
assert.equal(retainedProjectileSprite.texture, Texture.WHITE);
assert.equal(retainedProjectileSprite.anchor.x, 0.5);
assert.equal(retainedProjectileSprite.anchor.y, 0.5);
assert.equal(retainedProjectileSprite.position.x, 10);
assert.equal(retainedProjectileSprite.position.y, 10);
assert.ok(Math.abs(retainedProjectileSprite.rotation - Math.PI / 4) < 1e-12);
assert.equal(retainedProjectileSprite.scale.x, 1);
assert.equal(retainedProjectileSprite.scale.y, 1);
assert.equal(lastSeenRoots.has(retainedProjectileGraphics), true, "Projectile Graphics must register for immediate-layer preservation");
assert.ok(retainedProjectileGraphics.getLocalBounds().width > 0, "Projectile fallback must draw non-empty geometry");
const initialProjectileFills = retainedProjectileGraphics.context.instructions.filter(({ action }) => action === "fill").map(({ data }) => [data.style.color, data.style.alpha]);
assert.deepEqual(initialProjectileFills, [[0x1b1712, 1], [0xd95d45, 0.22]], "Cannon fallback must preserve exact fill colors and alpha");
assert.equal(retainedProjectileText.text, "12");
assert.equal(retainedProjectileText.anchor.x, 0.5);
assert.equal(retainedProjectileText.anchor.y, 0.5);
assert.equal(retainedProjectileText.position.x, 30);
assert.equal(retainedProjectileText.position.y, 30);
assert.equal(retainedProjectileText.style.fill, 0xf8e48a);
assert.equal(retainedProjectileText.style.stroke.color, 0x2a160c);
assert.equal(retainedProjectileText.style.stroke.width, 2);
assert.equal(retainedProjectileText.style.fontFamily, "monospace");
assert.equal(retainedProjectileText.style.fontSize, 12);
currentProjectileFrame = 1;
projectileBelow40[0].x = 12;
projectileBelow40[0].y = 14;
projectileBelow40[1].x = 80;
projectileBelow40[2].displayDamage = 15;
projectileBelow40[2].y = 35;
drawProjectileFrame(primaryProjectileLayer);
assert.equal(projectileRecords.get("lower-projectile-sprite").value.unitObjects.sprites[0], retainedProjectileSprite);
assert.equal(retainedProjectileSprite.texture, Texture.EMPTY, "Projectile frame change must update retained Sprite texture");
assert.equal(retainedProjectileSprite.position.x, 12, "Projectile movement must update retained Sprite position");
assert.equal(retainedProjectileSprite.position.y, 14, "Projectile movement must update retained Sprite vertical position");
assert.ok(Math.abs(retainedProjectileSprite.rotation - Math.atan2(16, 18)) < 1e-12, "Projectile direction change must update retained Sprite rotation");
assert.equal(projectileRecords.get("lower-projectile-graphics").value.unitObjects.graphics[0], retainedProjectileGraphics);
assert.ok(retainedProjectileGraphics.getLocalBounds().minX > 65, "Projectile fallback update must clear stale geometry");
assert.equal(projectileRecords.get("lower-projectile-text").value.unitObjects.texts[0], retainedProjectileText);
assert.equal(retainedProjectileText.text, "15", "Damage-hit update must update retained Text content");
assert.equal(retainedProjectileText.position.y, 35, "Damage-hit movement must update retained Text vertical position");
const alternateProjectileAtlases = new Map(projectileAtlases);
retainedProjectileSprite.anchor.y = 0;
retainedProjectileSprite.rotation = 2;
retainedProjectileSprite.scale.y = 3;
drawProjectileFrame(primaryProjectileLayer, projectileWorld, projectileBelow40, projectileAtLeast40, alternateProjectileAtlases);
assert.equal(retainedProjectileSprite.anchor.y, 0.5, "Atlas-map identity change must rerun complete Sprite reset");
assert.ok(Math.abs(retainedProjectileSprite.rotation - Math.atan2(16, 18)) < 1e-12, "Atlas-map identity change must reset Sprite rotation");
assert.equal(retainedProjectileSprite.scale.y, 1, "Atlas-map identity change must reset Sprite scale y");
projectileBelow40[1].kind = "arrow";
projectileWorld.engineSettings.projectileColor = 0x123456;
drawProjectileFrame(primaryProjectileLayer);
let projectileArrowStroke = retainedProjectileGraphics.context.instructions.find(({ action }) => action === "stroke");
assert.equal(projectileArrowStroke.data.style.color, 0x123456, "Same-shape cannon-to-arrow transition must clear geometry and install player color");
projectileWorld.engineSettings.projectileColor = 0x654321;
drawProjectileFrame(primaryProjectileLayer);
projectileArrowStroke = retainedProjectileGraphics.context.instructions.find(({ action }) => action === "stroke");
assert.equal(projectileArrowStroke.data.style.color, 0x654321, "Engine-setting change must update retained fallback style");
const retainedUpperProjectileGraphics = upperProjectileRecord.unitObjects.graphics[0];
const upperBoundsBeforeElapsed = retainedUpperProjectileGraphics.getLocalBounds().width;
projectileWorld.elapsed = 2;
drawProjectileFrame(primaryProjectileLayer);
assert.equal(upperProjectileRecord.unitObjects.graphics[0], retainedUpperProjectileGraphics, "Elapsed-time animation must retain projectile Graphics identity");
assert.notEqual(retainedUpperProjectileGraphics.getLocalBounds().width, upperBoundsBeforeElapsed, "Elapsed-time change must redraw animated axe geometry");
const projectileCreatedAfterWarmup = tracked.snapshotDisplayObjectPerformance().trackedCreated;
for (let frame = 0; frame < 300; frame += 1) drawProjectileFrame(primaryProjectileLayer);
assert.equal(tracked.snapshotDisplayObjectPerformance().trackedCreated, projectileCreatedAfterWarmup, "300 unchanged production projectile frames must create zero display objects");
const shapeProjectileLayer = new Container();
const shapeProjectile = projectileFixture("shape-projectile", 10, "arrow", { missileId: "missile" });
const shapeProjectileWorld = { ...projectileWorld, projectiles: [shapeProjectile] };
drawProjectileFrame(shapeProjectileLayer, shapeProjectileWorld, [shapeProjectile], []);
const shapeProjectileSprite = lastSeenCaches.get(shapeProjectileLayer).kinds.projectile.active.get("shape-projectile").value;
Object.assign(shapeProjectile, { missileId: null, className: "missile-class-hit", displayDamage: 8 });
drawProjectileFrame(shapeProjectileLayer, shapeProjectileWorld, [shapeProjectile], []);
const shapeProjectileText = lastSeenCaches.get(shapeProjectileLayer).kinds.projectile.active.get("shape-projectile").value;
assert.notEqual(shapeProjectileText.root, shapeProjectileSprite.root, "Sprite-to-Text projectile shape transition must replace identity");
assert.equal(shapeProjectileSprite.root.destroyed, true, "Sprite-to-Text projectile shape transition must destroy incompatible record");
Object.assign(shapeProjectile, { className: null, displayDamage: undefined, kind: "cannon" });
drawProjectileFrame(shapeProjectileLayer, shapeProjectileWorld, [shapeProjectile], []);
const shapeProjectileGraphics = lastSeenCaches.get(shapeProjectileLayer).kinds.projectile.active.get("shape-projectile").value;
assert.notEqual(shapeProjectileGraphics.root, shapeProjectileText.root, "Text-to-Graphics projectile shape transition must replace identity");
assert.equal(shapeProjectileText.root.destroyed, true, "Text-to-Graphics projectile shape transition must destroy incompatible record");
assert.equal(lastSeenCaches.get(shapeProjectileLayer).kinds.projectile.pool.length, 0, "Shape transitions must not pool without reset contract");
disposeWorldRenderCache(lastSeenCaches.get(shapeProjectileLayer), detachLastSeenRecord, destroyLastSeenRecord);
lastSeenCaches.delete(shapeProjectileLayer);
projectilePrepared.delete(shapeProjectileLayer);
drawProjectileFrame(splitProjectileLayer);
assert.notEqual(lastSeenCaches.get(splitProjectileLayer).kinds.projectile.active.get("lower-projectile-sprite").value.root, projectileSpriteRecord.root, "Split viewport must own independent projectile objects");
drawProjectileFrame(primaryProjectileLayer, projectileWorld, projectileBelow40.filter(({ id }) => id !== "lower-projectile-sprite"), projectileAtLeast40);
assert.equal(primaryProjectileCache.kinds.projectile.dormant.get("lower-projectile-sprite").value.root, projectileSpriteRecord.root, "Culled projectile must detach to dormant");
drawProjectileFrame(primaryProjectileLayer);
assert.equal(primaryProjectileCache.kinds.projectile.active.get("lower-projectile-sprite").value.root, projectileSpriteRecord.root, "Projectile cull re-entry must retain identity");
projectileWorld.projectiles = projectileWorld.projectiles.filter(({ id }) => id !== "lower-projectile-text");
projectileBelow40 = projectileBelow40.filter(({ id }) => id !== "lower-projectile-text");
drawProjectileFrame(primaryProjectileLayer);
assert.equal(projectileTextRecord.root.destroyed, true, "Projectile removal must destroy its exact record while pooling is disabled");
assert.equal(primaryProjectileCache.kinds.projectile.pool.length, 0, "Projectile pool must remain empty without a reset contract");
const replacementProjectileBelow = [projectileFixture("lower-projectile-sprite", 10, "arrow", { missileId: "missile" })];
const replacementProjectileWorld = { ...projectileWorld, projectiles: replacementProjectileBelow };
drawProjectileFrame(primaryProjectileLayer, replacementProjectileWorld, replacementProjectileBelow, []);
assert.notEqual(lastSeenCaches.get(primaryProjectileLayer).kinds.projectile.active.get("lower-projectile-sprite").value.root, projectileSpriteRecord.root, "World replacement with same projectile ID must create a new identity");
assert.equal(projectileSpriteRecord.root.destroyed, true, "Projectile world replacement must destroy old identity");
for (const [layer, cache] of [[primaryProjectileLayer, lastSeenCaches.get(primaryProjectileLayer)], [splitProjectileLayer, lastSeenCaches.get(splitProjectileLayer)]]) {
  disposeWorldRenderCache(cache, detachLastSeenRecord, destroyLastSeenRecord);
  lastSeenCaches.delete(layer);
  projectilePrepared.delete(layer);
}
assert.equal(tracked.snapshotDisplayObjectPerformance().windowLiveDelta, 0, "Production projectile split/world-replacement disposal must return tracked live delta to zero");
tracked.setDisplayObjectPerformanceCapture(false);

tracked.resetDisplayObjectPerformance();
tracked.setDisplayObjectPerformanceCapture(true);
const effectFixture = (id, drawLevel, kind, overrides = {}) => ({
  id, drawLevel, kind, player: 0, x: drawLevel, y: drawLevel, radius: 30,
  age: 0.1, duration: 1, sourceTypeId: null, sourceUnitId: null, missileId: null, spellId: null,
  ...overrides
});
let spellEffectsBelow40 = [
  effectFixture("lower-effect-sprite", 10, "fireball", { missileId: "missile" }),
  effectFixture("lower-effect-graphics", 20, "explosion"),
  effectFixture("lower-effect-area", 30, "blizzard", { missileId: "area", spellId: "spell-blizzard" })
];
let spellEffectsAtLeast40 = [effectFixture("upper-effect-graphics", 40, "death-coil")];
const areaDefinition = { fields: 2, shards: 3, startOffsetX: -32, startOffsetY: -32 };
const spellEffectWorld = {
  spellEffects: [...spellEffectsBelow40, ...spellEffectsAtLeast40], tick: 0, tickRate: 30, tileSize: 32,
  engineSettings: { gameSpeed: 30, enhancedEffectsDefault: true },
  spellDefinitions: [{ id: "spell-blizzard", areaBombardments: [areaDefinition] }],
  missileDefinitions: [{ id: "area", blizzardSpeed: 10 }]
};
const spellAtlas = { frameCount: 4, framesPerDirection: 4, numDirections: 1, sleep: 1, frameWidth: 32, frameHeight: 32 };
const spellEffectAtlases = new Map([["missile", spellAtlas], ["area", spellAtlas]]);
const primarySpellEffectLayer = new Container();
const splitSpellEffectLayer = new Container();
const spellEffectUnitSentinel = new Container();
const drawSpellEffectFrame = (layer, world = spellEffectWorld, below40 = spellEffectsBelow40, atLeast40 = spellEffectsAtLeast40, atlases = spellEffectAtlases) => {
  layer.removeChildren();
  spellEffectPrepared.set(layer, { world, effects: { below40, atLeast40 } });
  retainedLastSeen.drawSpellEffects(layer, world, atlases, below40);
  layer.addChild(spellEffectUnitSentinel);
  retainedLastSeen.drawSpellEffects(layer, world, atlases, atLeast40);
};
const spellReconciliationsBefore = lastSeenReconciliations;
drawSpellEffectFrame(primarySpellEffectLayer);
assert.equal(lastSeenReconciliations, spellReconciliationsBefore + 1, "Production spell-effect renderer must reconcile once across strata");
const primarySpellEffectCache = lastSeenCaches.get(primarySpellEffectLayer);
const spellRecords = primarySpellEffectCache.kinds.spellEffect.active;
const singleSpellRecord = spellRecords.get("lower-effect-sprite").value;
const graphicsSpellRecord = spellRecords.get("lower-effect-graphics").value;
const areaSpellRecord = spellRecords.get("lower-effect-area").value;
const upperSpellRecord = spellRecords.get("upper-effect-graphics").value;
assert.deepEqual(primarySpellEffectLayer.children, [
  singleSpellRecord.root, graphicsSpellRecord.root, areaSpellRecord.root,
  graphicsSpellRecord.unitObjects.graphics[0], spellEffectUnitSentinel,
  upperSpellRecord.root, upperSpellRecord.unitObjects.graphics[0]
], "Production spell effects must preserve exact lower/unit/upper painter order");
const singleSpellSprite = singleSpellRecord.unitObjects.sprites[0];
const spellGraphics = graphicsSpellRecord.unitObjects.graphics[0];
const areaSprites = [...areaSpellRecord.unitObjects.sprites];
assert.equal(singleSpellSprite.texture, Texture.EMPTY);
assert.equal(singleSpellSprite.anchor.x, 0.5);
assert.equal(singleSpellSprite.anchor.y, 0.5);
assert.equal(singleSpellSprite.position.x, 10);
assert.equal(singleSpellSprite.position.y, 10);
assert.equal(singleSpellSprite.alpha, 0.9);
assert.equal(singleSpellSprite.scale.x, 1.35);
assert.equal(singleSpellSprite.scale.y, 1.35);
assert.equal(lastSeenRoots.has(spellGraphics), true, "Spell-effect Graphics must register for immediate-layer preservation");
assert.ok(spellGraphics.getLocalBounds().width > 0, "Spell-effect fallback must draw non-empty geometry");
assert.equal(areaSprites.length, 3, "Persistent spell effect must retain the exact configured shard count");
for (const sprite of areaSprites) {
  assert.equal(sprite.anchor.x, 0.5);
  assert.equal(sprite.anchor.y, 0.5);
  assert.equal(sprite.scale.x, 1.0625);
  assert.equal(sprite.scale.y, 1.0625);
}
const areaPositionsBefore = areaSprites.map((sprite) => [sprite.position.x, sprite.position.y]);
const areaTexturesBefore = areaSprites.map((sprite) => sprite.texture);
const areaAlphasBefore = areaSprites.map((sprite) => sprite.alpha);
spellEffectWorld.tickRate = 1;
drawSpellEffectFrame(primarySpellEffectLayer);
assert.equal(spellRecords.get("lower-effect-sprite").value.unitObjects.sprites[0], singleSpellSprite, "Tick-rate change must retain Sprite identity");
assert.equal(singleSpellSprite.texture, Texture.WHITE, "Tick-rate change must update retained spell frame");
spellEffectWorld.tickRate = 30;
spellEffectsBelow40[0].age = 0.01;
spellEffectsBelow40[0].x = 14;
spellEffectsBelow40[0].y = 16;
spellEffectsBelow40[1].age = 0.6;
spellEffectsBelow40[2].age = 0.2;
spellEffectsBelow40[1].x = 80;
spellEffectWorld.tick = 10;
drawSpellEffectFrame(primarySpellEffectLayer);
assert.equal(spellRecords.get("lower-effect-sprite").value.unitObjects.sprites[0], singleSpellSprite);
assert.equal(singleSpellSprite.texture, Texture.WHITE, "Spell frame change must update retained Sprite texture");
assert.equal(singleSpellSprite.position.x, 14);
assert.equal(singleSpellSprite.position.y, 16);
assert.equal(singleSpellSprite.alpha, 0.99);
assert.equal(spellRecords.get("lower-effect-graphics").value.unitObjects.graphics[0], spellGraphics);
assert.ok(spellGraphics.getLocalBounds().minX > 40, "Spell fallback update must clear stale geometry");
assert.deepEqual(areaSpellRecord.unitObjects.sprites, areaSprites, "Persistent spell update must retain every Sprite identity");
assert.ok(areaSprites.some((sprite, index) => sprite.position.x !== areaPositionsBefore[index][0] || sprite.position.y !== areaPositionsBefore[index][1]), "Persistent pulse tick must update impact positions");
assert.ok(areaSprites.some((sprite, index) => sprite.texture !== areaTexturesBefore[index]), "Persistent age change must update shard textures");
assert.ok(areaSprites.some((sprite, index) => sprite.alpha !== areaAlphasBefore[index]), "Persistent age change must update shard alpha");
const alternateSpellAtlases = new Map(spellEffectAtlases);
singleSpellSprite.anchor.y = 0;
singleSpellSprite.scale.y = 9;
drawSpellEffectFrame(primarySpellEffectLayer, spellEffectWorld, spellEffectsBelow40, spellEffectsAtLeast40, alternateSpellAtlases);
assert.equal(singleSpellSprite.anchor.y, 0.5, "Atlas-map identity change must reset spell Sprite anchor");
assert.equal(singleSpellSprite.scale.y, 1.35, "Atlas-map identity change must reset spell Sprite scale");
const spellCreatedAfterWarmup = tracked.snapshotDisplayObjectPerformance().trackedCreated;
for (let frame = 0; frame < 300; frame += 1) drawSpellEffectFrame(primarySpellEffectLayer);
assert.equal(tracked.snapshotDisplayObjectPerformance().trackedCreated, spellCreatedAfterWarmup, "300 unchanged spell-effect frames must create zero display objects");
const shapeSpellLayer = new Container();
const shapeEffect = effectFixture("shape-effect", 10, "blizzard", { missileId: "area", spellId: "spell-blizzard" });
const shapeSpellWorld = { ...spellEffectWorld, spellEffects: [shapeEffect], spellDefinitions: [{ id: "spell-blizzard", areaBombardments: [{ ...areaDefinition, shards: 2 }] }] };
drawSpellEffectFrame(shapeSpellLayer, shapeSpellWorld, [shapeEffect], []);
const twoSpriteShape = lastSeenCaches.get(shapeSpellLayer).kinds.spellEffect.active.get("shape-effect").value;
shapeSpellWorld.spellDefinitions[0].areaBombardments[0].shards = 4;
drawSpellEffectFrame(shapeSpellLayer, shapeSpellWorld, [shapeEffect], []);
const fourSpriteShape = lastSeenCaches.get(shapeSpellLayer).kinds.spellEffect.active.get("shape-effect").value;
assert.notEqual(fourSpriteShape.root, twoSpriteShape.root, "Persistent shard-count change must replace incompatible record");
assert.equal(twoSpriteShape.root.destroyed, true, "Persistent shard-count change must destroy old record");
shapeEffect.missileId = null;
drawSpellEffectFrame(shapeSpellLayer, shapeSpellWorld, [shapeEffect], []);
const graphicsShape = lastSeenCaches.get(shapeSpellLayer).kinds.spellEffect.active.get("shape-effect").value;
assert.notEqual(graphicsShape.root, fourSpriteShape.root, "Multi-Sprite-to-Graphics transition must replace record");
assert.equal(fourSpriteShape.root.destroyed, true, "Multi-Sprite-to-Graphics transition must destroy old record");
assert.equal(lastSeenCaches.get(shapeSpellLayer).kinds.spellEffect.pool.length, 0, "Spell-effect pooling must remain disabled");
disposeWorldRenderCache(lastSeenCaches.get(shapeSpellLayer), detachLastSeenRecord, destroyLastSeenRecord);
lastSeenCaches.delete(shapeSpellLayer);
spellEffectPrepared.delete(shapeSpellLayer);
drawSpellEffectFrame(splitSpellEffectLayer);
assert.notEqual(lastSeenCaches.get(splitSpellEffectLayer).kinds.spellEffect.active.get("lower-effect-sprite").value.root, singleSpellRecord.root, "Split viewport must own independent spell-effect objects");
drawSpellEffectFrame(primarySpellEffectLayer, spellEffectWorld, spellEffectsBelow40.filter(({ id }) => id !== "lower-effect-sprite"), spellEffectsAtLeast40);
assert.equal(primarySpellEffectCache.kinds.spellEffect.dormant.get("lower-effect-sprite").value.root, singleSpellRecord.root, "Culled spell effect must detach to dormant");
drawSpellEffectFrame(primarySpellEffectLayer);
assert.equal(primarySpellEffectCache.kinds.spellEffect.active.get("lower-effect-sprite").value.root, singleSpellRecord.root, "Spell-effect cull re-entry must retain identity");
spellEffectWorld.spellEffects = spellEffectWorld.spellEffects.filter(({ id }) => id !== "upper-effect-graphics");
spellEffectsAtLeast40 = [];
drawSpellEffectFrame(primarySpellEffectLayer);
assert.equal(upperSpellRecord.root.destroyed, true, "Spell-effect expiry/removal must destroy exact record");
assert.equal(primarySpellEffectCache.kinds.spellEffect.pool.length, 0, "Spell-effect pool must stay empty without reset contract");
const replacementSpellBelow = [effectFixture("lower-effect-sprite", 10, "fireball", { missileId: "missile" })];
const replacementSpellWorld = { ...spellEffectWorld, spellEffects: replacementSpellBelow };
drawSpellEffectFrame(primarySpellEffectLayer, replacementSpellWorld, replacementSpellBelow, []);
assert.notEqual(lastSeenCaches.get(primarySpellEffectLayer).kinds.spellEffect.active.get("lower-effect-sprite").value.root, singleSpellRecord.root, "World replacement with same spell-effect ID must create new identity");
assert.equal(singleSpellRecord.root.destroyed, true, "Spell-effect world replacement must destroy old identity");
for (const [layer, cache] of [[primarySpellEffectLayer, lastSeenCaches.get(primarySpellEffectLayer)], [splitSpellEffectLayer, lastSeenCaches.get(splitSpellEffectLayer)]]) {
  disposeWorldRenderCache(cache, detachLastSeenRecord, destroyLastSeenRecord);
  lastSeenCaches.delete(layer);
  spellEffectPrepared.delete(layer);
}
assert.equal(tracked.snapshotDisplayObjectPerformance().windowLiveDelta, 0, "Spell-effect split/world-replacement disposal must return tracked live delta to zero");
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

const corpseDormantCache = createWorldRenderCache({});
const corpseLiveKeys = new Set();
for (let index = 0; index < 66; index += 1) {
  const key = `corpse-${index}`;
  corpseLiveKeys.add(key);
  reconcileWorldRenderKind(options(corpseDormantCache, "corpse", [{ key, shape: "corpse-graphics-v1" }], new Set(corpseLiveKeys)));
}
reconcileWorldRenderKind(options(corpseDormantCache, "corpse", [], corpseLiveKeys));
assert.deepEqual(
  [...corpseDormantCache.kinds.corpse.dormant.keys()],
  Array.from({ length: 64 }, (_, index) => `corpse-${index + 2}`),
  "Corpse dormant cache must retain the newest 64 records"
);

const projectileDormantCache = createWorldRenderCache({});
const projectileLiveKeys = new Set();
for (let index = 0; index < 66; index += 1) {
  const key = `dormant-projectile-${index}`;
  projectileLiveKeys.add(key);
  reconcileWorldRenderKind({ ...options(projectileDormantCache, "projectile", [{ key, shape: "projectile-graphics-v1" }], new Set(projectileLiveKeys)), canResetForPool: undefined });
}
reconcileWorldRenderKind({ ...options(projectileDormantCache, "projectile", [], projectileLiveKeys), canResetForPool: undefined });
assert.deepEqual(
  [...projectileDormantCache.kinds.projectile.dormant.keys()],
  Array.from({ length: 64 }, (_, index) => `dormant-projectile-${index + 2}`),
  "Projectile dormant cache must retain the newest 64 records"
);
assert.equal(projectileDormantCache.kinds.projectile.pool.length, 0, "Projectile pool must stay empty without reset contract");

const spellDormantCache = createWorldRenderCache({});
const spellLiveKeys = new Set();
for (let index = 0; index < 66; index += 1) {
  const key = `dormant-effect-${index}`;
  spellLiveKeys.add(key);
  reconcileWorldRenderKind({ ...options(spellDormantCache, "spellEffect", [{ key, shape: "spell-effect-graphics-v1" }], new Set(spellLiveKeys)), canResetForPool: undefined });
}
reconcileWorldRenderKind({ ...options(spellDormantCache, "spellEffect", [], spellLiveKeys), canResetForPool: undefined });
assert.deepEqual(
  [...spellDormantCache.kinds.spellEffect.dormant.keys()],
  Array.from({ length: 64 }, (_, index) => `dormant-effect-${index + 2}`),
  "Spell-effect dormant cache must retain newest 64 records"
);
assert.equal(spellDormantCache.kinds.spellEffect.pool.length, 0, "Spell-effect pool must stay empty without reset contract");

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
