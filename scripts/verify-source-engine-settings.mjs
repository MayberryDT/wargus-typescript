import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const source = readFileSync(path.join(manifest.dataRoot, "scripts/stratagus.lua"), "utf8");
const fovSource = readFileSync(path.join(manifest.dataRoot, "scripts/fov.lua"), "utf8");
const guichanSource = readFileSync(path.join(manifest.dataRoot, "scripts/guichan.lua"), "utf8");
const optionsSource = readFileSync(path.join(manifest.dataRoot, "scripts/menus/options.lua"), "utf8");
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const typesSource = readFileSync("src/wargus/types.ts", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const hudSource = readFileSync("src/view/renderHud.ts", "utf8");
const renderWorldSource = readFileSync("src/view/renderWorld.ts", "utf8");
const worldViewAssetsSource = readFileSync("src/view/worldViewAssets.ts", "utf8");
const fogTextureAtlasSource = readFileSync("src/view/fogTextureAtlas.ts", "utf8");
const sourceUiHelperSource = readFileSync("src/view/sourceUiHelpers.ts", "utf8");
const sourceInputSource = readFileSync("src/view/sourceInput.ts", "utf8");
const sourceLifecycleSource = readFileSync("src/view/sourceLifecycle.ts", "utf8");
const mapCommandsSource = readFileSync("src/view/mapCommands.ts", "utf8");
const selectionInputSource = readFileSync("src/view/selectionInput.ts", "utf8");
const eventFeedbackSource = readFileSync("src/view/worldEventFeedback.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const sourceCommandSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/command.cpp", "utf8");
const sourceUnitSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/unit/unit.cpp", "utf8");
const sourceTrainSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_train.cpp", "utf8");
const sourceResearchSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_research.cpp", "utf8");
const sourceUpgradeToSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_upgradeto.cpp", "utf8");
const sourceBuiltSource = readFileSync("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src/src/action/action_built.cpp", "utf8");
const uncommentedSource = source
  .replace(/--\[\[[\s\S]*?\]\]/g, "")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");
const uncommentedFovSource = fovSource
  .replace(/--\[\[[\s\S]*?\]\]/g, "")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");
const uncommentedGuichanSource = guichanSource
  .replace(/--\[\[[\s\S]*?\]\]/g, "")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");
const sourceScripts = (manifest.scripts ?? [])
  .map((script) => readFileSync(path.join(manifest.dataRoot, script), "utf8")
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n"));

const errors = [];
if (!sourceCommandSource.includes("const unsigned int maxOrderCount = 0x7F")) {
  errors.push("Stratagus source no longer exposes the expected 0x7F order queue limit.");
}
for (const fragment of [
  "static void HitUnit_BuildingCapture",
  "EnableBuildingCapture && attacker",
  "target.Type->Building && target.Variable[HP_INDEX].Value <= damage * 3",
  "attacker->IsEnemy(target)",
  "attacker->Type->RepairRange",
  "target.ChangeOwner(*attacker->Player)",
  "CommandStopUnit(*attacker)"
]) {
  if (!sourceUnitSource.includes(fragment)) {
    errors.push(`Stratagus building-capture source missing expected fragment: ${fragment}`);
  }
}
for (const [name, sourceText, fragments] of [
  ["train", sourceTrainSource, ["this->Ticks += std::max(1, player.SpeedTrain / SPEEDUP_FACTOR)", "unit.Wait = CYCLES_PER_SECOND / 6"]],
  ["research", sourceResearchSource, ["player.UpgradeTimers.Upgrades[upgrade.ID] += std::max(1, player.SpeedResearch / SPEEDUP_FACTOR)", "unit.Wait = CYCLES_PER_SECOND / 6"]],
  ["upgrade-to", sourceUpgradeToSource, ["this->Ticks += std::max(1, player.SpeedUpgrade / SPEEDUP_FACTOR)", "unit.Wait = CYCLES_PER_SECOND / 6"]],
  ["built", sourceBuiltSource, ["const int maxProgress = type.Stats[unit.Player->Index].Costs[TimeCost] * 600", "this->ProgressCounter += std::max(1, amount * unit.Player->SpeedBuild / SPEEDUP_FACTOR)"]]
]) {
  for (const fragment of fragments) {
    if (!sourceText.includes(fragment)) {
      errors.push(`Stratagus ${name} timing source missing expected fragment: ${fragment}`);
    }
  }
}
function readCallBody(sourceText, functionName) {
  const start = sourceText.indexOf(`${functionName}(`);
  if (start === -1) {
    return "";
  }
  const openIndex = sourceText.indexOf("(", start);
  let depth = 0;
  for (let index = openIndex; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) {
      return sourceText.slice(openIndex + 1, index);
    }
  }
  return "";
}

function parseByteTupleCall(sourceText, functionName, fallback) {
  const body = readCallBody(sourceText, functionName);
  if (!body) {
    return fallback;
  }
  const parts = body.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return fallback;
  }
  return parts.map((part) => Math.max(0, Math.min(255, Math.round(part))));
}

function parseClampedByteCall(sourceText, functionName, fallback) {
  const body = readCallBody(sourceText, functionName);
  const value = Number(body.trim() || fallback);
  return Number.isFinite(value) ? Math.max(1, Math.min(255, Math.round(value))) : fallback;
}

function parseFogOfWarBlur(sourceText) {
  const body = readCallBody(sourceText, "SetFogOfWarBlur");
  const parts = body.split(",").map((part) => Number(part.trim()));
  const [simpleRadius = 2.0, bilinearRadius = 1.5, iterations = 3] = parts;
  return {
    simpleRadius: Number.isFinite(simpleRadius) && simpleRadius > 0 ? simpleRadius : 2.0,
    bilinearRadius: Number.isFinite(bilinearRadius) && bilinearRadius > 0 ? bilinearRadius : 1.5,
    iterations: Number.isFinite(iterations) && iterations > 0 ? Math.max(1, Math.min(255, Math.round(iterations))) : 3
  };
}

function sourceRevealMapMode(sources) {
  let mode = "hidden";
  for (const sourceText of sources) {
    const next = sourceText.match(/RevealMap\(\s*"([^"]+)"\s*\)/)?.[1];
    if (["hidden", "known", "explored"].includes(next)) {
      mode = next;
    }
  }
  return mode;
}

function parseColorTuple(sourceText) {
  const parts = sourceText.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return parts.map((part) => Math.max(0, Math.min(255, Math.round(part))));
}

function parsePlayerColors(sourceText) {
  const body = readCallBody(sourceText, "DefinePlayerColors");
  const colors = [];
  const pattern = /"([^"]+)"\s*,\s*\{\s*\{([^}]+)\}\s*,\s*\{([^}]+)\}\s*,\s*\{([^}]+)\}\s*,\s*\{([^}]+)\}\s*\}/g;
  for (const match of body.matchAll(pattern)) {
    const shades = match.slice(2).map((shade) => parseColorTuple(shade)).filter(Boolean);
    if (shades.length === 4) {
      colors.push({ name: match[1], shades });
    }
  }
  return colors;
}

function cleanSourceText(text) {
  return text
    .replace(/~!/g, "")
    .replace(/~<([^~>]+)~>/g, "$1")
    .replace(/~/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDefaultPlayerNames(sourceText) {
  const start = sourceText.indexOf("local default_names");
  if (start < 0) {
    return {};
  }
  const end = sourceText.indexOf("for i=0,7 do", start);
  const body = sourceText.slice(start, end > start ? end : undefined);
  const names = {};
  for (const match of body.matchAll(/\["([^"]+)"\]\s*=\s*\{([^}]+)\}/g)) {
    const raceNames = [...match[2].matchAll(/_?\(\s*"([^"]+)"\s*\)|"([^"]+)"/g)]
      .map((nameMatch) => cleanSourceText(nameMatch[1] ?? nameMatch[2] ?? ""))
      .filter(Boolean);
    if (raceNames.length > 0) {
      names[match[1]] = raceNames;
    }
  }
  return names;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseResourceSpeedFactors(sourceText, functionName, fallback) {
  const factors = {};
  const pattern = new RegExp(`${functionName}\\(\\s*"([^"]+)"\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*\\)`, "g");
  for (const match of sourceText.matchAll(pattern)) {
    factors[match[1]] = positiveNumber(match[2]) ?? fallback;
  }
  return factors;
}

function parseSpeedFactors(sourceText) {
  const setSpeeds = positiveNumber(sourceText.match(/SetSpeeds\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? 1;
  return {
    build: positiveNumber(sourceText.match(/SetSpeedBuild\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? setSpeeds,
    train: positiveNumber(sourceText.match(/SetSpeedTrain\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? setSpeeds,
    upgrade: positiveNumber(sourceText.match(/SetSpeedUpgrade\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? setSpeeds,
    research: positiveNumber(sourceText.match(/SetSpeedResearch\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? setSpeeds,
    resourceHarvest: parseResourceSpeedFactors(sourceText, "SetSpeedResourcesHarvest", setSpeeds),
    resourceReturn: parseResourceSpeedFactors(sourceText, "SetSpeedResourcesReturn", setSpeeds)
  };
}

function readPreferenceBool(name, fallback) {
  const match = uncommentedSource.match(new RegExp(`(?<![.\\w])${name}\\s*=\\s*(true|false)`));
  return match ? match[1] === "true" : fallback;
}
function readPreferenceNumber(name, fallback) {
  return Number(uncommentedSource.match(new RegExp(`(?<![.\\w])${name}\\s*=\\s*(\\d+)`))?.[1] ?? fallback);
}
function readPreferenceString(name, fallback) {
  return uncommentedSource.match(new RegExp(`(?<![.\\w])${name}\\s*=\\s*"([^"]*)"`))?.[1] ?? fallback;
}
function readPreferenceTranslatedString(name, fallback) {
  return uncommentedSource.match(new RegExp(`(?<![.\\w])${name}\\s*=\\s*(?:_\\()?\"([^"]*)\"\\)?`))?.[1] ?? fallback;
}
function readPreferenceAssignmentBool(name, fallback) {
  const match = uncommentedSource.match(new RegExp(`Preference\\.${name}\\s*=\\s*(true|false|[01])`));
  if (!match) {
    return fallback;
  }
  return match[1] === "true" || match[1] === "1";
}
function readPreferenceAssignmentNumber(name, fallback) {
  const match = uncommentedSource.match(new RegExp(`Preference\\.${name}\\s*=\\s*(-?\\d+)`));
  const value = Number(match?.[1] ?? fallback);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}
const expectedShowDamageDefault = readPreferenceBool("ShowDamage", false);
const expectedSourceName = uncommentedSource.match(/wargus\.Name\s*=\s*(?:_\()?\"([^"]+)\"/)?.[1] ?? null;

const expected = {
  buildingCapture: uncommentedSource.match(/SetBuildingCapture\(\s*(true|false)\s*\)/)?.[1] === "true",
  clickMissileId: uncommentedSource.match(/SetClickMissile\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
  sourceDamageMissileId: uncommentedSource.match(/SetDamageMissile\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
  damageMissileId: expectedShowDamageDefault ? uncommentedSource.match(/SetDamageMissile\(\s*"([^"]+)"\s*\)/)?.[1] ?? null : null,
  deselectInMineDefault: readPreferenceBool("DeselectInMine", false),
  doubleClickDelayMsDefault: readPreferenceNumber("DoubleClickDelayInMs", 300),
  enhancedEffectsDefault: readPreferenceBool("EnhancedEffects", true),
  effectsEnabledDefault: readPreferenceBool("EffectsEnabled", true),
  effectsVolumeDefault: readPreferenceNumber("EffectsVolume", 128),
  enableKeyboardScrollingDefault: readPreferenceBool("EnableKeyboardScrolling", true),
  enableMouseScrollingDefault: readPreferenceBool("EnableMouseScrolling", true),
  fastForwardCycleDefault: readPreferenceNumber("FastForwardCycle", 0),
  frameSkipDefault: readPreferenceNumber("FrameSkip", 0),
  formationMovementDefault: readPreferenceAssignmentBool("FormationMovement", true),
  bigScreenDefault: readPreferenceAssignmentBool("BigScreen", false),
  grayscaleIconsDefault: readPreferenceBool("GrayscaleIcons", false),
  allyDepositsAllowedDefault: readPreferenceBool("AllyDepositsAllowed", false),
  aiChecksDependenciesDefault: readPreferenceBool("AiChecksDependencies", false),
  aiExploresDefault: readPreferenceBool("AiExplores", true),
  insideDefault: readPreferenceBool("Inside", false),
  fogOfWarBilinear: uncommentedSource.match(/FogOfWarBilinear\s*=\s*(true|false)/)?.[1] === "true",
  fogOfWarBlur: parseFogOfWarBlur(uncommentedSource),
  fogOfWarEasingSteps: parseClampedByteCall(uncommentedSource, "SetFogOfWarEasingSteps", 8),
  fogOfWarEnabled: uncommentedSource.match(/FogOfWar\s*=\s*(true|false)/)?.[1] !== "false",
  fogOfWarGraphics: uncommentedSource.match(/SetFogOfWarGraphics\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
  fogOfWarOpacityLevels: parseByteTupleCall(uncommentedSource, "SetFogOfWarOpacityLevels", [0x7f, 0xbe, 0xfe]),
  fogOfWarType: uncommentedSource.match(/FogOfWarType\s*=\s*"([^"]+)"/)?.[1] ?? null,
  fieldOfViewType: uncommentedFovSource.match(/SetFieldOfViewType\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
  opaqueTerrainTypes: [...readCallBody(uncommentedFovSource, "SetOpaqueFor").matchAll(/"([^"]+)"/g)].map((match) => match[1]),
  globalBuildingLimit: Number(uncommentedSource.match(/SetAllPlayersBuildingLimit\(\s*(\d+)\s*\)/)?.[1] ?? 0),
  globalTotalUnitLimit: Number(uncommentedSource.match(/SetAllPlayersTotalUnitLimit\(\s*(\d+)\s*\)/)?.[1] ?? 0),
  globalUnitLimit: Number(uncommentedSource.match(/SetAllPlayersUnitLimit\(\s*(\d+)\s*\)/)?.[1] ?? 0),
  grabMouseDefault: readPreferenceBool("GrabMouse", false),
  groupKeysDefault: readPreferenceString("GroupKeys", "0123456789`"),
  hardwareCursorDefault: readPreferenceBool("HardwareCursor", false),
  highlightPassabilityDefault: uncommentedSource.match(/SetHighlightPassability\(\s*(true|false)\s*\)/)?.[1] === "true",
  holdClickDelayMsDefault: readPreferenceNumber("HoldClickDelayInMs", 1000),
  iconsShiftDefault: readPreferenceAssignmentBool("IconsShift", true),
  keepRatioDefault: readPreferenceBool("KeepRatio", true),
  keyScrollSpeedDefault: readPreferenceNumber("KeyScrollSpeed", 4),
  lastDifficultyDefault: readPreferenceNumber("LastDifficulty", 2),
  leaveStopScrollingDefault: readPreferenceBool("LeaveStopScrolling", true),
  forestRegenerationSeconds: Number(uncommentedSource.match(/SetForestRegeneration\(\s*(-?\d+)\s*\)/)?.[1] ?? 0),
  fullGameName: uncommentedSource.match(/SetFullGameName\(\s*wargus\.Name\s*\)/) ? expectedSourceName : uncommentedSource.match(/SetFullGameName\(\s*(?:_\()?\"([^"]+)\"/)?.[1] ?? expectedSourceName,
  gameName: uncommentedSource.match(/SetGameName\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
  gameVersion: uncommentedSource.match(/wargus\.Version\s*=\s*"([^"]+)"/)?.[1] ?? null,
  gameHomepage: uncommentedSource.match(/wargus\.Homepage\s*=\s*"([^"]+)"/)?.[1] ?? null,
  gameCopyright: uncommentedSource.match(/wargus\.Copyright\s*=\s*(?:_\()?\"([^"]+)\"/)?.[1] ?? null,
  gameLicense: uncommentedSource.match(/wargus\.Licen[cs]e\s*=\s*"([^"]+)"/)?.[1] ?? null,
  maxSelectable: Number(uncommentedSource.match(/SetMaxSelectable\(\s*(\d+)\s*\)/)?.[1] ?? 0),
  menuRace: uncommentedSource.match(/SetMenuRace\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
  defaultRace: uncommentedSource.match(/function\s+SetDefaultRaceView\(\)[\s\S]*?SetPlayerData\(\s*GetThisPlayer\(\)\s*,\s*"RaceName"\s*,\s*"([^"]+)"\s*\)/)?.[1] ?? null,
  mapGridDefault: readPreferenceBool("MapGrid", false),
  minimapFogOfWarOpacityLevels: parseByteTupleCall(uncommentedSource, "SetMMFogOfWarOpacityLevels", [0x55, 0xaa, 0xff]),
  minimapWithTerrainDefault: readPreferenceBool("MinimapWithTerrain", true),
  mineNotificationsDefault: readPreferenceBool("MineNotifications", true),
  musicEnabledDefault: readPreferenceBool("MusicEnabled", true),
  musicVolumeDefault: readPreferenceNumber("MusicVolume", 128),
  networkGameDefault: false,
  debugFlagsDefault: [],
  mouseScrollSpeedControlDefault: readPreferenceNumber("MouseScrollSpeedControl", 15),
  mouseScrollSpeedDefault: readPreferenceNumber("MouseScrollSpeed", 1),
  mouseScrollSpeedPressedDefault: readPreferenceNumber("MouseScrollSpeedDefault", 4),
  scrollMargins: (() => {
    const match = uncommentedGuichanSource.match(/SetScrollMargins\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
    return match ? { top: Number(match[1]), right: Number(match[2]), bottom: Number(match[3]), left: Number(match[4]) } : null;
  })(),
  pauseOnLeaveDefault: readPreferenceBool("PauseOnLeave", true),
  playerNameDefault: uncommentedSource.match(/PlayerName\s*=\s*"([^"]*)"/)?.[1] ?? null,
  playerColorIndex: (() => {
    const match = uncommentedSource.match(/DefinePlayerColorIndex\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
    return match ? { start: Number(match[1]), count: Number(match[2]) } : null;
  })(),
  playerColors: parsePlayerColors(uncommentedSource),
  defaultPlayerNames: parseDefaultPlayerNames(uncommentedGuichanSource),
  raceNames: manifest.engineSettings?.raceNames ?? [],
  raceUnitEquivalents: manifest.engineSettings?.raceUnitEquivalents ?? {},
  autosaveMinutesDefault: readPreferenceAssignmentNumber("AutosaveMinutes", 5),
  revealAttacker: uncommentedSource.match(/SetRevealAttacker\(\s*(true|false)\s*\)/)?.[1] === "true",
  revealMapMode: sourceRevealMapMode(sourceScripts),
  revelationType: uncommentedSource.match(/SetRevelationType\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
  rightButtonAction: /RightButtonAttacks\(\s*\)/.test(uncommentedSource) ? "attack" : "move",
  extensionsEnabled: uncommentedSource.match(/wargus\.extensions\s*=\s*(true|false)/)?.[1] !== "false",
  selectionStyleDefault: readPreferenceTranslatedString("SelectionStyle", "corners"),
  sourceGameSpeedDefault: Number(uncommentedSource.match(/(?<![.\w])GameSpeed\s*=\s*(\d+)/)?.[1] ?? 0),
  showButtonPopupsDefault: readPreferenceBool("ShowButtonPopups", true),
  showCommandKeyDefault: readPreferenceBool("ShowCommandKey", true),
  showDamageDefault: expectedShowDamageDefault,
  showMessagesDefault: readPreferenceBool("ShowMessages", true),
  noStatusLineTooltipsDefault: readPreferenceAssignmentBool("NoStatusLineTooltips", false),
  showOrdersDefault: readPreferenceBool("ShowOrders", true),
  showSightRangeDefault: readPreferenceAssignmentBool("ShowSightRange", false),
  showAttackRangeDefault: readPreferenceAssignmentBool("ShowAttackRange", false),
  showReactionRangeDefault: readPreferenceAssignmentBool("ShowReactionRange", false),
  showTipsDefault: readPreferenceBool("ShowTips", true),
  simplifiedAutoTargetingDefault: readPreferenceBool("SimplifiedAutoTargeting", true),
  speedFactors: parseSpeedFactors(uncommentedSource),
  stereoSoundDefault: readPreferenceBool("StereoSound", true),
  tipNumberDefault: readPreferenceNumber("TipNumber", 0),
  trainingQueue: uncommentedSource.match(/SetTrainingQueue\(\s*(true|false)\s*\)/)?.[1] !== "false",
  useFancyBuildingsDefault: readPreferenceBool("UseFancyBuildings", false),
  videoFullScreenDefault: readPreferenceBool("VideoFullScreen", false),
  videoHeightDefault: readPreferenceNumber("VideoHeight", 480),
  videoShaderDefault: readPreferenceString("VideoShader", "none"),
  videoWidthDefault: readPreferenceNumber("VideoWidth", 640),
  viewportModeDefault: readPreferenceNumber("ViewportMode", 0)
};

for (const [key, value] of Object.entries(expected)) {
  const actual = manifest.engineSettings?.[key];
  const matches = Array.isArray(value)
    ? JSON.stringify(actual) === JSON.stringify(value)
    : value !== null && typeof value === "object"
      ? JSON.stringify(actual) === JSON.stringify(value)
    : actual === value;
  if (!matches) {
    errors.push(`engineSettings.${key}: expected ${String(value)}, found ${String(manifest.engineSettings?.[key])}`);
  }
}

const fragments = [
  [indexSource, "buildingCapture: uncommented.match(/SetBuildingCapture"],
  [indexSource, "revealAttacker: uncommented.match(/SetRevealAttacker"],
  [indexSource, "revealMapMode"],
  [indexSource, "if (/RevealMap\\(\\s*\"/.test(source)) engineSettings.revealMapMode = parsedEngineSettings.revealMapMode"],
  [indexSource, "revelationType: uncommented.match(/SetRevelationType"],
  [indexSource, "rightButtonAction: /RightButtonAttacks"],
  [indexSource, "if (/RightButton(?:Moves|Attacks)\\(\\s*\\)/.test(source)) engineSettings.rightButtonAction = parsedEngineSettings.rightButtonAction"],
  [indexSource, "extensionCondition: sourceExtensionConditionAt(uncommented, start)"],
  [indexSource, "function sourceExtensionConditionAt"],
  [indexSource, "engineSettings.extensionsEnabled = parsedEngineSettings.extensionsEnabled"],
  [indexSource, "trainingQueue: uncommented.match(/SetTrainingQueue"],
  [indexSource, "useFancyBuildingsDefault: readPreferenceBool(\"UseFancyBuildings\", false)"],
  [indexSource, "maxSelectable: Number(uncommented.match(/SetMaxSelectable"],
  [indexSource, "globalUnitLimit: Number(uncommented.match(/SetAllPlayersUnitLimit"],
  [indexSource, "globalBuildingLimit: Number(uncommented.match(/SetAllPlayersBuildingLimit"],
  [indexSource, "globalTotalUnitLimit: Number(uncommented.match(/SetAllPlayersTotalUnitLimit"],
  [indexSource, "forestRegenerationSeconds: Number(uncommented.match(/SetForestRegeneration"],
  [indexSource, "gameName: uncommented.match(/SetGameName"],
  [indexSource, "SetFullGameName"],
  [indexSource, "menuRace: uncommented.match(/SetMenuRace"],
  [indexSource, "defaultRace: uncommented.match(/function\\s+SetDefaultRaceView"],
  [indexSource, "fogOfWarOpacityLevels: parseByteTupleCall(uncommented, \"SetFogOfWarOpacityLevels\""],
  [indexSource, "fogOfWarBlur: parseFogOfWarBlur()"],
  [indexSource, "if (/SetFogOfWarBlur\\(/.test(source)) engineSettings.fogOfWarBlur = parsedEngineSettings.fogOfWarBlur"],
  [indexSource, "fogOfWarEasingSteps: clampByte(uncommented.match(/SetFogOfWarEasingSteps"],
  [indexSource, "minimapFogOfWarOpacityLevels: parseByteTupleCall(uncommented, \"SetMMFogOfWarOpacityLevels\""],
  [indexSource, "fogOfWarGraphics: uncommented.match(/SetFogOfWarGraphics"],
  [indexSource, "fogOfWarType: uncommented.match(/FogOfWarType"],
  [indexSource, "fogOfWarBilinear: uncommented.match(/FogOfWarBilinear"],
  [indexSource, "fieldOfViewType: uncommented.match(/SetFieldOfViewType"],
  [indexSource, "opaqueTerrainTypes: parseDefaultStringList(uncommented, \"SetOpaqueFor\")"],
  [indexSource, "function parsePlayerColors"],
  [indexSource, "function parsePlayerColorIndex"],
  [indexSource, "function parseDefaultPlayerNames"],
  [indexSource, "playerColors: parsePlayerColors(uncommented)"],
  [indexSource, "playerColorIndex: parsePlayerColorIndex(uncommented)"],
  [indexSource, "defaultPlayerNames: parseDefaultPlayerNames(uncommented)"],
  [indexSource, "function parseRaceNames"],
  [indexSource, "raceNames: sourceRaceNames"],
  [indexSource, "raceUnitEquivalents: sourceRaceUnitEquivalents"],
  [indexSource, "function parseSpeedFactors"],
  [indexSource, "speedFactors: parseSpeedFactors(uncommented)"],
  [indexSource, "const sourceDamageMissileId = uncommented.match(/SetDamageMissile"],
  [indexSource, "const damageMissileId = showDamageDefault ? sourceDamageMissileId : null"],
  [indexSource, "sourceDamageMissileId,"],
  [indexSource, "const readPreferenceBool = (name, fallback)"],
  [indexSource, "const readPreferenceNumber = (name, fallback)"],
  [indexSource, "const readPreferenceString = (name, fallback)"],
  [indexSource, "const readPreferenceTranslatedString = (name, fallback)"],
  [indexSource, "deselectInMineDefault: readPreferenceBool(\"DeselectInMine\", false)"],
  [indexSource, "doubleClickDelayMsDefault: readPreferenceNumber(\"DoubleClickDelayInMs\", 300)"],
  [indexSource, "enhancedEffectsDefault: readPreferenceBool(\"EnhancedEffects\", true)"],
  [indexSource, "effectsEnabledDefault: readPreferenceBool(\"EffectsEnabled\", true)"],
  [indexSource, "effectsVolumeDefault: readPreferenceNumber(\"EffectsVolume\", 128)"],
  [indexSource, "enableKeyboardScrollingDefault: readPreferenceBool(\"EnableKeyboardScrolling\", true)"],
  [indexSource, "enableMouseScrollingDefault: readPreferenceBool(\"EnableMouseScrolling\", true)"],
  [indexSource, "fastForwardCycleDefault: readPreferenceNumber(\"FastForwardCycle\", 0)"],
  [indexSource, "frameSkipDefault: readPreferenceNumber(\"FrameSkip\", 0)"],
  [indexSource, "formationMovementDefault: readPreferenceAssignmentBool(\"FormationMovement\", true)"],
  [indexSource, "bigScreenDefault: readPreferenceAssignmentBool(\"BigScreen\", false)"],
  [indexSource, "grayscaleIconsDefault: readPreferenceBool(\"GrayscaleIcons\", false)"],
  [indexSource, "allyDepositsAllowedDefault: readPreferenceBool(\"AllyDepositsAllowed\", false)"],
  [indexSource, "aiChecksDependenciesDefault: readPreferenceBool(\"AiChecksDependencies\", false)"],
  [indexSource, "aiExploresDefault: readPreferenceBool(\"AiExplores\", true)"],
  [indexSource, "insideDefault: readPreferenceBool(\"Inside\", false)"],
  [indexSource, "musicEnabledDefault: readPreferenceBool(\"MusicEnabled\", true)"],
  [indexSource, "musicVolumeDefault: readPreferenceNumber(\"MusicVolume\", 128)"],
  [indexSource, "networkGameDefault: false"],
  [indexSource, "debugFlagsDefault: uncommented.match(/IsDebugEnabled\\s*=\\s*true/) ? [\"debug\"] : []"],
  [indexSource, "holdClickDelayMsDefault: readPreferenceNumber(\"HoldClickDelayInMs\", 1000)"],
  [indexSource, "iconsShiftDefault: readPreferenceAssignmentBool(\"IconsShift\", true)"],
  [indexSource, "keyScrollSpeedDefault: readPreferenceNumber(\"KeyScrollSpeed\", 4)"],
  [indexSource, "leaveStopScrollingDefault: readPreferenceBool(\"LeaveStopScrolling\", true)"],
  [indexSource, "mouseScrollSpeedControlDefault: readPreferenceNumber(\"MouseScrollSpeedControl\", 15)"],
  [indexSource, "mouseScrollSpeedDefault: readPreferenceNumber(\"MouseScrollSpeed\", 1)"],
  [indexSource, "mouseScrollSpeedPressedDefault: readPreferenceNumber(\"MouseScrollSpeedDefault\", 4)"],
  [indexSource, "function parseScrollMargins(source)"],
  [indexSource, "scrollMargins: parseScrollMargins(uncommented)"],
  [indexSource, "scriptFile === \"scripts/guichan.lua\" || !engineSettings.scrollMargins"],
  [indexSource, "mapGridDefault: readPreferenceBool(\"MapGrid\", false)"],
  [indexSource, "minimapWithTerrainDefault: readPreferenceBool(\"MinimapWithTerrain\", true)"],
  [indexSource, "mineNotificationsDefault: readPreferenceBool(\"MineNotifications\", true)"],
  [indexSource, "pauseOnLeaveDefault = readPreferenceBool(\"PauseOnLeave\", true)"],
  [indexSource, "selectionStyleDefault: readPreferenceTranslatedString(\"SelectionStyle\", \"corners\")"],
  [indexSource, "groupKeysDefault: readPreferenceString(\"GroupKeys\", \"0123456789`\")"],
  [indexSource, "grabMouseDefault: readPreferenceBool(\"GrabMouse\", false)"],
  [indexSource, "hardwareCursorDefault: readPreferenceBool(\"HardwareCursor\", false)"],
  [indexSource, "highlightPassabilityDefault: uncommented.match(/SetHighlightPassability"],
  [indexSource, "autosaveMinutesDefault: readPreferenceAssignmentNumber(\"AutosaveMinutes\", 5)"],
  [indexSource, "keepRatioDefault: readPreferenceBool(\"KeepRatio\", true)"],
  [indexSource, "lastDifficultyDefault: readPreferenceNumber(\"LastDifficulty\", 2)"],
  [indexSource, "showButtonPopupsDefault = readPreferenceBool(\"ShowButtonPopups\", true)"],
  [indexSource, "showCommandKeyDefault = readPreferenceBool(\"ShowCommandKey\", true)"],
  [indexSource, "showDamageDefault = readPreferenceBool(\"ShowDamage\", false)"],
  [indexSource, "showMessagesDefault = readPreferenceBool(\"ShowMessages\", true)"],
  [indexSource, "noStatusLineTooltipsDefault: readPreferenceAssignmentBool(\"NoStatusLineTooltips\", false)"],
  [indexSource, "showOrdersDefault = readPreferenceBool(\"ShowOrders\", true)"],
  [indexSource, "readPreferenceAssignmentBool(\"ShowSightRange\", false)"],
  [indexSource, "readPreferenceAssignmentBool(\"ShowAttackRange\", false)"],
  [indexSource, "readPreferenceAssignmentBool(\"ShowReactionRange\", false)"],
  [indexSource, "showTipsDefault = readPreferenceBool(\"ShowTips\", true)"],
  [indexSource, "simplifiedAutoTargetingDefault: readPreferenceBool(\"SimplifiedAutoTargeting\", true)"],
  [indexSource, "stereoSoundDefault: readPreferenceBool(\"StereoSound\", true)"],
  [indexSource, "tipNumberDefault: readPreferenceNumber(\"TipNumber\", 0)"],
  [indexSource, "videoFullScreenDefault: readPreferenceBool(\"VideoFullScreen\", false)"],
  [indexSource, "const videoHeightDefault = readPreferenceNumber(\"VideoHeight\", 480)"],
  [indexSource, "const videoSize = sourceVideoSize(videoWidthDefault, videoHeightDefault)"],
  [indexSource, "videoHeightDefault,"],
  [indexSource, "videoShaderDefault: readPreferenceString(\"VideoShader\", \"none\")"],
  [indexSource, "const videoWidthDefault = readPreferenceNumber(\"VideoWidth\", 640)"],
  [indexSource, "videoWidthDefault,"],
  [indexSource, "viewportModeDefault: readPreferenceNumber(\"ViewportMode\", 0)"],
  [indexSource, "sourceGameSpeedDefault: Number(uncommented.match(/(?<![.\\w])GameSpeed"],
  [typesSource, "export interface WargusEngineSettings"],
  [typesSource, "deselectInMineDefault: boolean"],
  [typesSource, "doubleClickDelayMsDefault: number"],
  [typesSource, "enhancedEffectsDefault: boolean"],
  [typesSource, "effectsEnabledDefault: boolean"],
  [typesSource, "effectsVolumeDefault: number"],
  [typesSource, "enableKeyboardScrollingDefault: boolean"],
  [typesSource, "enableMouseScrollingDefault: boolean"],
  [typesSource, "fastForwardCycleDefault: number"],
  [typesSource, "frameSkipDefault: number"],
  [typesSource, "formationMovementDefault: boolean"],
  [typesSource, "bigScreenDefault: boolean"],
  [typesSource, "grayscaleIconsDefault: boolean"],
  [typesSource, "allyDepositsAllowedDefault: boolean"],
  [typesSource, "aiChecksDependenciesDefault: boolean"],
  [typesSource, "aiExploresDefault: boolean"],
  [typesSource, "insideDefault: boolean"],
  [typesSource, "iconsShiftDefault: boolean"],
  [typesSource, "forestRegenerationSeconds: number"],
  [typesSource, "gameName: string | null"],
  [typesSource, "fullGameName: string | null"],
  [typesSource, "gameVersion: string | null"],
  [typesSource, "gameHomepage: string | null"],
  [typesSource, "gameCopyright: string | null"],
  [typesSource, "gameLicense: string | null"],
  [typesSource, "menuRace: string | null"],
  [typesSource, "defaultRace: string | null"],
  [typesSource, "fogOfWarBlur: WargusFogOfWarBlur"],
  [typesSource, "fogOfWarEasingSteps: number"],
  [typesSource, "fogOfWarOpacityLevels: [number, number, number]"],
  [typesSource, "minimapFogOfWarOpacityLevels: [number, number, number]"],
  [typesSource, "minimapWithTerrainDefault: boolean"],
  [typesSource, "mineNotificationsDefault: boolean"],
  [typesSource, "musicEnabledDefault: boolean"],
  [typesSource, "musicVolumeDefault: number"],
  [typesSource, "networkGameDefault: boolean"],
  [typesSource, "debugFlagsDefault: string[]"],
  [typesSource, "mouseScrollSpeedControlDefault: number"],
  [typesSource, "mouseScrollSpeedDefault: number"],
  [typesSource, "mouseScrollSpeedPressedDefault: number"],
  [typesSource, "scrollMargins: WargusScrollMargins | null"],
  [typesSource, "export interface WargusScrollMargins"],
  [typesSource, "mapGridDefault: boolean"],
  [typesSource, "pauseOnLeaveDefault: boolean"],
  [typesSource, "fogOfWarGraphics: string | null"],
  [typesSource, "fogOfWarType: string | null"],
  [typesSource, "fogOfWarBilinear: boolean"],
  [typesSource, "fogOfWarEnabled: boolean"],
  [typesSource, "fieldOfViewType: string | null"],
  [typesSource, "opaqueTerrainTypes: string[]"],
  [typesSource, "playerColorIndex: { start: number; count: number } | null"],
  [typesSource, "playerColors: WargusPlayerColor[]"],
  [typesSource, "defaultPlayerNames: Record<string, string[]>"],
  [typesSource, "raceNames: WargusRaceName[]"],
  [typesSource, "raceUnitEquivalents: Partial<Record<\"human\" | \"orc\", Record<string, string>>>"],
  [typesSource, "selectionStyleDefault: string"],
  [typesSource, "export interface WargusPlayerColor"],
  [typesSource, "speedFactors: WargusSpeedFactors"],
  [typesSource, "showButtonPopupsDefault: boolean"],
  [typesSource, "showCommandKeyDefault: boolean"],
  [typesSource, "showDamageDefault: boolean"],
  [typesSource, "showMessagesDefault: boolean"],
  [typesSource, "noStatusLineTooltipsDefault: boolean"],
  [typesSource, "autosaveMinutesDefault: number"],
  [typesSource, "showOrdersDefault: boolean"],
  [typesSource, "showSightRangeDefault: boolean"],
  [typesSource, "showAttackRangeDefault: boolean"],
  [typesSource, "showReactionRangeDefault: boolean"],
  [typesSource, "showTipsDefault: boolean"],
  [typesSource, "simplifiedAutoTargetingDefault: boolean"],
  [typesSource, "stereoSoundDefault: boolean"],
  [typesSource, "sourceGameSpeedDefault: number"],
  [typesSource, "export interface WargusSpeedFactors"],
  [typesSource, "buildingCapture: boolean"],
  [typesSource, "globalUnitLimit: number"],
  [typesSource, "globalBuildingLimit: number"],
  [typesSource, "globalTotalUnitLimit: number"],
  [typesSource, "grabMouseDefault: boolean"],
  [typesSource, "groupKeysDefault: string"],
  [typesSource, "hardwareCursorDefault: boolean"],
  [typesSource, "highlightPassabilityDefault: boolean"],
  [typesSource, "holdClickDelayMsDefault: number"],
  [typesSource, "keepRatioDefault: boolean"],
  [typesSource, "keyScrollSpeedDefault: number"],
  [typesSource, "lastDifficultyDefault: number"],
  [typesSource, "leaveStopScrollingDefault: boolean"],
  [typesSource, "maxSelectable: number"],
  [typesSource, "revealMapMode: \"hidden\" | \"known\" | \"explored\""],
  [typesSource, "revealAttacker: boolean"],
  [typesSource, "rightButtonAction: \"move\" | \"attack\""],
  [typesSource, "extensionsEnabled: boolean"],
  [typesSource, "playerNameDefault: string | null"],
  [typesSource, "extensionCondition?: boolean | null"],
  [typesSource, "trainingQueue: boolean"],
  [typesSource, "useFancyBuildingsDefault: boolean"],
  [typesSource, "videoWidthDefault: number"],
  [typesSource, "viewportModeDefault: number"],
  [worldSource, "export interface WorldVisibilityReveal"],
  [worldSource, "visibilityReveals: WorldVisibilityReveal[]"],
  [worldSource, "export interface WorldForestRegrowth"],
  [worldSource, "forestRegrowth: WorldForestRegrowth[]"],
  [worldSource, "export interface WorldForestResource"],
  [worldSource, "forestResources: WorldForestResource[]"],
  [worldSource, "export function initialForestResourcesForWorld"],
  [worldSource, "export function defaultForestTileResources"],
  [worldSource, "export function productionQueueLimitForEngine"],
  [worldSource, "return engineSettings.trainingQueue === false ? 1 : 0x7F"],
  [worldSource, "export function maxSelectableForEngine"],
  [worldSource, "export function isUnitInsideResourceSource"],
  [worldSource, "fogOfWarOpacityLevels: [0x7f, 0xbe, 0xfe]"],
  [worldSource, "gameName: \"wc2\""],
  [worldSource, "fullGameName: \"Wargus\""],
  [worldSource, "gameVersion: \"3.3.3\""],
  [sourceUiHelperSource, "sourceGameIdentityLine(world)"],
  [sourceUiHelperSource, "world.engineSettings.gameHomepage"],
  [worldSource, "menuRace: \"orc\""],
  [worldSource, "defaultRace: \"orc\""],
  [worldSource, "playerNameDefault: \"Wargustus\""],
  [worldSource, "defaultPlayerNames:"],
  [worldSource, "raceNames: ["],
  [worldSource, "raceUnitEquivalents: {}"],
  [worldSource, "Nation of Azeroth"],
  [worldSource, "Blackrock Clan"],
  [worldSource, "function sourceDefaultRace"],
  [worldSource, "function sourcePlayerName"],
  [worldSource, "function sourceDefaultPlayerName"],
  [worldSource, "engineSettings.defaultPlayerNames[race]"],
  [worldSource, "const defaultRace = sourceDefaultRace(engineSettings)"],
  [worldSource, "fogOfWarBlur: { simpleRadius: 2.0, bilinearRadius: 1.5, iterations: 3 }"],
  [worldSource, "fogOfWarEasingSteps: 8"],
  [worldSource, "if (!world.engineSettings.fogOfWarEnabled)"],
  [worldSource, "world.visibleTiles.fill(1)"],
  [worldSource, "world.exploredTiles.fill(1)"],
  [worldSource, "x >= 0 && y >= 0 && x < world.map.width * world.tileSize && y < world.map.height * world.tileSize"],
  [worldSource, "fieldOfViewType: \"simple-radial\""],
  [worldSource, "function isSourceFieldOfViewTileVisible"],
  [worldSource, "world.engineSettings.fieldOfViewType !== \"shadow-casting\""],
  [worldSource, "world.engineSettings.opaqueTerrainTypes"],
  [worldSource, "minimapFogOfWarOpacityLevels: [0x55, 0xaa, 0xff]"],
  [worldSource, "playerColorIndex: { start: 208, count: 4 }"],
  [worldSource, "playerColors: ["],
  [worldSource, "deselectInMineDefault: false"],
  [worldSource, "doubleClickDelayMsDefault: 300"],
  [worldSource, "enhancedEffectsDefault: true"],
  [worldSource, "effectsEnabledDefault: true"],
  [worldSource, "effectsVolumeDefault: 128"],
  [worldSource, "enableKeyboardScrollingDefault: true"],
  [worldSource, "enableMouseScrollingDefault: true"],
  [worldSource, "fastForwardCycleDefault: 0"],
  [worldSource, "musicEnabledDefault: true"],
  [worldSource, "musicVolumeDefault: 128"],
  [worldSource, "networkGameDefault: false"],
  [worldSource, "debugFlagsDefault: []"],
  [worldSource, "mouseScrollSpeedControlDefault: 15"],
  [worldSource, "mouseScrollSpeedDefault: 1"],
  [worldSource, "mouseScrollSpeedPressedDefault: 4"],
  [worldSource, "scrollMargins: { top: 15, right: 16, bottom: 16, left: 2 }"],
  [worldSource, "mapGridDefault: false"],
  [worldSource, "minimapWithTerrainDefault: true"],
  [worldSource, "mineNotificationsDefault: true"],
  [worldSource, "pauseOnLeaveDefault: true"],
  [worldSource, "selectionStyleDefault: \"corners\""],
  [worldSource, "groupKeysDefault: \"0123456789`\""],
  [worldSource, "grabMouseDefault: false"],
  [worldSource, "hardwareCursorDefault: false"],
  [worldSource, "highlightPassabilityDefault: false"],
  [worldSource, "holdClickDelayMsDefault: 1000"],
  [worldSource, "keepRatioDefault: true"],
  [worldSource, "keyScrollSpeedDefault: 4"],
  [worldSource, "lastDifficultyDefault: 2"],
  [worldSource, "leaveStopScrollingDefault: true"],
  [worldSource, "sourceGameSpeedDefault: 30"],
  [worldSource, "frameSkipDefault: 0"],
  [worldSource, "formationMovementDefault: true"],
  [worldSource, "bigScreenDefault: false"],
  [worldSource, "grayscaleIconsDefault: false"],
  [worldSource, "allyDepositsAllowedDefault: false"],
  [worldSource, "aiChecksDependenciesDefault: false"],
  [worldSource, "aiExploresDefault: true"],
  [worldSource, "insideDefault: false"],
  [worldSource, "showMessagesDefault: true"],
  [worldSource, "noStatusLineTooltipsDefault: false"],
  [worldSource, "autosaveMinutesDefault: 5"],
  [worldSource, "showTipsDefault: true"],
  [worldSource, "simplifiedAutoTargetingDefault: true"],
  [worldSource, "stereoSoundDefault: true"],
  [worldSource, "tipNumberDefault: 0"],
  [worldSource, "useFancyBuildingsDefault: false"],
  [worldSource, "videoHeightDefault: 480"],
  [worldSource, "videoShaderDefault: \"none\""],
  [worldSource, "sourceTrainDurationSeconds"],
  [worldSource, "sourceBuildDurationSeconds"],
  [worldSource, "sourceUpgradeDurationSeconds"],
  [worldSource, "sourceResearchDurationSeconds"],
  [worldSource, "sourceResourceHarvestDurationSeconds"],
  [worldSource, "sourceResourceReturnDurationSeconds"],
  [worldSource, "speedFactors: WargusSpeedFactors"],
  [worldSource, "function sourceTimedActionDurationSeconds"],
  [worldSource, "return Math.max(0.001, cost / 5 / sourceSpeedFactor(speedFactor))"],
  [worldSource, "function cloneSourceSpeedFactors"],
  [worldSource, "sourceSpeedFactorsForPlayer"],
  [worldSource, "sourceTrainDurationSecondsForPlayer"],
  [worldSource, "sourceBuildDurationSecondsForPlayer"],
  [worldSource, "sourceUpgradeDurationSecondsForPlayer"],
  [worldSource, "sourceResearchDurationSecondsForPlayer"],
  [worldSource, "sourceResourceHarvestDurationSecondsForPlayer"],
  [worldSource, "sourceResourceReturnDurationSecondsForPlayer"],
  [worldSource, "speedFactors: cloneSourceSpeedFactors(speedFactors)"],
  [worldSource, "revelationKnownMainFacilityPlayers: number[]"],
  [worldSource, "revealMapMode: \"hidden\""],
  [worldSource, "function applySourceRevealMapMode"],
  [worldSource, "world.engineSettings.revealMapMode === \"explored\""],
  [worldSource, "export function isWorldTileSourceKnown"],
  [worldSource, "world.engineSettings.revealMapMode !== \"hidden\""],
  [worldSource, "revelationTimers: Array<{ player: number; remainingTicks: number }>"],
  [worldSource, "world.revelationTimers = []"],
  [worldSource, "function sourceRevelationDelayTicks"],
  [worldSource, "return sourceDurationSecondsToTicks(world, 30)"],
  [worldSource, "export function sourceDefaultGameSpeed"],
  [worldSource, "function sourceDurationSecondsToTicks"],
  [worldSource, "return Math.max(1, Math.round(Math.max(0, seconds) * sourceDefaultGameSpeed(world)))"],
  [worldSource, "revealedPlayers: number[]"],
  [worldSource, "rightButtonAction: \"move\""],
  [worldSource, "export function revealAreaToPlayer"],
  [worldSource, "export function updateSourceRevelationState"],
  [worldSource, "export function isPlayerRevealedToPlayer"],
  [worldSource, "export function isRuntimeSourceBuildingUnit"],
  [worldSource, "return unit.kind === \"building\" || unit.speed === 0 || unit.tileWidth > 1 || unit.tileHeight > 1"],
  [worldSource, "function doesUnitProvideRevelationVision"],
  [worldSource, "world.engineSettings.revelationType === \"no-revelation\""],
  [worldSource, "world.engineSettings.revelationType !== \"buildings-only\" || isRuntimeSourceBuildingUnit(unit)"],
  [worldSource, "!isRuntimeSourceBuildingUnit(unit)"],
  [worldSource, "isRuntimeSourceBuildingUnit(unit))"],
  [worldSource, "for (const reveal of world.visibilityReveals"],
  [worldSource, "doesUnitProvideRevelationVision(world, world.visibilityPlayer, unit)"],
  [fogTextureAtlasSource, "world.engineSettings.fogOfWarGraphics"],
  [fogTextureAtlasSource, "Assets.load<Texture>(`/wargus/graphics/${source}`)"],
  [fogTextureAtlasSource, "export function getFogTexture"],
  [worldViewAssetsSource, "loadFogTextureAtlas(world)"],
  [worldViewAssetsSource, "fogAtlas: FogTextureAtlas | null"],
  [mainSource, "fogAtlas: FogTextureAtlas | null"],
  [mainSource, "fogAtlas = assets.fogAtlas"],
  [mainSource, "tileAtlas, fogAtlas"],
  [renderWorldSource, "const sourceTiledFogTable = [0, 11, 10, 2, 13, 6, 14, 3, 12, 15, 4, 1, 8, 9, 7, 0] as const"],
  [renderWorldSource, "fogAtlas: FogTextureAtlas | null"],
  [renderWorldSource, "drawFog(fogLayer, world, viewport, fogAtlas)"],
  [renderWorldSource, "sourceFogTextureFramesForTile(world, x, y)"],
  [renderWorldSource, "isWorldTileSourceKnown(world, tx, ty)"],
  [renderWorldSource, "isWorldTileSourceKnown(world, x, y)"],
  [renderWorldSource, "sprite.alpha = alpha"],
  [renderWorldSource, "graphics.fill({ color: 0x000000, alpha })"],
  [renderWorldSource, "import { Application, BlurFilter"],
  [renderWorldSource, "function applySourceFogBlur"],
  [renderWorldSource, "world.engineSettings.fogOfWarBlur"],
  [renderWorldSource, "world.engineSettings.fogOfWarEasingSteps"],
  [renderWorldSource, "function sourceFogEasingSteps"],
  [ordersSource, "function revealSourceAttacker"],
  [ordersSource, "if (amount <= 0)"],
  [ordersSource, "function addDamageMissileEffect"],
  [ordersSource, "world.engineSettings.damageMissileId"],
  [ordersSource, "world.engineSettings.showDamageDefault"],
  [ordersSource, "kind: \"click-missile\""],
  [ordersSource, "world.engineSettings.buildingCapture"],
  [ordersSource, "function applySourceBuildingCaptureOnDamage"],
  [ordersSource, "function isSourceBuildingCaptureTarget"],
  [ordersSource, "!isSourceBuildingCaptureTarget(target)"],
  [ordersSource, "return isBuildingLike(target);"],
  [ordersSource, "function sourceUnitLimitCounts"],
  [ordersSource, "if (isBuildingLike(unit))"],
  [ordersSource, "target.hitPoints > damage * 3"],
  [ordersSource, "attacker.repairRange <= 0"],
  [ordersSource, "attacker.order = null"],
  [ordersSource, "function isCapturableBySourceRules"],
  [ordersSource, "function stepForestRegrowth"],
  [ordersSource, "function stepSourceRevelationTimers"],
  [ordersSource, "remainingTicks: timer.remainingTicks - 1"],
  [ordersSource, "function scheduleForestRegrowth"],
  [ordersSource, "remainingTicks: sourceDurationSecondsToTicks(world, regenerationSeconds)"],
  [ordersSource, "function sourceDurationSecondsToTicks(world: WorldState, seconds: number): number"],
  [ordersSource, "return Math.max(1, Math.round(Math.max(0, seconds) * sourceDefaultGameSpeed(world)))"],
  [ordersSource, "function isForestRegrowthTileOccupied"],
  [ordersSource, "remaining.push({ ...entry, remainingTicks: sourceDurationSecondsToTicks(world, 1) })"],
  [ordersSource, "unitFootprintHalfSize(unit, world.tileSize)"],
  [ordersSource, "function harvestWoodStep"],
  [ordersSource, "function clearDepletedWoodTile"],
  [ordersSource, "function restoreForestResource"],
  [ordersSource, "world.engineSettings.forestRegenerationSeconds"],
  [ordersSource, "world.engineSettings.revealAttacker"],
  [ordersSource, "revealAreaToPlayer(world, target.player, attacker.x, attacker.y, radiusTiles, sourceOrderRetryTicks(world, 90))"],
  [ordersSource, "productionQueueLimitForEngine(world.engineSettings)"],
  [ordersSource, "function canCreateUnitWithinSourceLimits"],
  [ordersSource, "world.engineSettings.globalUnitLimit"],
  [ordersSource, "world.engineSettings.globalBuildingLimit"],
  [ordersSource, "world.engineSettings.globalTotalUnitLimit"],
  [ordersSource, "world.engineSettings.deselectInMineDefault"],
  [ordersSource, "world.engineSettings.networkGameDefault"],
  [ordersSource, "world.engineSettings.debugFlagsDefault"],
  [ordersSource, "world.engineSettings.simplifiedAutoTargetingDefault"],
  [ordersSource, "function compareAutoTargetCandidates"],
  [ordersSource, "sourceSimplifiedAutoTargetPriority(attacker, right) - sourceSimplifiedAutoTargetPriority(attacker, left)"],
  [ordersSource, "kind: \"unit-entered-resource\""],
  [ordersSource, "sourceTrainDurationSecondsForPlayer(world, building.player"],
  [ordersSource, "active.remainingSeconds = sourceTrainRetryDelaySeconds(world)"],
  [ordersSource, "function sourceTrainRetryDelaySeconds(world: WorldState): number"],
  [ordersSource, "return sourceCyclesToSeconds(world, 5)"],
  [ordersSource, "sourceUpgradeDurationSecondsForPlayer(world, building.player"],
  [ordersSource, "isProducerTransformationFor(world, building, unitDefinition.id)"],
  [ordersSource, "export function isProducerTransformationFor"],
  [ordersSource, "sourceBuildDurationSecondsForPlayer(world, builder.player"],
  [ordersSource, "sourceResearchDurationSecondsForPlayer(world, building.player"],
  [ordersSource, "sourceResourceHarvestDurationSecondsForPlayer(world, unit.player"],
  [ordersSource, "sourceResourceReturnDurationSecondsForPlayer(world, unit.player"],
  [saveSource, "visibilityReveals?: WorldState[\"visibilityReveals\"]"],
  [saveSource, "forestRegrowth?: WorldState[\"forestRegrowth\"]"],
  [saveSource, "forestResources?: WorldState[\"forestResources\"]"],
  [saveSource, "revelationKnownMainFacilityPlayers?: WorldState[\"revelationKnownMainFacilityPlayers\"]"],
  [saveSource, "revealedPlayers?: WorldState[\"revealedPlayers\"]"],
  [saveSource, "visibilityReveals: world.visibilityReveals"],
  [saveSource, "forestRegrowth: world.forestRegrowth"],
  [saveSource, "forestResources: world.forestResources"],
  [saveSource, "revelationKnownMainFacilityPlayers: world.revelationKnownMainFacilityPlayers"],
  [saveSource, "revealedPlayers: world.revealedPlayers"],
  [saveSource, "world.visibilityReveals = normalizeVisibilityReveals"],
  [saveSource, "const sourceRevealTicks = sourceOrderRetryTicksForSave(world, 90)"],
  [saveSource, "Math.min(sourceRevealTicks"],
  [saveSource, "const sourceRevelationTicks = sourceDurationSecondsToTicksForSave(world, 30)"],
  [saveSource, "Math.min(sourceRevelationTicks"],
  [saveSource, "world.forestRegrowth = normalizeForestRegrowth"],
  [saveSource, "function sourceForestRegrowthTicksForSave"],
  [saveSource, "const sourceRegrowthTicks = sourceForestRegrowthTicksForSave(world)"],
  [saveSource, "function sourceDurationSecondsToTicksForSave"],
  [saveSource, "return Math.max(1, Math.round(Math.max(0, seconds) * sourceDefaultGameSpeed(world)))"],
  [saveSource, "world.forestResources = normalizeForestResources"],
  [saveSource, "world.revelationKnownMainFacilityPlayers = normalizePlayerIdArray"],
  [saveSource, "world.revealedPlayers = normalizePlayerIdArray"],
  [saveSource, "name: normalizeNullableString(record.name"],
  [sourceUiHelperSource, "export function sourcePlayerDisplayName"],
  [sourceUiHelperSource, "sourcePlayerDisplayName(player)"],
  [hudSource, "sourcePlayerDisplayName(player)"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "mapCommandPlayerDisplayName"],
  [saveSource, "playerNameDefault: world.engineSettings.playerNameDefault"],
  [saveSource, "world.engineSettings.playerNameDefault = sourcePlayerNameOr"],
  [sourceUiHelperSource, "Player name:"],
  [sourceUiHelperSource, "edit-player-name"],
  [mapCommandsSource, "command === \"edit-player-name\""],
  [mapCommandsSource, "playerNameDefault = nextName"],
  [mapCommandsSource, "function sourcePromptPlayerName"],
  [saveSource, "function normalizeVisibilityReveals"],
  [saveSource, "function normalizeForestRegrowth"],
  [saveSource, "function normalizeForestResources"],
  [saveSource, "productionQueueLimitForEngine(world.engineSettings)"],
  [saveSource, "speedFactors: normalizeSpeedFactors"],
  [saveSource, "function normalizeSpeedFactors"],
  [saveSource, "function normalizeResourceSpeedFactors"],
  [saveSource, "sourceTrainDurationSecondsForPlayer(world, producer.player"],
  [saveSource, "sourceUpgradeDurationSecondsForPlayer(world, producer.player"],
  [saveSource, "isProducerTransformationFor(world, producer, definition.id)"],
  [saveSource, "sourceBuildDurationSecondsForPlayer(world, playerId"],
  [saveSource, "sourceResearchDurationSecondsForPlayer(world, player"],
  [saveSource, "returnSeconds: Math.max(0, Math.min(sourceReturnSeconds, finiteNumberOr(record.returnSeconds, 0)))"],
  [saveSource, "function sourceResourceReturnStepSecondsForSave"],
  [hudSource, "const visibleProductionSlots = Math.max(1, sourceLayout.trainingSlots.length || 6)"],
  [hudSource, "selected.productionQueue.slice(0, visibleProductionSlots)"],
  [hudSource, "world.engineSettings.minimapFogOfWarOpacityLevels"],
  [hudSource, "function sourceMinimapFogAlpha"],
  [hudSource, "isWorldTileSourceKnown(world, x, y)"],
  [hudSource, "fogByteToAlpha(fogLevels[1])"],
  [hudSource, "function minimapTileTouchesVisibleTile"],
  [hudSource, "world.engineSettings.minimapWithTerrainDefault"],
  [hudSource, "world.engineSettings.fogOfWarEnabled"],
  [hudSource, "world.engineSettings.showButtonPopupsDefault"],
  [hudSource, "world.engineSettings.showCommandKeyDefault"],
  [hudSource, "world.engineSettings.iconsShiftDefault"],
  [hudSource, "function sourceIconShiftY"],
  [saveSource, "iconsShiftDefault: world.engineSettings.iconsShiftDefault"],
  [saveSource, "world.engineSettings.iconsShiftDefault = booleanOr"],
  [saveSource, "grayscaleIconsDefault: world.engineSettings.grayscaleIconsDefault"],
  [saveSource, "world.engineSettings.grayscaleIconsDefault = booleanOr"],
  [saveSource, "allyDepositsAllowedDefault: world.engineSettings.allyDepositsAllowedDefault"],
  [saveSource, "world.engineSettings.allyDepositsAllowedDefault = booleanOr"],
  [saveSource, "aiChecksDependenciesDefault: world.engineSettings.aiChecksDependenciesDefault"],
  [saveSource, "world.engineSettings.aiChecksDependenciesDefault = booleanOr"],
  [saveSource, "aiExploresDefault: world.engineSettings.aiExploresDefault"],
  [saveSource, "world.engineSettings.aiExploresDefault = booleanOr"],
  [saveSource, "insideDefault: world.engineSettings.insideDefault"],
  [saveSource, "world.engineSettings.insideDefault = booleanOr"],
  [mapCommandsSource, "toggle-icon-shift"],
  [mapCommandsSource, "iconsShiftDefault = !context.world.engineSettings.iconsShiftDefault"],
  [mapCommandsSource, "toggle-grayscale-icons"],
  [mapCommandsSource, "grayscaleIconsDefault = !context.world.engineSettings.grayscaleIconsDefault"],
  [mapCommandsSource, "toggle-ally-deposits"],
  [mapCommandsSource, "allyDepositsAllowedDefault = !context.world.engineSettings.allyDepositsAllowedDefault"],
  [mapCommandsSource, "toggle-ai-dependencies"],
  [mapCommandsSource, "aiChecksDependenciesDefault = !context.world.engineSettings.aiChecksDependenciesDefault"],
  [mapCommandsSource, "toggle-ai-explores"],
  [mapCommandsSource, "aiExploresDefault = !context.world.engineSettings.aiExploresDefault"],
  [mapCommandsSource, "toggle-inside-mode"],
  [mapCommandsSource, "insideDefault = !context.world.engineSettings.insideDefault"],
  [sourceUiHelperSource, "Icon shift:"],
  [sourceUiHelperSource, "toggle-icon-shift"],
  [sourceUiHelperSource, "Grayscale icons:"],
  [sourceUiHelperSource, "toggle-grayscale-icons"],
  [sourceUiHelperSource, "AI dependencies:"],
  [sourceUiHelperSource, "toggle-ai-dependencies"],
  [sourceUiHelperSource, "AI explores:"],
  [sourceUiHelperSource, "toggle-ai-explores"],
  [sourceUiHelperSource, "Inside mode:"],
  [sourceUiHelperSource, "toggle-inside-mode"],
  [sourceUiHelperSource, "Ally depots:"],
  [sourceUiHelperSource, "toggle-ally-deposits"],
  [saveSource, "groupKeysDefault: world.engineSettings.groupKeysDefault"],
  [saveSource, "world.engineSettings.groupKeysDefault = sourceGroupKeysOr"],
  [sourceUiHelperSource, "Group keys:"],
  [sourceUiHelperSource, "cycle-group-keys"],
  [mapCommandsSource, "cycle-group-keys"],
  [mapCommandsSource, "function nextSourceGroupKeys"],
  [sourceUiHelperSource, "world.engineSettings.groupKeysDefault"],
  [sourceUiHelperSource, "export function controlGroupSummary"],
  [selectionInputSource, "sourceDoubleClickDelayMs(world)"],
  [ordersSource, "world.engineSettings.doubleClickDelayMsDefault"],
  [sourceLifecycleSource, "world?.engineSettings.pauseOnLeaveDefault"],
  [mainSource, "sourcePauseOnLeaveEnabled(world)"],
  [ordersSource, "world.engineSettings.groupKeysDefault"],
  [ordersSource, "input.code === \"Backquote\""],
  [ordersSource, "export function selectionAfterWorldEvent"],
  [ordersSource, "event.kind === \"unit-loaded\""],
  [ordersSource, "event.kind === \"units-unloaded\""],
  [ordersSource, "selectedUnitIds.filter((id) => id !== event.unitId)"],
  [ordersSource, "? [event.transportId]"],
  [ordersSource, "event.unitIds.filter((id) => world.units.some((unit) => unit.id === id))"],
  [eventFeedbackSource, "selectionAfterWorldEvent(world, nextSelectedUnitIds, event)"],
  [ordersSource, "isUnitInsideResourceSource(unit)"],
  [sourceLifecycleSource, "sourceMouseScrollingEnabled(world)"],
  [mainSource, "sourceMouseDragScrollEnabled(world, event.button)"],
  [mainSource, "sourceMouseEdgeScrollScale(world, buttons, controlPressed)"],
  [mainSource, "sourceMouseScrollingEnabled(world)"],
  [sourceUiHelperSource, "export function sourceScrollMargins"],
  [sourceUiHelperSource, "world?.engineSettings.scrollMargins"],
  [readFileSync("src/view/camera.ts", "utf8"), "x <= margins.left"],
  [readFileSync("src/view/camera.ts", "utf8"), "viewport.width - margins.right"],
  [sourceUiHelperSource, "world?.engineSettings.mouseScrollSpeedPressedDefault"],
  [sourceUiHelperSource, "world?.engineSettings.mouseScrollSpeedControlDefault"],
  [sourceUiHelperSource, "export function sourceMouseEdgeScrollScale"],
  [readFileSync("src/view/camera.ts", "utf8"), "edgeSpeedMultiplier"],
  [readFileSync("src/view/camera.ts", "utf8"), "scrollSettings.mouseScrollSpeed * input.edgeSpeedMultiplier"],
  [mainSource, "function applySourceLeaveStopScrolling"],
  [mainSource, "sourceLeaveStopScrollingEnabled(world)"],
  [sourceLifecycleSource, "world?.engineSettings.leaveStopScrollingDefault"],
  [saveSource, "leaveStopScrollingDefault: world.engineSettings.leaveStopScrollingDefault"],
  [saveSource, "world.engineSettings.leaveStopScrollingDefault = booleanOr"],
  [mapCommandsSource, "toggle-leave-stop-scrolling"],
  [mapCommandsSource, "leaveStopScrollingDefault = !context.world.engineSettings.leaveStopScrollingDefault"],
  [sourceUiHelperSource, "Stop scroll on leave:"],
  [sourceUiHelperSource, "toggle-leave-stop-scrolling"],
  [ordersSource, "export function sourceGameSpeedMultiplier"],
  [ordersSource, "world.engineSettings.sourceGameSpeedDefault"],
  [ordersSource, "export { sourceDefaultGameSpeed } from \"./world\""],
  [ordersSource, "sourceGameSpeed / sourceDefaultGameSpeed(world)"],
  [ordersSource, "export function sourceGameSpeedFromMultiplier"],
  [mapCommandsSource, "sourceGameSpeedFromMultiplier(context.world, context.state.gameSpeed)"],
  [mainSource, "sourceGameSpeedFromMultiplier(world, gameSpeed)"],
  [saveSource, "sourceGameSpeedDefault: world.engineSettings.sourceGameSpeedDefault"],
  [saveSource, "world.engineSettings.sourceGameSpeedDefault = sourceGameSpeedOr"],
  [sourceUiHelperSource, "Saved GameSpeed:"],
  [ordersSource, "export function sourceRuntimeGameSpeedMultiplier"],
  [ordersSource, "export function sourceFastForwardMultiplier"],
  [ordersSource, "world.engineSettings.fastForwardCycleDefault"],
  [ordersSource, "cycle / sourceGameSpeed"],
  [saveSource, "fastForwardCycleDefault: world.engineSettings.fastForwardCycleDefault"],
  [saveSource, "world.engineSettings.fastForwardCycleDefault = sourceFastForwardCycleOr"],
  [saveSource, "frameSkipDefault: world.engineSettings.frameSkipDefault"],
  [saveSource, "world.engineSettings.frameSkipDefault = sourceFrameSkipOr"],
  [saveSource, "function sourceFrameSkipOr"],
  [saveSource, "bigScreenDefault: world.engineSettings.bigScreenDefault"],
  [saveSource, "world.engineSettings.bigScreenDefault = booleanOr"],
  [sourceUiHelperSource, "Fast-forward cycle:"],
  [sourceUiHelperSource, "fast-forward-cycle-up"],
  [mapCommandsSource, "fastForwardCycleDefault = steppedSourceFastForwardCycle"],
  [mapCommandsSource, "function steppedSourceFastForwardCycle"],
  [saveSource, "keepRatioDefault: world.engineSettings.keepRatioDefault"],
  [saveSource, "world.engineSettings.keepRatioDefault = booleanOr"],
  [sourceUiHelperSource, "Keep ratio:"],
  [sourceUiHelperSource, "toggle-keep-ratio"],
  [mapCommandsSource, "toggle-keep-ratio"],
  [mapCommandsSource, "keepRatioDefault = !context.world.engineSettings.keepRatioDefault"],
  [ordersSource, "export function issueSourceRightButtonOrder"],
  [ordersSource, "world.engineSettings.rightButtonAction !== \"attack\""],
  [ordersSource, "issueGroupAttackTargetAtOrder(world, unitIds, x, y, playerId)"],
  [saveSource, "rightButtonAction: world.engineSettings.rightButtonAction"],
  [saveSource, "world.engineSettings.rightButtonAction = sourceRightButtonActionOr"],
  [saveSource, "function sourceRightButtonActionOr"],
  [mapCommandsSource, "toggle-right-button-action"],
  [mapCommandsSource, "rightButtonAction === \"attack\" ? \"move\" : \"attack\""],
  [sourceUiHelperSource, "Right button:"],
  [sourceUiHelperSource, "toggle-right-button-action"],
  [ordersSource, "function sourceButtonEnabledForEngine"],
  [ordersSource, "button.extensionCondition === world.engineSettings.extensionsEnabled"],
  [readFileSync("src/view/worldPointerInput.ts", "utf8"), "issueSourceRightButtonOrder(world, selectedUnitIds, x, y, input.shiftKey)"],
  [ordersSource, "export function sourceGameSpeedMultipliers"],
  [ordersSource, "function sourceDefaultGameSpeedOrFallback(world: WorldState | null): number"],
  [ordersSource, "const tickRate = sourceDefaultGameSpeedOrFallback(world)"],
  [ordersSource, "const tickSeconds = sourceFrameSeconds(world)"],
  [ordersSource, "function sourceFrameSeconds(world: WorldState): number"],
  [ordersSource, "return 1 / sourceDefaultGameSpeed(world)"],
  [mainSource, "sourceRuntimeGameSpeedMultiplier"],
  [mainSource, "simulateWorld(world, deltaSeconds * sourceRuntimeGameSpeedMultiplier(world, gameSpeed))"],
  [ordersSource, "for (let sourceSpeed = 15; sourceSpeed <= 75; sourceSpeed += 5)"],
  [ordersSource, "sourceSpeed / tickRate"],
  [sourceInputSource, "export function sourceSpeedKeyAction"],
  [sourceInputSource, "input.code === \"Space\""],
  [sourceInputSource, "input.code === \"BracketLeft\""],
  [sourceInputSource, "input.code === \"BracketRight\""],
  [mainSource, "sourceSpeedKeyAction(event)"],
  [readFileSync("src/view/camera.ts", "utf8"), "world?.engineSettings.enableKeyboardScrollingDefault"],
  [readFileSync("src/view/camera.ts", "utf8"), "world?.engineSettings.enableMouseScrollingDefault"],
  [readFileSync("src/view/camera.ts", "utf8"), "world?.engineSettings.keyScrollSpeedDefault"],
  [readFileSync("src/view/camera.ts", "utf8"), "world?.engineSettings.mouseScrollSpeedDefault"],
  [saveSource, "keyScrollSpeedDefault: world.engineSettings.keyScrollSpeedDefault"],
  [saveSource, "mouseScrollSpeedDefault: world.engineSettings.mouseScrollSpeedDefault"],
  [saveSource, "mouseScrollSpeedPressedDefault: world.engineSettings.mouseScrollSpeedPressedDefault"],
  [saveSource, "mouseScrollSpeedControlDefault: world.engineSettings.mouseScrollSpeedControlDefault"],
  [saveSource, "world.engineSettings.keyScrollSpeedDefault = sourceScrollSpeedOr"],
  [saveSource, "world.engineSettings.mouseScrollSpeedDefault = sourceScrollSpeedOr"],
  [saveSource, "function sourceScrollSpeedOr"],
  [sourceUiHelperSource, "Key scroll speed:"],
  [sourceUiHelperSource, "Mouse edge speed:"],
  [sourceUiHelperSource, "key-scroll-speed-up"],
  [sourceUiHelperSource, "mouse-control-scroll-speed-up"],
  [mapCommandsSource, "keyScrollSpeedDefault = steppedSourceScrollSpeed"],
  [mapCommandsSource, "mouseScrollSpeedControlDefault = steppedSourceScrollSpeed"],
  [mapCommandsSource, "function steppedSourceScrollSpeed"],
  [readFileSync("src/view/camera.ts", "utf8"), "export function createCameraInput"],
  [readFileSync("src/view/camera.ts", "utf8"), "export function resetCameraInput"],
  [readFileSync("src/view/camera.ts", "utf8"), "export function beginCameraDrag"],
  [readFileSync("src/view/camera.ts", "utf8"), "export function dragCameraByPointer"],
  [readFileSync("src/view/camera.ts", "utf8"), "export function updateCameraEdgeScroll"],
  [readFileSync("src/view/camera.ts", "utf8"), "export function resetCameraEdgeScroll"],
  [readFileSync("src/view/sourceCursor.ts", "utf8"), "input.world?.engineSettings.hardwareCursorDefault === false"],
  [readFileSync("src/view/sourceCursor.ts", "utf8"), "export function sourceCursorRenderStateForWorldState"],
  [mainSource, "const cursorLayer = new Container()"],
  [mainSource, "let pointerScreenPosition: { x: number; y: number } | null = null"],
  [sourceUiHelperSource, "world.engineSettings.grabMouseDefault"],
  [sourceUiHelperSource, "world.engineSettings.hardwareCursorDefault"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "grabMouseDefault = !context.world.engineSettings.grabMouseDefault"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "hardwareCursorDefault = !context.world.engineSettings.hardwareCursorDefault"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "videoShaderDefault = nextVideoShader(context.world.engineSettings.videoShaderDefault)"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "function nextVideoShader(shader: string): string"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "command === \"video-size-down\" || command === \"video-size-up\""],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "function nextSourceVideoSize"],
  [readFileSync("src/view/sourceUiHelpers.ts", "utf8"), "sourceVideoShaderLabel(world.engineSettings.videoShaderDefault)"],
  [readFileSync("src/view/sourceUiHelpers.ts", "utf8"), "sourceVideoSizeLabel(world)"],
  [readFileSync("src/view/sourceUiHelpers.ts", "utf8"), "export function sourceVideoSizeLabel"],
  [readFileSync("src/view/sourceUiHelpers.ts", "utf8"), "{ label: \"Shader\", command: \"toggle-video-shader\" }"],
  [readFileSync("src/view/sourceUiHelpers.ts", "utf8"), "{ label: \"Video +\", command: \"video-size-up\" }"],
  [readFileSync("src/view/sourceUiHelpers.ts", "utf8"), "export function sourceVideoShaderLabel(shader: string): string"],
  [readFileSync("src/view/camera.ts", "utf8"), "world?.engineSettings.videoWidthDefault ?? source.baseWidth"],
  [readFileSync("src/view/camera.ts", "utf8"), "world?.engineSettings.videoHeightDefault ?? source.baseHeight"],
  [readFileSync("src/wargus/saveGame.ts", "utf8"), "videoHeightDefault: world.engineSettings.videoHeightDefault"],
  [readFileSync("src/wargus/saveGame.ts", "utf8"), "videoWidthDefault: world.engineSettings.videoWidthDefault"],
  [readFileSync("src/wargus/saveGame.ts", "utf8"), "world.engineSettings.videoHeightDefault = sourceVideoDimensionOr"],
  [readFileSync("src/wargus/saveGame.ts", "utf8"), "world.engineSettings.videoWidthDefault = sourceVideoDimensionOr"],
  [readFileSync("src/wargus/saveGame.ts", "utf8"), "world.engineSettings.grabMouseDefault = booleanOr"],
  [readFileSync("src/wargus/saveGame.ts", "utf8"), "world.engineSettings.hardwareCursorDefault = booleanOr"],
  [readFileSync("src/wargus/saveGame.ts", "utf8"), "world.engineSettings.highlightPassabilityDefault = booleanOr"],
  [optionsSource, "SetHighlightPassability(highlightPassability:isMarked())"],
  [optionsSource, "GetIsPassabilityHighlighted()"],
  [mainSource, "world?.engineSettings.grabMouseDefault"],
  [mainSource, "app.canvas.requestPointerLock()"],
  [mainSource, "syncRuntimePresentationSettingsFromWorld()"],
  [mainSource, "function applySourceVideoShader(shader: string): void"],
  [mainSource, "app.canvas.dataset.wargusVideoShader = normalized"],
  [mainSource, "app.canvas.style.imageRendering = normalized === \"linear\" ? \"auto\" : \"pixelated\""],
  [mainSource, "app.canvas.style.filter = normalized === \"crt\""],
  [mainSource, "function renderSourceSoftwareCursor"],
  [mainSource, "world?.engineSettings.hardwareCursorDefault !== false"],
  [mainSource, "sourceCursorRenderStateForWorldState"],
  [mainSource, "const cameraInput: CameraInput = createCameraInput()"],
  [mainSource, "resetCameraInput(cameraInput)"],
  [mainSource, "sourceScreenPointIsInPlayableViewport(event.clientX, event.clientY)"],
  [mainSource, "beginCameraDrag(cameraInput, event.clientX, event.clientY)"],
  [mainSource, "dragCameraByPointer(camera, cameraInput, event.clientX, event.clientY"],
  [mainSource, "resetCameraEdgeScroll(cameraInput)"],
  [mainSource, "const point = sourceMapAreaLocalScreenPoint(clientX, clientY)"],
  [mainSource, "updateCameraEdgeScroll(cameraInput, point.x, point.y"],
  [readFileSync("src/audio/audioEngine.ts", "utf8"), "manifest.engineSettings?.effectsEnabledDefault"],
  [readFileSync("src/audio/audioEngine.ts", "utf8"), "manifest.engineSettings?.effectsVolumeDefault"],
  [readFileSync("src/audio/audioEngine.ts", "utf8"), "manifest.engineSettings?.musicEnabledDefault"],
  [readFileSync("src/audio/audioEngine.ts", "utf8"), "manifest.engineSettings?.musicVolumeDefault"],
  [readFileSync("src/audio/audioEngine.ts", "utf8"), "manifest.engineSettings?.stereoSoundDefault"],
  [readFileSync("src/audio/audioEngine.ts", "utf8"), "context.createStereoPanner"],
  [readFileSync("src/audio/audioEngine.ts", "utf8"), "sourceVolumeToGain"],
  [hudSource, "world.engineSettings.keepRatioDefault"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.fogOfWarOpacityLevels"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.fogOfWarEnabled"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "function sourceFogOpacityAlphas"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.fogOfWarOpacityLevels[1] ?? 0xbe"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.fogOfWarType === null || world.engineSettings.fogOfWarType === \"fast\""],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.fogOfWarBilinear"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "function exploredTileTouchesVisibleTile"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.showOrdersDefault"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "function drawSourceSelectedRangeMarkers"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.showSightRangeDefault"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.showAttackRangeDefault"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.showReactionRangeDefault"],
  [hudSource, "toggle-show-sight-range"],
  [hudSource, "toggle-show-attack-range"],
  [hudSource, "toggle-show-reaction-range"],
  [hudSource, "toggle-single-player-walls"],
  [hudSource, "toggle-highlight-passability"],
  [sourceUiHelperSource, "sourceDebugFlagEnabled(world, \"single-player-walls\")"],
  [sourceUiHelperSource, "world.engineSettings.highlightPassabilityDefault"],
  [sourceUiHelperSource, "export function sourceDebugFlagEnabled"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "showSightRangeDefault = !context.world.engineSettings.showSightRangeDefault"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "showAttackRangeDefault = !context.world.engineSettings.showAttackRangeDefault"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "showReactionRangeDefault = !context.world.engineSettings.showReactionRangeDefault"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "toggleDebugFlag(context.world, \"single-player-walls\")"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "highlightPassabilityDefault = !context.world.engineSettings.highlightPassabilityDefault"],
  [readFileSync("src/view/mapCommands.ts", "utf8"), "function toggleDebugFlag"],
  [saveSource, "showSightRangeDefault: world.engineSettings.showSightRangeDefault"],
  [saveSource, "showAttackRangeDefault: world.engineSettings.showAttackRangeDefault"],
    [saveSource, "showReactionRangeDefault: world.engineSettings.showReactionRangeDefault"],
    [saveSource, "debugFlagsDefault: world.engineSettings.debugFlagsDefault"],
    [saveSource, "highlightPassabilityDefault: world.engineSettings.highlightPassabilityDefault"],
    [saveSource, "revealMapMode: world.engineSettings.revealMapMode"],
    [saveSource, "world.engineSettings.showSightRangeDefault = booleanOr"],
    [saveSource, "world.engineSettings.showAttackRangeDefault = booleanOr"],
    [saveSource, "world.engineSettings.showReactionRangeDefault = booleanOr"],
    [saveSource, "world.engineSettings.debugFlagsDefault = sourceDebugFlagsOr"],
    [saveSource, "world.engineSettings.revealMapMode = sourceRevealMapModeOr"],
    [saveSource, "const SOURCE_DEBUG_FLAGS = new Set([\"single-player-walls\"])"],
    [saveSource, "function sourceDebugFlagsOr"],
    [saveSource, "function sourceRevealMapModeOr"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.enhancedEffectsDefault !== false"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "isUnitInsideResourceSource(unit)"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "function drawSourceSelectionMarker"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.selectionStyleDefault"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "style === \"corners\""],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "function drawSourceMapGrid"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.mapGridDefault"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "function drawSourcePassabilityOverlay"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.highlightPassabilityDefault"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "isTilePassable(world, x, y, \"land\", undefined, true)"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "sourcePlayerColor(world, unit.player"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "world.engineSettings.useFancyBuildingsDefault"],
  [readFileSync("src/view/renderWorld.ts", "utf8"), "function sourceFancyBuildingMirror"],
  [hudSource, "sourcePlayerColor(world, playerId)"],
  [sourceUiHelperSource, "export function sourcePlayerColor"],
  [sourceUiHelperSource, "world.engineSettings.playerColors"],
  [sourceUiHelperSource, "function sourcePlayerColorShadeCount"],
  [sourceUiHelperSource, "world.engineSettings.playerColorIndex?.count"],
  [ordersSource, "maxSelectableForEngine(world.engineSettings)"],
  [mainSource, "clampSelectionToSourceLimit"],
  [mainSource, "world ? clampSelectionToSourceLimit(world, [unitId]) : [unitId]"],
  [ordersSource, "controlGroups[group] = clampSelectionToSourceLimit(world, assignableIds)"],
  [ordersSource, "controlGroups[Number(group)] = world ? clampSelectionToSourceLimit(world, ids) : ids"],
  [mainSource, "sourceStereoPanForUnit(unit)"],
  [sourceUiHelperSource, "export function sourceStereoPanForUnit"],
  [sourceUiHelperSource, "Math.max(-0.85, Math.min(0.85"]
];

for (const [fileSource, fragment] of fragments) {
  if (!fileSource.includes(fragment)) {
    errors.push(`Missing source engine setting fragment: ${fragment}`);
  }
}

for (const fragment of [
  "costValue(costs, \"time\") / 15",
  "costValue(costs, \"time\") / 20",
  "timeCost / 12",
  "active.remainingSeconds = 0.25"
]) {
  if (worldSource.includes(fragment)) {
    errors.push(`Source timed action duration still uses old browser-local formula: ${fragment}`);
  }
}

if (ordersSource.includes("remainingTicks: Math.max(1, regenerationSeconds * world.tickRate)")) {
  errors.push("Forest regrowth runtime should route source seconds through sourceDurationSecondsToTicks instead of raw world.tickRate multiplication.");
}
if (ordersSource.includes("Math.max(0, seconds) * world.tickRate")
  || saveSource.includes("Math.max(0, seconds) * world.tickRate")
  || worldSource.includes("Math.max(0, seconds) * world.tickRate")) {
  errors.push("Source duration-to-tick conversion should use sourceDefaultGameSpeed instead of raw browser tick-rate math.");
}
if (ordersSource.includes("remaining.push({ ...entry, remainingTicks: Math.max(1, world.tickRate) })")) {
  errors.push("Forest regrowth occupied-tile retry should route source seconds through sourceDurationSecondsToTicks instead of raw world.tickRate.");
}
if (ordersSource.includes("return Math.max(1 / world.tickRate, 5 / world.tickRate)")) {
  errors.push("Training retry delay should use sourceCyclesToSeconds instead of raw browser tick-rate math.");
}
if (ordersSource.includes("sourceGameSpeed / Math.max(1, world.tickRate || 30)")) {
  errors.push("GameSpeed multiplier should use sourceDefaultGameSpeed instead of inline browser tick-rate fallback math.");
}
if (mainSource.includes("world.engineSettings.sourceGameSpeedDefault = Math.max(1, world.tickRate || 30)")) {
  errors.push("Default GameSpeed reset should use sourceDefaultGameSpeed instead of inline browser tick-rate fallback math.");
}
if (ordersSource.includes("Math.max(1, world?.tickRate ?? 30)")) {
  errors.push("Nullable speed menu helpers should use sourceDefaultGameSpeedOrFallback instead of inline browser tick-rate fallback math.");
}
if (ordersSource.includes("const tickSeconds = 1 / world.tickRate")) {
  errors.push("Simulation frame stepping should use sourceFrameSeconds instead of raw browser tick-rate math.");
}
const sourceBuildingCaptureBody = ordersSource.match(/function applySourceBuildingCaptureOnDamage[\s\S]*?\n}\n/)?.[0] ?? "";
if (sourceBuildingCaptureBody.includes('target.kind !== "building"')) {
  errors.push("Damage-time building capture should use source unit Building semantics instead of browser-local kind text.");
}
const sourceUnitLimitCountsBody = ordersSource.match(/function sourceUnitLimitCounts[\s\S]*?\n}\n\nfunction canSourceBuildType/)?.[0] ?? "";
if (sourceUnitLimitCountsBody.includes('unit.kind === "building"')) {
  errors.push("Source unit/building limit counts should use source Building semantics instead of browser-local kind text.");
}
const revelationVisionBody = worldSource.match(/function doesUnitProvideRevelationVision[\s\S]*?\n}\n/)?.[0] ?? "";
if (revelationVisionBody.includes('unit.kind === "building"')) {
  errors.push("Buildings-only revelation should use source Building semantics instead of browser-local kind text.");
}
const lastSeenBody = worldSource.match(/function updateLastSeenBuildings[\s\S]*?\n}\n/)?.[0] ?? "";
if (lastSeenBody.includes('unit.kind !== "building"') || lastSeenBody.includes('unit.kind === "building"')) {
  errors.push("Last-seen building tracking should use source Building semantics instead of browser-local kind text.");
}

const mainForbiddenFragments = [
  "selectedUnitIds = [event.transportId]",
  "selectedUnitIds = event.unitIds.filter((id) => loadedWorld.units.some((unit) => unit.id === id))",
  "selectedUnitIds = selectedUnitIds.filter((id) => id !== event.unitId)"
];

for (const fragment of mainForbiddenFragments) {
  if (mainSource.includes(fragment)) {
    errors.push(`Source event selection should stay in orders.ts, not main.ts: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  console.error(`Source engine setting errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source engine settings verified (${Object.entries(expected).map(([key, value]) => `${key}=${String(value)}`).join(", ")}).`);
