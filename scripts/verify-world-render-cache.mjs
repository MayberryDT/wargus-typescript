import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const cacheSource = readFileSync(new URL("../src/view/worldRenderCache.ts", import.meta.url), "utf8");
const rendererSource = readFileSync(new URL("../src/view/renderWorld.ts", import.meta.url), "utf8");
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

const sourceFile = ts.createSourceFile("worldRenderCache.ts", cacheSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const executableSource = sourceFile.statements
  .filter((statement) => !ts.isImportDeclaration(statement) && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement))
  .map((statement) => statement.getText(sourceFile))
  .join("\n");
const javascript = ts.transpileModule(executableSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;
const load = Function("exports", `${javascript}\nreturn { createWorldRenderCache, disposeWorldRenderCache, planWorldRenderReconciliation, reconcileWorldRenderKind };`);
const { createWorldRenderCache, disposeWorldRenderCache, planWorldRenderReconciliation, reconcileWorldRenderKind } = load({});

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
