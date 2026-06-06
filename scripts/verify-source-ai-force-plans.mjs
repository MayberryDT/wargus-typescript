import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const errors = [];
const upgradeIds = new Set((manifest.upgrades ?? []).map((upgrade) => upgrade.id));
const unitIds = new Set((manifest.units ?? []).map((unit) => unit.id));

function error(message) {
  errors.push(message);
}

const campaignMapsWithPlans = (manifest.maps ?? []).filter((map) => map.setupPath?.startsWith("campaigns/") && (map.aiForcePlans ?? []).length > 0);
if (campaignMapsWithPlans.length < 30) {
  error(`Expected source AI force plans for at least 30 campaign maps, found ${campaignMapsWithPlans.length}.`);
}

let plans = 0;
let nonDefaultThresholds = 0;
let attackDelayPlans = 0;
let nonDefaultAttackDelays = 0;
let attackWavePlans = 0;
let attackWaveReferences = 0;
let attackWaveUnitTargetPlans = 0;
let attackWaveUnitTargetReferences = 0;
let defendForcePlans = 0;
let initialAttackDelayPlans = 0;
let nonDefaultInitialAttackDelays = 0;
let workerTargets = 0;
let nonDefaultWorkerTargets = 0;
let tankerTargets = 0;
let nonDefaultTankerTargets = 0;
let transportTargets = 0;
let collectPlans = 0;
let researchPlans = 0;
let researchReferences = 0;
let attackTypePlans = 0;
let attackTypeReferences = 0;
let attackUnitTargetPlans = 0;
let attackUnitTargetReferences = 0;
let buildPlans = 0;
let buildReferences = 0;
let buildDepotDisabledPlans = 0;
let sourceUpgradeBuildReferences = 0;
let multiBuildingTargetPlans = 0;
let repeatedBuildRolePlans = 0;
let sourceWaitBuildReferences = 0;
let groupedAttackWavePlans = 0;
const buildRoles = new Set([
  "town-center",
  "town-center-tier2",
  "town-center-tier3",
  "supply",
  "barracks",
  "lumber-mill",
  "blacksmith",
  "tower",
  "guard-tower",
  "cannon-tower",
  "advanced-melee",
  "holy",
  "caster",
  "air",
  "demolition",
  "shipyard",
  "foundry",
  "refinery",
  "oil-platform"
]);
const exactCollectWeights = new Map([
  ["campaigns/human/level13h.sms.gz:hum-13", { gold: 50, wood: 50, oil: 100 }],
  ["campaigns/human/level14h.sms.gz:hum-14-white", { gold: 100, wood: 0, oil: 0 }]
]);
const seenExactCollectWeights = new Set();
for (const map of campaignMapsWithPlans) {
  const setupPlans = map.setup?.aiForcePlans ?? [];
  if (setupPlans.length !== map.aiForcePlans.length) {
    error(`${map.path} setup summary has ${setupPlans.length} AI force plans but map has ${map.aiForcePlans.length}.`);
  }
  for (const plan of map.aiForcePlans) {
    plans += 1;
    if (typeof plan.ai !== "string" || plan.ai.length === 0) {
      error(`${map.path} has an AI force plan without an AI name.`);
    }
    if (!Number.isInteger(plan.attackForceSize) || plan.attackForceSize < 3) {
      error(`${map.path} ${plan.ai} has invalid attackForceSize ${plan.attackForceSize}.`);
    }
    if (!Array.isArray(plan.attackForceIds) || plan.attackForceIds.length === 0 || plan.attackForceIds.some((id) => !Number.isInteger(id) || id < 0)) {
      error(`${map.path} ${plan.ai} has invalid attackForceIds metadata.`);
    }
    if (!Array.isArray(plan.forceSizes) || plan.forceSizes.length === 0 || plan.forceSizes.some((size) => !Number.isInteger(size) || size <= 0)) {
      error(`${map.path} ${plan.ai} has invalid forceSizes metadata.`);
    }
    if (!Array.isArray(plan.attackWaveSizes) || plan.attackWaveSizes.length === 0 || plan.attackWaveSizes.some((size) => !Number.isInteger(size) || size < 3)) {
      error(`${map.path} ${plan.ai} has invalid attackWaveSizes metadata.`);
    } else {
      attackWavePlans += 1;
      attackWaveReferences += plan.attackWaveSizes.length;
      if (plan.attackWaveSizes.some((size) => !plan.forceSizes.includes(size))) {
        groupedAttackWavePlans += 1;
      }
    }
    if (Array.isArray(plan.attackWaveUnitTargets) && plan.attackWaveUnitTargets.length > 0) {
      attackWaveUnitTargetPlans += 1;
      attackWaveUnitTargetReferences += plan.attackWaveUnitTargets.reduce((sum, wave) => sum + wave.length, 0);
      if (plan.attackWaveUnitTargets.length !== plan.attackWaveSizes.length) {
        error(`${map.path} ${plan.ai} has ${plan.attackWaveUnitTargets.length} attackWaveUnitTargets but ${plan.attackWaveSizes.length} attackWaveSizes.`);
      }
      for (const waveTargets of plan.attackWaveUnitTargets) {
        for (const target of waveTargets) {
          if (!unitIds.has(target.unitTypeId)) {
            error(`${map.path} ${plan.ai} attackWaveUnitTargets references unknown unit ${target.unitTypeId}.`);
          }
          if (!Number.isInteger(target.count) || target.count <= 0) {
            error(`${map.path} ${plan.ai} attackWaveUnitTargets has invalid count for ${target.unitTypeId}: ${target.count}.`);
          }
        }
      }
    }
    if (!Number.isInteger(plan.defendForceSize) || plan.defendForceSize < 0) {
      error(`${map.path} ${plan.ai} has invalid defendForceSize ${plan.defendForceSize}.`);
    }
    if (plan.defendForceSize > 0) {
      defendForcePlans += 1;
    }
    if (plan.attackDelayTicks !== null) {
      attackDelayPlans += 1;
      if (!Number.isInteger(plan.attackDelayTicks) || plan.attackDelayTicks < 30) {
        error(`${map.path} ${plan.ai} has invalid attackDelayTicks ${plan.attackDelayTicks}.`);
      }
      if (plan.attackDelayTicks !== 35 * 30) {
        nonDefaultAttackDelays += 1;
      }
    }
    if (plan.initialAttackDelayTicks !== null) {
      initialAttackDelayPlans += 1;
      if (!Number.isInteger(plan.initialAttackDelayTicks) || plan.initialAttackDelayTicks < 30) {
        error(`${map.path} ${plan.ai} has invalid initialAttackDelayTicks ${plan.initialAttackDelayTicks}.`);
      }
      if (plan.initialAttackDelayTicks !== 20 * 30) {
        nonDefaultInitialAttackDelays += 1;
      }
    }
    if (plan.attackForceSize > 3) {
      nonDefaultThresholds += 1;
    }
    if ((plan.buildOrder ?? []).length > 0) {
      buildPlans += 1;
      buildReferences += plan.buildOrder.length;
      const roleCounts = new Map();
      for (const role of plan.buildOrder) {
        if (!buildRoles.has(role)) {
          error(`${map.path} ${plan.ai} buildOrder references unknown role ${role}.`);
        }
        roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
        if (role === "town-center-tier2" || role === "town-center-tier3" || role === "guard-tower" || role === "cannon-tower") {
          sourceUpgradeBuildReferences += 1;
        }
        if (role === "town-center" || role === "town-center-tier2" || role === "town-center-tier3" || role === "barracks" || role === "lumber-mill" || role === "air") {
          sourceWaitBuildReferences += 1;
        }
      }
      if ([...roleCounts.values()].some((count) => count > 1)) {
        repeatedBuildRolePlans += 1;
        multiBuildingTargetPlans += 1;
      }
    }
    if (typeof plan.buildDepots !== "boolean") {
      error(`${map.path} ${plan.ai} has invalid buildDepots flag ${plan.buildDepots}.`);
    }
    if (plan.buildDepots === false) {
      buildDepotDisabledPlans += 1;
      if (map.setupPath?.replace(/\.gz$/i, "") !== "campaigns/orc/level04o.sms" || plan.ai !== "orc-04") {
        error(`${map.path} ${plan.ai} unexpectedly disables source AI depot building.`);
      }
    }
    if (plan.workerTarget !== null) {
      workerTargets += 1;
      if (!Number.isInteger(plan.workerTarget) || plan.workerTarget < 1) {
        error(`${map.path} ${plan.ai} has invalid workerTarget ${plan.workerTarget}.`);
      }
      if (plan.workerTarget !== 7) {
        nonDefaultWorkerTargets += 1;
      }
    }
    if (plan.tankerTarget !== null) {
      tankerTargets += 1;
      if (!Number.isInteger(plan.tankerTarget) || plan.tankerTarget < 0) {
        error(`${map.path} ${plan.ai} has invalid tankerTarget ${plan.tankerTarget}.`);
      }
      if (plan.tankerTarget !== 1) {
        nonDefaultTankerTargets += 1;
      }
    }
    if (plan.transportTarget !== null) {
      transportTargets += 1;
      if (!Number.isInteger(plan.transportTarget) || plan.transportTarget < 0) {
        error(`${map.path} ${plan.ai} has invalid transportTarget ${plan.transportTarget}.`);
      }
    }
    if (plan.collectWeights !== null) {
      collectPlans += 1;
      for (const resource of ["gold", "wood", "oil"]) {
        if (!Number.isInteger(plan.collectWeights[resource]) || plan.collectWeights[resource] < 0) {
          error(`${map.path} ${plan.ai} has invalid collect weight ${resource}=${plan.collectWeights[resource]}.`);
        }
      }
      if (plan.collectWeights.gold + plan.collectWeights.wood + plan.collectWeights.oil <= 0) {
        error(`${map.path} ${plan.ai} has empty source collect weights.`);
      }
      const exactKey = `${map.setupPath}:${plan.ai}`;
      const expected = exactCollectWeights.get(exactKey);
      if (expected) {
        seenExactCollectWeights.add(exactKey);
        for (const resource of ["gold", "wood", "oil"]) {
          if (plan.collectWeights[resource] !== expected[resource]) {
            error(`${map.path} ${plan.ai} collect weight ${resource} expected ${expected[resource]} from source AiSetCollect, found ${plan.collectWeights[resource]}.`);
          }
        }
      }
    }
    if ((plan.researchOrder ?? []).length > 0) {
      researchPlans += 1;
      researchReferences += plan.researchOrder.length;
      for (const upgradeId of plan.researchOrder) {
        if (!upgradeIds.has(upgradeId)) {
          error(`${map.path} ${plan.ai} researchOrder references unknown upgrade ${upgradeId}.`);
        }
      }
    }
    if ((plan.preferredAttackUnitTypes ?? []).length > 0) {
      attackTypePlans += 1;
      attackTypeReferences += plan.preferredAttackUnitTypes.length;
      for (const unitTypeId of plan.preferredAttackUnitTypes) {
        if (!unitIds.has(unitTypeId)) {
          error(`${map.path} ${plan.ai} preferredAttackUnitTypes references unknown unit ${unitTypeId}.`);
        }
      }
    }
    if ((plan.attackUnitTargets ?? []).length > 0) {
      attackUnitTargetPlans += 1;
      attackUnitTargetReferences += plan.attackUnitTargets.length;
      for (const target of plan.attackUnitTargets) {
        if (!unitIds.has(target.unitTypeId)) {
          error(`${map.path} ${plan.ai} attackUnitTargets references unknown unit ${target.unitTypeId}.`);
        }
        if (!Number.isInteger(target.count) || target.count <= 0) {
          error(`${map.path} ${plan.ai} attackUnitTargets has invalid count for ${target.unitTypeId}: ${target.count}.`);
        }
      }
    }
  }
}

if (plans < 70) {
  error(`Expected at least 70 indexed source AI force plans, found ${plans}.`);
}

if (nonDefaultThresholds < 20) {
  error(`Expected source AI force plans to affect attack thresholds, only ${nonDefaultThresholds} plans exceed the default size.`);
}

if (attackDelayPlans < 60) {
  error(`Expected at least 60 indexed source AI attack delays, found ${attackDelayPlans}.`);
}

if (nonDefaultAttackDelays < 50) {
  error(`Expected source AI attack delays to affect pacing, only ${nonDefaultAttackDelays} differ from the browser default.`);
}

if (attackWavePlans < 70) {
  error(`Expected at least 70 indexed source AI attack-wave plans, found ${attackWavePlans}.`);
}

if (attackWaveReferences < 200) {
  error(`Expected at least 200 indexed source AI attack-wave size references, found ${attackWaveReferences}.`);
}

if (groupedAttackWavePlans < 1) {
  error("Expected at least one grouped source AI attack wave from multiple AiAttackWithForce calls.");
}

if (attackWaveUnitTargetPlans < 70) {
  error(`Expected at least 70 indexed source AI attack-wave composition plans, found ${attackWaveUnitTargetPlans}.`);
}

if (attackWaveUnitTargetReferences < 600) {
  error(`Expected at least 600 indexed source AI attack-wave composition references, found ${attackWaveUnitTargetReferences}.`);
}

const human04 = campaignMapsWithPlans.find((map) => map.path === "campaigns/human/level04h.smp.gz")?.aiForcePlans.find((plan) => plan.ai === "hum-04");
if (!human04?.attackWaveSizes.every((size) => size === 14)) {
  error(`Expected Human IV source AI to wait for grouped 14-unit attack waves, found ${human04?.attackWaveSizes?.join(",") ?? "missing"}.`);
}
if (!human04?.attackWaveUnitTargets.every((wave) => wave.some((target) => target.unitTypeId === "unit-human-destroyer" && target.count === 2) && wave.some((target) => target.unitTypeId === "unit-footman" && target.count === 5) && wave.some((target) => target.unitTypeId === "unit-archer" && target.count === 5))) {
  error("Expected Human IV grouped source AI attack waves to preserve destroyer/footman/archer composition.");
}

if (defendForcePlans < 1) {
  error(`Expected at least one indexed source AI defend force plan, found ${defendForcePlans}.`);
}

if (initialAttackDelayPlans < 50) {
  error(`Expected at least 50 indexed source AI initial attack delays, found ${initialAttackDelayPlans}.`);
}

if (nonDefaultInitialAttackDelays < 40) {
  error(`Expected source AI initial attack delays to affect opening attack timing, only ${nonDefaultInitialAttackDelays} differ from the browser default.`);
}

if (workerTargets < 60) {
  error(`Expected at least 60 indexed source AI worker targets, found ${workerTargets}.`);
}

if (nonDefaultWorkerTargets < 40) {
  error(`Expected source AI worker targets to affect economy pacing, only ${nonDefaultWorkerTargets} differ from the browser default.`);
}

if (tankerTargets < 25) {
  error(`Expected at least 25 indexed source AI tanker targets, found ${tankerTargets}.`);
}

if (nonDefaultTankerTargets < 10) {
  error(`Expected source AI tanker targets to affect naval economy, only ${nonDefaultTankerTargets} differ from the browser default.`);
}

if (transportTargets < 3) {
  error(`Expected at least 3 indexed source AI transport targets, found ${transportTargets}.`);
}

if (collectPlans < 2) {
  error(`Expected at least 2 indexed source AI collect weight plans, found ${collectPlans}.`);
}

for (const key of exactCollectWeights.keys()) {
  if (!seenExactCollectWeights.has(key)) {
    error(`Missing exact source AiSetCollect weights for ${key}.`);
  }
}

if (researchPlans < 50) {
  error(`Expected at least 50 indexed source AI research plans, found ${researchPlans}.`);
}

if (researchReferences < 1000) {
  error(`Expected at least 1000 indexed source AI research references, found ${researchReferences}.`);
}

if (attackTypePlans < 70) {
  error(`Expected at least 70 indexed source AI attack composition plans, found ${attackTypePlans}.`);
}

if (attackTypeReferences < 600) {
  error(`Expected at least 600 indexed source AI attack unit references, found ${attackTypeReferences}.`);
}

if (attackUnitTargetPlans < 70) {
  error(`Expected at least 70 indexed source AI attack unit target plans, found ${attackUnitTargetPlans}.`);
}

if (attackUnitTargetReferences < 600) {
  error(`Expected at least 600 indexed source AI attack unit target references, found ${attackUnitTargetReferences}.`);
}

if (buildPlans < 50) {
  error(`Expected at least 50 indexed source AI build plans, found ${buildPlans}.`);
}

if (buildReferences < 400) {
  error(`Expected at least 400 indexed source AI build role references, found ${buildReferences}.`);
}

if (multiBuildingTargetPlans < 35) {
  error(`Expected at least 35 source AI multi-building target plans from AiSet, found ${multiBuildingTargetPlans}.`);
}

if (repeatedBuildRolePlans < 35) {
  error(`Expected at least 35 source AI repeated build-role plans that save/load must preserve, found ${repeatedBuildRolePlans}.`);
}

if (sourceUpgradeBuildReferences < 140) {
  error(`Expected at least 140 indexed source AI upgrade-to build references, found ${sourceUpgradeBuildReferences}.`);
}

if (sourceWaitBuildReferences < 250) {
  error(`Expected at least 250 indexed source AI wait/build readiness references, found ${sourceWaitBuildReferences}.`);
}

if (buildDepotDisabledPlans !== 1) {
  error(`Expected exactly one source AI depot-building override from AiSetBuildDepots(false), found ${buildDepotDisabledPlans}.`);
}

const requiredIndexFragments = [
  "const aiSetBuildRoles",
  "const aiWaitBuildRoles",
  "buildDepots: aiBuildDepotsForLoop(source, loopName, new Set())",
  "function aiBuildDepotsForLoop",
  "body.matchAll(/AiSet",
  "body.matchAll(/AiWait",
  "order.push(...Array.from({ length: count }, () => role))",
  "collectWeights: aiCollectWeightsForLoop(source, loopName, new Set())",
  "body.matchAll(/AiSetCollect",
  "gold: Math.max(0, Math.floor(values[1] ?? 0))",
  "wood: Math.max(0, Math.floor(values[2] ?? 0))",
  "oil: Math.max(0, Math.floor(values[3] ?? 0))",
  "function aiAttackForceGroupsForBody",
  "attackWaveUnitTargets: attackForces.waveUnitTargets",
  "function aiCombinedForceUnitTargets",
  "group.reduce((sum, id) => sum + (definitions.get(id)?.size ?? 0), 0)"
];
for (const fragment of requiredIndexFragments) {
  if (!indexSource.includes(fragment)) {
    error(`Indexer missing source AI building target fragment: ${fragment}`);
  }
}

const requiredWorldFragments = [
  "attackForceSize: aiAttackForceSizeForPlayer(setup, player.ai)",
  "attackForceIds: aiAttackForceIdsForPlayer(setup, player.ai)",
  "forceSizes: aiForceSizesForPlayer(setup, player.ai)",
  "attackWaveSizes: aiAttackWaveSizesForPlayer(setup, player.ai)",
  "attackWaveUnitTargets: aiAttackWaveUnitTargetsForPlayer(setup, player.ai)",
  "nextAttackWaveIndex: 0",
  "defendForceSize: aiDefendForceSizeForPlayer(setup, player.ai)",
  "attackDelayTicks: aiAttackDelayTicksForPlayer(setup, player.ai)",
  "nextAttackTick: aiInitialAttackDelayTicksForPlayer(setup, player.ai)",
  "attackUnitTargets: aiAttackUnitTargetsForPlayer(setup, player.ai)",
  "buildOrder: aiBuildOrderForPlayer(setup, player.ai)",
  "buildDepots: aiBuildDepotsForPlayer(setup, player.ai)",
  "preferredAttackUnitTypes: aiPreferredAttackUnitTypesForPlayer(setup, player.ai)",
  "workerTarget: aiWorkerTargetForPlayer(setup, player.ai)",
  "tankerTarget: aiTankerTargetForPlayer(setup, player.ai)",
  "transportTarget: aiTransportTargetForPlayer(setup, player.ai)",
  "collectWeights: aiCollectWeightsForPlayer(setup, player.ai)",
  "researchOrder: aiResearchOrderForPlayer(setup, player.ai)",
  "function aiAttackForceSizeForPlayer",
  "function aiAttackForceIdsForPlayer",
  "function aiForceSizesForPlayer",
  "function aiAttackWaveSizesForPlayer",
  "function aiAttackWaveUnitTargetsForPlayer",
  "function aiDefendForceSizeForPlayer",
  "function aiAttackDelayTicksForPlayer",
  "function aiInitialAttackDelayTicksForPlayer",
  "function aiAttackUnitTargetsForPlayer",
  "function aiBuildOrderForPlayer",
  "function aiBuildDepotsForPlayer",
  "function aiPreferredAttackUnitTypesForPlayer",
  "function aiWorkerTargetForPlayer",
  "function aiTankerTargetForPlayer",
  "function aiTransportTargetForPlayer",
  "function aiCollectWeightsForPlayer",
  "function aiResearchOrderForPlayer",
  "setup?.aiForcePlans.find"
];
for (const fragment of requiredWorldFragments) {
  if (!worldSource.includes(fragment)) {
    error(`World creation missing source AI force plan fragment: ${fragment}`);
  }
}

const requiredOrderFragments = [
  "function sourceAiDifficultyForceCount",
  "function sourceAiDifficultyDefendForceSize",
  "difficulty === -1",
  "Math.min(0, difficulty - 3)",
  "difficulty - 3",
  "function sourceAiDifficultyUnitTargets",
  "function isSourceAiTransporterType",
  "definition.canTransport || (definition.maxOnBoard ?? 0) > 0",
  "const attackForceId = currentAiAttackForceId(state)",
  "sourceAiDifficultyUnitTargets(world, currentAiAttackUnitTargets(state, attackForceId))",
  "currentAiAttackForceSize(world, state)",
  "aiAttackArmyAfterDefenders(attackCandidates, sourceAiDifficultyDefendForceSize(world, state.defendForceSize ?? 0), home)",
  "sourceAiDifficultyForceCount(world, Math.max(3, Math.floor(state.attackForceSize ?? 3)))",
  "state.attackForceIds",
  "state.forceSizes",
  "state.attackForceSize",
  "state.attackWaveSizes",
  "state.attackWaveUnitTargets",
  "state.nextAttackWaveIndex",
  "state.defendForceSize",
  "state.attackDelayTicks",
  "const attackDelayCycles = Math.max(30, Math.floor(state.attackDelayTicks ?? 35 * 30))",
  "state.nextAttackTick = world.tick + sourceOrderRetryTicks(world, attackDelayCycles)",
  "state.attackUnitTargets",
  "function currentAiAttackUnitTargets",
  "function currentAiAttackForceId",
  "state.buildDepots",
  "function sourceAttackUnitTrainScore",
  "countPlayerUnitsAndQueued",
  "state.buildOrder",
  "function issueSourceAiBuildNeeds",
  "const buildings = world.units.filter((unit) => unit.player === playerId && isSourceAiBuilding(unit) && unit.hitPoints > 0)",
  "function isSourceAiDepotRole",
  "function issueSourceAiUpgradeNeed",
  "const buildings = world.units.filter((unit) => unit.player === playerId && isSourceAiBuilding(unit) && unit.hitPoints > 0 && !unit.construction)",
  "function issueAiBuildBySourceRole",
  "sourceAiBuildNeedForRole(world, playerId, role, race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"town-center\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"supply\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"barracks\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"lumber-mill\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"blacksmith\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"advanced-melee\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"caster\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"shipyard\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"foundry\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"refinery\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"air\", race)",
  "issueAiBuildBySourceRole(world, builder, playerId, \"demolition\", race)",
  "function isSourceAiBuilding",
  "return isBuildingLike(unit);",
  "function sourceAiBuildDefinitionMatchesRole",
  "case \"tower\":\n      return definition.building === true\n        && definition.canAttack !== true\n        && sourceBuildDefinitionUpgradesToMatching(world, definition.id, isDefensiveBuildingDefinition, playerId);",
  "case \"guard-tower\":\n      return definition.building === true && definition.canAttack === true && sourceTowerRoleForDefinition(world, definition) !== \"cannon\";",
  "case \"cannon-tower\":\n      return definition.building === true && definition.canAttack === true && sourceTowerRoleForDefinition(world, definition) === \"cannon\";",
  "issueUpgradeTowerOrder",
  "attackArmy.length >= attackForceSize",
  "function currentAiAttackForceSize",
  "const forceSizes = (state.forceSizes ?? [])",
  "forceSizes[forceIndex]",
  "function aiAttackArmyAfterDefenders",
  "state.preferredAttackUnitTypes",
  "function preferredAiAttackArmy",
  "return selected.slice(0, waveSize)",
  "return army.slice(0, waveSize)",
  "state.workerTarget",
  "workers.length + hall.productionQueue.length < workerTarget",
  "workerRaceScore(world, right, normalizedRace) - workerRaceScore(world, left, normalizedRace)",
  "return sourceRaceScoreForUnitDefinition(definition, world.unitDatabase, race);",
  "state.tankerTarget",
  "state.transportTarget",
  "state.collectWeights",
  "function preferredAiWorkerResource",
  "deterministicChance(world, `${worker.id}:gold`, 0.7)",
  "function deterministicChance(world: WorldState, seed: string, probability: number): boolean",
  "Math.floor(world.tick / sourceOrderRetryTicks(world, 30))",
  "function fallbackAiScoutPoint",
  "Math.floor(world.tick / sourceOrderRetryTicks(world, 600))",
  "tankers.length < tankerTarget",
  "transports.length < transportTarget",
  "state.researchOrder",
  "preferredUpgradeIds.filter(matchesSourceUpgrade)",
  "const holyProducers = completedUnits.filter((unit) => isHolyResearchProducer(world, unit));",
  'issueAiBuildBySourceRole(world, builder, playerId, "holy", race);',
  "for (const building of holyProducers)",
  "return { matches, fallback: human ? \"unit-church\" : \"unit-altar-of-storms\" };",
  "return sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isHolyResearchUpgradeId(world, upgradeId), playerId);",
  "sourceTowerRoleForDefinition(world, definition) !== \"cannon\"",
  "sourceTowerRoleForDefinition(world, definition) === \"cannon\"",
  "function sourceTowerRoleForDefinition(world: WorldState, definition: WargusUnit): \"guard\" | \"cannon\" | null",
  "button.action === \"upgrade-to\" && button.value === definition.id",
  "return isCannonTowerUpgradeDefinition(definition) ? \"cannon\" : \"guard\";"
];
for (const fragment of requiredOrderFragments) {
  if (!ordersSource.includes(fragment)) {
    error(`AI dispatch missing source AI plan fragment: ${fragment}`);
  }
}

if (ordersSource.includes('definition.id.includes("guard")')) {
  error("AI guard-tower role matching should classify source attacking tower definitions instead of checking for a guard id fragment.");
}
if (ordersSource.includes('definition.missile?.toLowerCase().includes("cannon")')) {
  error("AI cannon-tower role matching should use source combat traits instead of missile id text.");
}
if (ordersSource.includes("function sourceTowerRoleText") || ordersSource.includes('text.includes("guard")') || ordersSource.includes('text.includes("cannon")')) {
  error("AI tower role matching should classify upgrade target definitions instead of parsing source button text.");
}
if (ordersSource.includes("const lower = definition.id.toLowerCase();")) {
  error("AI worker race fallback should score preserved source definition text instead of browser type ids.");
}
if (ordersSource.includes('lower.includes("human")') || ordersSource.includes('lower.includes("orc")') || ordersSource.includes('lower.includes("peasant")') || ordersSource.includes('lower.includes("peon")')) {
  error("AI worker race fallback should use source race metadata instead of name text fragments.");
}
if (ordersSource.includes("Math.floor(tick / 30)")) {
  error("AI deterministic chance should scale source 30-cycle buckets through the browser tick rate.");
}
if (ordersSource.includes("world.tickRate * 20")) {
  error("AI scout fallback points should scale source 600-cycle buckets through the browser tick rate.");
}
if (ordersSource.includes('case "guard-tower":\n      return definition.building === true && definition.canAttack === true && !isCannonTowerUpgradeDefinition(definition);')) {
  error("AI guard-tower role matching should consult source upgrade button role metadata before cannon heuristics.");
}

for (const fragment of [
  'issueAiBuildByRole(world, builder, (definition) => isBaseTownCenterDefinition(world, definition, playerId), race === "human" ? "unit-town-hall" : "unit-great-hall")',
  'issueAiBuildByRole(world, builder, isSupplyProviderDefinition, race === "human" ? "unit-farm" : "unit-pig-farm")',
  'issueAiBuildByRole(world, builder, (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isOrdinaryBarracksCombatDefinition, playerId), race === "human" ? "unit-human-barracks" : "unit-orc-barracks")',
  'issueAiBuildByRole(world, builder, (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isLumberMillUpgradeId(world, upgradeId), playerId), race === "human" ? "unit-elven-lumber-mill" : "unit-troll-lumber-mill")',
  'issueAiBuildByRole(world, builder, (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, (upgradeId) => isBlacksmithUpgradeId(world, upgradeId), playerId), race === "human" ? "unit-human-blacksmith" : "unit-orc-blacksmith")',
  'issueAiBuildByRole(world, builder, (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isAdvancedMeleeCombatDefinition, playerId), race === "human" ? "unit-stables" : "unit-ogre-mound")',
  'issueAiBuildByRole(world, builder, (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isCasterDefinition, playerId), race === "orc" ? "unit-temple-of-the-damned" : "unit-mage-tower")',
  'issueAiBuildByRole(world, builder, (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isNavalCombatOrUtilityDefinition, playerId), race === "human" ? "unit-human-shipyard" : "unit-orc-shipyard")',
  'issueAiBuildByRole(world, builder, (definition) => sourceBuildDefinitionResearchesMatching(world, definition.id, isShipUpgradeId, playerId), race === "human" ? "unit-human-foundry" : "unit-orc-foundry")',
  'issueAiBuildByRole(world, builder, isOilRefineryDefinition, race === "human" ? "unit-human-refinery" : "unit-orc-refinery")',
  'issueAiBuildByRole(world, builder, (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isAirCombatDefinition, playerId), race === "human" ? "unit-gryphon-aviary" : "unit-dragon-roost")',
  'issueAiBuildByRole(world, builder, (definition) => sourceBuildDefinitionProducesMatching(world, definition.id, isDemolitionLabDefinition, playerId), race === "human" ? "unit-inventor" : "unit-alchemist")'
]) {
  if (ordersSource.includes(fragment)) {
    error(`Strategic AI build fallback should route through source AI build roles instead of inline stock ids: ${fragment}`);
  }
}

const sourceAiBuildNeedsBody = ordersSource.match(/function issueSourceAiBuildNeeds[\s\S]*?\n}\n\nfunction isSourceAiDepotRole/)?.[0] ?? "";
if (sourceAiBuildNeedsBody.includes('unit.kind === "building"')) {
  error("Source AI build needs should count buildings through source Building semantics instead of browser-local kind text.");
}

const sourceAiUpgradeNeedBody = ordersSource.match(/function issueSourceAiUpgradeNeed[\s\S]*?\n}\n\nfunction sourceAiBuildRoleCount/)?.[0] ?? "";
if (sourceAiUpgradeNeedBody.includes('unit.kind === "building"')) {
  error("Source AI upgrade needs should find upgrade buildings through source Building semantics instead of browser-local kind text.");
}

const defensiveBuildingBody = ordersSource.match(/function isDefensiveBuilding\(unit: WorldUnit\)[\s\S]*?\n}\n/)?.[0] ?? "";
if (!defensiveBuildingBody.includes("unit.canAttack && isBuildingLike(unit)") || defensiveBuildingBody.includes('unit.kind === "building"')) {
  error("AI auto-guard defensive building checks should use source Building semantics instead of browser-local kind text.");
}

const requiredSaveFragments = [
  "record.attackForceSize",
  "fallback?.attackForceSize",
  "record.attackForceIds",
  "fallback?.attackForceIds",
  "record.forceSizes",
  "fallback?.forceSizes",
  "record.attackWaveSizes",
  "fallback?.attackWaveSizes",
  "record.attackWaveUnitTargets",
  "fallback?.attackWaveUnitTargets",
  "record.nextAttackWaveIndex",
  "fallback?.nextAttackWaveIndex",
  "record.defendForceSize",
  "fallback?.defendForceSize",
  "record.attackDelayTicks",
  "fallback?.attackDelayTicks",
  "const sourceSecondTicks = sourceOrderRetryTicksForSave(world, 30)",
  "const attackDelayTicks = Math.max(30, Math.floor(finiteNumberOr(record.attackDelayTicks, fallback?.attackDelayTicks ?? 35 * 30)))",
  "const attackDelayRuntimeTicks = sourceOrderRetryTicksForSave(world, attackDelayTicks)",
  "const fallbackNextAttackTick = fallback?.nextAttackTick ?? currentTick + sourceOrderRetryTicksForSave(world, 20 * 30)",
  "const nextAttackTickCap = Math.max(fallbackNextAttackTick, currentTick + Math.max(sourceSecondTicks, attackDelayRuntimeTicks))",
  "nextAttackTick: Math.max(0, Math.min(nextAttackTickCap, Math.floor(finiteNumberOr(record.nextAttackTick, fallbackNextAttackTick))))",
  "record.attackUnitTargets",
  "fallback?.attackUnitTargets",
  "function normalizeAiAttackUnitTargets",
  "targets.set(record.unitTypeId, (targets.get(record.unitTypeId) ?? 0) + count);",
  ".sort(([left], [right]) => left.localeCompare(right))",
  "function normalizeAiAttackWaveUnitTargets",
  "record.buildOrder",
  "fallback?.buildOrder",
  "buildOrder: normalizeAiBuildOrder(record.buildOrder, fallback?.buildOrder ?? [])",
  "const SOURCE_AI_BUILD_ROLES = new Set([",
  "SOURCE_AI_BUILD_ROLES.has(entry)",
  "function normalizeAiBuildOrder",
  "record.buildDepots",
  "fallback?.buildDepots",
  "record.preferredAttackUnitTypes",
  "fallback?.preferredAttackUnitTypes",
  "preferredAttackUnitTypes: normalizeAiPreferredAttackUnitTypes(record.preferredAttackUnitTypes, fallback?.preferredAttackUnitTypes ?? [], world)",
  "function normalizeAiPreferredAttackUnitTypes",
  "unitTypeIds.has(unitTypeId)",
  "record.workerTarget",
  "fallback?.workerTarget",
  "record.tankerTarget",
  "fallback?.tankerTarget",
  "record.transportTarget",
  "fallback?.transportTarget",
  "record.collectWeights",
  "fallback?.collectWeights",
  "function normalizeAiCollectWeights",
  "record.researchOrder",
  "fallback?.researchOrder",
  "researchOrder: normalizeAiResearchOrder(record.researchOrder, fallback?.researchOrder ?? [], world)",
  "function normalizeAiResearchOrder",
  "upgradeIds.has(upgradeId)"
];
for (const fragment of requiredSaveFragments) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load normalization missing source AI plan fragment: ${fragment}`);
  }
}

for (const fragment of [
  "normalizeNonNegativeIntegerArray(record.attackForceIds",
  "normalizePositiveIntegerArray(record.forceSizes",
  "attackForceIds: []",
  "forceSizes: []"
]) {
  if (!saveSource.includes(fragment)) {
    error(`Save/load normalization missing source AI force metadata fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Source AI force plan errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source AI force plans verified (${plans} plans across ${campaignMapsWithPlans.length} campaign maps, ${nonDefaultThresholds} non-default attack thresholds, ${attackWaveReferences} attack-wave size references, ${groupedAttackWavePlans} grouped attack-wave plans, ${attackWaveUnitTargetReferences} attack-wave composition references, ${defendForcePlans} defend force plans, ${nonDefaultAttackDelays} non-default attack delays, ${nonDefaultInitialAttackDelays} non-default initial attack delays, ${buildPlans} build plans, ${buildDepotDisabledPlans} depot-building overrides, ${multiBuildingTargetPlans} multi-building target plans, ${sourceUpgradeBuildReferences} upgrade-to build references, ${sourceWaitBuildReferences} wait-build references, ${attackTypePlans} attack composition plans, ${attackUnitTargetPlans} attack unit target plans, ${nonDefaultWorkerTargets} non-default worker targets, ${nonDefaultTankerTargets} non-default tanker targets, ${transportTargets} transport targets, ${collectPlans} collect weight plans, ${researchPlans} research plans).`);
