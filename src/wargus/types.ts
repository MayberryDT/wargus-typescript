export interface WargusManifest {
  generatedAt: string;
  dataRoot: string;
  sourceHash: string;
  counts: {
    files: number;
    maps: number;
    scripts: number;
    images: number;
    sounds: number;
    units: number;
    animations: number;
    soundDefinitions: number;
    gameSounds: number;
    upgrades: number;
    missiles: number;
    constructions: number;
    burningBuildings: number;
    tilesets: number;
    allowRules: number;
    dependencies: number;
    popups: number;
    buttons: number;
    spells: number;
    aiDefinitions: number;
    unitDatabase: number;
    titleTips: number;
    cursors: number;
    fonts: number;
    fontColors: number;
    musicCues: number;
    resultScreens: number;
    resultRanks: number;
    panelContents: number;
    decorations: number;
  };
  titleScreens?: WargusTitleScreen[];
  titleTips?: WargusTitleTip[];
  cursors?: WargusCursorDefinition[];
  fonts?: WargusFontDefinition[];
  fontColors?: WargusFontColorPalette[];
  musicCues?: WargusMusicCue[];
  resultScreens?: WargusResultScreen[];
  resultRanks?: WargusResultRank[];
  panelContents?: WargusPanelContents[];
  decorations?: WargusDecoration[];
  aiDefinitions?: WargusAiDefinition[];
  unitDatabase?: WargusUnitDatabaseEntry[];
  maps: WargusMap[];
  campaigns?: WargusCampaign[];
  engineSettings?: WargusEngineSettings;
  units: WargusUnit[];
  animations: WargusAnimation[];
  sounds: WargusSound[];
  gameSounds?: WargusGameSound[];
  upgrades: WargusUpgrade[];
  missiles: WargusMissile[];
  constructions?: WargusConstruction[];
  burningBuildings: WargusBurningBuildingStage[];
  tilesets?: WargusTilesetTerrain[];
  allowRules: WargusAllowRule[];
  dependencies: WargusDependencyRule[];
  popups?: WargusPopup[];
  buttons: WargusButton[];
  spells: WargusSpell[];
  defaultMapSetup?: string;
  assetRoots: {
    graphics: string[];
    sounds: string[];
    music: string[];
  };
  scripts: string[];
}

export interface WargusTitleScreen {
  image: string;
  timeoutSeconds: number | null;
  music: string | null;
  stretchMode: string | null;
}

export interface WargusTitleTip {
  text: string;
  source: string;
}

export interface WargusCursorDefinition {
  name: string;
  race: "any" | "human" | "orc" | string;
  file: string;
  hotSpot: [number, number];
  size: [number, number];
  source: string;
}

export interface WargusFontDefinition {
  id: string;
  file: string;
  glyphWidth: number;
  glyphHeight: number;
  source: string;
}

export interface WargusFontColorPalette {
  id: string;
  colors: Array<[number, number, number]>;
  source: string;
}

export interface WargusMusicCue {
  kind: "battle" | "briefing" | "victory" | "defeat" | string;
  race: "human" | "orc" | "any" | string;
  files: string[];
  source: string;
}

export interface WargusResultScreen {
  status: "victory" | "defeat" | "draw" | string;
  race: "human" | "orc";
  image: string;
  source: string;
}

export interface WargusResultRank {
  race: "human" | "orc";
  threshold: number;
  name: string;
  source: string;
}

export interface WargusTilesetTerrain {
  script: string;
  name: string;
  image: string | null;
  colorCycleAll: boolean;
  colorCycleRanges: WargusTilesetColorCycleRange[];
  slots: WargusTilesetSlot[];
}

export interface WargusTilesetColorCycleRange {
  start: number;
  end: number;
  label: string;
}

export interface WargusTilesetSlot {
  slot: number;
  flags: string[];
}

export interface WargusAiDefinition {
  name: string;
  race: string;
  class: string;
  script: string;
  defaultName: string | null;
  source: string;
}

export interface WargusUnitDatabaseEntry {
  race: "human" | "orc";
  unitTypeId: string;
  producerTypeId: string;
  category: string;
  class: string;
  rank: string;
  castCosts: {
    gold: number;
    wood: number;
    oil: number;
  };
  source: string;
}

export interface WargusEngineSettings {
  buildingCapture: boolean;
  clickMissileId: string | null;
  damageMissileId: string | null;
  sourceDamageMissileId: string | null;
  defaultIncomes: number[];
  defaultResourceActions: string[];
  defaultResourceAmounts: Record<string, number>;
  defaultResourceMaxAmounts: number[];
  defaultResourceNames: string[];
  deselectInMineDefault: boolean;
  doubleClickDelayMsDefault: number;
  enhancedEffectsDefault: boolean;
  effectsEnabledDefault: boolean;
  effectsVolumeDefault: number;
  enableKeyboardScrollingDefault: boolean;
  enableMouseScrollingDefault: boolean;
  fastForwardCycleDefault: number;
  frameSkipDefault: number;
  formationMovementDefault: boolean;
  bigScreenDefault: boolean;
  grayscaleIconsDefault: boolean;
  allyDepositsAllowedDefault: boolean;
  aiChecksDependenciesDefault: boolean;
  aiExploresDefault: boolean;
  insideDefault: boolean;
  fogOfWarBilinear: boolean;
  fogOfWarBlur: WargusFogOfWarBlur;
  fogOfWarEasingSteps: number;
  fogOfWarEnabled: boolean;
  fogOfWarGraphics: string | null;
  fogOfWarOpacityLevels: [number, number, number];
  fogOfWarType: string | null;
  fieldOfViewType: string | null;
  opaqueTerrainTypes: string[];
  forestRegenerationSeconds: number;
  globalBuildingLimit: number;
  globalTotalUnitLimit: number;
  globalUnitLimit: number;
  gameName: string | null;
  fullGameName: string | null;
  gameVersion: string | null;
  gameHomepage: string | null;
  gameCopyright: string | null;
  gameLicense: string | null;
  menuRace: string | null;
  defaultRace: string | null;
  grabMouseDefault: boolean;
  groupKeysDefault: string;
  hardwareCursorDefault: boolean;
  highlightPassabilityDefault: boolean;
  holdClickDelayMsDefault: number;
  iconsShiftDefault: boolean;
  keepRatioDefault: boolean;
  keyScrollSpeedDefault: number;
  lastDifficultyDefault: number;
  leaveStopScrollingDefault: boolean;
  maxSelectable: number;
  mapGridDefault: boolean;
  minimapFogOfWarOpacityLevels: [number, number, number];
  minimapWithTerrainDefault: boolean;
  mineNotificationsDefault: boolean;
  musicEnabledDefault: boolean;
  musicVolumeDefault: number;
  networkGameDefault: boolean;
  debugFlagsDefault: string[];
  mouseScrollSpeedControlDefault: number;
  mouseScrollSpeedDefault: number;
  mouseScrollSpeedPressedDefault: number;
  scrollMargins: WargusScrollMargins | null;
  pauseOnLeaveDefault: boolean;
  playerNameDefault: string | null;
  defaultPlayerNames: Record<string, string[]>;
  raceNames: WargusRaceName[];
  raceUnitEquivalents: Partial<Record<"human" | "orc", Record<string, string>>>;
  playerColorIndex: { start: number; count: number } | null;
  playerColors: WargusPlayerColor[];
  completedBarColorRgb: [number, number, number] | null;
  completedBarShadow: boolean | null;
  autoCastBorderColorRgb: [number, number, number] | null;
  autosaveMinutesDefault: number;
  buttonStyles: Record<string, WargusButtonStyle>;
  uiFontColors: Partial<Record<"human" | "orc", WargusUiFontColors>>;
  buttonPanel: WargusButtonPanelLayout | null;
  infoPanel: WargusInfoPanelLayout | null;
  mapArea: WargusMapAreaLayout | null;
  minimap: WargusMinimapLayout | null;
  statusLine: WargusStatusLineLayout | null;
  messageUi: WargusMessageUiLayout | null;
  menuButtons: Partial<Record<"human" | "orc", WargusMenuButtonGroup>>;
  briefingLayout: WargusBriefingLayout | null;
  revealMapMode: "hidden" | "known" | "explored";
  revealAttacker: boolean;
  revelationType: "no-revelation" | "buildings-only" | "all-units" | string | null;
  rightButtonAction: "move" | "attack";
  extensionsEnabled: boolean;
  resourceUiLabels: string[];
  resourceUiSlots: WargusResourceUiSlot[];
  selectionStyleDefault: string;
  selectionRectangleIndicatesDamageDefault: boolean;
  sourceGameSpeedDefault: number;
  showButtonPopupsDefault: boolean;
  showCommandKeyDefault: boolean;
  showDamageDefault: boolean;
  showMessagesDefault: boolean;
  showNameDelayTicksDefault: number;
  showNameTimeTicksDefault: number;
  showNoSelectionStatsDefault: boolean;
  noStatusLineTooltipsDefault: boolean;
  showOrdersDefault: boolean;
  showSightRangeDefault: boolean;
  showAttackRangeDefault: boolean;
  showReactionRangeDefault: boolean;
  showTipsDefault: boolean;
  simplifiedAutoTargetingDefault: boolean;
  speedFactors: WargusSpeedFactors;
  stereoSoundDefault: boolean;
  tipNumberDefault: number;
  trainingQueue: boolean;
  useFancyBuildingsDefault: boolean;
  videoFullScreenDefault: boolean;
  videoHeightDefault: number;
  videoShaderDefault: string;
  videoWidthDefault: number;
  viewportModeDefault: number;
}

export interface WargusRaceName {
  name: string;
  display: string;
  visible: boolean;
}

export interface WargusResourceUiSlot {
  key: string;
  resource: string;
  graphic: string;
  frame: number;
  frameWidth: number;
  frameHeight: number;
  iconX: number;
  iconY: number;
  textX: number;
  textY: number;
  hidden: boolean;
  source: string;
}

export interface WargusScrollMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WargusFogOfWarBlur {
  simpleRadius: number;
  bilinearRadius: number;
  iterations: number;
}

export interface WargusPlayerColor {
  name: string;
  shades: Array<[number, number, number]>;
}

export interface WargusUiFontColors {
  normal: string | null;
  reverse: string | null;
}

export interface WargusButtonStyle {
  id: string;
  race: "human" | "orc" | null;
  size: [number, number];
  font: string;
  textNormalColor: string | null;
  textReverseColor: string | null;
  textAlign: string | null;
  textPos: [number, number];
  defaultFile: string | null;
  defaultSize: [number, number] | null;
  defaultFrame: number | null;
  clickedFile: string | null;
  clickedSize: [number, number] | null;
  clickedFrame: number | null;
}

export interface WargusButtonPanelLayout {
  x: number;
  y: number;
  slots: WargusButtonPanelSlot[];
}

export interface WargusButtonPanelSlot {
  slot: number;
  x: number;
  y: number;
}

export interface WargusInfoPanelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  singleSelected: WargusPanelButtonSlot | null;
  selectedSlots: WargusPanelButtonSlot[];
  maxSelectedText: { x: number; y: number; font: string } | null;
  singleTraining: WargusPanelButtonSlot | null;
  trainingSlots: WargusPanelButtonSlot[];
  upgrading: WargusPanelButtonSlot | null;
  researching: WargusPanelButtonSlot | null;
  transportingSlots: WargusPanelButtonSlot[];
}

export interface WargusMapAreaLayout {
  x: number;
  y: number;
  rightMargin: number;
  bottomMargin: number;
  baseWidth: number;
  baseHeight: number;
}

export interface WargusMinimapLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WargusPanelButtonSlot {
  slot: number;
  x: number;
  y: number;
}

export interface WargusStatusLineLayout {
  textX: number;
  textYFromBottom: number;
  widthLeft: number;
  widthRightMargin: number;
  font: string;
}

export interface WargusMessageUiLayout {
  font: string;
  scrollSpeed: number;
}

export interface WargusMenuButtonLayout {
  x: number;
  y: number;
  text: string;
  style: string;
  callback: "game-menu" | "editor-menu" | "diplomacy-menu" | string | null;
}

export interface WargusMenuButtonGroup {
  menu: WargusMenuButtonLayout | null;
  networkMenu: WargusMenuButtonLayout | null;
  networkDiplomacy: WargusMenuButtonLayout | null;
}

export interface WargusBriefingLayout {
  baseWidth: number;
  baseHeight: number;
  titleX: number;
  titleY: number;
  textX: number;
  textY: number;
  textWidth: number;
  objectivesX: number;
  objectivesY: number;
  objectivesWidth: number;
  continueButtonX: number;
  continueButtonY: number;
  exitButtonOffsetX: number;
  characterXOffsetFromRight: number;
  characterY: number;
}

export interface WargusPanelContents {
  ident: string;
  x: number;
  y: number;
  defaultFont: string | null;
  conditions: Record<string, string | boolean>;
  items: WargusPanelContentItem[];
  source: string;
}

export interface WargusPanelContentItem {
  x: number;
  y: number;
  kind: string;
  variable: string | null;
  variable1: string | null;
  variable2: string | null;
  label: string | null;
  format: string | null;
  width: number | null;
  height: number | null;
  conditions: Record<string, string | boolean>;
}

export interface WargusDecoration {
  index: string;
  hideNeutral: boolean;
  showOpponent: boolean;
  showWhenNull: boolean;
  showWhenMax: boolean;
  centerX: boolean;
  offset: [number, number] | null;
  offsetPercent: [number, number] | null;
  method: "sprite" | "static-sprite" | string;
  sprite: string | null;
  frame: number | null;
  source: string;
}

export interface WargusSpeedFactors {
  build: number;
  train: number;
  upgrade: number;
  research: number;
  resourceHarvest: Record<string, number>;
  resourceReturn: Record<string, number>;
}

export interface WargusCampaign {
  id: string;
  title: string;
  race: string | null;
  path: string;
  missions: WargusCampaignMission[];
}

export interface WargusCampaignMission {
  index: number;
  title: string;
  mapPath: string;
  setupPath: string | null;
}

export interface WargusMap {
  path: string;
  setupPath: string | null;
  setupJson?: string;
  title: string;
  players: number;
  width: number;
  height: number;
  tileset: number;
  highgroundsEnabled?: boolean;
  objectives?: string[];
  briefingText?: string | null;
  briefingVoiceFiles?: string[];
  victoryRequirements?: WargusVictoryRequirement[];
  victoryRequirementGroups?: WargusVictoryRequirementGroup[];
  defeatRequirements?: WargusDefeatRequirement[];
  timedVictoryTriggers?: WargusTimedVictoryTrigger[];
  locationBuildRequirements?: WargusLocationBuildRequirement[];
  circleOfPowerRequirements?: WargusCircleOfPowerRequirement[];
  rescuedCircleRequirements?: WargusRescuedCircleRequirement[];
  initialUnitHitPointRules?: WargusInitialUnitHitPointRule[];
  playerTypes?: WargusPlayerTypeRule[];
  aiTypeOverrides?: WargusAiTypeRule[];
  diplomacy?: WargusDiplomacyRule[];
  sharedVision?: WargusSharedVisionRule[];
  teams?: WargusMapTeam[];
  allowOverrides?: WargusAllowRule[];
  allowedUnitTypes?: string[];
  allowedUpgradeTypes?: string[];
  aiForcePlans?: WargusAiForcePlan[];
  campaignTitle?: string;
  campaignMissionIndex?: number;
  setup?: WargusMapSetupSummary;
}

export interface WargusMapSetupSummary {
  path: string;
  tileset: string | null;
  highgroundsEnabled?: boolean;
  playerCount: number;
  unitCount: number;
  tileCount: number;
  state?: WargusMapSetupState;
  starts: WargusPlayerStart[];
  tileStats: WargusTileStat[];
  objectives?: string[];
  briefingText?: string | null;
  briefingVoiceFiles?: string[];
  victoryRequirements?: WargusVictoryRequirement[];
  victoryRequirementGroups?: WargusVictoryRequirementGroup[];
  defeatRequirements?: WargusDefeatRequirement[];
  timedVictoryTriggers?: WargusTimedVictoryTrigger[];
  locationBuildRequirements?: WargusLocationBuildRequirement[];
  circleOfPowerRequirements?: WargusCircleOfPowerRequirement[];
  rescuedCircleRequirements?: WargusRescuedCircleRequirement[];
  initialUnitHitPointRules?: WargusInitialUnitHitPointRule[];
  playerTypes?: WargusPlayerTypeRule[];
  aiTypeOverrides?: WargusAiTypeRule[];
  diplomacy?: WargusDiplomacyRule[];
  sharedVision?: WargusSharedVisionRule[];
  allowOverrides?: WargusAllowRule[];
  allowedUnitTypes?: string[];
  allowedUpgradeTypes?: string[];
  aiForcePlans?: WargusAiForcePlan[];
}

export interface WargusMapSetup {
  path: string;
  presentationPath: string;
  title: string;
  objectives: string[];
  briefingText: string | null;
  briefingVoiceFiles: string[];
  victoryRequirements: WargusVictoryRequirement[];
  victoryRequirementGroups: WargusVictoryRequirementGroup[];
  defeatRequirements: WargusDefeatRequirement[];
  timedVictoryTriggers: WargusTimedVictoryTrigger[];
  locationBuildRequirements: WargusLocationBuildRequirement[];
  circleOfPowerRequirements: WargusCircleOfPowerRequirement[];
  rescuedCircleRequirements: WargusRescuedCircleRequirement[];
  initialUnitHitPointRules: WargusInitialUnitHitPointRule[];
  playerTypes: WargusPlayerTypeRule[];
  aiTypeOverrides: WargusAiTypeRule[];
  diplomacy: WargusDiplomacyRule[];
  sharedVision: WargusSharedVisionRule[];
  allowOverrides: WargusAllowRule[];
  allowedUnitTypes: string[];
  allowedUpgradeTypes: string[];
  aiForcePlans: WargusAiForcePlan[];
  width: number;
  height: number;
  highgroundsEnabled: boolean;
  tileset: string | null;
  state?: WargusMapSetupState;
  players: WargusMapPlayer[];
  teams: WargusMapTeam[];
  starts: WargusPlayerStart[];
  units: WargusMapUnit[];
  teleportDestinations: WargusTeleportDestination[];
  tiles: WargusMapTile[];
  tileStats: WargusTileStat[];
}

export interface WargusMapSetupState {
  fogOfWar?: boolean;
  gamePaused?: boolean;
  gameSpeed?: number;
  disableStartingHalls?: boolean;
}

export interface WargusMapPlayer {
  player: number;
  resources: Record<string, number>;
  race: string | null;
  ai: string | null;
  playerType: string | null;
  startView: { x: number; y: number } | null;
}

export interface WargusMapTeam {
  player: number;
  team: number;
  position: number;
}

export interface WargusPlayerStart {
  player: number;
  x: number;
  y: number;
}

export interface WargusMapUnit {
  typeId: string;
  player: number;
  x: number;
  y: number;
  resourcesHeld: number | null;
  hitPoints: number | null;
}

export interface WargusTeleportDestination {
  unitIndex: number;
  destinationIndex: number;
}

export interface WargusMapTile {
  id: number;
  x: number;
  y: number;
  value: number;
}

export interface WargusTileStat {
  id: number;
  count: number;
}

export type WargusVictoryRequirement =
  | { kind: "unit-count"; unitTypeId: string; minimum: number }
  | { kind: "unit-count-exact"; unitTypeId: string; count: number }
  | { kind: "unit-destroyed"; unitTypeId: string; player: number }
  | { kind: "player-defeated"; player: number }
  | { kind: "opponents-defeated" };

export interface WargusVictoryRequirementGroup {
  clauses: WargusVictoryRequirement[];
}

export type WargusSourcePlayer = number | "self";

export type WargusDefeatRequirement =
  | { kind: "player-defeated"; player: WargusSourcePlayer }
  | { kind: "unit-group-destroyed"; unitTypeId: string; players: WargusSourcePlayer[] }
  | { kind: "unit-count-below"; unitTypeId: string; players: WargusSourcePlayer[]; threshold: number };

export interface WargusTimedVictoryTrigger {
  kind: "circle-of-power";
  delayTicks: number;
  soundId: string | null;
}

export interface WargusLocationBuildRequirement {
  clauses: WargusLocationBuildClause[];
}

export interface WargusLocationBuildClause {
  player: WargusSourcePlayer;
  unitTypeId: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minimum: number;
}

export interface WargusCircleOfPowerRequirement {
  unitTypeId: string;
  circleTypeId: string;
  minimum: number;
}

export interface WargusRescuedCircleRequirement {
  unitTypeIds: string[];
  circleTypeId: string;
  minimum: number;
}

export interface WargusInitialUnitHitPointRule {
  player: number;
  unitTypeId: string | null;
  hitPoints: number;
}

export interface WargusPlayerTypeRule {
  player: number;
  playerType: string;
}

export interface WargusAiTypeRule {
  player: number;
  ai: string;
}

export interface WargusDiplomacyRule {
  player: number;
  state: "allied" | "enemy" | "neutral";
  otherPlayer: number;
}

export interface WargusSharedVisionRule {
  player: number;
  enabled: boolean;
  otherPlayer: number;
}

export interface WargusAiForcePlan {
  ai: string;
  attackForceSize: number;
  attackForceIds: number[];
  forceSizes: number[];
  attackWaveSizes: number[];
  attackWaveUnitTargets: Array<Array<{ unitTypeId: string; count: number }>>;
  defendForceSize: number;
  attackDelayTicks: number | null;
  initialAttackDelayTicks: number | null;
  attackUnitTargets: Array<{ unitTypeId: string; count: number }>;
  buildOrder: string[];
  buildDepots: boolean;
  preferredAttackUnitTypes: string[];
  workerTarget: number | null;
  tankerTarget: number | null;
  transportTarget: number | null;
  collectWeights: { gold: number; wood: number; oil: number } | null;
  researchOrder: string[];
}

export interface WargusUnit {
  id: string;
  name: string;
  image: string | null;
  seasonalImages?: Record<string, string>;
  icon: string | null;
  animation: string | null;
  corpseTypeId?: string | null;
  explosionType?: string | null;
  rightMouseAction?: string | null;
  missile?: string | null;
  constructionTypeId?: string | null;
  type: string;
  landUnit?: boolean;
  seaUnit?: boolean;
  airUnit?: boolean;
  sideAttack?: boolean;
  rotationSpeed?: number;
  elevated?: boolean;
  shadow?: number | null;
  woodImprove?: boolean;
  oilImprove?: boolean;
  center?: boolean;
  level?: number;
  builderOutside?: boolean;
  teleporter?: boolean;
  numDirections?: number;
  onReady?: string | null;
  hitPoints: number;
  drawLevel?: number;
  priority?: number;
  points?: number;
  annoyComputerFactor?: number;
  armor: number;
  basicDamage: number;
  piercingDamage: number;
  minAttackRange?: number;
  maxAttackRange: number;
  sightRange?: number;
  computerReactionRange?: number;
  personReactionRange?: number;
  speed?: number;
  supply: number;
  demand: number;
  canAttack: boolean;
  canTargetLand?: boolean;
  canTargetSea?: boolean;
  canTargetAir?: boolean;
  groundAttack?: boolean;
  detectCloak?: boolean;
  coward?: boolean;
  gatherResources?: string[];
  resourceCapacity?: Record<string, number>;
  resourceStep?: Record<string, number>;
  waitAtResource?: Record<string, number>;
  waitAtDepot?: Record<string, number>;
  canCastSpells?: string[];
  storesResources?: string[];
  givesResource?: string | null;
  canHarvest?: boolean;
  building?: boolean;
  mainFacility?: boolean;
  manaEnabled?: boolean;
  manaMax?: number;
  manaInitial?: number;
  manaIncrease?: number;
  selectableByRectangle?: boolean;
  indestructible?: boolean;
  nonSolid?: boolean;
  visibleUnderFog?: boolean;
  permanentCloak?: boolean;
  organic?: boolean;
  isUndead?: boolean;
  hero?: boolean;
  volatile?: boolean;
  randomMovementProbability?: number;
  randomMovementDistance?: number;
  clicksToExplode?: number;
  burnPercent?: number;
  burnDamageRate?: number;
  neutral?: boolean;
  neutralMinimapColor?: [number, number, number] | null;
  shoreBuilding?: boolean;
  buildingRules?: WargusBuildingRule[];
  replaceOnBuild?: boolean;
  replaceOnDie?: boolean;
  maxOnBoard?: number;
  canTransport?: string[];
  autoRepairRange?: number;
  repairRange?: number;
  repairHp?: number;
  repairCosts?: string[];
  improveProduction?: Record<string, number>;
  decayRate?: number;
  revealer?: boolean;
  vanishes?: boolean;
  tileSize: [number, number];
  boxSize?: [number, number];
  costs: string[];
  sounds: Record<string, string>;
  soundsByTileset?: Record<string, Record<string, string>>;
  source?: string;
}

export type WargusBuildingRule =
  | { kind: "distance"; typeId: string; distance: number; distanceType: string }
  | { kind: "ontop"; typeId: string; replaceOnBuild: boolean; replaceOnDie: boolean };

export interface WargusSound {
  id: string;
  files: string[];
  source: string;
  range?: number;
  members?: string[];
}

export interface WargusGameSound {
  event: string;
  race: string;
  soundId: string;
  source?: string;
}

export interface WargusMissile {
  id: string;
  file: string | null;
  size: [number, number] | null;
  frames: number;
  numDirections: number;
  className: string | null;
  sleep: number;
  speed: number;
  blizzardSpeed: number;
  range: number;
  drawLevel: number;
  impactSound: string | null;
  firedSound: string | null;
  impactMissile: string | null;
  splashFactor: number;
  numBounces: number;
  canHitOwner: boolean;
  friendlyFire: boolean;
  damage: WargusMissileDamage | null;
  source?: string;
}

export interface WargusMissileDamage {
  base: number;
  random: number;
  expression: string;
}

export interface WargusConstruction {
  id: string;
  image: string | null;
  seasonalImages?: Record<string, string>;
  size: [number, number] | null;
  stages: WargusConstructionStage[];
  source?: string;
}

export interface WargusConstructionStage {
  percent: number;
  file: "construction" | "main" | string;
  frame: number;
}

export interface WargusBurningBuildingStage {
  percent: number;
  missile: string | null;
  source?: string;
}

export interface WargusAllowRule {
  id: string;
  flags: string;
  source?: string;
}

export interface WargusDependencyRule {
  id: string;
  alternatives: string[][];
  source?: string;
}

export interface WargusPopup {
  id: string;
  race: "human" | "orc" | "any";
  kind: "commands" | "building" | "unit" | "upgrade";
  hasHint: boolean;
  hasDescription: boolean;
  showsCosts: boolean;
  variables: string[];
  actionHints: string[];
  conditionalHints?: Record<string, string[]>;
  extraHints: string[];
  source?: string;
}

export interface WargusButton {
  id: string;
  pos: number;
  level: number;
  alwaysShow: boolean;
  icon: string | null;
  action: string;
  value: string | null;
  allowed: string | null;
  allowArg: string[];
  key: string | null;
  hint: string | null;
  popup: string | null;
  popupKind?: WargusPopup["kind"] | null;
  popupRace?: WargusPopup["race"] | null;
  popupHasHint?: boolean;
  popupHasDescription?: boolean;
  popupShowsCosts?: boolean;
  popupVariables?: string[];
  popupActionHints?: string[];
  popupConditionalHints?: Record<string, string[]>;
  popupExtraHints?: string[];
  forUnit: string[];
  extensionCondition?: boolean | null;
  source?: string;
}

export interface WargusSpell {
  id: string;
  showName: string | null;
  manaCost: number;
  range: number | "infinite" | null;
  autocastRange: number | null;
  aiCastRange: number | null;
  autocastPriority: WargusSpellAutoCastPriority | null;
  aiCastPriority: WargusSpellAutoCastPriority | null;
  autocastPositionCallback: string | null;
  aiCastPositionCallback: string | null;
  autocastHitPointMinPercent: number | null;
  autocastHitPointMaxPercent: number | null;
  aiCastHitPointMinPercent: number | null;
  aiCastHitPointMaxPercent: number | null;
  autocastManaMinPercent: number | null;
  autocastManaMaxPercent: number | null;
  aiCastManaMinPercent: number | null;
  aiCastManaMaxPercent: number | null;
  conditionVariableRules: WargusSpellVariableConditionRule[];
  autocastVariableRules: WargusSpellVariableConditionRule[];
  aiCastVariableRules: WargusSpellVariableConditionRule[];
  target: string | null;
  repeatCast: boolean;
  dependUpgrade: string | null;
  soundWhenCast: string | null;
  actionTypes: string[];
  adjustVitals: WargusSpellAdjustVital[];
  variableAdjustments: WargusSpellVariableAdjustment[];
  areaAdjustVitals: WargusSpellAreaAdjustVital[];
  missileSpawns: WargusSpellMissileSpawn[];
  missileDamages: WargusSpellMissileDamage[];
  captures: WargusSpellCapture[];
  demolishes: WargusSpellDemolish[];
  areaBombardments: WargusSpellAreaBombardment[];
  polymorphs: WargusSpellPolymorph[];
  spawnPortals: WargusSpellSpawnPortal[];
  summons: WargusSpellSummon[];
  callbackUnitVariables: WargusSpellCallbackUnitVariable[];
  missiles: string[];
  conditions: string[];
  autocast: string[];
  aiCast: string[];
  source?: string;
}

export interface WargusSpellAutoCastPriority {
  variable: string;
  reverseSort: boolean;
}

export interface WargusSpellVariableConditionRule {
  variable: string;
  enable: "only" | "false" | "ignore" | null;
  exactValue: number | null;
  exceptValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  minMax: number | null;
  minValuePercent: number | null;
  maxValuePercent: number | null;
  conditionApplyOnCaster: boolean;
}

export interface WargusSpellAdjustVital {
  variable: string;
  amount: number;
}

export interface WargusSpellVariableAdjustment {
  variable: string;
  amount: number;
}

export interface WargusSpellAreaAdjustVital {
  hitPoints: number | null;
  manaPoints: number | null;
  shieldPoints: number | null;
  range: number | null;
  useMana: boolean;
}

export interface WargusSpellMissileDamage {
  missile: string;
  damage: number;
  delay: number | null;
  ttl: number | null;
  startBase: string | null;
  startOffsetX: number | null;
  startOffsetY: number | null;
  endBase: string | null;
  endOffsetX: number | null;
  endOffsetY: number | null;
}

export interface WargusSpellMissileSpawn {
  missile: string;
  damage: number | null;
  delay: number | null;
  ttl: number | null;
  startBase: string | null;
  startOffsetX: number | null;
  startOffsetY: number | null;
  endBase: string | null;
  endOffsetX: number | null;
  endOffsetY: number | null;
}

export interface WargusSpellCapture {
  sacrifice: boolean;
  joinToAiForce: boolean;
  damage: number | null;
  percent: number | null;
}

export interface WargusSpellDemolish {
  range: number | null;
  damage: number | null;
}

export interface WargusSpellAreaBombardment {
  missile: string;
  fields: number | null;
  shards: number | null;
  damage: number | null;
  startOffsetX: number | null;
  startOffsetY: number | null;
}

export interface WargusSpellPolymorph {
  newForm: string;
  playerNeutral: boolean;
}

export interface WargusSpellSpawnPortal {
  unitTypeId: string;
  timeToLive: number | null;
  currentPlayer: boolean;
}

export interface WargusSpellSummon {
  unitTypeId: string;
  timeToLive: number | null;
  requireCorpse: boolean;
}

export interface WargusSpellCallbackUnitVariable {
  callback: string;
  unitTypeId: string | null;
  variable: string;
  value: number;
}

export interface WargusUpgrade {
  id: string;
  icon: string | null;
  costs: {
    time: number;
    gold: number;
    wood: number;
    oil: number;
  };
  modifiers: WargusUpgradeModifier[];
  appliesTo: string[];
  conversions: WargusUpgradeConversion[];
  source?: string;
}

export interface WargusUpgradeModifier {
  stat: "PiercingDamage" | "BasicDamage" | "Armor" | "AttackRange" | "SightRange" | "Level" | "regeneration-rate" | "regeneration-frequency";
  value: number;
}

export interface WargusUpgradeConversion {
  fromTypeId: string;
  toTypeId: string;
}

export interface WargusAnimation {
  id: string;
  source: string;
  actions: Record<string, WargusAnimationFrame[]>;
}

export interface WargusAnimationFrame {
  frame: number;
  wait: number;
}
