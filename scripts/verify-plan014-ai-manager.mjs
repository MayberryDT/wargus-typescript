import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-plan014-ai-manager-"));

try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/orders.ts",
    "src/wargus/demoScenario.ts",
    "src/wargus/saveGame.ts",
    "--outDir", output,
    "--target", "ES2022",
    "--module", "CommonJS",
    "--moduleResolution", "Node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--resolveJsonModule",
    "--verbatimModuleSyntax", "false",
    "--ignoreDeprecations", "6.0",
    "--noEmitOnError", "true"
  ], { cwd: root, encoding: "utf8" });
  if (compiler.status !== 0) {
    throw new Error(`Fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);
  }

  const require = createRequire(import.meta.url);
  const manifest = JSON.parse(readFileSync(resolve(root, "public/wargus/manifest.json"), "utf8"));
  const map = manifest.maps.find((candidate) => candidate.path === "maps/ladder/Garden of war BNE.pud.smp.gz");
  if (!map?.setupJson) throw new Error("Garden of War setup is missing from the manifest.");
  const setup = JSON.parse(readFileSync(resolve(root, "public/wargus", map.setupJson), "utf8"));
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "?smoke=1&demoSeed=ai-staged-pressure" } });

  const demo = require(join(output, "wargus/demoScenario.js"));
  const worldModule = require(join(output, "simulation/world.js"));
  const orders = require(join(output, "simulation/orders.js"));
  const saveGame = require(join(output, "wargus/saveGame.js"));
  const demoSetup = demo.applyFixedBrowserDemoSetup(map, setup);
  const world = worldModule.createInitialWorld(
    map,
    manifest.units,
    demoSetup,
    manifest.upgrades,
    manifest.missiles,
    manifest.spells,
    manifest.allowRules,
    manifest.dependencies,
    manifest.buttons,
    manifest.engineSettings,
    manifest.aiDefinitions,
    manifest.unitDatabase,
    manifest.tilesets,
    manifest.animations
  );
  demo.applyFixedBrowserDemoWorldPresentation(map, world);

  const result = orders.runPlan014AiConstructionManagerFixture(world);
  const forceSafety = orders.runPlan014AiForceSafetyFixture(world);
  world.engineSettings.lastDifficultyDefault = 3;
  const aiState = world.aiStates.find((state) => state.enabled);
  const aiPlayer = aiState ? world.players.find((player) => player.id === aiState.player) : null;
  if (!aiState || !aiPlayer) throw new Error("Plan 014 save fixture is missing its AI player/state.");
  const liveEvidence = orders.sourceAiRuntimeEvidence(world, aiState.player, aiState);
  const race = aiPlayer.race === "orc" ? "orc" : "human";
  const saveTypeIds = {
    soldier: race === "orc" ? "unit-grunt" : "unit-footman",
    cavalry: race === "orc" ? "unit-ogre" : "unit-knight",
    cavalryMage: race === "orc" ? "unit-ogre-mage" : "unit-paladin",
    mage: race === "orc" ? "unit-death-knight" : "unit-mage",
    catapult: race === "orc" ? "unit-catapult" : "unit-ballista"
  };
  let saveUnitSerial = 0;
  const addSaveUnits = (typeId, count) => {
    const definition = world.unitDefinitions.find((candidate) => candidate.id === typeId);
    if (!definition) throw new Error(`Missing save-bound fixture definition ${typeId}.`);
    for (let index = 0; index < count; index += 1) {
      world.units.push(worldModule.createWorldUnit({
        unit: definition,
        id: `__plan014-save-${typeId}-${String(index).padStart(2, "0")}`,
        player: aiState.player,
        tileX: 2 + (saveUnitSerial % 24),
        tileY: 2 + (Math.floor(saveUnitSerial / 24) % 16),
        tileset: null
      }));
      saveUnitSerial += 1;
    }
  };
  addSaveUnits(saveTypeIds.soldier, 24);
  addSaveUnits(saveTypeIds.cavalry, 3);
  addSaveUnits(saveTypeIds.cavalryMage, 36);
  addSaveUnits(saveTypeIds.mage, 6);
  addSaveUnits(saveTypeIds.catapult, 2);
  const saveBounds = orders.sourceAiScriptSaveBounds(world, aiState.player, "wc2-land-attack", "land", Number.MAX_SAFE_INTEGER);
  const saved = JSON.parse(saveGame.exportSavedGame(world, { x: 0, y: 0, zoom: 1 }));
  const savedAi = saved.world.aiStates.find((state) => state.player === aiState.player);
  if (!savedAi) throw new Error("Exported save is missing the Plan 014 AI state.");
  const allAiUnitIds = world.units.filter((unit) => unit.player === aiState.player && unit.hitPoints > 0).map((unit) => unit.id);
  savedAi.sourceScriptId = "wc2-land-attack";
  savedAi.strategy = "land";
  savedAi.sourceScriptIndex = Number.MAX_SAFE_INTEGER;
  savedAi.sourceScriptForces = [
    {
      id: 0,
      attack: true,
      targets: Array.from({ length: 40 }, () => ({ role: "mage", count: 999999, unitTypeId: saveTypeIds.mage })),
      assignedUnitIds: ["__missing-force-id", ...allAiUnitIds, ...allAiUnitIds]
    },
    ...Array.from({ length: 80 }, (_, index) => ({ id: 1000 + index, attack: true, targets: [], assignedUnitIds: allAiUnitIds }))
  ];
  savedAi.sourceScriptLaunches = [
    ...saveBounds.launches.map((launch) => ({ sourceForceId: launch.sourceForceId, unitIds: ["__missing-launch-id", ...allAiUnitIds, ...allAiUnitIds], launchedTick: 123 })),
    ...Array.from({ length: 80 }, (_, index) => ({ sourceForceId: 1000 + index, unitIds: allAiUnitIds, launchedTick: 456 }))
  ];
  savedAi.sourceScriptForceRoles = Array.from({ length: 80 }, (_, index) => ({ id: 1000 + index, role: "attack" }));
  const loaded = saveGame.loadSavedGameJson(manifest, JSON.stringify(saved));
  const loadedAi = loaded?.world.aiStates.find((state) => state.player === aiState.player);
  const loadedIds = new Set(loaded?.world.units.map((unit) => unit.id) ?? []);
  const normalizedLaunchIds = loadedAi?.sourceScriptLaunches.flatMap((launch) => launch.unitIds) ?? [];
  const activeAssignedIds = loadedAi?.sourceScriptForces.flatMap((force) => force.assignedUnitIds) ?? [];
  const saveSafety = {
    scriptIndex: loadedAi?.sourceScriptIndex ?? null,
    scriptLength: saveBounds.scriptLength,
    forceCount: loadedAi?.sourceScriptForces.length ?? -1,
    activeForceIds: loadedAi?.sourceScriptForces.map((force) => force.id) ?? [],
    activeTargets: loadedAi?.sourceScriptForces[0]?.targets ?? [],
    activeAssignedIds,
    activeAssignedTypes: activeAssignedIds.map((unitId) => loaded?.world.units.find((unit) => unit.id === unitId)?.typeId ?? "missing"),
    launchCount: loadedAi?.sourceScriptLaunches.length ?? -1,
    launchForceIds: loadedAi?.sourceScriptLaunches.map((launch) => launch.sourceForceId) ?? [],
    launchSizes: loadedAi?.sourceScriptLaunches.map((launch) => launch.unitIds.length) ?? [],
    expectedLaunchForceIds: saveBounds.launches.map((launch) => launch.sourceForceId),
    expectedLaunchCaps: saveBounds.launches.map((launch) => launch.maxUnitIds),
    launchIdsUnique: new Set(normalizedLaunchIds).size === normalizedLaunchIds.length,
    launchIdsExist: normalizedLaunchIds.every((unitId) => loadedIds.has(unitId)),
    activeIdsUnique: new Set(activeAssignedIds).size === activeAssignedIds.length,
    activeIdsExist: activeAssignedIds.every((unitId) => loadedIds.has(unitId)),
    activeLaunchDisjoint: activeAssignedIds.every((unitId) => !normalizedLaunchIds.includes(unitId)),
    forceRoleCount: loadedAi?.sourceScriptForceRoles.length ?? -1
  };
  const failures = [];
  if (!result?.ok) failures.push(`fixture result: ${JSON.stringify(result)}`);
  if (result?.oneHall?.openingWorkerCount !== 1
    || result?.oneHall?.beforeOrder !== "harvest:to-resource"
    || result?.oneHall?.afterOrder !== "build:to-site"
    || result?.oneHall?.pendingTownCenters !== 1
    || result?.oneHall?.afterRepeatPendingTownCenters !== 1
    || result?.oneHall?.resourcesChangedBeforeArrival !== false) {
    failures.push(`one-Hall live manager path: ${JSON.stringify(result?.oneHall)}`);
  }
  if (result?.secondBarracks?.completedBefore !== 1
    || result?.secondBarracks?.travellingWorkerRetasked !== true
    || result?.secondBarracks?.completedAndPendingAfter !== 2
    || result?.secondBarracks?.afterRepeatCompletedAndPending !== 2) {
    failures.push(`second-Barracks live manager path: ${JSON.stringify(result?.secondBarracks)}`);
  }
  if (result?.competingCosts?.individuallyAffordable !== true
    || result?.competingCosts?.pendingTypes?.length !== 1
    || result?.competingCosts?.pendingTypes?.[0] !== result?.competingCosts?.townCenterTypeId
    || result?.competingCosts?.resourcesChangedBeforeArrival !== false
    || result?.competingCosts?.foundationReached !== true
    || result?.competingCosts?.foundationCancelled !== false
    || result?.competingCosts?.arrivalDeductionMatches !== true) {
    failures.push(`competing unpaid costs: ${JSON.stringify(result?.competingCosts)}`);
  }
  if (result?.productionReservation?.pendingReservationType !== result?.productionReservation?.barracksTypeId
    || !(Number(result?.productionReservation?.reservedDuringTravel?.gold ?? 0) > 0)
    || result?.productionReservation?.spendBlockedInSameThink !== true
    || result?.productionReservation?.spendBlockedInLaterThink !== true
    || result?.productionReservation?.sameThinkQueues?.worker !== 0
    || result?.productionReservation?.sameThinkQueues?.combat !== 0
    || result?.productionReservation?.sameThinkQueues?.research !== 0
    || result?.productionReservation?.laterThinkQueues?.worker !== 0
    || result?.productionReservation?.laterThinkQueues?.combat !== 0
    || result?.productionReservation?.laterThinkQueues?.research !== 0
    || result?.productionReservation?.foundationReached !== true
    || result?.productionReservation?.foundationCancelled !== false
    || Object.values(result?.productionReservation?.reservedAfterArrival ?? {}).some((amount) => amount !== 0)
    || result?.productionReservation?.spendingAllowedAfterResolution !== true
    || !(result?.productionReservation?.afterResolutionQueues?.worker > 0)
    || !(result?.productionReservation?.afterResolutionQueues?.combat > 0)
    || !(result?.productionReservation?.afterResolutionQueues?.research > 0)) {
    failures.push(`production respects unpaid build reservation: ${JSON.stringify(result?.productionReservation)}`);
  }
  if (result?.tankerRally?.ai?.tankerIdle !== true
    || result?.tankerRally?.ai?.resourcesUnchanged !== true
    || result?.tankerRally?.ai?.pendingBuildingPreserved !== true
    || result?.tankerRally?.ai?.oilPatchPreserved !== true
    || result?.tankerRally?.ai?.platformNotStarted !== true
    || result?.tankerRally?.human?.platformStartedFromRawFunds !== true
    || result?.tankerRally?.human?.spendMatches !== true) {
    failures.push(`trained-tanker rally respects only AI net reservations: ${JSON.stringify(result?.tankerRally)}`);
  }
  if (result?.blockedOilRepair?.rawRepairAffordable !== true
    || result?.blockedOilRepair?.rawPlatformAffordable !== true
    || result?.blockedOilRepair?.resourcesUnchanged !== true
    || result?.blockedOilRepair?.pendingBuildingPreserved !== true
    || result?.blockedOilRepair?.repairOrderBlocked !== true
    || result?.blockedOilRepair?.oilOrderBlocked !== true
    || result?.blockedOilRepair?.oilPatchPreserved !== true
    || result?.blockedOilRepair?.platformNotStarted !== true) {
    failures.push(`oil/repair initiation respects unpaid build reservation: ${JSON.stringify(result?.blockedOilRepair)}`);
  }
  if (result?.repairPause?.acceptedWithNetFunds !== true
    || result?.repairPause?.paused?.orderPreserved !== true
    || result?.repairPause?.paused?.hitPointsUnchanged !== true
    || result?.repairPause?.paused?.resourcesUnchanged !== true
    || result?.repairPause?.progressedAfterAdditionalFunds?.hitPointsIncreased !== true
    || result?.repairPause?.progressedAfterAdditionalFunds?.spendMatches !== true
    || result?.repairPause?.progressedAfterAdditionalFunds?.pendingBuildingPreserved !== true) {
    failures.push(`AI repair pauses and retries around changing reservations: ${JSON.stringify(result?.repairPause)}`);
  }
  if (!(Number(result?.pendingOil?.expectedGold ?? 0) > 0)
    || result?.pendingOil?.reservedWithPendingOil?.gold !== result?.pendingOil?.expectedGold
    || result?.pendingOil?.reservedWithPendingOil?.wood !== result?.pendingOil?.expectedWood
    || result?.pendingOil?.queuesBlockedByPendingOil !== true
    || result?.pendingOil?.blockedArrival?.orderPreserved !== true
    || result?.pendingOil?.blockedArrival?.orderUnchanged !== true
    || result?.pendingOil?.blockedArrival?.resourcesUnchanged !== true
    || result?.pendingOil?.blockedArrival?.competingBuildingPreserved !== true
    || result?.pendingOil?.blockedArrival?.oilPatchPreserved !== true
    || result?.pendingOil?.blockedArrival?.platformNotStarted !== true
    || result?.pendingOil?.platformProgressedAfterBuildingResolution !== true
    || result?.pendingOil?.oilPatchReplaced !== true
    || result?.pendingOil?.spendMatches !== true) {
    failures.push(`pending oil-platform reservation and funded progress: ${JSON.stringify(result?.pendingOil)}`);
  }
  const oneHallBuild = result?.oneHall?.evidence?.buildRoles?.find((entry) => entry.role === "town-center");
  const secondBarracksBuild = result?.secondBarracks?.evidence?.buildRoles?.find((entry) => entry.role === "barracks");
  if (oneHallBuild?.desired !== 1
    || oneHallBuild?.inFlight !== 1
    || oneHallBuild?.foundations !== 0
    || !(Number(result?.oneHall?.evidence?.reservedResources?.gold ?? 0) > 0)
    || secondBarracksBuild?.desired !== 2
    || secondBarracksBuild?.completed !== 1
    || secondBarracksBuild?.inFlight !== 1) {
    failures.push(`live construction evidence: ${JSON.stringify({ oneHall: result?.oneHall?.evidence, secondBarracks: result?.secondBarracks?.evidence })}`);
  }
  if (!forceSafety?.ok
    || forceSafety?.mixed?.readyWithoutMage !== false
    || forceSafety?.mixed?.readyWithMage !== true
    || forceSafety?.mixed?.assignedIds?.length !== 3
    || new Set(forceSafety?.mixed?.assignedIds ?? []).size !== 3
    || forceSafety?.mixed?.assignedTypes?.filter((typeId) => typeId === forceSafety?.mixed?.cavalryMageTypeId).length !== 2
    || forceSafety?.mixed?.assignedTypes?.filter((typeId) => typeId === forceSafety?.mixed?.mageTypeId).length !== 1
    || forceSafety?.mixed?.assignedTypes?.includes(forceSafety?.mixed?.soldierTypeId)) {
    failures.push(`exact mixed force membership: ${JSON.stringify(forceSafety?.mixed)}`);
  }
  if (forceSafety?.noPressure?.launchSucceeded !== false
    || forceSafety?.noPressure?.launchCount !== 0
    || forceSafety?.noPressure?.activeForceCount !== 1
    || forceSafety?.noPressure?.unitOrderKind !== null
    || forceSafety?.noPressure?.retryEligible !== true) {
    failures.push(`blocked orderless launch: ${JSON.stringify(forceSafety?.noPressure)}`);
  }
  if (forceSafety?.mixedReachability?.ready !== true
    || forceSafety?.mixedReachability?.blockedLaunchSucceeded !== false
    || forceSafety?.mixedReachability?.ordersUnchangedAfterFailure !== true
    || forceSafety?.mixedReachability?.forceCountAfterFailure !== 1
    || forceSafety?.mixedReachability?.launchCountAfterFailure !== 0
    || forceSafety?.mixedReachability?.retrySucceeded !== true
    || forceSafety?.mixedReachability?.retryLaunchCount !== 1
    || forceSafety?.mixedReachability?.retryLaunchUnitIds?.length !== 2
    || new Set(forceSafety?.mixedReachability?.retryLaunchUnitIds ?? []).size !== 2
    || forceSafety?.mixedReachability?.activeForceCountAfterRetry !== 0
    || !forceSafety?.mixedReachability?.retryOrderKinds?.every((kind) => kind === "attack" || kind === "attack-move")) {
    failures.push(`atomic mixed-reachability launch: ${JSON.stringify(forceSafety?.mixedReachability)}`);
  }
  if (saveSafety.scriptIndex !== saveSafety.scriptLength
    || saveSafety.forceCount !== 1
    || JSON.stringify(saveSafety.activeForceIds) !== JSON.stringify([0])
    || saveSafety.activeTargets.length !== 1
    || saveSafety.activeTargets[0]?.role !== "cavalry"
    || saveSafety.activeTargets[0]?.count !== 2
    || saveSafety.activeAssignedIds.length > 2
    || saveSafety.activeAssignedTypes.some((typeId) => typeId !== saveTypeIds.cavalry)
    || saveSafety.launchCount !== saveBounds.launches.length
    || JSON.stringify(saveSafety.launchForceIds) !== JSON.stringify(saveSafety.expectedLaunchForceIds)
    || saveSafety.launchSizes.some((size, index) => size > saveSafety.expectedLaunchCaps[index])
    || !saveSafety.launchIdsUnique
    || !saveSafety.launchIdsExist
    || !saveSafety.activeIdsUnique
    || !saveSafety.activeIdsExist
    || !saveSafety.activeLaunchDisjoint
    || saveSafety.forceRoleCount !== 0) {
    failures.push(`bounded source-AI save state: ${JSON.stringify(saveSafety)}`);
  }
  if (liveEvidence?.player !== aiState.player
    || !Number.isInteger(liveEvidence?.sourceScriptIndex)
    || !Array.isArray(liveEvidence?.forces)
    || !Array.isArray(liveEvidence?.launches)
    || !Array.isArray(liveEvidence?.buildRoles)
    || !Array.isArray(liveEvidence?.pendingBuildOrders)
    || !Array.isArray(liveEvidence?.productionQueues)
    || !Array.isArray(liveEvidence?.constructions)
    || typeof liveEvidence?.reservedResources !== "object"
    || typeof liveEvidence?.speedFactors?.build !== "number"
    || typeof liveEvidence?.exploration?.exploredTiles !== "number"
    || liveEvidence.forces.length > 16
    || liveEvidence.launches.length > 16
    || liveEvidence.pendingBuildOrders.length > 64
    || liveEvidence.productionQueues.length > 64
    || liveEvidence.constructions.length > 64) {
    failures.push(`bounded live AI evidence: ${JSON.stringify(liveEvidence)}`);
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  console.log(`Plan 014 live AI manager/force/save safety verified (one Hall, travelling-worker second Barracks, production/oil/repair-safe unpaid reservations, AI tanker rally admission, retryable blocked oil arrival, exact mixed force, atomic mixed-reachability launch, ${saveSafety.launchCount} bounded launches; ${result.competingCosts.arrivalTicks} arrival ticks).`);
} finally {
  rmSync(output, { recursive: true, force: true });
}
