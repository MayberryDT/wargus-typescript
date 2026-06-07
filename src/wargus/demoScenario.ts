import type { WorldState } from "../simulation/world";
import type { WargusMap, WargusMapSetup } from "./types";

export const FIXED_BROWSER_DEMO_MAP_PATH = "maps/ladder/Garden of war BNE.pud.smp.gz";
export const FIXED_BROWSER_DEMO_TITLE = "Wargus TS Browser Demo";
export const FIXED_BROWSER_DEMO_PLAYER_ID = 0;
export const FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID = 1;
export const FIXED_BROWSER_DEMO_NEUTRAL_PLAYER_ID = 15;

const DEMO_START_PLAYERS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const DEMO_DEFAULT_SEED = "garden-of-war-browser-demo";
const DEMO_HIGH_RESOURCES = { gold: 10000, wood: 5000, oil: 5000 } as const;

export function isFixedBrowserDemoMap(map: Pick<WargusMap, "path"> | null | undefined): boolean {
  return map?.path === FIXED_BROWSER_DEMO_MAP_PATH;
}

export function applyFixedBrowserDemoSetup(map: WargusMap, setup: WargusMapSetup): WargusMapSetup {
  if (!isFixedBrowserDemoMap(map)) {
    return setup;
  }

  const starts = chooseFixedDemoStarts(setup);
  const humanSourcePlayer = starts.human;
  const enemySourcePlayer = starts.enemy;
  const humanSource = setup.players.find((player) => player.player === humanSourcePlayer);
  const enemySource = setup.players.find((player) => player.player === enemySourcePlayer);
  const humanStart = setup.starts.find((start) => start.player === humanSourcePlayer);
  const enemyStart = setup.starts.find((start) => start.player === enemySourcePlayer);
  const enemyAi = enemySource?.ai ?? setup.aiTypeOverrides.find((entry) => entry.player === enemySourcePlayer)?.ai ?? "wc2-land-attack";
  const humanStartPoint = {
    x: humanStart?.x ?? humanSource?.startView?.x ?? 116,
    y: humanStart?.y ?? humanSource?.startView?.y ?? 116
  };
  const enemyStartPoint = {
    x: enemyStart?.x ?? enemySource?.startView?.x ?? 85,
    y: enemyStart?.y ?? enemySource?.startView?.y ?? 118
  };
  const demoUnits = [
    ...setup.units
      .filter((unit) => unit.player === FIXED_BROWSER_DEMO_NEUTRAL_PLAYER_ID)
      .map((unit) => ({ ...unit })),
    {
      typeId: "unit-peasant",
      player: FIXED_BROWSER_DEMO_PLAYER_ID,
      x: humanStartPoint.x,
      y: humanStartPoint.y,
      resourcesHeld: null,
      hitPoints: null
    },
    {
      typeId: "unit-peon",
      player: FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID,
      x: enemyStartPoint.x,
      y: enemyStartPoint.y,
      resourcesHeld: null,
      hitPoints: null
    }
  ];

  return {
    ...setup,
    title: FIXED_BROWSER_DEMO_TITLE,
    objectives: [],
    briefingText: null,
    briefingVoiceFiles: [],
    state: {
      ...setup.state,
      fogOfWar: true,
      disableStartingHalls: true
    },
    players: setup.players.map((player) => {
      if (player.player === FIXED_BROWSER_DEMO_PLAYER_ID) {
        return {
          ...player,
          race: "human",
          ai: null,
          playerType: "person",
          startView: humanStartPoint,
          resources: { ...DEMO_HIGH_RESOURCES }
        };
      }
      if (player.player === FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID) {
        return {
          ...player,
          race: "orc",
          ai: enemyAi,
          playerType: "computer",
          startView: enemyStartPoint,
          resources: { ...DEMO_HIGH_RESOURCES }
        };
      }
      return {
        ...player,
        ai: null,
        playerType: "nobody",
        resources: { gold: 0, wood: 0, oil: 0 }
      };
    }),
    playerTypes: [
      { player: FIXED_BROWSER_DEMO_PLAYER_ID, playerType: "person" },
      { player: FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID, playerType: "computer" },
      ...setup.players
        .filter((player) => player.player !== FIXED_BROWSER_DEMO_PLAYER_ID && player.player !== FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID)
        .map((player) => ({ player: player.player, playerType: "nobody" }))
    ],
    aiTypeOverrides: [
      { player: FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID, ai: enemyAi },
      ...setup.aiTypeOverrides.filter((entry) => entry.player !== FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID)
    ],
    diplomacy: [
      { player: FIXED_BROWSER_DEMO_PLAYER_ID, otherPlayer: FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID, state: "enemy" },
      { player: FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID, otherPlayer: FIXED_BROWSER_DEMO_PLAYER_ID, state: "enemy" },
      ...setup.diplomacy.filter((entry) => (
        !(entry.player === FIXED_BROWSER_DEMO_PLAYER_ID && entry.otherPlayer === FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID)
        && !(entry.player === FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID && entry.otherPlayer === FIXED_BROWSER_DEMO_PLAYER_ID)
      ))
    ],
    sharedVision: setup.sharedVision.filter((entry) => entry.player <= 1 && entry.otherPlayer <= 1 ? false : true),
    victoryRequirements: [{ kind: "player-defeated", player: FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID }],
    victoryRequirementGroups: [],
    defeatRequirements: [{ kind: "player-defeated", player: "self" }],
    timedVictoryTriggers: [],
    locationBuildRequirements: [],
    circleOfPowerRequirements: [],
    rescuedCircleRequirements: [],
    allowedUnitTypes: [
      "unit-farm",
      "unit-footman",
      "unit-archer",
      "unit-human-barracks",
      "unit-peasant",
      "unit-town-hall",
      "unit-gold-mine",
      "unit-great-hall",
      "unit-pig-farm",
      "unit-orc-barracks",
      "unit-peon",
      "unit-grunt",
      "unit-axethrower",
      "unit-elven-lumber-mill",
      "unit-troll-lumber-mill",
      "unit-human-blacksmith",
      "unit-orc-blacksmith",
      "unit-stables",
      "unit-ogre-mound",
      "unit-human-watch-tower",
      "unit-orc-watch-tower",
      "unit-human-guard-tower",
      "unit-orc-guard-tower",
      "unit-human-cannon-tower",
      "unit-orc-cannon-tower",
      "unit-keep",
      "unit-stronghold",
      "unit-castle",
      "unit-fortress",
      "unit-knight",
      "unit-ogre",
      "unit-paladin",
      "unit-ogre-mage",
      "unit-ballista",
      "unit-catapult",
      "unit-mage",
      "unit-death-knight",
      "unit-gryphon-rider",
      "unit-dragon",
      "unit-gryphon-aviary",
      "unit-dragon-roost"
    ],
    allowedUpgradeTypes: [],
    tiles: setup.tiles.map((tile) => ({ ...tile })),
    starts: [
      { player: FIXED_BROWSER_DEMO_PLAYER_ID, ...humanStartPoint },
      { player: FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID, ...enemyStartPoint },
      ...setup.starts
        .filter((start) => start.player !== FIXED_BROWSER_DEMO_PLAYER_ID && start.player !== FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID)
        .map((start) => ({ ...start }))
    ],
    units: demoUnits
  };
}

export function applyFixedBrowserDemoWorldPresentation(map: WargusMap, world: WorldState): void {
  if (!isFixedBrowserDemoMap(map)) {
    return;
  }

  world.units = world.units.filter((unit) => (
    (unit.player === FIXED_BROWSER_DEMO_PLAYER_ID || unit.player === FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID || unit.player === FIXED_BROWSER_DEMO_NEUTRAL_PLAYER_ID)
    && !unit.id.includes("-starting-")
  ));
  world.visibilityPlayer = FIXED_BROWSER_DEMO_PLAYER_ID;
  world.engineSettings.showNoSelectionStatsDefault = false;
  world.engineSettings.showTipsDefault = false;
  world.engineSettings.viewportModeDefault = 0;
  world.engineSettings.bigScreenDefault = true;
  world.engineSettings.mapGridDefault = false;
  world.engineSettings.highlightPassabilityDefault = false;
  world.engineSettings.hardwareCursorDefault = true;
  world.engineSettings.grabMouseDefault = false;
  world.engineSettings.frameSkipDefault = 0;
  world.engineSettings.showButtonPopupsDefault = false;
  world.engineSettings.noStatusLineTooltipsDefault = true;
  world.engineSettings.selectionStyleDefault = "corners";
  world.engineSettings.doubleClickDelayMsDefault = 0;
  world.engineSettings.pauseOnLeaveDefault = false;
  world.engineSettings.sourceGameSpeedDefault = world.tickRate;
  world.engineSettings.fogOfWarEnabled = true;
  world.engineSettings.revealMapMode = "hidden";
  world.engineSettings.fogOfWarType = "fast";
  world.engineSettings.fogOfWarBilinear = false;
  world.engineSettings.fogOfWarBlur = { simpleRadius: 0, bilinearRadius: 0, iterations: 1 };
  world.engineSettings.fogOfWarOpacityLevels = [0x98, 0x98, 0xff];
}

export function fixedBrowserDemoInitialSelection(world: WorldState): string[] {
  return world.units
    .filter((unit) => unit.player === world.visibilityPlayer && unit.hitPoints > 0 && unit.typeId === "unit-peasant")
    .slice(0, 1)
    .map((unit) => unit.id);
}

function chooseFixedDemoStarts(setup: WargusMapSetup): { human: number; enemy: number } {
  const available = DEMO_START_PLAYERS.filter((player) => setup.players.some((candidate) => candidate.player === player));
  if (available.length < 2) {
    return { human: FIXED_BROWSER_DEMO_PLAYER_ID, enemy: FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID };
  }
  const seed = fixedDemoSeed();
  const humanIndex = seededIndex(`${seed}:human`, available.length);
  const human = available[humanIndex] ?? FIXED_BROWSER_DEMO_PLAYER_ID;
  const enemyPool = available.filter((player) => player !== human);
  const enemyIndex = seededIndex(`${seed}:enemy:${human}`, enemyPool.length);
  const enemy = enemyPool[enemyIndex] ?? FIXED_BROWSER_DEMO_ENEMY_PLAYER_ID;
  return { human, enemy };
}

function fixedDemoSeed(): string {
  const search = typeof globalThis.location?.search === "string" ? globalThis.location.search : "";
  const params = new URLSearchParams(search);
  if (params.has("demoSeed")) {
    return params.get("demoSeed") || DEMO_DEFAULT_SEED;
  }
  if (params.has("smoke")) {
    return "smoke";
  }
  return `${DEMO_DEFAULT_SEED}:${Date.now()}:${Math.random()}`;
}

function seededIndex(seed: string, length: number): number {
  if (length <= 0) {
    return 0;
  }
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % length;
}
