import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/view/renderPreparation.ts", import.meta.url), "utf8");
assert.doesNotMatch(source, /worldSelectors|Math\.random|Date\.now|crypto\.getRandomValues/);
assert.doesNotMatch(source, /pixi\.js|Container|Graphics|Sprite|Texture/);
assert.match(source, /if \(!index\.has\(key\)\) \{\s*index\.set\(key, value\);/);
const rendererSource = readFileSync(new URL("../src/view/renderWorld.ts", import.meta.url), "utf8");
assert.equal(rendererSource.match(/const prepared = prepareWorldRenderSnapshot\(world, manifest, viewport\);/g)?.length, 2, "Active and split viewports each prepare one snapshot");
assert.doesNotMatch(rendererSource, /worldSelectors|\[\.\.\.world\.(units|corpses|projectiles|spellEffects)\]/);
assert.doesNotMatch(rendererSource, /manifest\.animations\.find|pendingAttacks\.(find|some)|activeResearch\.(find|some)|world\.units\.find/);
assert.match(rendererSource, /prepared\.corpses\.below40[\s\S]*prepared\.corpses\.atLeast40/);
assert.match(rendererSource, /prepared\.projectiles\.below40[\s\S]*prepared\.projectiles\.atLeast40/);
assert.match(rendererSource, /prepared\.spellEffects\.below40[\s\S]*prepared\.spellEffects\.atLeast40/);
assert.match(rendererSource, /prepared\.unitById\.get\(unit\.teleportDestinationId\)/);
assert.match(rendererSource, /prepared\.researchByBuildingId\.get\(unit\.id\)/);
assert.match(rendererSource, /prepared\.pendingAttackBySourceId\.get\(unit\.id\)/);
const trackedCallCount = (name) => rendererSource.match(new RegExp(name + "\\(", "g"))?.length ?? 0;
assert.deepEqual({
  containers: trackedCallCount("createTrackedContainer"),
  graphics: trackedCallCount("createTrackedGraphics"),
  sprites: trackedCallCount("createTrackedSprite"),
  texts: trackedCallCount("createTrackedText"),
  destroys: trackedCallCount("destroyTrackedDisplayObject")
}, { containers: 5, graphics: 12, sprites: 12, texts: 2, destroys: 2 }, "Plan 018 tracked Pixi call sites must remain unchanged");

const sourceFile = ts.createSourceFile("renderPreparation.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const executableSource = sourceFile.statements
  .filter((statement) => !ts.isImportDeclaration(statement) && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement))
  .map((statement) => statement.getText(sourceFile))
  .join("\n");
const javascript = ts.transpileModule(executableSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

const load = Function(
  "exports",
  "isCircleVisibleToPlayer",
  "isInvisibleUtilityUnit",
  "isUnitHiddenInConstruction",
  "isUnitInsideResourceSource",
  "isUnitVisibleToPlayer",
  `${javascript}
  return {
    getPlan021RenderPreparationDiagnostics,
    prepareWorldRenderSnapshot,
    resetPlan021RenderPreparationDiagnostics
  };`
);

const {
  getPlan021RenderPreparationDiagnostics,
  prepareWorldRenderSnapshot,
  resetPlan021RenderPreparationDiagnostics
} = load(
  {},
  (_world, x) => x < 500,
  (unit) => unit.utility === true,
  (unit) => Boolean(unit.hiddenInConstructionId),
  (unit) => unit.insideResource === true,
  (_world, unit) => unit.visible !== false
);

const unit = (id, x, drawLevel, extra = {}) => ({
  id,
  x,
  y: 20,
  radius: 8,
  frameWidth: 16,
  frameHeight: 16,
  drawLevel,
  ...extra
});
const world = {
  visibilityPlayer: 0,
  tileSize: 32,
  map: { width: 64, height: 64 },
  exploredTiles: new Uint8Array(64 * 64).fill(1),
  units: [
    unit("offscreen", 1000, 1),
    unit("visible", 20, 2),
    unit("hidden", 24, 0, { hiddenInConstructionId: "site" })
  ],
  corpses: [],
  projectiles: [],
  pendingAttacks: [],
  spellEffects: [],
  activeResearch: []
};
const manifest = { animations: [], missiles: [] };
const viewport = { left: 0, top: 0, right: 100, bottom: 100 };
const sourceOrder = world.units.map(({ id }) => id);

resetPlan021RenderPreparationDiagnostics();
const snapshot = prepareWorldRenderSnapshot(world, manifest, viewport);
assert.deepEqual(snapshot.units.map(({ id }) => id), ["visible"]);
assert.deepEqual(world.units.map(({ id }) => id), sourceOrder, "Preparation must not mutate authoritative arrays");

const diagnostics = getPlan021RenderPreparationDiagnostics().plan021.renderPreparation;
assert.equal(diagnostics.retainedCounts.units, 1);
assert.equal(
  diagnostics.sortedItems.units,
  1,
  "Cull-before-sort must sort only the retained visible unit"
);


const detailedUnit = (id, x, y, drawLevel, extra = {}) => ({
  id, x, y, radius: 8, frameWidth: 16, frameHeight: 16, drawLevel, ...extra
});
const corpse = (id, x, y, drawLevel, extra = {}) => ({
  id, x, y, radius: 8, drawLevel, visibleUnderFog: false, ...extra
});
const projectile = (id, x, y, drawLevel, extra = {}) => ({
  id, x, y, originX: x, originY: y, targetX: x + 10, targetY: y,
  drawLevel, kind: "arrow", className: null, missileId: null, ...extra
});
const effect = (id, x, y, drawLevel) => ({ id, x, y, radius: 10, drawLevel });
const duplicateAnimations = [
  { id: "duplicate-animation", source: "first", actions: { Still: [{ frame: 3, wait: 1 }] } },
  { id: "duplicate-animation", source: "second", actions: { Still: [{ frame: 99, wait: 1 }] } }
];
const detailedManifest = {
  animations: duplicateAnimations,
  missiles: [{ id: "large", file: "large.png", size: [64, 40] }]
};
const detailedWorld = {
  visibilityPlayer: 0,
  tileSize: 32,
  map: { width: 64, height: 64 },
  exploredTiles: new Uint8Array(64 * 64).fill(1),
  units: [
    detailedUnit("far", 400, 10, 1),
    detailedUnit("same-id", 20, 30, 12, { marker: "first" }),
    detailedUnit("same-id", 20, 32, 12, { marker: "second" }),
    detailedUnit("unit-z", 30, 20, 5),
    detailedUnit("unit-a", 30, 20, 5),
    detailedUnit("level-40", 40, 40, 40),
    detailedUnit("edge", -100, 50, 7),
    detailedUnit("hidden", 20, 20, 0, { hiddenInConstructionId: "site" }),
    detailedUnit("utility", 20, 20, 0, { utility: true }),
    detailedUnit("inside", 20, 20, 0, { insideResource: true }),
    detailedUnit("fogged", 20, 20, 0, { visible: false })
  ],
  corpses: [
    corpse("corpse-z", 25, 25, 39), corpse("corpse-a", 25, 25, 39),
    corpse("corpse-40", 35, 35, 40), corpse("corpse-far", 400, 20, 1),
    corpse("corpse-fogged", 600, 20, 1)
  ],
  projectiles: [
    projectile("projectile-z", 20, 20, 39), projectile("projectile-a", 25, 20, 39),
    projectile("projectile-40", 30, 20, 40),
    projectile("projectile-edge", -31, 20, 39, { missileId: "large" }),
    projectile("projectile-far", 400, 20, 1), projectile("projectile-fogged", 600, 20, 1),
    projectile("projectile-parabolic", 50, 30, 39, {
      className: "missile-class-parabolic", originX: 0, originY: 30, targetX: 100, targetY: 30
    })
  ],
  pendingAttacks: [
    { sourceId: "same-id", targetId: "first-target", remainingSeconds: 0.1 },
    { sourceId: "same-id", targetId: "second-target", remainingSeconds: 9.9 }
  ],
  spellEffects: [
    effect("effect-z", 20, 20, 39), effect("effect-a", 20, 20, 39),
    effect("effect-40", 30, 20, 40), effect("effect-far", 400, 20, 1),
    effect("effect-fogged", 600, 20, 1)
  ],
  activeResearch: [
    { buildingId: "same-id", upgradeId: "first-upgrade", remainingSeconds: 0.2 },
    { buildingId: "same-id", upgradeId: "second-upgrade", remainingSeconds: 8.2 }
  ]
};
const viewportA = { left: 0, top: 0, right: 100, bottom: 100 };
const viewportB = { left: 300, top: 0, right: 500, bottom: 100 };
const intersects = (x, y, radius, view) => x + radius >= view.left
  && x - radius <= view.right && y + radius >= view.top && y - radius <= view.bottom;
const unitOrder = (left, right) => left.drawLevel - right.drawLevel
  || (left.y + left.radius) - (right.y + right.radius) || left.id.localeCompare(right.id);
const corpseOrder = unitOrder;
const projectileOrder = (left, right) => left.drawLevel - right.drawLevel;
const effectOrder = (left, right) => left.drawLevel - right.drawLevel
  || left.y - right.y || left.id.localeCompare(right.id);
const projectilePosition = (value) => {
  if (value.className !== "missile-class-parabolic") return { x: value.x, y: value.y };
  const total = Math.max(1, Math.hypot(value.targetX - value.originX, value.targetY - value.originY));
  const remaining = Math.hypot(value.targetX - value.x, value.targetY - value.y);
  const progress = Math.max(0, Math.min(1, 1 - remaining / total));
  const arc = Math.min(72, Math.max(24, total * 0.18));
  return { x: value.x, y: value.y - Math.sin(progress * Math.PI) * arc };
};
const projectileRadius = (value) => {
  const missile = value.missileId
    ? detailedManifest.missiles.find((candidate) => candidate.id === value.missileId)
    : undefined;
  if (missile?.file && missile.size) return Math.ceil(Math.max(...missile.size) * 0.5);
  if (value.kind === "siege" || value.kind === "torpedo") return 28;
  return value.kind === "cannon" ? 18 : 22;
};
const partitionIds = (values) => ({
  below40: values.filter((value) => value.drawLevel < 40).map((value) => value.id),
  atLeast40: values.filter((value) => value.drawLevel >= 40).map((value) => value.id)
});
const referenceFor = (view) => {
  const visibleUnits = [...detailedWorld.units].sort(unitOrder).filter((value) =>
    !Boolean(value.hiddenInConstructionId) && value.utility !== true && value.insideResource !== true
    && value.visible !== false
    && intersects(value.x, value.y, Math.max(value.radius + 96, value.frameWidth, value.frameHeight), view));
  const visibleCorpses = [...detailedWorld.corpses].sort(corpseOrder).filter((value) =>
    value.x < 500 && intersects(value.x, value.y, value.radius + 64, view));
  const visibleProjectiles = [...detailedWorld.projectiles].sort(projectileOrder).filter((value) => {
    const position = projectilePosition(value);
    const radius = projectileRadius(value);
    return position.x < 500 && intersects(position.x, position.y, radius, view);
  });
  const visibleEffects = [...detailedWorld.spellEffects].sort(effectOrder).filter((value) =>
    value.x < 500 && intersects(value.x, value.y, value.radius + 24, view));
  return {
    units: visibleUnits.map((value) => value.id),
    corpses: partitionIds(visibleCorpses),
    projectiles: partitionIds(visibleProjectiles),
    spellEffects: partitionIds(visibleEffects)
  };
};
const normalize = (value) => ({
  units: value.units.map((item) => item.id),
  corpses: { below40: value.corpses.below40.map((item) => item.id), atLeast40: value.corpses.atLeast40.map((item) => item.id) },
  projectiles: { below40: value.projectiles.below40.map((item) => item.id), atLeast40: value.projectiles.atLeast40.map((item) => item.id) },
  spellEffects: { below40: value.spellEffects.below40.map((item) => item.id), atLeast40: value.spellEffects.atLeast40.map((item) => item.id) }
});
const originalDetailedOrder = Object.fromEntries(
  ["units", "corpses", "projectiles", "spellEffects"].map((key) => [key, detailedWorld[key].map((item) => item.id)])
);

resetPlan021RenderPreparationDiagnostics();
const detailedA = prepareWorldRenderSnapshot(detailedWorld, detailedManifest, viewportA);
assert.deepEqual(normalize(detailedA), referenceFor(viewportA), "Prepared IDs, order, and strata must match immediate rendering");
assert.deepEqual(Object.fromEntries(
  ["units", "corpses", "projectiles", "spellEffects"].map((key) => [key, detailedWorld[key].map((item) => item.id)])
), originalDetailedOrder, "Preparation must not mutate authoritative arrays");
assert.equal(detailedA.unitById.get("same-id")?.marker, "first");
assert.equal(detailedA.researchByBuildingId.get("same-id")?.upgradeId, "first-upgrade");
assert.equal(detailedA.pendingAttackBySourceId.get("same-id")?.targetId, "first-target");
assert.equal(detailedA.animationById.get("duplicate-animation")?.source, "first");
const detailedDiagnostics = getPlan021RenderPreparationDiagnostics().plan021.renderPreparation;
const retained = {
  units: detailedA.units.length,
  corpses: detailedA.corpses.below40.length + detailedA.corpses.atLeast40.length,
  projectiles: detailedA.projectiles.below40.length + detailedA.projectiles.atLeast40.length,
  spellEffects: detailedA.spellEffects.below40.length + detailedA.spellEffects.atLeast40.length
};
assert.deepEqual(detailedDiagnostics.sourceCounts, {
  units: detailedWorld.units.length, corpses: detailedWorld.corpses.length,
  projectiles: detailedWorld.projectiles.length, spellEffects: detailedWorld.spellEffects.length
});
assert.deepEqual(detailedDiagnostics.retainedCounts, retained);
assert.deepEqual(detailedDiagnostics.sortCounts, { units: 1, corpses: 1, projectiles: 1, spellEffects: 1 });
assert.deepEqual(detailedDiagnostics.sortedItems, retained, "Only retained candidates may enter sorting");
assert.equal(detailedDiagnostics.snapshotCount, 1);

const detailedB = prepareWorldRenderSnapshot(detailedWorld, detailedManifest, viewportB);
assert.deepEqual(normalize(detailedB), referenceFor(viewportB));
assert.notEqual(detailedA, detailedB, "Each viewport must receive an independent snapshot");
assert.notEqual(detailedA.units, detailedB.units, "Dynamic lists must be viewport-local");
assert.notEqual(detailedA.unitById, detailedB.unitById, "Dynamic indexes must be rebuilt per snapshot");
assert.notEqual(detailedA.researchByBuildingId, detailedB.researchByBuildingId);
assert.notEqual(detailedA.pendingAttackBySourceId, detailedB.pendingAttackBySourceId);
assert.equal(detailedA.animationById, detailedB.animationById, "Static animation index may reuse manifest identity");
const otherManifest = { animations: duplicateAnimations, missiles: detailedManifest.missiles };
const otherSnapshot = prepareWorldRenderSnapshot(detailedWorld, otherManifest, viewportA);
assert.notEqual(detailedA.animationById, otherSnapshot.animationById, "Animation cache must be keyed only by manifest identity");
assert.equal(getPlan021RenderPreparationDiagnostics().plan021.renderPreparation.snapshotCount, 3);
resetPlan021RenderPreparationDiagnostics();
assert.deepEqual(getPlan021RenderPreparationDiagnostics().plan021.renderPreparation, {
  sourceCounts: { units: 0, corpses: 0, projectiles: 0, spellEffects: 0 },
  retainedCounts: { units: 0, corpses: 0, projectiles: 0, spellEffects: 0 },
  sortCounts: { units: 0, corpses: 0, projectiles: 0, spellEffects: 0 },
  sortedItems: { units: 0, corpses: 0, projectiles: 0, spellEffects: 0 },
  snapshotCount: 0
});


const rendererSourceFile = ts.createSourceFile("renderWorld.ts", rendererSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const rendererFunctionNames = [
  "getAnimatedFrameNumber", "animationFrameCursorForUnitAction",
  "sourceAttackAnimationLaunchDelayCyclesForRender", "animationActionForUnit",
  "isSourceUpgradeProduction", "spriteDirectionForFacing",
  "getCorpseFrameNumber", "getLastSeenBuildingFrameNumber"
];
const rendererDeclarations = rendererFunctionNames.map((name) => {
  const declaration = rendererSourceFile.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration, "Expected renderWorld.ts to define " + name);
  return declaration.getText(rendererSourceFile);
});
const rendererJavascript = ts.transpileModule(rendererDeclarations.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;
const rendererFunctions = Function(
  "sourceDefaultGameSpeed", "sourceButtonAppliesTo", "sourceCorpseAgeTicks",
  rendererJavascript + "\nreturn { " + rendererFunctionNames.join(", ") + " };"
)(() => 10, () => false, (_world, corpseValue) => corpseValue.ageTicks);
const frameUnit = detailedUnit("frame-unit", 20, 20, 10, {
  animation: "frame-animation", facing: 6, productionQueue: [], construction: null,
  spellCooldown: 0, order: null, attackCooldown: 0
});
const frameWorld = {
  ...detailedWorld,
  units: [frameUnit], corpses: [], projectiles: [], spellEffects: [], activeResearch: [],
  pendingAttacks: [
    { sourceId: "frame-unit", targetId: "first-target", remainingSeconds: 0.1 },
    { sourceId: "frame-unit", targetId: "later-target", remainingSeconds: 9.9 }
  ],
  tick: 0, buttonDefinitions: []
};
const firstFrameAnimation = {
  id: "frame-animation", source: "first", actions: {
    Attack: [{ frame: 1, wait: 2 }, { frame: 2, wait: 2 }, { frame: 0, wait: 1 }],
    Research: [{ frame: 7, wait: 1 }], Still: [{ frame: 5, wait: 1 }],
    Death: [{ frame: 11, wait: 2 }]
  }
};
const frameManifest = {
  animations: [firstFrameAnimation, {
    id: "frame-animation", source: "later", actions: {
      Attack: [{ frame: 99, wait: 1 }], Research: [{ frame: 99, wait: 1 }],
      Still: [{ frame: 99, wait: 1 }], Death: [{ frame: 99, wait: 1 }]
    }
  }],
  missiles: []
};
const frameSnapshot = prepareWorldRenderSnapshot(frameWorld, frameManifest, viewportA);
assert.equal(frameSnapshot.pendingAttackBySourceId.get("frame-unit")?.targetId, "first-target");
assert.equal(
  rendererFunctions.getAnimatedFrameNumber(frameUnit, frameWorld, 1, frameSnapshot),
  2,
  "First pending attack and first animation record must select the legacy attack frame"
);
const researchWorld = {
  ...frameWorld,
  pendingAttacks: [],
  activeResearch: [
    { buildingId: "frame-unit", upgradeId: "first-research", remainingSeconds: 0.2 },
    { buildingId: "frame-unit", upgradeId: "later-research", remainingSeconds: 8.2 }
  ]
};
const researchSnapshot = prepareWorldRenderSnapshot(researchWorld, frameManifest, viewportA);
assert.equal(researchSnapshot.researchByBuildingId.get("frame-unit")?.upgradeId, "first-research");
assert.equal(rendererFunctions.getAnimatedFrameNumber(frameUnit, researchWorld, 1, researchSnapshot), 7);
assert.equal(rendererFunctions.getLastSeenBuildingFrameNumber(
  { animation: "frame-animation", facing: 6 }, 1, frameSnapshot.animationById
), 5);
assert.equal(rendererFunctions.getCorpseFrameNumber(
  { animation: "frame-animation", facing: 6, ageTicks: 1 }, frameWorld, 1, frameSnapshot.animationById
), 11);

console.log("Render preparation verified (ordering, culling, strata, indexes, frames, viewports, counters, diagnostics).");
