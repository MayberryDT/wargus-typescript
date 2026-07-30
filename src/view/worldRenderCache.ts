export type WorldRenderCacheKind = "unit" | "lastSeenBuilding" | "corpse" | "projectile" | "spellEffect";

export type WorldRenderCacheAction = {
  type: "create" | "reuse" | "detach" | "reattach" | "retire" | "destroy" | "reorder";
  kind: WorldRenderCacheKind;
  key: string;
};

export type WorldRenderCacheRecord<T> = {
  key: string;
  shapeKey: string;
  value: T;
  lastUsed: number;
};

type WorldRenderKindCache<T> = {
  active: Map<string, WorldRenderCacheRecord<T>>;
  dormant: Map<string, WorldRenderCacheRecord<T>>;
  pool: WorldRenderCacheRecord<T>[];
};

export type WorldRenderCache<T> = {
  worldIdentity: object;
  clock: number;
  kinds: Record<WorldRenderCacheKind, WorldRenderKindCache<T>>;
};

export type WorldRenderDecisionRecord = {
  token: string;
  key: string;
  shapeKey: string;
  lastUsed: number;
};

export type WorldRenderDecisionItem = {
  key: string;
  shapeKey: string;
};

export type PlanWorldRenderReconciliationOptions = {
  kind: WorldRenderCacheKind;
  clock: number;
  active: readonly WorldRenderDecisionRecord[];
  dormant: readonly WorldRenderDecisionRecord[];
  pool: readonly WorldRenderDecisionRecord[];
  items: readonly WorldRenderDecisionItem[];
  liveKeys: ReadonlySet<string>;
  poolingEnabled: boolean;
  canReusePooled?: (record: WorldRenderDecisionRecord, item: WorldRenderDecisionItem) => boolean;
};

type WorldRenderDecisionStep =
  | { type: "detach"; token: string }
  | { type: "destroy"; token: string }
  | { type: "update"; token: string; itemIndex: number; attach: boolean }
  | { type: "create"; token: string; itemIndex: number }
  | { type: "reorder"; tokens: string[] };

export type WorldRenderReconciliationPlan = {
  actions: WorldRenderCacheAction[];
  steps: WorldRenderDecisionStep[];
  clock: number;
  active: WorldRenderDecisionRecord[];
  dormant: WorldRenderDecisionRecord[];
  pool: WorldRenderDecisionRecord[];
};

export type ReconcileWorldRenderKindOptions<T, I> = {
  cache: WorldRenderCache<T>;
  worldIdentity: object;
  kind: WorldRenderCacheKind;
  items: readonly I[];
  liveKeys: ReadonlySet<string>;
  keyOf: (item: I) => string;
  shapeKeyOf: (item: I) => string;
  create: (item: I) => T;
  update: (value: T, item: I) => void;
  attach: (value: T) => void;
  detach: (value: T) => void;
  destroy: (value: T) => void;
  canResetForPool?: (value: T, item: I) => boolean;
  reorder: (values: readonly T[]) => void;
};

export type RetainedRenderSlots<G, S, X> = {
  graphics: G[];
  sprites: S[];
  texts: X[];
  graphicsCursor: number;
  spriteCursor: number;
  textCursor: number;
};

export function createRetainedRenderSlots<G, S, X>(): RetainedRenderSlots<G, S, X> {
  return { graphics: [], sprites: [], texts: [], graphicsCursor: 0, spriteCursor: 0, textCursor: 0 };
}

export function beginRetainedRenderSlots<G, S, X>(slots: RetainedRenderSlots<G, S, X>): void {
  slots.graphicsCursor = 0;
  slots.spriteCursor = 0;
  slots.textCursor = 0;
}

export function takeRetainedRenderSlot<G, S, X, K extends "graphics" | "sprites" | "texts">(
  slots: RetainedRenderSlots<G, S, X>,
  kind: K,
  create: () => RetainedRenderSlots<G, S, X>[K][number],
  update: (value: RetainedRenderSlots<G, S, X>[K][number]) => void
): RetainedRenderSlots<G, S, X>[K][number] {
  const cursor = kind === "graphics" ? "graphicsCursor" : kind === "sprites" ? "spriteCursor" : "textCursor";
  const index = slots[cursor]++;
  const values = slots[kind] as Array<G | S | X>;
  let value = values[index] as RetainedRenderSlots<G, S, X>[K][number] | undefined;
  if (value === undefined) {
    value = create();
    values.push(value);
  } else {
    update(value);
  }
  return value;
}

export function finishRetainedRenderSlots<G, S, X>(slots: RetainedRenderSlots<G, S, X>): void {
  if (slots.graphicsCursor !== slots.graphics.length || slots.spriteCursor !== slots.sprites.length || slots.textCursor !== slots.texts.length) {
    throw new Error("Retained render child shape mismatch");
  }
}

export function retainedSceneOrder<T, O>(records: readonly T[], rootOf: (record: T) => O, overlaysOf: (record: T) => readonly O[]): O[] {
  return [
    ...records.map(rootOf),
    ...records.flatMap((record) => overlaysOf(record))
  ];
}

const dormantLimits: Record<WorldRenderCacheKind, number> = { unit: 256, lastSeenBuilding: 128, corpse: 64, projectile: 64, spellEffect: 64 };
const poolLimits: Record<WorldRenderCacheKind, number> = { unit: 0, lastSeenBuilding: 0, corpse: 0, projectile: 64, spellEffect: 64 };
const createKindCache = <T>(): WorldRenderKindCache<T> => ({ active: new Map(), dormant: new Map(), pool: [] });

export function createWorldRenderCache<T>(worldIdentity: object): WorldRenderCache<T> {
  return {
    worldIdentity,
    clock: 0,
    kinds: {
      unit: createKindCache(),
      lastSeenBuilding: createKindCache(),
      corpse: createKindCache(),
      projectile: createKindCache(),
      spellEffect: createKindCache()
    }
  };
}

export function replaceWorldRenderCacheOwner<T>(
  existing: WorldRenderCache<T> | undefined,
  worldIdentity: object,
  detach: (value: T) => void,
  destroy: (value: T) => void
): WorldRenderCache<T> {
  if (existing?.worldIdentity === worldIdentity) return existing;
  if (existing) disposeWorldRenderCache(existing, detach, destroy);
  return createWorldRenderCache<T>(worldIdentity);
}

export function planWorldRenderReconciliation(options: PlanWorldRenderReconciliationOptions): WorldRenderReconciliationPlan {
  const { kind, liveKeys, poolingEnabled, canReusePooled } = options;
  const actions: WorldRenderCacheAction[] = [];
  const steps: WorldRenderDecisionStep[] = [];
  const active = new Map(options.active.map((record) => [record.key, { ...record }]));
  const dormant = new Map(options.dormant.map((record) => [record.key, { ...record }]));
  const pool = options.pool.map((record) => ({ ...record }));
  const visibleKeys = new Set<string>();
  for (const item of options.items) {
    if (visibleKeys.has(item.key)) throw new Error(`Duplicate ${kind} render key: ${item.key}`);
    visibleKeys.add(item.key);
  }
  const clock = options.clock + 1;
  const retire = (record: WorldRenderDecisionRecord): void => {
    actions.push({ type: "retire", kind, key: record.key });
    if (poolingEnabled && pool.length < poolLimits[kind]) {
      pool.push(record);
    } else {
      actions.push({ type: "destroy", kind, key: record.key });
      steps.push({ type: "destroy", token: record.token });
    }
  };

  for (const [key, record] of [...active]) {
    if (visibleKeys.has(key)) continue;
    active.delete(key);
    actions.push({ type: "detach", kind, key });
    steps.push({ type: "detach", token: record.token });
    if (liveKeys.has(key)) {
      dormant.set(key, { ...record, lastUsed: clock });
    } else {
      retire(record);
    }
  }
  for (const [key, record] of [...dormant]) {
    if (liveKeys.has(key)) continue;
    dormant.delete(key);
    retire(record);
  }

  const nextActive: WorldRenderDecisionRecord[] = [];
  for (let itemIndex = 0; itemIndex < options.items.length; itemIndex += 1) {
    const item = options.items[itemIndex];
    let record = active.get(item.key);
    if (record && record.shapeKey === item.shapeKey) {
      const next = { ...record, lastUsed: clock };
      actions.push({ type: "reuse", kind, key: item.key });
      steps.push({ type: "update", token: record.token, itemIndex, attach: false });
      nextActive.push(next);
      continue;
    }
    if (record) {
      active.delete(item.key);
      actions.push({ type: "detach", kind, key: item.key });
      steps.push({ type: "detach", token: record.token });
      retire(record);
    }

    record = dormant.get(item.key);
    if (record && record.shapeKey === item.shapeKey) {
      dormant.delete(item.key);
      const next = { ...record, lastUsed: clock };
      actions.push({ type: "reattach", kind, key: item.key });
      steps.push({ type: "update", token: record.token, itemIndex, attach: true });
      nextActive.push(next);
      continue;
    }
    if (record) {
      dormant.delete(item.key);
      retire(record);
    }

    const pooledIndex = pool.findIndex((candidate) => candidate.shapeKey === item.shapeKey);
    if (pooledIndex >= 0) {
      const pooled = pool.splice(pooledIndex, 1)[0];
      if (canReusePooled?.(pooled, item) === true) {
        const next = { ...pooled, key: item.key, shapeKey: item.shapeKey, lastUsed: clock };
        actions.push({ type: "reuse", kind, key: item.key });
        steps.push({ type: "update", token: pooled.token, itemIndex, attach: true });
        nextActive.push(next);
        continue;
      }
      actions.push({ type: "destroy", kind, key: pooled.key });
      steps.push({ type: "destroy", token: pooled.token });
    }

    const token = `new:${clock}:${itemIndex}`;
    actions.push({ type: "create", kind, key: item.key });
    steps.push({ type: "create", token, itemIndex });
    nextActive.push({ token, key: item.key, shapeKey: item.shapeKey, lastUsed: clock });
  }

  const dormantOverflow = dormant.size - dormantLimits[kind];
  if (dormantOverflow > 0) {
    const oldest = [...dormant.values()]
      .sort((left, right) => left.lastUsed - right.lastUsed || left.key.localeCompare(right.key))
      .slice(0, dormantOverflow);
    for (const record of oldest) {
      dormant.delete(record.key);
      actions.push({ type: "destroy", kind, key: record.key });
      steps.push({ type: "destroy", token: record.token });
    }
  }
  while (pool.length > poolLimits[kind]) {
    const record = pool.shift();
    if (!record) break;
    actions.push({ type: "destroy", kind, key: record.key });
    steps.push({ type: "destroy", token: record.token });
  }
  actions.push({ type: "reorder", kind, key: nextActive.map(({ key }) => key).join(",") });
  steps.push({ type: "reorder", tokens: nextActive.map(({ token }) => token) });
  return { actions, steps, clock, active: nextActive, dormant: [...dormant.values()], pool };
}

export function reconcileWorldRenderKind<T, I>(options: ReconcileWorldRenderKindOptions<T, I>): { actions: WorldRenderCacheAction[]; records: WorldRenderCacheRecord<T>[] } {
  const { cache, worldIdentity, kind, items, liveKeys, keyOf, shapeKeyOf, create, update, attach, detach, destroy, canResetForPool, reorder } = options;
  if (worldIdentity !== cache.worldIdentity) throw new Error("World render cache owner mismatch");
  const state = cache.kinds[kind];
  const tokenRecords = new Map<string, WorldRenderCacheRecord<T>>();
  const decisionRecord = (record: WorldRenderCacheRecord<T>, token: string): WorldRenderDecisionRecord => {
    tokenRecords.set(token, record);
    return { token, key: record.key, shapeKey: record.shapeKey, lastUsed: record.lastUsed };
  };
  const active = [...state.active.values()].map((record, index) => decisionRecord(record, `active:${index}`));
  const dormant = [...state.dormant.values()].map((record, index) => decisionRecord(record, `dormant:${index}`));
  const pool = state.pool.map((record, index) => decisionRecord(record, `pool:${index}`));
  const decisionItems = items.map((item) => ({ key: keyOf(item), shapeKey: shapeKeyOf(item) }));
  const plan = planWorldRenderReconciliation({
    kind,
    clock: cache.clock,
    active,
    dormant,
    pool,
    items: decisionItems,
    liveKeys,
    poolingEnabled: Boolean(canResetForPool),
    canReusePooled: canResetForPool
      ? (record, item) => {
          const value = tokenRecords.get(record.token)?.value;
          const sourceItem = items[decisionItems.indexOf(item)];
          return value !== undefined && sourceItem !== undefined && canResetForPool(value, sourceItem);
        }
      : undefined
  });

  const allValues = new Set<T>([...tokenRecords.values()].map(({ value }) => value));
  const destroyedValues = new Set<T>();
  try {
    for (const step of plan.steps) {
      if (step.type === "detach") {
        const record = tokenRecords.get(step.token);
        if (record) detach(record.value);
      } else if (step.type === "destroy") {
        const record = tokenRecords.get(step.token);
        if (record) {
          destroy(record.value);
          destroyedValues.add(record.value);
        }
      } else if (step.type === "update") {
        const record = tokenRecords.get(step.token);
        const item = items[step.itemIndex];
        if (!record || item === undefined) throw new Error(`Missing ${kind} update input`);
        update(record.value, item);
        if (step.attach) attach(record.value);
      } else if (step.type === "create") {
        const item = items[step.itemIndex];
        if (item === undefined) throw new Error(`Missing ${kind} create input`);
        const value = create(item);
        allValues.add(value);
        update(value, item);
        attach(value);
        tokenRecords.set(step.token, { key: keyOf(item), shapeKey: shapeKeyOf(item), value, lastUsed: plan.clock });
      } else {
        const values = step.tokens.map((token) => tokenRecords.get(token)?.value);
        if (values.some((value) => value === undefined)) throw new Error(`Missing ${kind} reorder record`);
        reorder(values as T[]);
      }
    }
  } catch (error) {
    state.active.clear();
    state.dormant.clear();
    state.pool.length = 0;
    for (const value of allValues) {
      if (destroyedValues.has(value)) continue;
      try { detach(value); } catch { /* continue cleanup and preserve the original error */ }
    }
    for (const value of allValues) {
      if (destroyedValues.has(value)) continue;
      try {
        destroy(value);
        destroyedValues.add(value);
      } catch { /* continue cleanup and preserve the original error */ }
    }
    throw error;
  }

  const materialize = (record: WorldRenderDecisionRecord): WorldRenderCacheRecord<T> => {
    const existing = tokenRecords.get(record.token);
    if (!existing) throw new Error(`Missing ${kind} planned record: ${record.token}`);
    existing.key = record.key;
    existing.shapeKey = record.shapeKey;
    existing.lastUsed = record.lastUsed;
    return existing;
  };
  cache.clock = plan.clock;
  state.active = new Map(plan.active.map((record) => [record.key, materialize(record)]));
  state.dormant = new Map(plan.dormant.map((record) => [record.key, materialize(record)]));
  state.pool = plan.pool.map(materialize);
  return { actions: plan.actions, records: plan.active.map(materialize) };
}

export function disposeWorldRenderCache<T>(cache: WorldRenderCache<T>, detach: (value: T) => void, destroy: (value: T) => void): WorldRenderCacheAction[] {
  const actions: WorldRenderCacheAction[] = [];
  for (const kind of Object.keys(cache.kinds) as WorldRenderCacheKind[]) {
    const state = cache.kinds[kind];
    for (const record of state.active.values()) {
      detach(record.value);
      actions.push({ type: "detach", kind, key: record.key });
      destroy(record.value);
      actions.push({ type: "destroy", kind, key: record.key });
    }
    for (const record of [...state.dormant.values(), ...state.pool]) {
      destroy(record.value);
      actions.push({ type: "destroy", kind, key: record.key });
    }
    state.active.clear();
    state.dormant.clear();
    state.pool.length = 0;
  }
  return actions;
}
