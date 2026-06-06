import { issueGroupAttackMoveOrder } from "../simulation/orders";
import type { WorldState, WorldUnit } from "../simulation/world";
import { FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID, FIXED_BROWSER_DEMO_PLAYER_ID, isFixedBrowserDemoMap } from "./demoScenario";

export type FixedDemoMissionStage = "briefing" | "economy" | "training" | "raid" | "assault" | "victory" | "defeat";

export interface FixedDemoMissionSummary {
  stage: FixedDemoMissionStage;
  objective: string;
  objectives: string[];
  harvestStarted: boolean;
  trainingStarted: boolean;
  raidLaunched: boolean;
  raidActive: boolean;
  localWorkerCount: number;
  localArmyCount: number;
  enemyHallId: string | null;
  enemyHallHitPoints: number | null;
  enemyRaidUnitCount: number;
  tick: number;
  matchStatus: WorldState["matchState"]["status"];
}

export interface FixedDemoMissionRuntimeState {
  lastStage: FixedDemoMissionStage | null;
  raidAnnounced: boolean;
}

const INITIAL_DEMO_ARMY_COUNT = 3;
const INITIAL_DEMO_TOTAL_UNIT_COUNT = 5;
const RAID_LAUNCH_SECONDS = 18;
const TOWN_CENTER_TYPE_IDS = new Set(["unit-town-hall", "unit-keep", "unit-castle", "unit-great-hall", "unit-stronghold", "unit-fortress"]);

export function createFixedDemoMissionRuntimeState(): FixedDemoMissionRuntimeState {
  return {
    lastStage: null,
    raidAnnounced: false
  };
}

export function resetFixedDemoMissionRuntimeState(state: FixedDemoMissionRuntimeState): void {
  state.lastStage = null;
  state.raidAnnounced = false;
}

export function fixedDemoMissionSummary(world: WorldState | null, briefingOpen = false): FixedDemoMissionSummary | null {
  if (!world || !isFixedBrowserDemoMap(world.map)) {
    return null;
  }
  const player = fixedDemoPlayer(world);
  const hall = fixedDemoEnemyHall(world);
  const raidUnits = fixedDemoRaidUnits(world);
  const localArmyCount = fixedDemoArmyUnits(world).length;
  const localWorkerCount = world.units.filter((unit) => unit.player === FIXED_BROWSER_DEMO_PLAYER_ID && unit.hitPoints > 0 && unit.gatherResources.length > 0).length;
  const harvestStarted = fixedDemoHarvestStarted(world, player);
  const trainingStarted = fixedDemoTrainingStarted(world, player, localArmyCount);
  const raidLaunched = fixedDemoRaidLaunched(player, raidUnits);
  const raidActive = raidLaunched && raidUnits.length > 0;
  const stage = fixedDemoMissionStage(world, briefingOpen, harvestStarted, trainingStarted, raidLaunched, raidActive);
  const objective = fixedDemoMissionObjective(stage, raidLaunched);
  return {
    stage,
    objective,
    objectives: fixedDemoMissionObjectives(stage, objective),
    harvestStarted,
    trainingStarted,
    raidLaunched,
    raidActive,
    localWorkerCount,
    localArmyCount,
    enemyHallId: hall?.id ?? null,
    enemyHallHitPoints: hall?.hitPoints ?? null,
    enemyRaidUnitCount: raidUnits.length,
    tick: world.tick,
    matchStatus: world.matchState.status
  };
}

export function updateFixedDemoMission(
  world: WorldState | null,
  state: FixedDemoMissionRuntimeState,
  options: {
    briefingOpen: boolean;
    titleScreenOpen: boolean;
    addHudMessage: (message: string, lifetimeMs?: number) => void;
  }
): FixedDemoMissionSummary | null {
  const before = fixedDemoMissionSummary(world, options.briefingOpen);
  if (!world || !before) {
    resetFixedDemoMissionRuntimeState(state);
    return null;
  }

  if (!options.briefingOpen && !options.titleScreenOpen && shouldLaunchFixedDemoRaid(world, before)) {
    const issued = launchFixedDemoRaid(world);
    if (issued && !state.raidAnnounced) {
      options.addHudMessage("Enemy raiders are attacking your town.", 6500);
      state.raidAnnounced = true;
    }
  }

  const summary = fixedDemoMissionSummary(world, options.briefingOpen);
  if (!summary) {
    return null;
  }
  if (!options.briefingOpen && world.matchState.status === "playing") {
    world.objectives = summary.objectives;
  }
  if (!options.briefingOpen && summary.stage !== state.lastStage) {
    const message = fixedDemoMissionMessage(summary);
    if (message) {
      options.addHudMessage(message, 6500);
    }
  }
  state.lastStage = summary.stage;
  if (!summary.raidLaunched) {
    state.raidAnnounced = false;
  }
  return summary;
}

function fixedDemoMissionStage(
  world: WorldState,
  briefingOpen: boolean,
  harvestStarted: boolean,
  trainingStarted: boolean,
  raidLaunched: boolean,
  raidActive: boolean
): FixedDemoMissionStage {
  if (world.matchState.status === "victory") {
    return "victory";
  }
  if (world.matchState.status === "defeat" || world.matchState.status === "draw") {
    return "defeat";
  }
  if (briefingOpen) {
    return "briefing";
  }
  if (!harvestStarted) {
    return "economy";
  }
  if (!trainingStarted) {
    return "training";
  }
  if (!raidLaunched || raidActive) {
    return "raid";
  }
  return "assault";
}

function fixedDemoMissionObjective(stage: FixedDemoMissionStage, raidLaunched: boolean): string {
  if (stage === "briefing") {
    return "Read the briefing, then press Continue.";
  }
  if (stage === "economy") {
    return "Gather gold or lumber with your workers.";
  }
  if (stage === "training") {
    return "Train another soldier from the Barracks.";
  }
  if (stage === "raid") {
    return raidLaunched ? "Defend the town from the enemy raid." : "Build your army; enemy raiders are moving soon.";
  }
  if (stage === "assault") {
    return "Destroy the enemy town.";
  }
  if (stage === "victory") {
    return "Victory - the enemy town has fallen.";
  }
  return "Defeat - your town has been destroyed.";
}

function fixedDemoMissionObjectives(stage: FixedDemoMissionStage, objective: string): string[] {
  if (stage === "briefing") {
    return [
      "Gather gold and lumber for the war effort.",
      "Train soldiers at the Barracks and hold the town.",
      "Destroy the enemy town."
    ];
  }
  if (stage === "victory" || stage === "defeat") {
    return [objective];
  }
  if (objective === "Destroy the enemy town.") {
    return [objective];
  }
  return [
    objective,
    "Destroy the enemy town."
  ];
}

function fixedDemoMissionMessage(summary: FixedDemoMissionSummary): string | null {
  if (summary.stage === "economy") {
    return "Gather gold or lumber to start the attack.";
  }
  if (summary.stage === "training") {
    return "Select a production building and train another soldier.";
  }
  if (summary.stage === "raid") {
    return summary.raidLaunched ? "Defend the town from the enemy raid." : "The enemy is preparing a raid.";
  }
  if (summary.stage === "assault") {
    return "The raid is broken. Destroy the enemy town.";
  }
  return null;
}

function shouldLaunchFixedDemoRaid(world: WorldState, summary: FixedDemoMissionSummary): boolean {
  return summary.stage === "raid"
    && !summary.raidLaunched
    && summary.trainingStarted
    && fixedDemoRaidUnits(world).length > 0
    && world.tick >= RAID_LAUNCH_SECONDS * world.tickRate;
}

function launchFixedDemoRaid(world: WorldState): boolean {
  const raidUnits = fixedDemoRaidUnits(world);
  if (raidUnits.length === 0) {
    return false;
  }
  const target = fixedDemoTownCenter(world) ?? fixedDemoArmyUnits(world)[0] ?? null;
  if (!target) {
    return false;
  }
  return issueGroupAttackMoveOrder(
    world,
    raidUnits.map((unit) => unit.id),
    target.x,
    target.y,
    FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID
  );
}

function fixedDemoPlayer(world: WorldState): WorldState["players"][number] | null {
  return world.players.find((player) => player.id === FIXED_BROWSER_DEMO_PLAYER_ID) ?? null;
}

function fixedDemoEnemyHall(world: WorldState): WorldUnit | null {
  return world.units.find((unit) => unit.player === FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID && TOWN_CENTER_TYPE_IDS.has(unit.typeId) && unit.hitPoints > 0) ?? null;
}

function fixedDemoTownCenter(world: WorldState): WorldUnit | null {
  return world.units.find((unit) => unit.player === FIXED_BROWSER_DEMO_PLAYER_ID && unit.hitPoints > 0 && TOWN_CENTER_TYPE_IDS.has(unit.typeId)) ?? null;
}

function fixedDemoArmyUnits(world: WorldState): WorldUnit[] {
  return world.units.filter((unit) => unit.player === FIXED_BROWSER_DEMO_PLAYER_ID && unit.hitPoints > 0 && unit.canAttack && !unit.construction);
}

function fixedDemoRaidUnits(world: WorldState): WorldUnit[] {
  return world.units.filter((unit) => (
    unit.player === FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID
    && unit.hitPoints > 0
    && unit.canAttack
    && !unit.construction
    && !unit.order
  ));
}

function fixedDemoHarvestStarted(world: WorldState, player: WorldState["players"][number] | null): boolean {
  if ((player?.stats.goldMined ?? 0) > 0 || (player?.stats.woodHarvested ?? 0) > 0) {
    return true;
  }
  return world.units.some((unit) => (
    unit.player === FIXED_BROWSER_DEMO_PLAYER_ID
    && unit.hitPoints > 0
    && unit.gatherResources.length > 0
    && (
      unit.resourcesHeld > 0
      || unit.order?.kind === "harvest"
      || unit.moveQueue.some((order) => order.kind === "harvest" || order.kind === "harvest-wood")
    )
  ));
}

function fixedDemoTrainingStarted(world: WorldState, player: WorldState["players"][number] | null, localArmyCount: number): boolean {
  if (localArmyCount > INITIAL_DEMO_ARMY_COUNT) {
    return true;
  }
  if ((player?.stats.totalUnits ?? 0) > INITIAL_DEMO_TOTAL_UNIT_COUNT) {
    return true;
  }
  return world.units.some((unit) => (
    unit.player === FIXED_BROWSER_DEMO_PLAYER_ID
    && unit.hitPoints > 0
    && unit.productionQueue.length > 0
  ));
}

function fixedDemoRaidLaunched(player: WorldState["players"][number] | null, raidUnits: WorldUnit[]): boolean {
  if ((player?.stats.unitsKilled ?? 0) > 0) {
    return true;
  }
  return raidUnits.some((unit) => Boolean(unit.order) || unit.moveQueue.length > 0);
}
