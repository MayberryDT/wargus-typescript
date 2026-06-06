import type { WargusAiDefinition, WargusAllowRule, WargusAnimation, WargusButton, WargusDependencyRule, WargusEngineSettings, WargusMap, WargusMapSetup, WargusMissile, WargusSpeedFactors, WargusSpell, WargusTilesetTerrain, WargusUnit, WargusUnitDatabaseEntry, WargusUpgrade } from "../wargus/types";
import { sourceRaceScoreForUnitDefinition } from "../wargus/sourceRace";

const WARGUS_SPEED_TO_PIXELS_PER_SECOND = 8.4;

const DEFAULT_ENGINE_SETTINGS: WargusEngineSettings = {
  buildingCapture: false,
  clickMissileId: null,
  damageMissileId: null,
  sourceDamageMissileId: null,
  defaultIncomes: [],
  defaultResourceActions: [],
  defaultResourceAmounts: {},
  defaultResourceMaxAmounts: [],
  defaultResourceNames: [],
  deselectInMineDefault: false,
  doubleClickDelayMsDefault: 300,
  enhancedEffectsDefault: true,
  effectsEnabledDefault: true,
  effectsVolumeDefault: 128,
  enableKeyboardScrollingDefault: true,
  enableMouseScrollingDefault: true,
  fastForwardCycleDefault: 0,
  frameSkipDefault: 0,
  formationMovementDefault: true,
  bigScreenDefault: false,
  grayscaleIconsDefault: false,
  allyDepositsAllowedDefault: false,
  aiChecksDependenciesDefault: false,
  aiExploresDefault: true,
  insideDefault: false,
  fogOfWarBilinear: false,
  fogOfWarBlur: { simpleRadius: 2.0, bilinearRadius: 1.5, iterations: 3 },
  fogOfWarEasingSteps: 8,
  fogOfWarEnabled: true,
  fogOfWarGraphics: null,
  fogOfWarOpacityLevels: [0x7f, 0xbe, 0xfe],
  fogOfWarType: null,
  fieldOfViewType: "simple-radial",
  opaqueTerrainTypes: [],
  forestRegenerationSeconds: 0,
  globalBuildingLimit: 200,
  globalTotalUnitLimit: 400,
  globalUnitLimit: 200,
  gameName: "wc2",
  fullGameName: "Wargus",
  gameVersion: "3.3.3",
  gameHomepage: "https://wargus.github.io",
  gameCopyright: "(c) 1998-2022 by The Stratagus Project.",
  gameLicense: "GPL v2+",
  menuRace: "orc",
  defaultRace: "orc",
  grabMouseDefault: false,
  groupKeysDefault: "0123456789`",
  hardwareCursorDefault: false,
  highlightPassabilityDefault: false,
  holdClickDelayMsDefault: 1000,
  iconsShiftDefault: true,
  keepRatioDefault: true,
  keyScrollSpeedDefault: 4,
  lastDifficultyDefault: 2,
  leaveStopScrollingDefault: true,
  maxSelectable: 18,
  mapGridDefault: false,
  minimapFogOfWarOpacityLevels: [0x55, 0xaa, 0xff],
  minimapWithTerrainDefault: true,
  mineNotificationsDefault: true,
  musicEnabledDefault: true,
  musicVolumeDefault: 128,
  networkGameDefault: false,
  debugFlagsDefault: [],
  mouseScrollSpeedControlDefault: 15,
  mouseScrollSpeedDefault: 1,
  mouseScrollSpeedPressedDefault: 4,
  scrollMargins: { top: 15, right: 16, bottom: 16, left: 2 },
  pauseOnLeaveDefault: true,
  playerNameDefault: "Wargustus",
  defaultPlayerNames: {
    human: ["Nation of Stromgarde", "Nation of Azeroth", "Nation of Kul Tiras", "Nation of Dalaran", "Nation of Alterac", "Nation of Gilneas", "Nation of Lordaeron", "Alliance Traitors"],
    orc: ["Blackrock Clan", "Stormreaver Clan", "Bleeding Hollow Clan", "Twilight's Hammer Clan", "Burning Blade Clan", "Black Tooth Grin Clan", "Dragonmaw Clan", "Laughing Skull Clan"]
  },
  raceNames: [
    { name: "human", display: "Human", visible: true },
    { name: "orc", display: "Orc", visible: true },
    { name: "neutral", display: "Neutral", visible: false }
  ],
  raceUnitEquivalents: {},
  playerColorIndex: { start: 208, count: 4 },
  playerColors: [
    { name: "red", shades: [[164, 0, 0], [124, 0, 0], [92, 4, 0], [68, 4, 0]] },
    { name: "blue", shades: [[12, 72, 204], [4, 40, 160], [0, 20, 116], [0, 4, 76]] },
    { name: "green", shades: [[44, 180, 148], [20, 132, 92], [4, 84, 44], [0, 40, 12]] },
    { name: "violet", shades: [[152, 72, 176], [116, 44, 132], [80, 24, 88], [44, 8, 44]] },
    { name: "orange", shades: [[248, 140, 20], [200, 96, 16], [152, 60, 16], [108, 32, 12]] },
    { name: "black", shades: [[40, 40, 60], [28, 28, 44], [20, 20, 32], [12, 12, 20]] },
    { name: "white", shades: [[224, 224, 224], [152, 152, 180], [84, 84, 128], [36, 40, 76]] },
    { name: "yellow", shades: [[252, 252, 72], [228, 204, 40], [204, 160, 16], [180, 116, 0]] }
  ],
  completedBarColorRgb: [48, 100, 4],
  completedBarShadow: false,
  autoCastBorderColorRgb: [0, 0, 252],
  autosaveMinutesDefault: 5,
  buttonStyles: {},
  uiFontColors: {
    human: { normal: "white", reverse: "yellow" },
    orc: { normal: "yellow", reverse: "white" }
  },
  buttonPanel: {
    x: 0,
    y: 336,
    slots: [
      { slot: 0, x: 9, y: 4 },
      { slot: 1, x: 65, y: 4 },
      { slot: 2, x: 121, y: 4 },
      { slot: 3, x: 9, y: 51 },
      { slot: 4, x: 65, y: 51 },
      { slot: 5, x: 121, y: 51 },
      { slot: 6, x: 9, y: 98 },
      { slot: 7, x: 65, y: 98 },
      { slot: 8, x: 121, y: 98 }
    ]
  },
  infoPanel: {
    x: 0,
    y: 160,
    width: 176,
    height: 176,
    singleSelected: { slot: 0, x: 9, y: 9 },
    selectedSlots: [
      { slot: 0, x: 9, y: 9 },
      { slot: 1, x: 65, y: 9 },
      { slot: 2, x: 121, y: 9 },
      { slot: 3, x: 9, y: 63 },
      { slot: 4, x: 65, y: 63 },
      { slot: 5, x: 121, y: 63 },
      { slot: 6, x: 9, y: 117 },
      { slot: 7, x: 65, y: 117 },
      { slot: 8, x: 121, y: 117 }
    ],
    maxSelectedText: { x: 10, y: 10, font: "game" },
    singleTraining: { slot: 0, x: 110, y: 81 },
    trainingSlots: [
      { slot: 0, x: 9, y: 59 },
      { slot: 1, x: 65, y: 59 },
      { slot: 2, x: 121, y: 59 },
      { slot: 3, x: 9, y: 106 },
      { slot: 4, x: 65, y: 106 },
      { slot: 5, x: 121, y: 106 }
    ],
    upgrading: { slot: 0, x: 110, y: 81 },
    researching: { slot: 0, x: 110, y: 81 },
    transportingSlots: [
      { slot: 0, x: 9, y: 227 },
      { slot: 1, x: 9, y: 274 },
      { slot: 2, x: 65, y: 227 },
      { slot: 3, x: 65, y: 274 },
      { slot: 4, x: 121, y: 227 },
      { slot: 5, x: 121, y: 274 }
    ]
  },
  mapArea: {
    x: 176,
    y: 16,
    rightMargin: 17,
    bottomMargin: 17,
    baseWidth: 640,
    baseHeight: 480
  },
  minimap: {
    x: 24,
    y: 26,
    width: 128,
    height: 128
  },
  statusLine: {
    textX: 178,
    textYFromBottom: 14,
    widthLeft: 194,
    widthRightMargin: 16,
    font: "game"
  },
  messageUi: {
    font: "game",
    scrollSpeed: 5
  },
  menuButtons: {
    human: {
      menu: { x: 24, y: 2, text: "Menu (F10)", style: "main", callback: "game-menu" },
      networkMenu: { x: 6, y: 2, text: "Menu", style: "network", callback: "game-menu" },
      networkDiplomacy: { x: 90, y: 2, text: "Diplomacy", style: "network", callback: "diplomacy-menu" }
    },
    orc: {
      menu: { x: 24, y: 2, text: "Menu (F10)", style: "main-orc", callback: "game-menu" },
      networkMenu: { x: 6, y: 2, text: "Menu", style: "network-orc", callback: "game-menu" },
      networkDiplomacy: { x: 90, y: 2, text: "Diplomacy", style: "network-orc", callback: "diplomacy-menu" }
    }
  },
  briefingLayout: {
    baseWidth: 640,
    baseHeight: 480,
    titleX: 205,
    titleY: 28,
    textX: 70,
    textY: 80,
    textWidth: 320,
    objectivesX: 70,
    objectivesY: 306,
    objectivesWidth: 250,
    continueButtonX: 455,
    continueButtonY: 440,
    exitButtonOffsetX: 133,
    characterXOffsetFromRight: 450,
    characterY: 10
  },
  revealMapMode: "hidden",
  revealAttacker: false,
  revelationType: null,
  rightButtonAction: "move",
  extensionsEnabled: true,
  resourceUiLabels: [],
  resourceUiSlots: [],
  selectionStyleDefault: "corners",
  selectionRectangleIndicatesDamageDefault: false,
  sourceGameSpeedDefault: 30,
  showButtonPopupsDefault: true,
  showCommandKeyDefault: true,
  showDamageDefault: false,
  showMessagesDefault: true,
  showNameDelayTicksDefault: 0,
  showNameTimeTicksDefault: 0,
  showNoSelectionStatsDefault: true,
  noStatusLineTooltipsDefault: false,
  showOrdersDefault: true,
  showSightRangeDefault: false,
  showAttackRangeDefault: false,
  showReactionRangeDefault: false,
  showTipsDefault: true,
  simplifiedAutoTargetingDefault: true,
  speedFactors: { build: 1, train: 1, upgrade: 1, research: 1, resourceHarvest: {}, resourceReturn: {} },
  stereoSoundDefault: true,
  tipNumberDefault: 0,
  trainingQueue: true,
  useFancyBuildingsDefault: false,
  videoFullScreenDefault: false,
  videoHeightDefault: 480,
  videoShaderDefault: "none",
  videoWidthDefault: 640,
  viewportModeDefault: 0
};

export interface WorldUnit {
  id: string;
  typeId: string;
  name: string;
  player: number;
  x: number;
  y: number;
  radius: number;
  boxWidth: number;
  boxHeight: number;
  facing: number;
  hitPoints: number;
  maxHitPoints: number;
  drawLevel: number;
  priority: number;
  points: number;
  annoyComputerFactor: number;
  kind: string;
  landUnit: boolean;
  seaUnit: boolean;
  airUnit: boolean;
  sideAttack: boolean;
  rotationSpeed: number;
  elevated: boolean;
  shadow: number | null;
  woodImprove: boolean;
  oilImprove: boolean;
  center: boolean;
  level: number;
  builderOutside: boolean;
  teleporter: boolean;
  teleportDestinationId: string | null;
  numDirections: number;
  onReady: string | null;
  image: string | null;
  animation: string | null;
  corpseTypeId: string | null;
  explosionType: string | null;
  rightMouseAction: string | null;
  missile: string | null;
  constructionTypeId: string | null;
  vanishes: boolean;
  decayRate: number;
  revealer: boolean;
  frameWidth: number;
  frameHeight: number;
  tileWidth: number;
  tileHeight: number;
  baseSpeed: number;
  speed: number;
  statusEffects: WorldUnitStatusEffect[];
  regenerationRate: number;
  regenerationFrequency: number;
  regenerationAccumulator: number;
  armor: number;
  basicDamage: number;
  piercingDamage: number;
  minAttackRange: number;
  attackRange: number;
  sightRangeTiles: number;
  computerReactionRange: number;
  personReactionRange: number;
  supply: number;
  demand: number;
  canAttack: boolean;
  canTargetLand: boolean;
  canTargetSea: boolean;
  canTargetAir: boolean;
  groundAttack: boolean;
  detectCloak: boolean;
  coward: boolean;
  gatherResources: string[];
  resourceCapacity: Record<string, number>;
  resourceStep: Record<string, number>;
  waitAtResource: Record<string, number>;
  waitAtDepot: Record<string, number>;
  canCastSpells: string[];
  autoCastSpells: string[];
  storesResources: string[];
  givesResource: string | null;
  canHarvest: boolean;
  mainFacility: boolean;
  shoreBuilding: boolean;
  manaEnabled: boolean;
  selectableByRectangle: boolean;
  indestructible: boolean;
  nonSolid: boolean;
  visibleUnderFog: boolean;
  permanentCloak: boolean;
  organic: boolean;
  isUndead: boolean;
  hero: boolean;
  volatile: boolean;
  randomMovementProbability: number;
  randomMovementDistance: number;
  clicksToExplode: number;
  burnPercent: number;
  burnDamageRate: number;
  burnAccumulator: number;
  explodeClickCount: number;
  lastExplodeClickAtMs: number;
  nextAutoActionTick: number;
  nextRandomMoveTick: number;
  neutral: boolean;
  neutralMinimapColor: [number, number, number] | null;
  attackCooldown: number;
  mana: number;
  maxMana: number;
  manaIncrease: number;
  spellCooldown: number;
  sourceSpellGoalId: string | null;
  resourcesHeld: number;
  carriedResource: string | null;
  lastDamagePlayer: number | null;
  lastDamageSourceUnitId: string | null;
  kills: number;
  xp: number;
  cargo: WorldUnit[];
  cargoCapacity: number;
  canTransport: string[];
  autoRepair: boolean;
  autoRepairRange: number;
  repairRange: number;
  repairHp: number;
  repairCosts: string[];
  improveProduction: Record<string, number>;
  rallyPoint: WorldPathPoint | null;
  productionQueue: ProductionOrder[];
  construction: ConstructionState | null;
  lifetimeSeconds?: number;
  hiddenInConstructionId?: string | null;
  order: WorldOrder | null;
  moveQueue: QueuedMoveOrder[];
}

export interface WorldUnitStatusEffect {
  kind: "slow" | "haste" | "bloodlust" | "invisibility" | "unholy-armor" | "flame-shield";
  remainingSeconds: number;
  totalSeconds: number;
  speedMultiplier: number;
  damageMultiplier?: number;
}

export interface WorldLastSeenBuilding {
  unitId: string;
  typeId: string;
  player: number;
  x: number;
  y: number;
  radius: number;
  drawLevel: number;
  facing: number;
  animation: string | null;
  frameWidth: number;
  frameHeight: number;
  seenTick: number;
}

export interface WorldVisibilityReveal {
  player: number;
  x: number;
  y: number;
  radiusTiles: number;
  remainingTicks: number;
}

export interface WorldForestRegrowth {
  x: number;
  y: number;
  tile: number;
  remainingTicks: number;
}

export interface WorldForestResource {
  x: number;
  y: number;
  amount: number;
}

export interface WorldProjectile {
  id: string;
  sourceId: string;
  targetId: string | null;
  sourceTypeId: string;
  player: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  displayDamage?: number;
  missileId: string | null;
  className: string | null;
  impactSoundId: string | null;
  impactMissileId: string | null;
  splashFactor: number;
  range: number;
  canHitOwner: boolean;
  friendlyFire: boolean;
  canTargetLand: boolean;
  canTargetSea: boolean;
  canTargetAir: boolean;
  bouncesRemaining: number;
  hitUnitIds: string[];
  drawLevel: number;
  kind: "arrow" | "axe" | "cannon" | "siege" | "torpedo" | "melee";
  age: number;
  delaySeconds: number;
  ttlSeconds: number | null;
}

export interface WorldPendingAttack {
  id: string;
  sourceId: string;
  targetId: string;
  player: number;
  targetX: number;
  targetY: number;
  remainingSeconds: number;
}

export interface WorldSpellEffect {
  id: string;
  kind: "heal" | "fireball" | "flame-shield" | "death-coil" | "slow" | "haste" | "bloodlust" | "death-and-decay" | "blizzard" | "whirlwind" | "polymorph" | "exorcism" | "holy-vision" | "raise-dead" | "runes" | "invisibility" | "unholy-armor" | "summon" | "explosion" | "click-missile";
  player: number;
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
  sourceTypeId?: string | null;
  sourceUnitId?: string | null;
  missileId?: string | null;
  spellId?: string | null;
  drawLevel: number;
}

export interface WorldCorpse {
  id: string;
  typeId: string;
  player: number;
  x: number;
  y: number;
  radius: number;
  drawLevel: number;
  visibleUnderFog: boolean;
  facing?: number;
  animation?: string | null;
  frameWidth?: number;
  frameHeight?: number;
  age: number;
  duration: number;
}

export interface ProductionOrder {
  unitTypeId: string;
  remainingSeconds: number;
  totalSeconds: number;
}

export interface ConstructionState {
  builderId: string;
  builderInside?: boolean;
  remainingSeconds: number;
  totalSeconds: number;
}

export interface ResearchOrder {
  buildingId: string;
  player: number;
  upgradeId: string;
  remainingSeconds: number;
  totalSeconds: number;
}

export interface QueuedResearchOrder {
  buildingId: string;
  player: number;
  upgradeId: string;
  totalSeconds: number;
}

export type WorldOrder =
  | {
      kind: "move";
      targetX: number;
      targetY: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "attack";
      targetId: string;
      targetX: number;
      targetY: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "attack-move";
      targetId: string | null;
      targetX: number;
      targetY: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "attack-ground";
      targetX: number;
      targetY: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "spell-cast";
      command: string;
      spellId: string;
      spellRange: number;
      targetX: number;
      targetY: number;
      spellState: "move" | "cast";
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "explore";
      targetX: number;
      targetY: number;
      exploreRange: number;
      exploreWaitingCycle: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "patrol";
      targetId: string | null;
      anchorX: number;
      anchorY: number;
      targetX: number;
      targetY: number;
      patrolX: number;
      patrolY: number;
      returning: boolean;
      patrolRange: number;
      patrolWaitingCycle: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "hold";
      targetId: string | null;
      anchorX: number;
      anchorY: number;
    }
  | {
      kind: "repair";
      targetId: string;
      targetX: number;
      targetY: number;
      repairCycle: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "load-transport";
      targetId: string;
      boardState: "move" | "wait" | "enter";
      boardRange: number;
      boardWaitTicks: number;
      targetX: number;
      targetY: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "follow";
      targetId: string;
      attackTargetId: string | null;
      followRange: number;
      targetX: number;
      targetY: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "defend";
      targetId: string;
      defendState: "moving" | "defending";
      defendRange: number;
      targetX: number;
      targetY: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "unload-transport";
      unloadCargoUnitId: string | null;
      unloadState: "find-dropzone" | "move" | "unload";
      unloadRetries: number;
      targetX: number;
      targetY: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "harvest";
      targetId: string | null;
      resource: "gold" | "wood" | "oil";
      phase: "to-resource" | "gathering" | "to-dropoff";
      targetX: number;
      targetY: number;
      tileX: number | null;
      tileY: number | null;
      dropoffId: string | null;
      dropoffX: number;
      dropoffY: number;
      gatherSeconds: number;
      returnSeconds: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "build";
      targetId: string;
      targetX: number;
      targetY: number;
      buildCycle: number;
      path: WorldPathPoint[];
      pathIndex: number;
    }
  | {
      kind: "build-oil-platform";
      targetId: string;
      targetX: number;
      targetY: number;
      path: WorldPathPoint[];
      pathIndex: number;
      preserveQueue?: boolean;
    };

export interface WorldPathPoint {
  x: number;
  y: number;
}

export type QueuedMoveOrder =
  | (WorldPathPoint & {
      kind: "move" | "attack-move" | "attack-ground" | "patrol" | "unload-transport" | "stand-ground" | "explore";
      cargoUnitId?: string | null;
    })
  | (WorldPathPoint & {
      kind: "attack-target";
      targetId: string;
    })
  | (WorldPathPoint & {
      kind: "harvest";
      resource: "gold" | "oil";
      targetId: string;
    })
  | (WorldPathPoint & {
      kind: "harvest-wood";
      tileX: number;
      tileY: number;
    })
  | (WorldPathPoint & {
      kind: "return-goods";
      targetId: string | null;
      resource: "gold" | "wood" | "oil";
    })
  | (WorldPathPoint & {
      kind: "spell-cast";
      command: string;
      spellId: string;
      spellRange: number;
    })
  | (WorldPathPoint & {
      kind: "build";
      buildingTypeId: string;
    })
  | (WorldPathPoint & {
      kind: "build-oil-platform";
      targetId: string;
    })
  | (WorldPathPoint & {
      kind: "follow" | "defend" | "repair" | "load-transport";
      targetId: string;
    });

export interface WorldState {
  map: WargusMap;
  tileSize: number;
  tiles: number[];
  terrainVersion: number;
  units: WorldUnit[];
  corpses: WorldCorpse[];
  projectiles: WorldProjectile[];
  pendingAttacks: WorldPendingAttack[];
  spellEffects: WorldSpellEffect[];
  unitDefinitions: WargusUnit[];
  upgradeDefinitions: WargusUpgrade[];
  missileDefinitions: WargusMissile[];
  animationDefinitions: WargusAnimation[];
  spellDefinitions: WargusSpell[];
  allowRules: WargusAllowRule[];
  allowOverrides: WargusAllowRule[];
  dependencyRules: WargusDependencyRule[];
  buttonDefinitions: WargusButton[];
  aiDefinitions: WargusAiDefinition[];
  unitDatabase: WargusUnitDatabaseEntry[];
  tilesetTerrain: WargusTilesetTerrain | null;
  engineSettings: WargusEngineSettings;
  players: WorldPlayer[];
  researchedUpgrades: Record<number, string[]>;
  activeResearch: ResearchOrder[];
  queuedResearch: QueuedResearchOrder[];
  aiStates: WorldAiState[];
  visibilityPlayer: number;
  exploredTiles: Uint8Array;
  visibleTiles: Uint8Array;
  lastSeenBuildings: WorldLastSeenBuilding[];
  visibilityReveals: WorldVisibilityReveal[];
  forestRegrowth: WorldForestRegrowth[];
  forestResources: WorldForestResource[];
  revelationKnownMainFacilityPlayers: number[];
  revelationTimers: Array<{ player: number; remainingTicks: number }>;
  revealedPlayers: number[];
  godModePlayers: number[];
  objectives: string[];
  briefingText: string | null;
  briefingVoiceFiles: string[];
  victoryRequirements: WargusMapSetup["victoryRequirements"];
  victoryRequirementGroups: WargusMapSetup["victoryRequirementGroups"];
  defeatRequirements: WargusMapSetup["defeatRequirements"];
  timedVictoryTriggers: WargusMapSetup["timedVictoryTriggers"];
  locationBuildRequirements: WargusMapSetup["locationBuildRequirements"];
  pendingTimedVictory: { triggerIndex: number; remainingTicks: number; soundPlayed: boolean } | null;
  circleOfPowerRequirements: WargusMapSetup["circleOfPowerRequirements"];
  rescuedCircleRequirements: WargusMapSetup["rescuedCircleRequirements"];
  diplomacy: WargusMapSetup["diplomacy"];
  sharedVision: WargusMapSetup["sharedVision"];
  requiredSurvivalUnitIds: string[];
  allowedUnitTypes: string[];
  allowedUpgradeTypes: string[];
  matchState: MatchState;
  events: WorldEvent[];
  lastHelpTickByPlayer: Record<number, number>;
  lastHelpLocationByPlayer: Record<number, { x: number; y: number }>;
  nextUnitSerial: number;
  elapsed: number;
  tick: number;
  tickRate: number;
  accumulator: number;
}

export type WorldEvent =
  | { kind: "unit-ready"; unitId: string; typeId: string; player: number; x?: number; y?: number }
  | { kind: "construction-complete"; unitId: string; typeId: string; player: number; builderTypeId: string | null; x?: number; y?: number }
  | { kind: "research-complete"; upgradeId: string; player: number; buildingId?: string; x?: number; y?: number }
  | { kind: "unit-dead"; unitId: string; typeId: string; player: number; x?: number; y?: number }
  | { kind: "unit-help"; unitId: string; typeId: string; player: number; x?: number; y?: number }
  | { kind: "unit-entered-resource"; unitId: string; typeId: string; player: number; resource: "gold" | "oil" }
  | { kind: "unit-loaded"; unitId: string; transportId: string; player: number }
  | { kind: "units-unloaded"; unitIds: string[]; transportId: string; player: number }
  | { kind: "unit-teleported"; unitId: string; teleporterId: string; destinationId: string; player: number; x?: number; y?: number }
  | { kind: "resource-depleted"; unitId: string; typeId: string; player: number; resource: "gold" | "oil" }
  | { kind: "sound"; soundId: string; player: number; x?: number; y?: number };

export type MatchState =
  | { status: "playing"; winner: null; endedTick: null }
  | { status: "victory" | "defeat" | "draw"; winner: number | null; endedTick: number };

export interface WorldPlayer {
  id: number;
  name: string | null;
  resources: Record<string, number>;
  speedFactors: WargusSpeedFactors;
  stats: WorldPlayerStats;
  race: string | null;
  ai: string | null;
  playerType: string | null;
  startX: number;
  startY: number;
}

export interface WorldPlayerStats {
  totalUnits: number;
  totalBuildings: number;
  unitsKilled: number;
  buildingsRazed: number;
  unitsLost: number;
  buildingsLost: number;
  pointsKilled: number;
  pointsLost: number;
  goldMined: number;
  woodHarvested: number;
  oilHarvested: number;
}

export interface WorldAiState {
  player: number;
  enabled: boolean;
  strategy: "land" | "sea" | "air";
  sourceScriptId: string | null;
  sourceScriptIndex: number;
  sourceScriptSleepUntilTick: number;
  sourceScriptForces: Array<{ id: number; attack: boolean; targets: Array<{ role: string; count: number; unitTypeId: string | null }> }>;
  sourceScriptForceRoles: Array<{ id: number; role: string }>;
  attackForceSize: number;
  attackForceIds: number[];
  forceSizes: number[];
  attackWaveSizes: number[];
  attackWaveUnitTargets: Array<Array<{ unitTypeId: string; count: number }>>;
  nextAttackWaveIndex: number;
  defendForceSize: number;
  attackDelayTicks: number;
  attackUnitTargets: Array<{ unitTypeId: string; count: number }>;
  buildOrder: string[];
  buildDepots: boolean;
  preferredAttackUnitTypes: string[];
  workerTarget: number;
  tankerTarget: number;
  transportTarget: number;
  collectWeights: { gold: number; wood: number; oil: number } | null;
  researchOrder: string[];
  nextThinkTick: number;
  nextAttackTick: number;
}

export interface PlayerSupply {
  used: number;
  cap: number;
  queued: number;
}

export function getPlayerSupply(world: WorldState, playerId: number): PlayerSupply {
  let used = 0;
  let cap = 0;
  let queued = 0;
  const countUnit = (unit: WorldUnit): void => {
    if (unit.player !== playerId || unit.hitPoints <= 0) {
      return;
    }
    if (!unit.construction) {
      cap += unit.supply;
    }
    used += unit.demand;
    for (const order of unit.productionQueue) {
      const unitDefinition = world.unitDefinitions.find((candidate) => candidate.id === order.unitTypeId);
      queued += unitDefinition?.demand ?? 0;
    }
    for (const cargoUnit of unit.cargo ?? []) {
      countUnit(cargoUnit);
    }
  };
  for (const unit of world.units) {
    countUnit(unit);
  }
  return { used, cap, queued };
}

function engineSettingsWithSetupState(engineSettings: WargusEngineSettings, state: WargusMapSetup["state"] | undefined): WargusEngineSettings {
  const next = structuredClone(engineSettings);
  if (typeof state?.fogOfWar === "boolean") {
    next.fogOfWarEnabled = state.fogOfWar;
  }
  if (typeof state?.gameSpeed === "number" && Number.isFinite(state.gameSpeed) && state.gameSpeed > 0) {
    next.sourceGameSpeedDefault = state.gameSpeed;
  }
  return next;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

export function createInitialWorld(map: WargusMap, sourceUnits: WargusUnit[], setup: WargusMapSetup | null = null, sourceUpgrades: WargusUpgrade[] = [], sourceMissiles: WargusMissile[] = [], sourceSpells: WargusSpell[] = [], sourceAllowRules: WargusAllowRule[] = [], sourceDependencies: WargusDependencyRule[] = [], sourceButtons: WargusButton[] = [], engineSettings: WargusEngineSettings = DEFAULT_ENGINE_SETTINGS, sourceAiDefinitions: WargusAiDefinition[] = [], sourceUnitDatabase: WargusUnitDatabaseEntry[] = [], sourceTilesets: WargusTilesetTerrain[] = [], sourceAnimations: WargusAnimation[] = []): WorldState {
  const worldEngineSettings = engineSettingsWithSetupState(engineSettings, setup?.state);
  const tileCount = map.width * map.height;
  const tiles = setup?.tiles.length
    ? tilesFromSetup(map, setup)
    : Array.from({ length: tileCount }, (_, index) => {
    const x = index % map.width;
    const y = Math.floor(index / map.width);
    const ridge = Math.sin(x * 0.29) + Math.cos(y * 0.21);
    const water = Math.sin((x + y) * 0.13) > 0.82 || ridge < -1.15;
    const forest = !water && (x * 17 + y * 31) % 11 < 3;
    const gold = !water && !forest && (x * 23 + y * 19) % 97 === 0;
    if (water) {
      return 0;
    }
    if (forest) {
      return 2;
    }
    if (gold) {
      return 3;
    }
    return 1;
  });

  const unitsById = new Map(sourceUnits.map((unit) => [unit.id, unit]));
  const roster: Pick<WargusUnit, "id" | "name" | "type" | "landUnit" | "seaUnit" | "airUnit" | "sideAttack" | "rotationSpeed" | "elevated" | "shadow" | "woodImprove" | "oilImprove" | "center" | "level" | "builderOutside" | "teleporter" | "numDirections" | "onReady" | "hitPoints" | "burnPercent" | "burnDamageRate" | "drawLevel" | "priority" | "points" | "annoyComputerFactor" | "tileSize" | "boxSize" | "missile" | "constructionTypeId" | "image" | "seasonalImages" | "animation" | "corpseTypeId" | "explosionType" | "rightMouseAction" | "revealer" | "vanishes" | "decayRate" | "armor" | "basicDamage" | "piercingDamage" | "minAttackRange" | "maxAttackRange" | "sightRange" | "computerReactionRange" | "personReactionRange" | "speed" | "supply" | "demand" | "maxOnBoard" | "canTransport" | "autoRepairRange" | "repairRange" | "repairHp" | "repairCosts" | "improveProduction" | "canAttack" | "canTargetLand" | "canTargetSea" | "canTargetAir" | "groundAttack" | "detectCloak" | "coward" | "gatherResources" | "resourceCapacity" | "resourceStep" | "waitAtResource" | "waitAtDepot" | "canCastSpells" | "storesResources" | "givesResource" | "canHarvest" | "building" | "mainFacility" | "shoreBuilding" | "manaEnabled" | "manaMax" | "manaInitial" | "manaIncrease" | "selectableByRectangle" | "indestructible" | "nonSolid" | "visibleUnderFog" | "permanentCloak" | "organic" | "isUndead" | "hero" | "volatile" | "randomMovementProbability" | "randomMovementDistance" | "clicksToExplode" | "neutral" | "neutralMinimapColor">[] = sourceUnits.length > 0
    ? sourceUnits
    : [
        fallbackUnit("unit-peasant", "Peasant", 30),
        fallbackUnit("unit-footman", "Footman", 60),
        fallbackUnit("unit-grunt", "Grunt", 60)
      ];

  const setupUnits = setup?.units.length
    ? setup.units.map((unit) => unitsById.get(unit.typeId) ?? {
        id: unit.typeId,
        name: unit.typeId.replace(/^unit-/, "").replaceAll("-", " "),
        type: "land",
        landUnit: false,
        seaUnit: false,
        airUnit: false,
        sideAttack: false,
        rotationSpeed: 0,
        elevated: false,
        shadow: null,
        woodImprove: false,
        oilImprove: false,
        center: false,
        level: 0,
        builderOutside: false,
        teleporter: false,
        numDirections: 0,
        onReady: null,
        hitPoints: (unit.resourcesHeld ?? 0) > 0 ? unit.resourcesHeld ?? 1 : 1,
        burnPercent: 0,
        burnDamageRate: 0,
        drawLevel: 0,
        priority: 0,
        points: 0,
        annoyComputerFactor: 0,
        tileSize: [1, 1] as [number, number],
        boxSize: [31, 31] as [number, number],
        image: null,
        animation: null,
        corpseTypeId: null,
        explosionType: null,
        rightMouseAction: null,
        missile: null,
        revealer: false,
        vanishes: false,
        decayRate: 0,
        armor: 0,
        basicDamage: 0,
        piercingDamage: 0,
        minAttackRange: 0,
        maxAttackRange: 0,
        sightRange: 1,
        computerReactionRange: 0,
        personReactionRange: 0,
        speed: 0,
        supply: 0,
        demand: 0,
        maxOnBoard: 0,
        canTransport: [],
        autoRepairRange: 0,
        repairRange: 0,
        repairHp: 0,
        repairCosts: [],
        improveProduction: {},
        canAttack: false,
        canTargetLand: false,
        canTargetSea: false,
        canTargetAir: false,
        groundAttack: false,
        detectCloak: false,
        coward: false,
        gatherResources: [],
        resourceCapacity: {},
        resourceStep: {},
        waitAtResource: {},
        waitAtDepot: {},
        canCastSpells: [],
        storesResources: [],
        givesResource: null,
        canHarvest: false,
        mainFacility: false,
        shoreBuilding: false,
        manaEnabled: false,
        manaMax: 0,
        manaInitial: 0,
        manaIncrease: 0,
        selectableByRectangle: true,
        indestructible: false,
        nonSolid: false,
        visibleUnderFog: false,
        permanentCloak: false,
        organic: false,
        isUndead: false,
        hero: false,
        volatile: false,
        randomMovementProbability: 0,
        randomMovementDistance: 1,
        clicksToExplode: 0,
        neutral: false,
        neutralMinimapColor: null
      })
    : roster.slice(0, 12);

  const units = setupUnits.map((unit, index) => {
    const setupUnit = setup?.units[index];
    return createWorldUnit({
      unit,
      id: `${unit.id}-${index}`,
      player: setupUnit?.player ?? index % 2,
      tileX: setupUnit?.x ?? (8 + index * 3),
      tileY: setupUnit?.y ?? (10 + (index % 4) * 3),
      resourcesHeld: resourcesHeldForSourceUnit(unit, setupUnit?.resourcesHeld, worldEngineSettings),
      hitPoints: setupUnit?.hitPoints ?? null,
      tileset: setup?.tileset ?? map.setup?.tileset ?? null
    });
  });
  applySourceTeleportDestinations(units, setup?.teleportDestinations ?? []);
  addStartingHalls(units, unitsById, setup, sourceButtons, sourceUnitDatabase, setup?.tileset ?? map.setup?.tileset ?? null);

  const players = playersFromSetup(setup, worldEngineSettings, sourceAiDefinitions);
  const playablePlayerId = playablePlayerIdForPlayers(players, setup, sourceAiDefinitions);
  const objectives = setup?.objectives ?? map.objectives ?? [];
  const world: WorldState = {
    map,
    tileSize: 32,
    tiles,
    terrainVersion: 0,
    units,
    corpses: [],
    projectiles: [],
    pendingAttacks: [],
    spellEffects: [],
    unitDefinitions: sourceUnits,
    upgradeDefinitions: sourceUpgrades,
    missileDefinitions: sourceMissiles,
    animationDefinitions: sourceAnimations,
    spellDefinitions: sourceSpells,
    allowRules: sourceAllowRules,
    allowOverrides: setup?.allowOverrides ?? map.allowOverrides ?? [],
    dependencyRules: sourceDependencies,
    buttonDefinitions: sourceButtons,
    aiDefinitions: sourceAiDefinitions,
    unitDatabase: sourceUnitDatabase,
    tilesetTerrain: sourceTilesetForSetup(setup?.tileset ?? map.setup?.tileset ?? null, sourceTilesets),
    engineSettings: worldEngineSettings,
    players,
    researchedUpgrades: {},
    activeResearch: [],
    queuedResearch: [],
    aiStates: players
      .map((player) => ({ player, strategy: aiStrategyForPlayer(player.ai, units, player.id, sourceAiDefinitions) }))
      .filter((entry): entry is { player: WorldPlayer; strategy: WorldAiState["strategy"] } => (
        entry.player.id !== playablePlayerId
        && entry.player.id !== 15
        && entry.player.playerType !== "person"
        && entry.player.playerType !== "nobody"
        && entry.strategy !== "passive"
      ))
      .map(({ player, strategy }) => ({
        player: player.id,
        enabled: true,
        strategy,
        sourceScriptId: player.ai === "wc2-land-attack" || player.ai === "wc2-air-attack" ? player.ai : null,
        sourceScriptIndex: 0,
        sourceScriptSleepUntilTick: 0,
        sourceScriptForces: [],
        sourceScriptForceRoles: [],
        attackForceSize: aiAttackForceSizeForPlayer(setup, player.ai),
        attackForceIds: aiAttackForceIdsForPlayer(setup, player.ai),
        forceSizes: aiForceSizesForPlayer(setup, player.ai),
        attackWaveSizes: aiAttackWaveSizesForPlayer(setup, player.ai),
        attackWaveUnitTargets: aiAttackWaveUnitTargetsForPlayer(setup, player.ai),
        nextAttackWaveIndex: 0,
        defendForceSize: aiDefendForceSizeForPlayer(setup, player.ai),
        attackDelayTicks: aiAttackDelayTicksForPlayer(setup, player.ai),
        attackUnitTargets: aiAttackUnitTargetsForPlayer(setup, player.ai),
        buildOrder: aiBuildOrderForPlayer(setup, player.ai),
        buildDepots: aiBuildDepotsForPlayer(setup, player.ai),
        preferredAttackUnitTypes: aiPreferredAttackUnitTypesForPlayer(setup, player.ai),
        workerTarget: aiWorkerTargetForPlayer(setup, player.ai),
        tankerTarget: aiTankerTargetForPlayer(setup, player.ai),
        transportTarget: aiTransportTargetForPlayer(setup, player.ai),
        collectWeights: aiCollectWeightsForPlayer(setup, player.ai),
        researchOrder: aiResearchOrderForPlayer(setup, player.ai),
        nextThinkTick: 1,
        nextAttackTick: aiInitialAttackDelayTicksForPlayer(setup, player.ai)
      })),
    visibilityPlayer: playablePlayerId,
    exploredTiles: new Uint8Array(tileCount),
    visibleTiles: new Uint8Array(tileCount),
    lastSeenBuildings: [],
    visibilityReveals: [],
    forestRegrowth: [],
    forestResources: [],
    revelationKnownMainFacilityPlayers: uniqueNumbers(units.filter((unit) => unit.mainFacility && unit.hitPoints > 0).map((unit) => unit.player)),
    revelationTimers: [],
    revealedPlayers: [],
    godModePlayers: [],
    objectives,
    briefingText: setup?.briefingText ?? map.briefingText ?? null,
    briefingVoiceFiles: setup?.briefingVoiceFiles ?? map.briefingVoiceFiles ?? [],
    victoryRequirements: setup?.victoryRequirements ?? map.victoryRequirements ?? [],
    victoryRequirementGroups: setup?.victoryRequirementGroups ?? map.victoryRequirementGroups ?? [],
    defeatRequirements: setup?.defeatRequirements ?? map.defeatRequirements ?? [],
    timedVictoryTriggers: setup?.timedVictoryTriggers ?? map.timedVictoryTriggers ?? [],
    locationBuildRequirements: setup?.locationBuildRequirements ?? map.locationBuildRequirements ?? [],
    pendingTimedVictory: null,
    circleOfPowerRequirements: setup?.circleOfPowerRequirements ?? map.circleOfPowerRequirements ?? [],
    rescuedCircleRequirements: setup?.rescuedCircleRequirements ?? map.rescuedCircleRequirements ?? [],
    diplomacy: setup?.diplomacy ?? map.diplomacy ?? [],
    sharedVision: setup?.sharedVision ?? map.sharedVision ?? [],
    requiredSurvivalUnitIds: requiredSurvivalUnitIdsForObjectives(objectives, units, playablePlayerId),
    allowedUnitTypes: setup?.allowedUnitTypes ?? map.allowedUnitTypes ?? [],
    allowedUpgradeTypes: setup?.allowedUpgradeTypes ?? map.allowedUpgradeTypes ?? [],
    matchState: { status: "playing", winner: null, endedTick: null },
    events: [],
    lastHelpTickByPlayer: {},
    lastHelpLocationByPlayer: {},
    nextUnitSerial: units.length,
    elapsed: 0,
    tick: 0,
    tickRate: 30,
    accumulator: 0
  };
  world.forestResources = initialForestResourcesForWorld(world);
  applySourceRevealMapMode(world);
  initializePlayerTotalStats(world);
  updateVisibility(world);
  return world;
}

function applySourceRevealMapMode(world: WorldState): void {
  if (world.engineSettings.revealMapMode === "explored") {
    world.exploredTiles.fill(1);
  }
}

function applySourceTeleportDestinations(units: WorldUnit[], teleportDestinations: WargusMapSetup["teleportDestinations"]): void {
  for (const link of teleportDestinations) {
    const unit = units[link.unitIndex];
    const destination = units[link.destinationIndex];
    if (!unit || !destination || !unit.teleporter || destination.hitPoints <= 0) {
      continue;
    }
    unit.teleportDestinationId = destination.id;
  }
}

export function defaultForestTileResources(): number {
  return 100;
}

export function initialForestResourcesForWorld(world: Pick<WorldState, "map" | "tiles" | "tilesetTerrain">): WorldForestResource[] {
  const resources: WorldForestResource[] = [];
  for (let y = 0; y < world.map.height; y += 1) {
    for (let x = 0; x < world.map.width; x += 1) {
      const tile = world.tiles[y * world.map.width + x] ?? 0;
      if (isSourceForestTile(world, tile)) {
        resources.push({ x, y, amount: defaultForestTileResources() });
      }
    }
  }
  return resources;
}

function isSourceForestTile(world: Pick<WorldState, "tilesetTerrain">, tile: number): boolean {
  const flags = world.tilesetTerrain?.slots.find((entry) => entry.slot === tileSlot(tile))?.flags;
  if (flags) {
    return flags.includes("forest");
  }
  const slot = tileSlot(tile);
  return slot === 0x070 || (slot >= 0x700 && slot <= 0x7df);
}

export function recordPlayerUnitCreated(world: WorldState, unit: Pick<WorldUnit, "player" | "kind" | "speed" | "tileWidth" | "tileHeight">): void {
  if (unit.player === 15) {
    return;
  }
  const player = world.players.find((candidate) => candidate.id === unit.player);
  if (!player) {
    return;
  }
  if (isRuntimeSourceBuildingUnit(unit)) {
    player.stats.totalBuildings += 1;
  } else {
    player.stats.totalUnits += 1;
  }
}

function initializePlayerTotalStats(world: WorldState): void {
  for (const player of world.players) {
    player.stats.totalUnits = 0;
    player.stats.totalBuildings = 0;
  }
  for (const unit of world.units) {
    if (unit.hitPoints > 0) {
      recordPlayerUnitCreated(world, unit);
    }
  }
}

function requiredSurvivalUnitIdsForObjectives(objectives: string[], units: WorldUnit[], playerId: number): string[] {
  const required = new Set<string>();
  for (const objective of objectives) {
    const line = objective.toLowerCase();
    if (!/(survive|alive|must return|must reach|must.*destroy|must.*circle)/.test(line)) {
      continue;
    }
    for (const [needle, aliases] of HERO_OBJECTIVE_KEYWORDS) {
      if (!line.includes(needle)) {
        continue;
      }
      for (const unit of units) {
        if (sourceHeroNameMatches(unit, aliases)) {
          required.add(unit.id);
        }
      }
    }
    if (/(all your heroes|heroes must survive|heroes alive|keep your heroes)/.test(line)) {
      for (const unit of units) {
        if (unit.player === playerId && isSourceHeroSurvivalUnit(unit)) {
          required.add(unit.id);
        }
      }
    }
  }
  return [...required];
}

function isSourceHeroSurvivalUnit(unit: WorldUnit): boolean {
  return unit.hero || HERO_OBJECTIVE_KEYWORDS.some(([, aliases]) => sourceHeroNameMatches(unit, aliases));
}

function sourceHeroNameMatches(unit: WorldUnit, aliases: string[]): boolean {
  const haystack = `${unit.typeId} ${unit.name}`.toLowerCase();
  return aliases.some((alias) => haystack.includes(alias));
}

const HERO_OBJECTIVE_KEYWORDS: Array<[string, string[]]> = [
  ["alleria", ["alleria", "female hero"]],
  ["danath", ["danath", "arthor literios"]],
  ["grom", ["grom", "hellscream", "beast cry"]],
  ["hellscream", ["grom", "hellscream", "beast cry"]],
  ["khadgar", ["khadgar", "white mage"]],
  ["kurdran", ["kurdran", "kurdan", "sky'ree", "flying angel"]],
  ["kurdan", ["kurdran", "kurdan", "sky'ree", "flying angel"]],
  ["lightbringer", ["uther", "lightbringer", "man of light"]],
  ["lothar", ["lothar", "wise man"]],
  ["teron", ["teron", "gorefiend", "evil knight"]],
  ["turalyon", ["turalyon", "knight rider"]],
  ["zuljin", ["zuljin", "zul'jin", "sharp axe"]],
  ["zul'jin", ["zuljin", "zul'jin", "sharp axe"]],
  ["cho'gall", ["cho'gall", "chogall", "double head"]],
  ["chogall", ["cho'gall", "chogall", "double head"]],
  ["gul'dan", ["gul'dan", "guldan", "ice bringer"]],
  ["guldan", ["gul'dan", "guldan", "ice bringer"]]
];

export function normalizeImproveProduction(value: Record<string, number> | undefined): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [resource, percent] of Object.entries(value ?? {})) {
    const amount = Math.floor(Number(percent));
    if (resource && Number.isFinite(amount) && amount !== 0) {
      normalized[resource] = amount;
    }
  }
  return normalized;
}

export function normalizePositiveResourceMap(value: Record<string, number> | undefined): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [resource, amount] of Object.entries(value ?? {})) {
    const normalizedAmount = Math.floor(Number(amount));
    if (resource && Number.isFinite(normalizedAmount) && normalizedAmount > 0) {
      normalized[resource] = normalizedAmount;
    }
  }
  return normalized;
}

export function normalizeResourceCapacity(value: Record<string, number> | undefined): Record<string, number> {
  return normalizePositiveResourceMap(value);
}

export function resourceCapacityForUnit(unit: Pick<WargusUnit, "resourceCapacity"> | Pick<WorldUnit, "resourceCapacity">, resource: string): number {
  const capacity = Math.floor(Number(unit.resourceCapacity?.[resource] ?? 0));
  return Number.isFinite(capacity) && capacity > 0 ? capacity : 100;
}

export function resourceStepForUnit(
  unit: Pick<WargusUnit, "resourceCapacity" | "resourceStep"> | Pick<WorldUnit, "resourceCapacity" | "resourceStep">,
  resource: string
): number {
  const step = Math.floor(Number(unit.resourceStep?.[resource] ?? 0));
  return Number.isFinite(step) && step > 0 ? step : resourceCapacityForUnit(unit, resource);
}

export function resourceWaitAtResourceCyclesForUnit(unit: Pick<WargusUnit, "waitAtResource"> | Pick<WorldUnit, "waitAtResource">, resource: string): number {
  const cycles = Math.floor(Number(unit.waitAtResource?.[resource] ?? 0));
  return Number.isFinite(cycles) && cycles > 0 ? cycles : 23;
}

export function resourceWaitAtDepotCyclesForUnit(unit: Pick<WargusUnit, "waitAtDepot"> | Pick<WorldUnit, "waitAtDepot">, resource: string): number {
  const cycles = Math.floor(Number(unit.waitAtDepot?.[resource] ?? 0));
  return Number.isFinite(cycles) && cycles > 0 ? cycles : 8;
}

export function resourcesHeldForSourceUnit(
  unit: Pick<WargusUnit, "givesResource" | "canHarvest">,
  setupResourcesHeld: number | null | undefined,
  engineSettings: Pick<WargusEngineSettings, "defaultResourceAmounts">
): number {
  if (typeof setupResourcesHeld === "number" && Number.isFinite(setupResourcesHeld)) {
    return Math.max(0, Math.floor(setupResourcesHeld));
  }
  if (!unit.givesResource || !unit.canHarvest) {
    return 0;
  }
  return Math.max(0, Math.floor(engineSettings.defaultResourceAmounts[unit.givesResource] ?? 0));
}

export function productionQueueLimitForEngine(engineSettings: Pick<WargusEngineSettings, "trainingQueue">): number {
  return engineSettings.trainingQueue === false ? 1 : 0x7F;
}

export function maxSelectableForEngine(engineSettings: Pick<WargusEngineSettings, "maxSelectable">): number {
  return Math.max(1, Math.floor(engineSettings.maxSelectable || 18));
}

export function isUnitInsideResourceSource(unit: Pick<WorldUnit, "order">): boolean {
  return unit.order?.kind === "harvest" && (
    (unit.order.phase === "gathering" && (unit.order.resource === "gold" || unit.order.resource === "oil"))
    || (unit.order.phase === "to-dropoff" && unit.order.returnSeconds > 0)
  );
}

export function sourceTrainDurationSeconds(engineSettings: Pick<WargusEngineSettings, "speedFactors">, costs: string[]): number {
  return sourceTimedActionDurationSeconds(costValue(costs, "time"), sourceSpeedFactor(engineSettings.speedFactors.train));
}

export function sourceBuildDurationSeconds(engineSettings: Pick<WargusEngineSettings, "speedFactors">, costs: string[]): number {
  return sourceTimedActionDurationSeconds(costValue(costs, "time"), sourceSpeedFactor(engineSettings.speedFactors.build));
}

export function sourceUpgradeDurationSeconds(engineSettings: Pick<WargusEngineSettings, "speedFactors">, costs: string[]): number {
  return sourceTimedActionDurationSeconds(costValue(costs, "time"), sourceSpeedFactor(engineSettings.speedFactors.upgrade));
}

export function sourceResearchDurationSeconds(engineSettings: Pick<WargusEngineSettings, "speedFactors">, timeCost: number): number {
  return sourceTimedActionDurationSeconds(timeCost, sourceSpeedFactor(engineSettings.speedFactors.research));
}

export function sourceResourceHarvestDurationSeconds(engineSettings: Pick<WargusEngineSettings, "speedFactors">, resource: string): number {
  return 0.75 / sourceResourceSpeedFactor(engineSettings.speedFactors.resourceHarvest, resource);
}

export function sourceResourceReturnDurationSeconds(engineSettings: Pick<WargusEngineSettings, "speedFactors">, resource: string): number {
  return 0.25 / sourceResourceSpeedFactor(engineSettings.speedFactors.resourceReturn, resource);
}

export function sourceSpeedFactorsForPlayer(world: Pick<WorldState, "engineSettings" | "players">, playerId: number): WargusSpeedFactors {
  return world.players.find((player) => player.id === playerId)?.speedFactors ?? world.engineSettings.speedFactors;
}

export function sourceTrainDurationSecondsForPlayer(world: Pick<WorldState, "engineSettings" | "players">, playerId: number, costs: string[]): number {
  return sourceTimedActionDurationSeconds(costValue(costs, "time"), sourceSpeedFactor(sourceSpeedFactorsForPlayer(world, playerId).train));
}

export function sourceBuildDurationSecondsForPlayer(world: Pick<WorldState, "engineSettings" | "players">, playerId: number, costs: string[]): number {
  return sourceTimedActionDurationSeconds(costValue(costs, "time"), sourceSpeedFactor(sourceSpeedFactorsForPlayer(world, playerId).build));
}

export function sourceUpgradeDurationSecondsForPlayer(world: Pick<WorldState, "engineSettings" | "players">, playerId: number, costs: string[]): number {
  return sourceTimedActionDurationSeconds(costValue(costs, "time"), sourceSpeedFactor(sourceSpeedFactorsForPlayer(world, playerId).upgrade));
}

export function sourceResearchDurationSecondsForPlayer(world: Pick<WorldState, "engineSettings" | "players">, playerId: number, timeCost: number): number {
  return sourceTimedActionDurationSeconds(timeCost, sourceSpeedFactor(sourceSpeedFactorsForPlayer(world, playerId).research));
}

export function sourceResourceHarvestDurationSecondsForPlayer(world: Pick<WorldState, "engineSettings" | "players">, playerId: number, resource: string): number {
  return 0.75 / sourceResourceSpeedFactor(sourceSpeedFactorsForPlayer(world, playerId).resourceHarvest, resource);
}

export function sourceResourceReturnDurationSecondsForPlayer(world: Pick<WorldState, "engineSettings" | "players">, playerId: number, resource: string): number {
  return 0.25 / sourceResourceSpeedFactor(sourceSpeedFactorsForPlayer(world, playerId).resourceReturn, resource);
}

function sourceSpeedFactor(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function sourceResourceSpeedFactor(factors: Record<string, number>, resource: string): number {
  return sourceSpeedFactor(factors[resource] ?? 1);
}

function sourceTimedActionDurationSeconds(timeCost: number, speedFactor: number): number {
  const cost = Number.isFinite(timeCost) ? Math.max(0, timeCost) : 0;
  return Math.max(0.001, cost / 5 / sourceSpeedFactor(speedFactor));
}

function cloneSourceSpeedFactors(speedFactors: WargusSpeedFactors): WargusSpeedFactors {
  return {
    build: sourceSpeedFactor(speedFactors.build),
    train: sourceSpeedFactor(speedFactors.train),
    upgrade: sourceSpeedFactor(speedFactors.upgrade),
    research: sourceSpeedFactor(speedFactors.research),
    resourceHarvest: { ...speedFactors.resourceHarvest },
    resourceReturn: { ...speedFactors.resourceReturn }
  };
}

function costValue(costs: string[], resource: string): number {
  const index = costs.indexOf(resource);
  return index >= 0 ? Number(costs[index + 1]) : 0;
}

export function createWorldUnit(args: {
    unit: Pick<WargusUnit, "id" | "name" | "type" | "landUnit" | "seaUnit" | "airUnit" | "sideAttack" | "rotationSpeed" | "elevated" | "shadow" | "woodImprove" | "oilImprove" | "center" | "level" | "builderOutside" | "teleporter" | "numDirections" | "onReady" | "hitPoints" | "burnPercent" | "burnDamageRate" | "drawLevel" | "priority" | "points" | "annoyComputerFactor" | "tileSize" | "boxSize" | "missile" | "constructionTypeId" | "image" | "seasonalImages" | "animation" | "corpseTypeId" | "explosionType" | "rightMouseAction" | "revealer" | "vanishes" | "decayRate" | "armor" | "basicDamage" | "piercingDamage" | "minAttackRange" | "maxAttackRange" | "sightRange" | "computerReactionRange" | "personReactionRange" | "speed" | "supply" | "demand" | "maxOnBoard" | "canTransport" | "autoRepairRange" | "repairRange" | "repairHp" | "repairCosts" | "improveProduction" | "canAttack" | "canTargetLand" | "canTargetSea" | "canTargetAir" | "groundAttack" | "detectCloak" | "coward" | "gatherResources" | "resourceCapacity" | "resourceStep" | "waitAtResource" | "waitAtDepot" | "canCastSpells" | "storesResources" | "givesResource" | "canHarvest" | "building" | "mainFacility" | "shoreBuilding" | "manaEnabled" | "manaMax" | "manaInitial" | "manaIncrease" | "selectableByRectangle" | "indestructible" | "nonSolid" | "visibleUnderFog" | "permanentCloak" | "organic" | "isUndead" | "hero" | "volatile" | "randomMovementProbability" | "randomMovementDistance" | "clicksToExplode" | "neutral" | "neutralMinimapColor">;
  id: string;
  player: number;
  tileX: number;
  tileY: number;
  resourcesHeld?: number;
  hitPoints?: number | null;
  tileset?: string | null;
}): WorldUnit {
  const { unit, id, player, tileX, tileY, resourcesHeld = 0, hitPoints = null, tileset = null } = args;
  const tileWidth = Math.max(unit.tileSize?.[0] ?? 1, 1);
  const tileHeight = Math.max(unit.tileSize?.[1] ?? 1, 1);
  const frameWidth = tileWidth === 1 ? 72 : tileWidth * 32;
  const frameHeight = tileHeight === 1 ? 72 : tileHeight * 32;
  const kind = isBuildingType(unit) ? "building" : worldKindForUnitDefinition(unit);
  const baseSpeed = speedForUnit(unit.id, kind, unit.speed, unit);
  const footprint = boxDimensionsForUnit(unit, kind);
  const maxMana = maxManaForUnit(unit);
  const manaIncrease = manaIncreaseForUnit(unit);
  const maxHitPoints = Math.max(unit.hitPoints, 1);
  const initialHitPoints = Math.max(1, Math.min(maxHitPoints, Math.floor(hitPoints ?? maxHitPoints)));
  const decayRate = Math.max(0, unit.decayRate ?? 0);
  return {
    id,
    typeId: unit.id,
    name: unit.name,
    player,
    x: tileX * 32 + (tileWidth * 32) / 2,
    y: tileY * 32 + (tileHeight * 32) / 2,
    radius: footprint.radius,
    boxWidth: footprint.boxWidth,
    boxHeight: footprint.boxHeight,
    facing: 4,
    hitPoints: initialHitPoints,
    maxHitPoints,
    burnPercent: Math.max(0, unit.burnPercent ?? 0),
    burnDamageRate: Math.max(0, unit.burnDamageRate ?? 0),
    burnAccumulator: 0,
    drawLevel: Math.max(0, unit.drawLevel ?? 0),
    priority: Math.max(0, unit.priority ?? 0),
    points: Math.max(0, unit.points ?? 0),
    annoyComputerFactor: Math.max(0, unit.annoyComputerFactor ?? 0),
    kind,
    landUnit: unit.landUnit ?? false,
    seaUnit: unit.seaUnit ?? false,
    airUnit: unit.airUnit ?? false,
    sideAttack: unit.sideAttack ?? false,
    rotationSpeed: Math.max(0, unit.rotationSpeed ?? 0),
    elevated: unit.elevated ?? false,
    shadow: typeof unit.shadow === "number" ? Math.max(0, unit.shadow) : null,
    woodImprove: unit.woodImprove ?? false,
    oilImprove: unit.oilImprove ?? false,
    center: unit.center ?? false,
    level: Math.max(0, unit.level ?? 0),
    builderOutside: unit.builderOutside ?? false,
    teleporter: unit.teleporter ?? false,
    teleportDestinationId: null,
    numDirections: Math.max(0, unit.numDirections ?? 0),
    onReady: unit.onReady ?? null,
    image: imageForTileset(unit, tileset),
    animation: unit.animation,
    corpseTypeId: unit.corpseTypeId ?? null,
    explosionType: unit.explosionType ?? null,
    rightMouseAction: unit.rightMouseAction ?? null,
    missile: unit.missile ?? null,
    constructionTypeId: unit.constructionTypeId ?? null,
    revealer: unit.revealer ?? false,
    vanishes: unit.vanishes ?? false,
    decayRate,
    frameWidth,
    frameHeight,
    tileWidth,
    tileHeight,
    baseSpeed,
    speed: baseSpeed,
    statusEffects: [],
    regenerationRate: 0,
    regenerationFrequency: 0,
    regenerationAccumulator: 0,
    armor: unit.armor,
    basicDamage: unit.basicDamage,
    piercingDamage: unit.piercingDamage,
    minAttackRange: Math.max(unit.minAttackRange ?? 0, 0) * 32,
    attackRange: Math.max(unit.maxAttackRange, 0) * 32 + 12,
    sightRangeTiles: sightRangeForUnit(unit, kind, tileWidth, tileHeight),
    computerReactionRange: Math.max(0, unit.computerReactionRange ?? 0) * 32,
    personReactionRange: Math.max(0, unit.personReactionRange ?? 0) * 32,
    supply: unit.supply,
    demand: unit.demand,
    canAttack: unit.canAttack,
    canTargetLand: unit.canTargetLand ?? false,
    canTargetSea: unit.canTargetSea ?? false,
    canTargetAir: unit.canTargetAir ?? false,
    groundAttack: unit.groundAttack ?? false,
    detectCloak: unit.detectCloak ?? false,
    coward: unit.coward ?? false,
    gatherResources: [...(unit.gatherResources ?? [])],
    resourceCapacity: normalizeResourceCapacity(unit.resourceCapacity),
    resourceStep: normalizePositiveResourceMap(unit.resourceStep),
    waitAtResource: normalizePositiveResourceMap(unit.waitAtResource),
    waitAtDepot: normalizePositiveResourceMap(unit.waitAtDepot),
    canCastSpells: [...(unit.canCastSpells ?? [])],
    autoCastSpells: [],
    storesResources: [...(unit.storesResources ?? [])],
    givesResource: unit.givesResource ?? null,
    canHarvest: unit.canHarvest ?? false,
    mainFacility: unit.mainFacility ?? false,
    shoreBuilding: unit.shoreBuilding ?? false,
    manaEnabled: unit.manaEnabled ?? false,
    selectableByRectangle: unit.selectableByRectangle ?? true,
    indestructible: unit.indestructible ?? false,
    nonSolid: unit.nonSolid ?? false,
    visibleUnderFog: unit.visibleUnderFog ?? false,
    permanentCloak: unit.permanentCloak ?? false,
    organic: unit.organic ?? false,
    isUndead: unit.isUndead ?? false,
    hero: unit.hero ?? false,
    volatile: unit.volatile ?? false,
    randomMovementProbability: Math.max(0, unit.randomMovementProbability ?? 0),
    randomMovementDistance: Math.max(0, unit.randomMovementDistance ?? 1),
    clicksToExplode: Math.max(0, unit.clicksToExplode ?? 0),
    explodeClickCount: 0,
    lastExplodeClickAtMs: 0,
    nextAutoActionTick: 0,
    nextRandomMoveTick: 0,
    neutral: unit.neutral ?? false,
    neutralMinimapColor: normalizeRgbColor(unit.neutralMinimapColor),
    attackCooldown: 0,
    mana: initialManaForUnit(unit, maxMana),
    maxMana,
    manaIncrease,
    spellCooldown: 0,
    sourceSpellGoalId: null,
    resourcesHeld,
    carriedResource: null,
    lastDamagePlayer: null,
    lastDamageSourceUnitId: null,
    kills: 0,
    xp: 0,
    cargo: [],
    cargoCapacity: cargoCapacityForUnit(unit),
    canTransport: [...(unit.canTransport ?? [])],
    autoRepair: false,
    autoRepairRange: Math.max(0, unit.autoRepairRange ?? 0) * 32,
    repairRange: Math.max(0, unit.repairRange ?? 0) * 32,
    repairHp: Math.max(0, unit.repairHp ?? 0),
    repairCosts: [...(unit.repairCosts ?? [])],
    improveProduction: normalizeImproveProduction(unit.improveProduction),
    rallyPoint: null,
    productionQueue: [],
    construction: null,
    lifetimeSeconds: sourceDecayRateLifetimeSeconds(decayRate),
    hiddenInConstructionId: null,
    order: null,
    moveQueue: []
  };
}

export function sourceDecayRateLifetimeSeconds(decayRate: number): number | undefined {
  const sourceDecayRate = Math.max(0, Math.floor(decayRate));
  return sourceDecayRate > 0 ? sourceDecayRate * 6 : undefined;
}

export function sourceDefaultGameSpeed(world: Pick<WorldState, "tickRate">): number {
  return Math.max(1, world.tickRate || 30);
}

function sourceTilesetForSetup(tilesetPath: string | null | undefined, sourceTilesets: WargusTilesetTerrain[]): WargusTilesetTerrain | null {
  if (!tilesetPath) {
    return null;
  }
  const normalized = sourceTilesetFamilyName(tilesetPath);
  return sourceTilesets.find((tileset) => (
    tileset.script === tilesetPath
    || tileset.script.endsWith(`/${normalized}.lua`)
    || tileset.name.toLowerCase() === normalized.toLowerCase()
  )) ?? null;
}

export function boxDimensionsForUnit(unit: Pick<WargusUnit, "boxSize" | "tileSize">, kind: string): { boxWidth: number; boxHeight: number; radius: number } {
  const sourceWidth = Math.floor(unit.boxSize?.[0] ?? 0);
  const sourceHeight = Math.floor(unit.boxSize?.[1] ?? 0);
  if (sourceWidth > 0 && sourceHeight > 0) {
    return {
      boxWidth: sourceWidth,
      boxHeight: sourceHeight,
      radius: Math.max(6, Math.max(sourceWidth, sourceHeight) / 2)
    };
  }
  const tileWidth = Math.max(unit.tileSize?.[0] ?? 1, 1);
  const tileHeight = Math.max(unit.tileSize?.[1] ?? 1, 1);
  const fallbackRadius = kind === "building"
    ? Math.max(28, Math.max(tileWidth, tileHeight) * 16)
    : Math.max(13, Math.max(tileWidth, tileHeight) * 13);
  return {
    boxWidth: fallbackRadius * 2,
    boxHeight: fallbackRadius * 2,
    radius: fallbackRadius
  };
}

export function unitFootprintHalfSize(unit: Pick<WorldUnit, "radius" | "tileWidth" | "tileHeight"> & Partial<Pick<WorldUnit, "boxWidth" | "boxHeight">>, tileSize: number): { halfWidth: number; halfHeight: number } {
  return {
    halfWidth: Math.max((unit.boxWidth ?? 0) / 2, unit.radius, (unit.tileWidth * tileSize) / 2),
    halfHeight: Math.max((unit.boxHeight ?? 0) / 2, unit.radius, (unit.tileHeight * tileSize) / 2)
  };
}

export function normalizeRgbColor(value: readonly number[] | null | undefined): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const color = value.map((channel) => Math.max(0, Math.min(255, Math.round(Number(channel)))));
  if (color.some((channel) => !Number.isFinite(channel))) {
    return null;
  }
  return [color[0], color[1], color[2]];
}

function maxManaForUnit(unit: Pick<WargusUnit, "canCastSpells" | "manaEnabled" | "manaMax">): number {
  if (unit.manaEnabled === true || (unit.canCastSpells ?? []).length > 0) {
    return Math.max(0, unit.manaMax ?? 0);
  }
  return 0;
}

function initialManaForUnit(unit: Pick<WargusUnit, "manaInitial">, maxMana: number): number {
  return Math.max(0, Math.min(maxMana, unit.manaInitial ?? maxMana));
}

function manaIncreaseForUnit(unit: Pick<WargusUnit, "manaIncrease">): number {
  return Math.max(0, unit.manaIncrease ?? 0);
}

export function updateVisibility(world: WorldState): void {
  updateSourceRevelationState(world);
  if (!world.engineSettings.fogOfWarEnabled) {
    world.visibleTiles.fill(1);
    world.exploredTiles.fill(1);
    updateLastSeenBuildings(world);
    return;
  }
  world.visibleTiles.fill(0);
  for (const unit of world.units) {
    if ((!doesPlayerShareVisionWith(world, world.visibilityPlayer, unit.player) && !doesUnitProvideRevelationVision(world, world.visibilityPlayer, unit)) || unit.hitPoints <= 0) {
      continue;
    }
    const footprint = sourceFieldOfViewFootprintForUnit(world, unit);
    const radius = unit.sightRangeTiles;
    for (let y = footprint.top - radius; y < footprint.top + footprint.height + radius; y += 1) {
      for (let x = footprint.left - radius; x < footprint.left + footprint.width + radius; x += 1) {
        if (x < 0 || y < 0 || x >= world.map.width || y >= world.map.height) {
          continue;
        }
        if (!isSourceFieldOfViewTileVisible(world, footprint, x, y, radius, unit.elevated)) {
          continue;
        }
        const index = y * world.map.width + x;
        world.visibleTiles[index] = 1;
        world.exploredTiles[index] = 1;
      }
    }
  }
  for (const effect of world.spellEffects) {
    if (effect.kind !== "holy-vision" || !doesPlayerShareVisionWith(world, world.visibilityPlayer, effect.player)) {
      continue;
    }
    revealTilesAround(world, effect.x, effect.y, Math.ceil(effect.radius / world.tileSize));
  }
  for (const reveal of world.visibilityReveals ?? []) {
    if (reveal.remainingTicks > 0 && doesPlayerShareVisionWith(world, world.visibilityPlayer, reveal.player)) {
      revealTilesAround(world, reveal.x, reveal.y, reveal.radiusTiles);
    }
  }
  updateLastSeenBuildings(world);
}

export function revealAreaToPlayer(world: WorldState, player: number, x: number, y: number, radiusTiles: number, remainingTicks: number): void {
  if (remainingTicks <= 0 || radiusTiles <= 0) {
    return;
  }
  world.visibilityReveals ??= [];
  world.visibilityReveals.push({
    player,
    x: Math.max(0, Math.min(world.map.width * world.tileSize, x)),
    y: Math.max(0, Math.min(world.map.height * world.tileSize, y)),
    radiusTiles: Math.max(1, Math.floor(radiusTiles)),
    remainingTicks: Math.max(1, Math.floor(remainingTicks))
  });
}

export function doesPlayerShareVisionWith(world: WorldState, playerId: number, sourcePlayerId: number): boolean {
  if (playerId === sourcePlayerId) {
    return true;
  }
  const source = world.sharedVision.find((rule) => rule.player === playerId && rule.otherPlayer === sourcePlayerId);
  return source?.enabled === true;
}

export function updateSourceRevelationState(world: WorldState): void {
  if (world.engineSettings.revelationType === "no-revelation") {
    world.revelationTimers = [];
    world.revealedPlayers = [];
    return;
  }
  const liveMainFacilityPlayers = uniqueNumbers(world.units
    .filter((unit) => unit.player !== 15 && unit.hitPoints > 0 && unit.mainFacility)
    .map((unit) => unit.player));
  world.revelationKnownMainFacilityPlayers = uniqueNumbers([
    ...(world.revelationKnownMainFacilityPlayers ?? []),
    ...liveMainFacilityPlayers
  ]);
  const lostMainFacilityPlayers = (world.revelationKnownMainFacilityPlayers ?? [])
    .filter((player) => !liveMainFacilityPlayers.includes(player));
  const lostPlayerSet = new Set(lostMainFacilityPlayers);
  const revealedPlayerSet = new Set((world.revealedPlayers ?? []).filter((player) => lostPlayerSet.has(player)));
  const timersByPlayer = new Map((world.revelationTimers ?? [])
    .filter((timer) => lostPlayerSet.has(timer.player) && !revealedPlayerSet.has(timer.player))
    .map((timer) => [timer.player, Math.max(0, Math.floor(timer.remainingTicks))]));
  for (const player of lostMainFacilityPlayers) {
    if (revealedPlayerSet.has(player)) {
      continue;
    }
    const remainingTicks = timersByPlayer.get(player);
    if (remainingTicks === undefined) {
      timersByPlayer.set(player, sourceRevelationDelayTicks(world));
    } else if (remainingTicks <= 0) {
      revealedPlayerSet.add(player);
      timersByPlayer.delete(player);
    }
  }
  world.revelationTimers = [...timersByPlayer.entries()]
    .map(([player, remainingTicks]) => ({ player, remainingTicks }))
    .sort((left, right) => left.player - right.player);
  world.revealedPlayers = [...revealedPlayerSet].sort((left, right) => left - right);
}

function sourceRevelationDelayTicks(world: WorldState): number {
  return sourceDurationSecondsToTicks(world, 30);
}

function sourceDurationSecondsToTicks(world: WorldState, seconds: number): number {
  return Math.max(1, Math.round(Math.max(0, seconds) * sourceDefaultGameSpeed(world)));
}

export function isPlayerRevealedToPlayer(world: WorldState, playerId: number, sourcePlayerId: number): boolean {
  if (playerId === sourcePlayerId || sourcePlayerId === 15 || world.engineSettings.revelationType === "no-revelation") {
    return false;
  }
  return (world.revealedPlayers ?? []).includes(sourcePlayerId);
}

export function isRuntimeSourceBuildingUnit(unit: Pick<WorldUnit, "kind" | "speed" | "tileWidth" | "tileHeight">): boolean {
  return unit.kind === "building" || unit.speed === 0 || unit.tileWidth > 1 || unit.tileHeight > 1;
}

function doesUnitProvideRevelationVision(world: WorldState, playerId: number, unit: Pick<WorldUnit, "player" | "kind" | "speed" | "tileWidth" | "tileHeight">): boolean {
  if (!isPlayerRevealedToPlayer(world, playerId, unit.player)) {
    return false;
  }
  return world.engineSettings.revelationType !== "buildings-only" || isRuntimeSourceBuildingUnit(unit);
}

function updateLastSeenBuildings(world: WorldState): void {
  world.lastSeenBuildings ??= [];
  const byId = new Map(world.lastSeenBuildings.map((building) => [building.unitId, building]));
  for (const unit of world.units) {
    if (unit.player === world.visibilityPlayer || unit.player === 15 || unit.hitPoints <= 0 || !isRuntimeSourceBuildingUnit(unit) || !isUnitFootprintVisibleToPlayer(world, unit, world.visibilityPlayer)) {
      continue;
    }
    byId.set(unit.id, {
      unitId: unit.id,
      typeId: unit.typeId,
      player: unit.player,
      x: unit.x,
      y: unit.y,
      radius: unit.radius,
      drawLevel: unit.drawLevel,
      facing: unit.facing ?? 4,
      animation: unit.animation,
      frameWidth: unit.frameWidth,
      frameHeight: unit.frameHeight,
      seenTick: world.tick
    });
  }
  const liveEnemyBuildingIds = new Set(world.units
    .filter((unit) => unit.player !== world.visibilityPlayer && unit.player !== 15 && unit.hitPoints > 0 && isRuntimeSourceBuildingUnit(unit))
    .map((unit) => unit.id));
  world.lastSeenBuildings = [...byId.values()].filter((building) => (
    liveEnemyBuildingIds.has(building.unitId)
    || !isLastSeenBuildingAreaVisible(world, building)
  ));
}

function isLastSeenBuildingAreaVisible(world: WorldState, building: WorldLastSeenBuilding): boolean {
  const definition = world.unitDefinitions.find((unit) => unit.id === building.typeId);
  return isUnitFootprintVisibleToPlayer(world, {
    x: building.x,
    y: building.y,
    radius: building.radius,
    tileWidth: definition?.tileSize?.[0] ?? Math.max(1, Math.ceil((building.radius * 2) / world.tileSize)),
    tileHeight: definition?.tileSize?.[1] ?? Math.max(1, Math.ceil((building.radius * 2) / world.tileSize))
  }, world.visibilityPlayer);
}

function revealTilesAround(world: WorldState, x: number, y: number, radiusTiles: number): void {
  const centerX = Math.floor(x / world.tileSize);
  const centerY = Math.floor(y / world.tileSize);
  for (let tileY = centerY - radiusTiles; tileY <= centerY + radiusTiles; tileY += 1) {
    for (let tileX = centerX - radiusTiles; tileX <= centerX + radiusTiles; tileX += 1) {
      if (tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
        continue;
      }
      if (Math.hypot(tileX - centerX, tileY - centerY) > radiusTiles + 0.45) {
        continue;
      }
      const index = tileY * world.map.width + tileX;
      world.visibleTiles[index] = 1;
      world.exploredTiles[index] = 1;
    }
  }
}

function sourceFieldOfViewFootprintForUnit(world: WorldState, unit: Pick<WorldUnit, "x" | "y" | "tileWidth" | "tileHeight">): { left: number; top: number; width: number; height: number; centerX: number; centerY: number } {
  const width = Math.max(1, Math.floor(unit.tileWidth));
  const height = Math.max(1, Math.floor(unit.tileHeight));
  const centerX = Math.floor(unit.x / world.tileSize);
  const centerY = Math.floor(unit.y / world.tileSize);
  return {
    left: centerX - Math.floor(width / 2),
    top: centerY - Math.floor(height / 2),
    width,
    height,
    centerX,
    centerY
  };
}

function isSourceFieldOfViewTileVisible(world: WorldState, footprint: { left: number; top: number; width: number; height: number; centerX: number; centerY: number }, tileX: number, tileY: number, radiusTiles: number, elevated = false): boolean {
  if (!isSourceSimpleRadialFieldOfViewTileVisible(footprint, tileX, tileY, radiusTiles)) {
    return false;
  }
  if (world.engineSettings.fieldOfViewType !== "shadow-casting" || world.engineSettings.opaqueTerrainTypes.length === 0) {
    return true;
  }
  if (elevated) {
    return true;
  }
  return hasSourceLineOfSight(world, footprint.centerX, footprint.centerY, tileX, tileY);
}

function isSourceSimpleRadialFieldOfViewTileVisible(footprint: { left: number; top: number; width: number; height: number }, tileX: number, tileY: number, radiusTiles: number): boolean {
  const relativeY = tileY - footprint.top;
  if (relativeY < 0) {
    const offsetY = relativeY;
    const offsetX = Math.floor(Math.sqrt(Math.max(0, (radiusTiles + 1) ** 2 - (-offsetY) ** 2 - 1)));
    return tileX >= footprint.left - offsetX && tileX < footprint.left + footprint.width + offsetX;
  }
  if (relativeY < footprint.height) {
    return tileX >= footprint.left - radiusTiles && tileX < footprint.left + footprint.width + radiusTiles;
  }
  const offsetY = relativeY - footprint.height;
  if (offsetY >= radiusTiles) {
    return false;
  }
  const offsetX = Math.floor(Math.sqrt(Math.max(0, (radiusTiles + 1) ** 2 - (offsetY + 1) ** 2 - 1)));
  return tileX >= footprint.left - offsetX && tileX < footprint.left + footprint.width + offsetX;
}

function hasSourceLineOfSight(world: WorldState, fromX: number, fromY: number, toX: number, toY: number): boolean {
  let x0 = fromX;
  let y0 = fromY;
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  const stepX = fromX < toX ? 1 : -1;
  const stepY = fromY < toY ? 1 : -1;
  let error = dx - dy;
  while (x0 !== toX || y0 !== toY) {
    const doubledError = error * 2;
    if (doubledError > -dy) {
      error -= dy;
      x0 += stepX;
    }
    if (doubledError < dx) {
      error += dx;
      y0 += stepY;
    }
    if ((x0 !== toX || y0 !== toY) && isSourceOpaqueTerrainTile(world, x0, y0)) {
      return false;
    }
  }
  return true;
}

function isSourceOpaqueTerrainTile(world: WorldState, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
    return false;
  }
  const flags = world.tilesetTerrain?.slots.find((entry) => entry.slot === tileSlot(world.tiles[tileY * world.map.width + tileX] ?? 0))?.flags ?? [];
  return world.engineSettings.opaqueTerrainTypes.some((type) => {
    if (world.engineSettings.insideDefault && type === "rock") {
      return false;
    }
    return flags.includes(type);
  });
}

function tileSlot(tile: number): number {
  return tile & 0xfff0;
}

export function isWorldTileVisible(world: WorldState, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
    return false;
  }
  if (!world.engineSettings.fogOfWarEnabled) {
    return true;
  }
  return world.visibleTiles[tileY * world.map.width + tileX] === 1;
}

export function isWorldTileSourceKnown(world: WorldState, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
    return false;
  }
  if (!world.engineSettings.fogOfWarEnabled || world.engineSettings.revealMapMode !== "hidden") {
    return true;
  }
  return world.exploredTiles[tileY * world.map.width + tileX] === 1;
}

export function isWorldPositionVisible(world: WorldState, x: number, y: number): boolean {
  return isWorldTileVisible(world, Math.floor(x / world.tileSize), Math.floor(y / world.tileSize));
}

export function isCircleVisibleToPlayer(world: WorldState, x: number, y: number, radius: number, playerId: number): boolean {
  const clampedRadius = Math.max(0, radius);
  const left = Math.floor((x - clampedRadius) / world.tileSize);
  const right = Math.floor((x + clampedRadius) / world.tileSize);
  const top = Math.floor((y - clampedRadius) / world.tileSize);
  const bottom = Math.floor((y + clampedRadius) / world.tileSize);
  for (let tileY = top; tileY <= bottom; tileY += 1) {
    for (let tileX = left; tileX <= right; tileX += 1) {
      const tileCenterX = tileX * world.tileSize + world.tileSize / 2;
      const tileCenterY = tileY * world.tileSize + world.tileSize / 2;
      const nearestX = Math.max(x - clampedRadius, Math.min(tileCenterX, x + clampedRadius));
      const nearestY = Math.max(y - clampedRadius, Math.min(tileCenterY, y + clampedRadius));
      if (Math.hypot(nearestX - x, nearestY - y) <= clampedRadius + world.tileSize * 0.72 && isWorldPositionVisibleToPlayer(world, tileCenterX, tileCenterY, playerId)) {
        return true;
      }
    }
  }
  return false;
}

export function isUnitVisibleToPlayer(world: WorldState, unit: WorldUnit, playerId: number): boolean {
  if (doesPlayerShareVisionWith(world, playerId, unit.player)) {
    return true;
  }
  if (unit.visibleUnderFog && isUnitFootprintExploredByPlayer(world, unit, playerId)) {
    return true;
  }
  if (!isUnitFootprintVisibleToPlayer(world, unit, playerId)) {
    return false;
  }
  if (isHiddenUnit(unit)) {
    return world.units.some((detector) => doesPlayerShareVisionWith(world, playerId, detector.player) && detector.hitPoints > 0 && !detector.construction && canDetectHiddenUnits(detector) && Math.hypot(detector.x - unit.x, detector.y - unit.y) <= detectionRange(detector, world));
  }
  return true;
}

export function isUnitFootprintVisibleToPlayer(world: WorldState, unit: Pick<WorldUnit, "x" | "y" | "radius" | "tileWidth" | "tileHeight">, playerId: number): boolean {
  const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, world.tileSize);
  const left = Math.floor((unit.x - halfWidth) / world.tileSize);
  const right = Math.floor((unit.x + halfWidth - 1) / world.tileSize);
  const top = Math.floor((unit.y - halfHeight) / world.tileSize);
  const bottom = Math.floor((unit.y + halfHeight - 1) / world.tileSize);
  for (let tileY = top; tileY <= bottom; tileY += 1) {
    for (let tileX = left; tileX <= right; tileX += 1) {
      const x = tileX * world.tileSize + world.tileSize / 2;
      const y = tileY * world.tileSize + world.tileSize / 2;
      if (isWorldPositionVisibleToPlayer(world, x, y, playerId)) {
        return true;
      }
    }
  }
  return false;
}

export function isUnitFootprintExploredByPlayer(world: WorldState, unit: Pick<WorldUnit, "x" | "y" | "radius" | "tileWidth" | "tileHeight">, playerId: number): boolean {
  if (!world.engineSettings.fogOfWarEnabled) {
    return true;
  }
  if (playerId !== world.visibilityPlayer) {
    return isUnitFootprintVisibleToPlayer(world, unit, playerId);
  }
  const { halfWidth, halfHeight } = unitFootprintHalfSize(unit, world.tileSize);
  const left = Math.floor((unit.x - halfWidth) / world.tileSize);
  const right = Math.floor((unit.x + halfWidth - 1) / world.tileSize);
  const top = Math.floor((unit.y - halfHeight) / world.tileSize);
  const bottom = Math.floor((unit.y + halfHeight - 1) / world.tileSize);
  for (let tileY = top; tileY <= bottom; tileY += 1) {
    for (let tileX = left; tileX <= right; tileX += 1) {
      if (tileX >= 0 && tileY >= 0 && tileX < world.map.width && tileY < world.map.height && world.exploredTiles[tileY * world.map.width + tileX] === 1) {
        return true;
      }
    }
  }
  return false;
}

export function isWorldPositionVisibleToPlayer(world: WorldState, x: number, y: number, playerId: number): boolean {
  if (!world.engineSettings.fogOfWarEnabled) {
    return x >= 0 && y >= 0 && x < world.map.width * world.tileSize && y < world.map.height * world.tileSize;
  }
  if (playerId === world.visibilityPlayer) {
    return isWorldPositionVisible(world, x, y);
  }
  const tileX = Math.floor(x / world.tileSize);
  const tileY = Math.floor(y / world.tileSize);
  if (tileX < 0 || tileY < 0 || tileX >= world.map.width || tileY >= world.map.height) {
    return false;
  }
  return world.units.some((unit) => {
    if ((!doesPlayerShareVisionWith(world, playerId, unit.player) && !doesUnitProvideRevelationVision(world, playerId, unit)) || unit.hitPoints <= 0) {
      return false;
    }
    return isSourceFieldOfViewTileVisible(world, sourceFieldOfViewFootprintForUnit(world, unit), tileX, tileY, unit.sightRangeTiles, unit.elevated);
  }) || world.spellEffects.some((effect) => (
    effect.kind === "holy-vision"
    && doesPlayerShareVisionWith(world, playerId, effect.player)
    && Math.hypot(x - effect.x, y - effect.y) <= effect.radius
  )) || (world.visibilityReveals ?? []).some((reveal) => (
    reveal.remainingTicks > 0
    && doesPlayerShareVisionWith(world, playerId, reveal.player)
    && Math.hypot(tileX - Math.floor(reveal.x / world.tileSize), tileY - Math.floor(reveal.y / world.tileSize)) <= reveal.radiusTiles + 0.45
  ));
}

export function isSubmarineUnit(unit: WorldUnit): boolean {
  return unit.seaUnit && unit.permanentCloak && unit.canAttack;
}

export function isInvisibleUtilityUnit(unit: WorldUnit): boolean {
  return unit.revealer
    && unit.image === null
    && unit.vanishes
    && unit.nonSolid
    && unit.hitPoints <= 1;
}

export function isUnitHiddenInConstruction(unit: Pick<WorldUnit, "hiddenInConstructionId">): boolean {
  return typeof unit.hiddenInConstructionId === "string" && unit.hiddenInConstructionId.length > 0;
}

function isHiddenUnit(unit: WorldUnit): boolean {
  return unit.permanentCloak || unit.statusEffects?.some((effect) => effect.kind === "invisibility" && effect.remainingSeconds > 0) === true;
}

function canDetectHiddenUnits(unit: WorldUnit): boolean {
  return unit.detectCloak;
}

function detectionRange(unit: WorldUnit, world: WorldState): number {
  return Math.max(unit.sightRangeTiles + 1, 5) * world.tileSize;
}

function addStartingHalls(units: WorldUnit[], unitsById: Map<string, WargusUnit>, setup: WargusMapSetup | null, sourceButtons: WargusButton[], sourceUnitDatabase: WargusUnitDatabaseEntry[], tileset: string | null): void {
  if (!setup) {
    return;
  }
  const sourceUnits = [...unitsById.values()];
  for (const player of setup.players) {
    const start = safePlayerStartTile(setup, player.player);
    if (player.player === 15 || !start) {
      continue;
    }
    if (units.some((unit) => unit.player === player.player && isTownCenter(unit))) {
      continue;
    }
    const fallbackHallId = player.race === "human" ? "unit-town-hall" : "unit-great-hall";
    const hall = startingHallDefinitionForPlayer(sourceUnits, sourceButtons, sourceUnitDatabase, player.race) ?? unitsById.get(fallbackHallId);
    if (!hall) {
      continue;
    }
    units.push(createWorldUnit({
      unit: hall,
      id: `${hall.id}-starting-${player.player}`,
      player: player.player,
      tileX: clampTile(start.x - 2, setup.width),
      tileY: clampTile(start.y - 2, setup.height),
      tileset
    }));
  }
}

export function imageForTileset(definition: Pick<WargusUnit, "image" | "seasonalImages">, tileset: string | null | undefined): string | null {
  if (!tileset) {
    return definition.image;
  }
  return definition.seasonalImages?.[sourceTilesetFamilyName(tileset)] ?? definition.image;
}

function sourceTilesetFamilyName(tileset: string): string {
  return tileset.replace(/^scripts\/tilesets\//, "").replace(/^wargus\//, "").replace(/\.lua$/, "");
}

function startingHallDefinitionForPlayer(sourceUnits: WargusUnit[], sourceButtons: WargusButton[], sourceUnitDatabase: WargusUnitDatabaseEntry[], race: string | null | undefined): WargusUnit | undefined {
  const baseHalls = sourceUnits
    .filter((unit) => unit.mainFacility === true && sourceTownCenterTier(sourceUnits, sourceButtons, unit.id, new Set()) === 1)
    .sort((left, right) => (
      raceMainFacilityScore(right, sourceUnitDatabase, race) - raceMainFacilityScore(left, sourceUnitDatabase, race)
      || (right.hitPoints ?? 0) - (left.hitPoints ?? 0)
      || left.id.localeCompare(right.id)
    ));
  return baseHalls[0];
}

function sourceTownCenterTier(sourceUnits: WargusUnit[], sourceButtons: WargusButton[], typeId: string, seen: Set<string>): number {
  if (seen.has(typeId)) {
    return 1;
  }
  const definition = sourceUnits.find((unit) => unit.id === typeId);
  if (!definition?.mainFacility) {
    return 0;
  }
  const nextSeen = new Set(seen);
  nextSeen.add(typeId);
  const previousTypes = sourceButtons
    .filter((button) => button.action === "upgrade-to" && button.value === typeId)
    .flatMap((button) => button.forUnit)
    .filter((previousTypeId) => sourceUnits.some((unit) => unit.id === previousTypeId && unit.mainFacility));
  if (previousTypes.length === 0) {
    return 1;
  }
  return 1 + Math.max(...previousTypes.map((previousTypeId) => sourceTownCenterTier(sourceUnits, sourceButtons, previousTypeId, nextSeen)));
}

function raceMainFacilityScore(definition: WargusUnit, sourceUnitDatabase: WargusUnitDatabaseEntry[], race: string | null | undefined): number {
  const normalizedRace = race?.toLowerCase() ?? "";
  if (normalizedRace === "human" || normalizedRace === "orc") {
    return sourceRaceScoreForUnitDefinition(definition, sourceUnitDatabase, normalizedRace);
  }
  return 1;
}

function playersFromSetup(setup: WargusMapSetup | null, engineSettings: WargusEngineSettings, sourceAiDefinitions: WargusAiDefinition[] = []): WorldPlayer[] {
  const speedFactors = cloneSourceSpeedFactors(engineSettings.speedFactors);
  if (!setup?.players.length) {
    const defaultRace = sourceDefaultRace(engineSettings);
    return [
      { id: 0, name: sourcePlayerName(engineSettings, sourceAiDefinitions, 0, "person", defaultRace, null), resources: { gold: 0, wood: 0, oil: 0 }, speedFactors: cloneSourceSpeedFactors(speedFactors), race: defaultRace, ai: null, playerType: "person", startX: 10 * 32 + 16, startY: 10 * 32 + 16 },
      { id: 1, name: sourcePlayerName(engineSettings, sourceAiDefinitions, 1, "computer", defaultRace, "Land Attack"), resources: { gold: 0, wood: 0, oil: 0 }, speedFactors: cloneSourceSpeedFactors(speedFactors), race: defaultRace, ai: "Land Attack", playerType: "computer", startX: 20 * 32 + 16, startY: 20 * 32 + 16 }
    ].map((player) => ({ ...player, stats: createPlayerStats() }));
  }
  return setup.players.map((player) => ({
    ...(() => {
      const start = safePlayerStartTile(setup, player.player) ?? { x: Math.floor(setup.width / 2), y: Math.floor(setup.height / 2) };
      return { startX: start.x * 32 + 16, startY: start.y * 32 + 16 };
    })(),
    id: player.player,
    name: sourcePlayerName(engineSettings, sourceAiDefinitions, player.player, player.playerType, player.race, player.ai),
    resources: { ...player.resources },
    speedFactors: cloneSourceSpeedFactors(speedFactors),
    stats: createPlayerStats(),
    race: player.race,
    ai: player.ai,
    playerType: player.playerType
  }));
}

function sourceDefaultRace(engineSettings: WargusEngineSettings): string | null {
  return engineSettings.defaultRace ?? engineSettings.menuRace ?? null;
}

function sourcePlayerName(engineSettings: WargusEngineSettings, aiDefinitions: WargusAiDefinition[], player: number, playerType: string | null | undefined, race: string | null | undefined, aiName: string | null | undefined): string | null {
  if (playerType === "person") {
    return engineSettings.playerNameDefault;
  }
  const aiDefaultName = sourceAiPlayerDisplayName(aiDefinitions, aiName);
  if (aiDefaultName) {
    return aiDefaultName;
  }
  const aiNameFallback = sourceAiNamePlayerFallback(aiDefinitions, aiName);
  if (aiNameFallback) {
    return aiNameFallback;
  }
  return sourceDefaultPlayerName(engineSettings, player, race);
}

function sourceAiPlayerDisplayName(aiDefinitions: WargusAiDefinition[], aiName: string | null | undefined): string | null {
  if (!aiName) {
    return null;
  }
  const definition = aiDefinitions.find((candidate) => candidate.name === aiName);
  if (!definition) {
    return null;
  }
  if (definition.defaultName) {
    return definition.defaultName;
  }
  return sourceAiDefinitionNameIsDisplayable(definition) ? definition.name : null;
}

function sourceAiDefinitionNameIsDisplayable(definition: WargusAiDefinition): boolean {
  return definition.class === "wc2-skirmish"
    && !sourceAiDefinitionIsPassive(definition)
    && definition.script !== "AiLandAttack"
    && definition.script !== "AiSeaAttack"
    && definition.script !== "AiAirAttack";
}

function sourceAiNamePlayerFallback(aiDefinitions: WargusAiDefinition[], aiName: string | null | undefined): string | null {
  if (!aiName || aiDefinitions.some((definition) => definition.name === aiName)) {
    return null;
  }
  return SOURCE_SETUP_PERSONALITY_AI_NAMES.has(aiName) ? aiName : null;
}

const SOURCE_SETUP_PERSONALITY_AI_NAMES = new Set(["Soul", "Tesuni", "Regulus"]);

function sourceDefaultPlayerName(engineSettings: WargusEngineSettings, player: number, race: string | null | undefined): string | null {
  const names = race ? engineSettings.defaultPlayerNames[race] : null;
  return names?.[player] ?? null;
}

function playablePlayerIdForPlayers(players: WorldPlayer[], setup: WargusMapSetup | null, aiDefinitions: WargusAiDefinition[]): number {
  return players.find((player) => player.playerType === "person")?.id
    ?? sourceCampaignPassivePlayerId(players, setup, aiDefinitions)
    ?? players.find((player) => player.id === 0)?.id
    ?? players.find((player) => player.id !== 15)?.id
    ?? 0;
}

function sourceCampaignPassivePlayerId(players: WorldPlayer[], setup: WargusMapSetup | null, aiDefinitions: WargusAiDefinition[]): number | null {
  const campaignRace = sourceCampaignRace(setup?.path);
  if (!campaignRace) {
    return null;
  }
  return players
    .filter((player) => player.id !== 15 && player.race === campaignRace && sourceAiNameIsPassive(player.ai, aiDefinitions))
    .sort((left, right) => left.id - right.id)[0]?.id ?? null;
}

function sourceCampaignRace(path: string | null | undefined): string | null {
  if (path?.startsWith("campaigns/human")) {
    return "human";
  }
  if (path?.startsWith("campaigns/orc")) {
    return "orc";
  }
  return null;
}

export function sourceAiNameIsPassive(aiName: string | null | undefined, aiDefinitions: WargusAiDefinition[]): boolean {
  const definition = sourceAiDefinitionForName(aiDefinitions, aiName);
  return definition ? sourceAiDefinitionIsPassive(definition) : false;
}

export function sourceAiDefinitionForName(aiDefinitions: WargusAiDefinition[], aiName: string | null | undefined): WargusAiDefinition | null {
  const normalized = aiName?.toLowerCase() ?? "";
  return normalized ? aiDefinitions.find((definition) => definition.name.toLowerCase() === normalized) ?? null : null;
}

export function sourceAiDefinitionIsPassive(definition: WargusAiDefinition): boolean {
  return definition.script === "AiPassive"
    || definition.class === "ai-passive"
    || definition.class === "wc2-passive"
    || definition.source === "scripts/ai/passive.lua";
}

function safePlayerStartTile(setup: WargusMapSetup, playerId: number): { x: number; y: number } | null {
  const player = setup.players.find((candidate) => candidate.player === playerId);
  if (isSetupTileInBounds(setup, player?.startView)) {
    return player.startView;
  }
  const start = setup.starts.find((candidate) => candidate.player === playerId && isSetupTileInBounds(setup, candidate));
  if (start) {
    return { x: start.x, y: start.y };
  }
  const unit = setup.units.find((candidate) => candidate.player === playerId && isSetupTileInBounds(setup, candidate));
  if (unit) {
    return { x: unit.x, y: unit.y };
  }
  return setup.width > 0 && setup.height > 0 ? { x: Math.floor(setup.width / 2), y: Math.floor(setup.height / 2) } : null;
}

function isSetupTileInBounds(setup: WargusMapSetup, point: { x: number; y: number } | null | undefined): point is { x: number; y: number } {
  return !!point && point.x >= 0 && point.y >= 0 && point.x < setup.width && point.y < setup.height;
}

function clampTile(value: number, size: number): number {
  return Math.max(0, Math.min(Math.max(0, size - 1), value));
}

function aiStrategyForPlayer(aiName: string | null, units: WorldUnit[], playerId: number, aiDefinitions: WargusAiDefinition[] = []): "land" | "sea" | "air" | "passive" {
  const normalized = aiName?.toLowerCase() ?? "";
  if (!normalized) {
    return "passive";
  }
  const aiDefinition = sourceAiDefinitionForName(aiDefinitions, aiName);
  if (aiDefinition && sourceAiDefinitionIsPassive(aiDefinition)) {
    return "passive";
  }
  const sourceStrategy = sourceAiDefinitionStrategy(aiDefinition?.class, aiDefinition?.script);
  if (sourceStrategy) {
    return sourceStrategy;
  }
  const playerUnits = units.filter((unit) => unit.player === playerId && unit.hitPoints > 0);
  const airWeight = playerUnits.filter((unit) => unit.airUnit || unit.kind === "fly").length;
  const navalWeight = playerUnits.filter((unit) => (
    unit.seaUnit
    || unit.kind === "naval"
    || unit.storesResources.includes("oil")
    || unit.gatherResources.includes("oil")
  )).length;
  if (airWeight >= 3 && airWeight >= navalWeight) {
    return "air";
  }
  if (navalWeight >= 2) {
    return "sea";
  }
  return "land";
}

function sourceAiDefinitionStrategy(aiClass: string | null | undefined, aiScript: string | null | undefined): "land" | "sea" | "air" | null {
  const normalizedClass = aiClass?.toLowerCase() ?? "";
  const normalizedScript = aiScript ?? "";
  if (normalizedScript === "AiSeaAttack" || normalizedClass === "wc2-sea-attack" || normalizedClass === "ai-sea-attack") {
    return "sea";
  }
  if (normalizedScript === "AiAirAttack" || normalizedClass === "wc2-air-attack" || normalizedClass === "ai-air-attack") {
    return "air";
  }
  if (normalizedScript === "AiLandAttack" || normalizedClass === "wc2-land-attack" || normalizedClass === "ai-active" || normalizedClass === "ai-land-attack") {
    return "land";
  }
  return null;
}

function aiAttackForceSizeForPlayer(setup: WargusMapSetup | null, aiName: string | null): number {
  if (!aiName) {
    return 3;
  }
  const plan = setup?.aiForcePlans.find((candidate) => candidate.ai === aiName);
  return Math.max(3, Math.floor(plan?.attackForceSize ?? 3));
}

function aiAttackForceIdsForPlayer(setup: WargusMapSetup | null, aiName: string | null): number[] {
  if (!aiName) {
    return [];
  }
  return (setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.attackForceIds ?? [])
    .map((id) => Math.max(0, Math.floor(id)))
    .filter((id) => Number.isFinite(id));
}

function aiForceSizesForPlayer(setup: WargusMapSetup | null, aiName: string | null): number[] {
  if (!aiName) {
    return [];
  }
  return (setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.forceSizes ?? [])
    .map((size) => Math.max(1, Math.floor(size)))
    .filter((size) => Number.isFinite(size));
}

function aiAttackWaveSizesForPlayer(setup: WargusMapSetup | null, aiName: string | null): number[] {
  if (!aiName) {
    return [];
  }
  return (setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.attackWaveSizes ?? [])
    .map((size) => Math.max(3, Math.floor(size)))
    .filter((size) => Number.isFinite(size));
}

function aiAttackWaveUnitTargetsForPlayer(setup: WargusMapSetup | null, aiName: string | null): Array<Array<{ unitTypeId: string; count: number }>> {
  if (!aiName) {
    return [];
  }
  return (setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.attackWaveUnitTargets ?? [])
    .map((targets) => targets.map((target) => ({ unitTypeId: target.unitTypeId, count: Math.max(1, Math.floor(target.count)) })));
}

function aiDefendForceSizeForPlayer(setup: WargusMapSetup | null, aiName: string | null): number {
  if (!aiName) {
    return 0;
  }
  const plan = setup?.aiForcePlans.find((candidate) => candidate.ai === aiName);
  return Math.max(0, Math.floor(plan?.defendForceSize ?? 0));
}

function aiPreferredAttackUnitTypesForPlayer(setup: WargusMapSetup | null, aiName: string | null): string[] {
  if (!aiName) {
    return [];
  }
  return [...(setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.preferredAttackUnitTypes ?? [])];
}

function aiAttackDelayTicksForPlayer(setup: WargusMapSetup | null, aiName: string | null): number {
  if (!aiName) {
    return 35 * 30;
  }
  const plan = setup?.aiForcePlans.find((candidate) => candidate.ai === aiName);
  return Math.max(30, Math.floor(plan?.attackDelayTicks ?? 35 * 30));
}

function aiInitialAttackDelayTicksForPlayer(setup: WargusMapSetup | null, aiName: string | null): number {
  if (!aiName) {
    return 20 * 30;
  }
  const plan = setup?.aiForcePlans.find((candidate) => candidate.ai === aiName);
  return Math.max(30, Math.floor(plan?.initialAttackDelayTicks ?? 20 * 30));
}

function aiAttackUnitTargetsForPlayer(setup: WargusMapSetup | null, aiName: string | null): Array<{ unitTypeId: string; count: number }> {
  if (!aiName) {
    return [];
  }
  return (setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.attackUnitTargets ?? [])
    .map((target) => ({ unitTypeId: target.unitTypeId, count: Math.max(1, Math.floor(target.count)) }));
}

function aiBuildOrderForPlayer(setup: WargusMapSetup | null, aiName: string | null): string[] {
  if (!aiName) {
    return [];
  }
  return [...(setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.buildOrder ?? [])];
}

function aiBuildDepotsForPlayer(setup: WargusMapSetup | null, aiName: string | null): boolean {
  if (!aiName) {
    return true;
  }
  return setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.buildDepots ?? true;
}

function aiWorkerTargetForPlayer(setup: WargusMapSetup | null, aiName: string | null): number {
  if (!aiName) {
    return 7;
  }
  const plan = setup?.aiForcePlans.find((candidate) => candidate.ai === aiName);
  return Math.max(1, Math.floor(plan?.workerTarget ?? 7));
}

function aiTankerTargetForPlayer(setup: WargusMapSetup | null, aiName: string | null): number {
  if (!aiName) {
    return 1;
  }
  const plan = setup?.aiForcePlans.find((candidate) => candidate.ai === aiName);
  return Math.max(0, Math.floor(plan?.tankerTarget ?? 1));
}

function aiTransportTargetForPlayer(setup: WargusMapSetup | null, aiName: string | null): number {
  if (!aiName) {
    return 0;
  }
  const plan = setup?.aiForcePlans.find((candidate) => candidate.ai === aiName);
  return Math.max(0, Math.floor(plan?.transportTarget ?? 0));
}

function aiCollectWeightsForPlayer(setup: WargusMapSetup | null, aiName: string | null): { gold: number; wood: number; oil: number } | null {
  if (!aiName) {
    return null;
  }
  const weights = setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.collectWeights;
  return weights
    ? {
        gold: Math.max(0, Math.floor(weights.gold)),
        wood: Math.max(0, Math.floor(weights.wood)),
        oil: Math.max(0, Math.floor(weights.oil))
      }
    : null;
}

function aiResearchOrderForPlayer(setup: WargusMapSetup | null, aiName: string | null): string[] {
  if (!aiName) {
    return [];
  }
  return [...(setup?.aiForcePlans.find((candidate) => candidate.ai === aiName)?.researchOrder ?? [])];
}

export function createPlayerStats(): WorldPlayerStats {
  return {
    totalUnits: 0,
    totalBuildings: 0,
    unitsKilled: 0,
    buildingsRazed: 0,
    unitsLost: 0,
    buildingsLost: 0,
    pointsKilled: 0,
    pointsLost: 0,
    goldMined: 0,
    woodHarvested: 0,
    oilHarvested: 0
  };
}

function fallbackUnit(id: string, name: string, hitPoints: number): Pick<
  WargusUnit,
  "id" | "name" | "type" | "landUnit" | "seaUnit" | "airUnit" | "sideAttack" | "rotationSpeed" | "elevated" | "shadow" | "woodImprove" | "oilImprove" | "center" | "level" | "builderOutside" | "teleporter" | "numDirections" | "onReady" | "hitPoints" | "burnPercent" | "burnDamageRate" | "drawLevel" | "priority" | "points" | "annoyComputerFactor" | "tileSize" | "boxSize" | "missile" | "constructionTypeId" | "image" | "seasonalImages" | "animation" | "corpseTypeId" | "explosionType" | "rightMouseAction" | "revealer" | "vanishes" | "decayRate" | "armor" | "basicDamage" | "piercingDamage" | "minAttackRange" | "maxAttackRange" | "sightRange" | "computerReactionRange" | "personReactionRange" | "speed" | "supply" | "demand" | "maxOnBoard" | "canTransport" | "autoRepairRange" | "repairRange" | "repairHp" | "repairCosts" | "improveProduction" | "canAttack" | "canTargetLand" | "canTargetSea" | "canTargetAir" | "groundAttack" | "detectCloak" | "coward" | "gatherResources" | "resourceCapacity" | "resourceStep" | "waitAtResource" | "waitAtDepot" | "canCastSpells" | "storesResources" | "givesResource" | "canHarvest" | "building" | "mainFacility" | "shoreBuilding" | "manaEnabled" | "manaMax" | "manaInitial" | "manaIncrease" | "selectableByRectangle" | "indestructible" | "nonSolid" | "visibleUnderFog" | "permanentCloak" | "organic" | "isUndead" | "hero" | "volatile" | "randomMovementProbability" | "randomMovementDistance" | "clicksToExplode" | "neutral" | "neutralMinimapColor"
> {
  return {
    id,
    name,
    type: "land",
    landUnit: true,
    seaUnit: false,
    airUnit: false,
    sideAttack: false,
    rotationSpeed: 0,
    elevated: false,
    shadow: null,
    woodImprove: false,
    oilImprove: false,
    center: false,
    level: 0,
    builderOutside: false,
    teleporter: false,
    numDirections: 0,
    onReady: null,
    hitPoints,
    burnPercent: 0,
    burnDamageRate: 0,
    drawLevel: 40,
    priority: 50,
    points: 50,
    annoyComputerFactor: 0,
    tileSize: [1, 1],
    boxSize: [31, 31],
    image: null,
    animation: null,
    corpseTypeId: null,
    explosionType: null,
    rightMouseAction: "attack",
    missile: "missile-none",
    constructionTypeId: null,
    revealer: false,
    vanishes: false,
    decayRate: 0,
    armor: 0,
    basicDamage: 1,
    piercingDamage: 0,
    minAttackRange: 0,
    maxAttackRange: 1,
    sightRange: 4,
    computerReactionRange: 6,
    personReactionRange: 4,
    speed: 10,
    supply: 0,
    demand: 1,
    maxOnBoard: 0,
    canTransport: [],
    autoRepairRange: 0,
    repairRange: 0,
    repairHp: 0,
    repairCosts: [],
    improveProduction: {},
    canAttack: true,
    canTargetLand: true,
    canTargetSea: false,
    canTargetAir: false,
    groundAttack: false,
    detectCloak: false,
    coward: false,
    gatherResources: [],
    resourceCapacity: {},
    resourceStep: {},
    waitAtResource: {},
    waitAtDepot: {},
    canCastSpells: [],
    storesResources: [],
    givesResource: null,
    canHarvest: false,
    building: false,
    mainFacility: false,
    shoreBuilding: false,
    manaEnabled: false,
    manaMax: 0,
    manaInitial: 0,
    manaIncrease: 0,
    selectableByRectangle: true,
    indestructible: false,
    nonSolid: false,
    visibleUnderFog: false,
    permanentCloak: false,
    organic: false,
    isUndead: false,
    hero: false,
    volatile: false,
    randomMovementProbability: 0,
    randomMovementDistance: 1,
    clicksToExplode: 0,
    neutral: false,
    neutralMinimapColor: null
  };
}

export function speedForUnit(
  id: string,
  type: string,
  wargusSpeed = 0,
  sourceDefinition?: Pick<WargusUnit, "id" | "type" | "building" | "mainFacility" | "shoreBuilding" | "storesResources" | "givesResource" | "canHarvest">
): number {
  if (sourceDefinition ? isSourceBuildingDefinition(sourceDefinition) : isKnownBuildingTypeId(id)) {
    return 0;
  }
  if (Number.isFinite(wargusSpeed) && wargusSpeed > 0) {
    return wargusSpeed * WARGUS_SPEED_TO_PIXELS_PER_SECOND;
  }
  if (type === "fly") {
    return 120;
  }
  if (type === "naval") {
    return 72;
  }
  return 84;
}

export function worldKindForUnitDefinition(unit: Pick<WargusUnit, "type" | "landUnit" | "seaUnit" | "airUnit">): string {
  if (unit.airUnit) {
    return "fly";
  }
  if (unit.seaUnit) {
    return "naval";
  }
  if (unit.landUnit) {
    return "land";
  }
  return unit.type;
}

export function sightRangeForUnit(unit: Pick<WargusUnit, "id" | "sightRange" | "building" | "canAttack" | "landUnit" | "maxAttackRange" | "gatherResources" | "canHarvest">, type: string, tileWidth: number, tileHeight: number): number {
  const sourceSightRange = unit.sightRange ?? 0;
  if (Number.isFinite(sourceSightRange) && sourceSightRange > 0) {
    return sourceSightRange;
  }
  if (type === "fly") {
    return 8;
  }
  if (unit.building === true && unit.canAttack === true) {
    return 9;
  }
  if (tileWidth > 1 || tileHeight > 1) {
    return 6;
  }
  if (unit.landUnit === true && unit.canAttack === true && (unit.maxAttackRange ?? 0) > 1) {
    return 7;
  }
  if ((unit.gatherResources ?? []).some((resource) => resource === "gold" || resource === "wood") || unit.canHarvest === true) {
    return 5;
  }
  return 6;
}

function isBuildingType(unit: Pick<WargusUnit, "id" | "type" | "building" | "mainFacility" | "shoreBuilding" | "storesResources" | "givesResource" | "canHarvest">): boolean {
  return isSourceBuildingDefinition(unit);
}

export function isSourceBuildingDefinition(unit: Pick<WargusUnit, "id" | "type" | "building" | "mainFacility" | "shoreBuilding" | "storesResources" | "givesResource" | "canHarvest">): boolean {
  return unit.building === true
    || unit.type === "building"
    || unit.mainFacility === true
    || unit.shoreBuilding === true
    || (unit.storesResources?.length ?? 0) > 0
    || isSourceResourceSiteDefinition(unit)
    || isSourceResourcePatchDefinition(unit);
}

export function isSourceResourceSiteDefinition(unit: Pick<WargusUnit, "givesResource" | "canHarvest">): boolean {
  return typeof unit.givesResource === "string" && unit.givesResource.length > 0 && unit.canHarvest === true;
}

export function isSourceResourcePatchDefinition(unit: Pick<WargusUnit, "givesResource" | "canHarvest">, resource?: string): boolean {
  return typeof unit.givesResource === "string"
    && unit.givesResource.length > 0
    && (resource === undefined || unit.givesResource === resource)
    && unit.canHarvest !== true;
}

export function isKnownBuildingTypeId(id: string): boolean {
  return SOURCE_COMPAT_BUILDING_TYPE_IDS.has(id);
}

const SOURCE_COMPAT_BUILDING_TYPE_IDS = new Set([
  "unit-gold-mine",
  "unit-oil-patch",
  "unit-town-hall",
  "unit-keep",
  "unit-castle",
  "unit-great-hall",
  "unit-stronghold",
  "unit-fortress",
  "unit-farm",
  "unit-pig-farm",
  "unit-human-barracks",
  "unit-orc-barracks",
  "unit-human-watch-tower",
  "unit-orc-watch-tower",
  "unit-human-guard-tower",
  "unit-orc-guard-tower",
  "unit-human-cannon-tower",
  "unit-orc-cannon-tower",
  "unit-elven-lumber-mill",
  "unit-troll-lumber-mill",
  "unit-human-blacksmith",
  "unit-orc-blacksmith",
  "unit-human-shipyard",
  "unit-orc-shipyard",
  "unit-human-foundry",
  "unit-orc-foundry",
  "unit-human-refinery",
  "unit-orc-refinery",
  "unit-human-oil-platform",
  "unit-orc-oil-platform",
  "unit-church",
  "unit-altar-of-storms",
  "unit-mage-tower",
  "unit-temple-of-the-damned",
  "unit-stables",
  "unit-ogre-mound",
  "unit-gryphon-aviary",
  "unit-dragon-roost",
  "unit-inventor",
  "unit-alchemist",
  "unit-human-wall",
  "unit-orc-wall",
  "unit-runestone",
  "unit-dark-portal",
  "unit-circle-of-power"
]);

function cargoCapacityForUnit(unit: Pick<WargusUnit, "maxOnBoard" | "canTransport">): number {
  return Math.max(0, Math.floor(unit.maxOnBoard ?? 0));
}

function isTownCenter(unit: WorldUnit): boolean {
  return unit.mainFacility;
}

function tilesFromSetup(map: WargusMap, setup: WargusMapSetup): number[] {
  const tiles = Array.from({ length: map.width * map.height }, () => 0);
  for (const tile of setup.tiles) {
    if (tile.x < 0 || tile.y < 0 || tile.x >= map.width || tile.y >= map.height) {
      continue;
    }
    tiles[tile.y * map.width + tile.x] = tile.id;
  }
  return tiles;
}
