import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import path from "node:path";

const unzip = promisify(gunzip);

const defaultRoot =
  "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus-local/share/games/stratagus/wargus";
const dataRoot = process.env.WARGUS_DATA_ROOT || defaultRoot;
const outDir = path.resolve("public/wargus");
const outFile = path.join(outDir, "manifest.json");
const defaultMapPath = "maps/skirmish/multiplayer/(4)just-land.smp";

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyBrowserAsset(kind, relativePath) {
  const sourcePath = path.join(dataRoot, kind, relativePath);
  const outputPath = path.join(outDir, kind, relativePath);
  if (!(await exists(sourcePath))) {
    return;
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
}

async function walk(dir, root = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute, root)));
    } else if (entry.isFile()) {
      files.push(path.relative(root, absolute).replaceAll(path.sep, "/"));
    }
  }
  return files;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

async function readMaybeGzip(filePath) {
  const bytes = await readFile(filePath);
  if (filePath.endsWith(".gz")) {
    return (await unzip(bytes)).toString("utf8");
  }
  return bytes.toString("utf8");
}

function parsePresentedMap(relativePath, source) {
  const match = source.match(/PresentMap\("([^"]+)",\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*"([^"]+)")?\)/);
  if (!match) {
    return null;
  }

  return {
    path: relativePath,
    setupPath: findSetupPath(relativePath),
    title: match[1],
    players: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
    tileset: Number(match[5]),
    highgroundsEnabled: match[6] === "highgrounds-enabled",
    playerTypes: parsePlayerTypes(source),
    teams: parseMapTeams(source),
    diplomacy: diplomacyRulesFromTeams(parseMapTeams(source))
  };
}

function findSetupPath(presentationPath) {
  const candidates = [];
  if (presentationPath.endsWith(".smp.gz")) {
    candidates.push(presentationPath.replace(/\.smp\.gz$/, ".sms.gz"));
    candidates.push(presentationPath.replace(/\.smp\.gz$/, ".sms"));
  } else if (presentationPath.endsWith(".smp")) {
    candidates.push(presentationPath.replace(/\.smp$/, ".sms"));
    candidates.push(presentationPath.replace(/\.smp$/, ".sms.gz"));
  }
  return candidates.find((candidate) => allFilesSet.has(candidate)) ?? null;
}

function parseMapTeams(source) {
  return [...source.matchAll(/SetMapTeams\((\d+),\s*(\d+),\s*(\d+)\)/g)]
    .map((match) => ({ player: Number(match[1]), team: Number(match[2]), position: Number(match[3]) }));
}

function findBalancedBody(source, openIndex) {
  let depth = 0;
  let bodyEnd = openIndex;
  for (; bodyEnd < source.length; bodyEnd += 1) {
    const char = source[bodyEnd];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      break;
    }
  }
  return source.slice(openIndex + 1, bodyEnd);
}

function findBalancedCallBody(source, openIndex) {
  let depth = 0;
  let bodyEnd = openIndex;
  for (; bodyEnd < source.length; bodyEnd += 1) {
    const char = source[bodyEnd];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) {
      break;
    }
  }
  return source.slice(openIndex + 1, bodyEnd);
}

function parseUnitTypeFiles(source) {
  const files = new Map();
  const pattern = /UnitTypeFiles\["([^"]+)"\]\s*=\s*\{/g;
  let match;
  while ((match = pattern.exec(source))) {
    const id = match[1];
    const openIndex = source.indexOf("{", match.index);
    const body = findBalancedBody(source, openIndex);
    const seasons = {};
    for (const seasonMatch of body.matchAll(/([a-z]+)\s*=\s*"([^"]+)"/g)) {
      seasons[seasonMatch[1]] = seasonMatch[2];
    }
    files.set(id, seasons);
    pattern.lastIndex = openIndex + body.length + 2;
  }
  return files;
}

function usableImagePath(value) {
  return value && value !== "size" ? value : null;
}

function parseUnitDefinitions(source, unitTypeFiles = new Map(), variableDefaults = {}) {
  const units = new Map();
  const marker = 'DefineUnitType("';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }

    const idStart = start + marker.length;
    const idEnd = source.indexOf('"', idStart);
    const id = source.slice(idStart, idEnd);
    const bodyStart = source.indexOf("{", idEnd);
    if (bodyStart === -1) {
      cursor = idEnd;
      continue;
    }

    const body = findBalancedBody(source, bodyStart);

    const name = body.match(/Name\s*=\s*_\("([^"]+)"\)/)?.[1] ?? id;
    const burnPercent = Number(body.match(/BurnPercent\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const burnDamageRate = Number(body.match(/BurnDamageRate\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const directImage = usableImagePath(body.match(/Image\s*=\s*\{"file",\s*"([^"]+)"/)?.[1] ?? null);
    const seasonalImages = unitTypeFiles.get(id) ?? {};
    const image = directImage ?? seasonalImages.summer ?? Object.values(seasonalImages)[0] ?? null;
    const icon = body.match(/Icon\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const animation = body.match(/Animations\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const corpseTypeId = body.match(/Corpse\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const explosionType = body.match(/ExplodeWhenKilled\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const rightMouseAction = body.match(/RightMouseAction\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const missile = body.match(/Missile\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const constructionTypeId = body.match(/Construction\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const type = body.match(/Type\s*=\s*"([^"]+)"/)?.[1] ?? "unknown";
    const landUnit = /LandUnit\s*=\s*true/.test(body);
    const seaUnit = /SeaUnit\s*=\s*true/.test(body);
    const airUnit = /AirUnit\s*=\s*true/.test(body);
    const sideAttack = /SideAttack\s*=\s*true/.test(body);
    const rotationSpeed = Number(body.match(/RotationSpeed\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const elevated = /Elevated\s*=\s*true/.test(body);
    const shadow = parseShadowDefinition(body);
    const woodImprove = /WoodImprove\s*=\s*true/.test(body);
    const oilImprove = /OilImprove\s*=\s*true/.test(body);
    const center = /Center\s*=\s*true/.test(body);
    const level = Number(body.match(/(?:^|[\n,{]\s*)Level\s*=\s*(-?\d+)/m)?.[1] ?? 0);
    const builderOutside = /BuilderOutside\s*=\s*true/.test(body);
    const teleporter = /Teleporter\s*=\s*true/.test(body);
    const numDirections = Number(body.match(/NumDirections\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const onReady = body.match(/OnReady\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? null;
    const hitPoints = Number(body.match(/HitPoints\s*=\s*(\d+)/)?.[1] ?? 0);
    const drawLevel = Number(body.match(/DrawLevel\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const priority = Number(body.match(/Priority\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const points = Number(body.match(/(?:^|[\n,{]\s*)Points\s*=\s*(-?\d+)/m)?.[1] ?? 0);
    const annoyComputerFactor = Number(body.match(/AnnoyComputerFactor\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const armor = Number(body.match(/Armor\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const basicDamage = Number(body.match(/BasicDamage\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const piercingDamage = Number(body.match(/PiercingDamage\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const minAttackRange = Number(body.match(/MinAttackRange\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const maxAttackRange = Number(body.match(/MaxAttackRange\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const sightRange = Number(body.match(/SightRange\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const computerReactionRange = Number(body.match(/ComputerReactionRange\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const personReactionRange = Number(body.match(/PersonReactionRange\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const speed = Number(body.match(/Speed\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const supply = Number(body.match(/Supply\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const demand = Number(body.match(/Demand\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const maxOnBoard = Number(body.match(/MaxOnBoard\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const canTransport = parseCanTransport(body);
    const autoRepairRange = Number(body.match(/AutoRepairRange\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const repairRange = Number(body.match(/(?:^|[,{]\s*)RepairRange\s*=\s*(-?\d+)/m)?.[1] ?? 0);
    const repairHp = Number(body.match(/RepairHp\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const repairCosts = parseCostList(body.match(/RepairCosts\s*=\s*\{([^}]+)\}/)?.[1] ?? "");
    const improveProduction = parseImproveProduction(body);
    const decayRate = Number(body.match(/DecayRate\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const canAttack = /CanAttack\s*=\s*true/.test(body);
    const canTargetLand = /CanTargetLand\s*=\s*true/.test(body);
    const canTargetSea = /CanTargetSea\s*=\s*true/.test(body);
    const canTargetAir = /CanTargetAir\s*=\s*true/.test(body);
    const groundAttack = /GroundAttack\s*=\s*true/.test(body);
    const detectCloak = /DetectCloak\s*=\s*true/.test(body);
    const coward = /Coward\s*=\s*true/.test(body);
    const gatherResources = parseCanGatherResources(body);
    const resourceCapacity = parseResourceCapacity(body);
    const resourceStep = parseResourceNumericField(body, "resource-step");
    const waitAtResource = parseResourceNumericField(body, "wait-at-resource");
    const waitAtDepot = parseResourceNumericField(body, "wait-at-depot");
    const canCastSpells = parseCanCastSpells(body);
    const storesResources = parseCanStoreResources(body);
    const givesResource = body.match(/GivesResource\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const canHarvest = /CanHarvest\s*=\s*true/.test(body);
    const building = /Building\s*=\s*true/.test(body);
    const mainFacility = /MainFacility\s*=\s*true/.test(body);
    const mana = parseManaConfig(body, variableDefaults.mana);
    const selectableByRectangle = !/SelectableByRectangle\s*=\s*false/.test(body);
    const indestructible = /Indestructible\s*=\s*(?:true|1)/.test(body);
    const nonSolid = /NonSolid\s*=\s*true/.test(body);
    const visibleUnderFog = /VisibleUnderFog\s*=\s*true/.test(body);
    const permanentCloak = /PermanentCloak\s*=\s*true/.test(body);
    const organic = /(?:^|[,{])\s*organic\s*=\s*true/m.test(body);
    const isUndead = /(?:^|[,{])\s*isundead\s*=\s*true/m.test(body);
    const hero = /(?:^|[,{])\s*hero\s*=\s*true/m.test(body);
    const volatile = /(?:^|[,{])\s*volatile\s*=\s*true/m.test(body);
    const randomMovementProbability = Number(body.match(/RandomMovementProbability\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const randomMovementDistance = Number(body.match(/RandomMovementDistance\s*=\s*(-?\d+)/)?.[1] ?? 1);
    const clicksToExplode = Number(body.match(/ClicksToExplode\s*=\s*(-?\d+)/)?.[1] ?? 0);
    const neutral = /Neutral\s*=\s*true/.test(body);
    const neutralMinimapColor = parseColorTuple(body.match(/NeutralMinimapColor\s*=\s*\{([^}]+)\}/)?.[1] ?? "");
    const shoreBuilding = /ShoreBuilding\s*=\s*true/.test(body);
    const buildingRules = parseBuildingRules(body);
    const replaceOnBuild = buildingRules.some((rule) => rule.kind === "ontop" && rule.replaceOnBuild === true);
    const replaceOnDie = buildingRules.some((rule) => rule.kind === "ontop" && rule.replaceOnDie === true);
    const revealer = /Revealer\s*=\s*true/.test(body);
    const vanishes = /(?:Vanishes|Revealer)\s*=\s*true/.test(body);
    const tileSize = body.match(/TileSize\s*=\s*\{(\d+),\s*(\d+)\}/);
    const boxSize = body.match(/BoxSize\s*=\s*\{(\d+),\s*(\d+)\}/);
    const costs = body.match(/Costs\s*=\s*\{([^}]+)\}/)?.[1] ?? "";
    const sounds = parseUnitSounds(body);
    const parsed = {
      id,
      name,
      image,
      seasonalImages,
      icon,
      animation,
      corpseTypeId,
      explosionType,
      rightMouseAction,
      missile,
      constructionTypeId,
      type,
      landUnit,
      seaUnit,
      airUnit,
      sideAttack,
      rotationSpeed,
      elevated,
      shadow,
      woodImprove,
      oilImprove,
      center,
      level,
      builderOutside,
      teleporter,
      numDirections,
      onReady,
      hitPoints,
      burnPercent,
      burnDamageRate,
      drawLevel,
      priority,
      points,
      annoyComputerFactor,
      armor,
      basicDamage,
      piercingDamage,
      minAttackRange,
      maxAttackRange,
      sightRange,
      computerReactionRange,
      personReactionRange,
      speed,
      supply,
      demand,
      maxOnBoard,
      canTransport,
      autoRepairRange,
      repairRange,
      repairHp,
      repairCosts,
      improveProduction,
      decayRate,
      canAttack,
      canTargetLand,
      canTargetSea,
      canTargetAir,
      groundAttack,
      detectCloak,
      coward,
      gatherResources,
      resourceCapacity,
      resourceStep,
      waitAtResource,
      waitAtDepot,
      canCastSpells,
      storesResources,
      givesResource,
      canHarvest,
      building,
      mainFacility,
      manaEnabled: mana.enabled,
      manaMax: mana.max,
      manaInitial: mana.initial,
      manaIncrease: mana.increase,
      selectableByRectangle,
      indestructible,
      nonSolid,
      visibleUnderFog,
      permanentCloak,
      organic,
      isUndead,
      hero,
      volatile,
      randomMovementProbability,
      randomMovementDistance,
      clicksToExplode,
      neutral,
      neutralMinimapColor,
      shoreBuilding,
      buildingRules,
      replaceOnBuild,
      replaceOnDie,
      revealer,
      vanishes,
      tileSize: tileSize ? [Number(tileSize[1]), Number(tileSize[2])] : [0, 0],
      boxSize: boxSize ? [Number(boxSize[1]), Number(boxSize[2])] : [0, 0],
      costs: parseCostList(costs),
      sounds
    };
    units.set(id, mergeUnitDefinition(units.get(id), parsed));
    cursor = bodyStart + body.length + 2;
  }
  return [...units.values()];
}

function parseConstructionDefinitions(source) {
  const constructions = [];
  const marker = 'DefineConstruction("';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }

    const idStart = start + marker.length;
    const idEnd = source.indexOf('"', idStart);
    const id = source.slice(idStart, idEnd);
    const bodyStart = source.indexOf("{", idEnd);
    if (bodyStart === -1) {
      cursor = idEnd;
      continue;
    }

    const body = findBalancedBody(source, bodyStart);
    const filesBody = body.match(/Files\s*=\s*\{([\s\S]*?)\}\s*,\s*Constructions/)?.[1] ?? "";
    const directImage = filesBody.match(/File\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const seasonalImages = parseNearestTilesetFilesTable(source, start);
    const image = directImage ?? seasonalImages.summer ?? Object.values(seasonalImages)[0] ?? null;
    const sizeMatch = body.match(/Size\s*=\s*\{(\d+),\s*(\d+)\}/);
    const stages = [];
    const stagePattern = /\{\s*Percent\s*=\s*(-?\d+),\s*File\s*=\s*"([^"]+)",\s*Frame\s*=\s*(-?\d+)\s*\}/g;
    let stageMatch;
    while ((stageMatch = stagePattern.exec(body))) {
      stages.push({
        percent: Number(stageMatch[1]),
        file: stageMatch[2],
        frame: Number(stageMatch[3])
      });
    }
    constructions.push({
      id,
      image,
      seasonalImages,
      size: sizeMatch ? [Number(sizeMatch[1]), Number(sizeMatch[2])] : null,
      stages
    });
    cursor = bodyStart + body.length + 2;
  }
  return constructions;
}

function addGeneratedDeadVisionUnits(unitsById, animationsById) {
  const generated = new Map();
  for (const unit of unitsById.values()) {
    const sight = Math.max(0, Math.floor(unit.sightRange ?? 0));
    const size = Math.max(1, Math.floor(unit.tileSize?.[0] ?? 1));
    const animation = unit.animation ? animationsById.get(unit.animation) : null;
    const hasDeathPayload = Boolean(animation?.actions?.Death?.length || unit.corpseTypeId || unit.explosionType);
    if (!hasDeathPayload || unit.vanishes || sight <= 0) {
      continue;
    }
    const id = `unit-dead-vision-${size}-${sight}`;
    if (unitsById.has(id) || generated.has(id)) {
      continue;
    }
    generated.set(id, {
      id,
      name: `Reveal Death Location ${size}-${sight}`,
      image: null,
      icon: "icon-holy-vision",
      animation: "animations-dead-vision",
      corpseTypeId: null,
      explosionType: null,
      rightMouseAction: null,
      missile: "missile-none",
      constructionTypeId: null,
      type: unit.type,
      landUnit: unit.landUnit,
      seaUnit: unit.seaUnit,
      airUnit: unit.airUnit,
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
      hitPoints: 1,
      burnPercent: 0,
      burnDamageRate: 0,
      drawLevel: 0,
      priority: 0,
      points: 0,
      annoyComputerFactor: 0,
      armor: 0,
      basicDamage: 0,
      piercingDamage: 0,
      minAttackRange: 0,
      maxAttackRange: 0,
      sightRange: sight,
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
      decayRate: 0,
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
      building: false,
      mainFacility: false,
      manaEnabled: false,
      manaMax: 0,
      manaInitial: 0,
      manaIncrease: 0,
      selectableByRectangle: false,
      indestructible: true,
      nonSolid: true,
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
      neutralMinimapColor: null,
      shoreBuilding: false,
      buildingRules: [],
      revealer: true,
      vanishes: true,
      tileSize: [size, size],
      boxSize: [size, size],
      costs: [],
      sounds: {},
      source: "scripts/units.lua"
    });
  }
  for (const [id, unit] of generated) {
    unitsById.set(id, unit);
  }
  return generated.size;
}


function parseNearestTilesetFilesTable(source, beforeIndex) {
  const tableStart = source.lastIndexOf("local files", beforeIndex);
  if (tableStart === -1) {
    return {};
  }
  const nextConstruction = source.indexOf('DefineConstruction("', tableStart);
  if (nextConstruction !== beforeIndex) {
    return {};
  }
  const openIndex = source.indexOf("{", tableStart);
  if (openIndex === -1 || openIndex > beforeIndex) {
    return {};
  }
  const body = findBalancedBody(source, openIndex);
  const seasons = {};
  for (const seasonMatch of body.matchAll(/([a-z]+)\s*=\s*"([^"]+)"/g)) {
    seasons[seasonMatch[1]] = seasonMatch[2];
  }
  return seasons;
}

function mergeUnitDefinition(existing, next) {
  if (!existing) {
    return next;
  }
  return {
    ...existing,
    ...next,
    name: next.name !== next.id ? next.name : existing.name,
    image: next.image ?? existing.image,
    seasonalImages: Object.keys(next.seasonalImages).length > 0 ? next.seasonalImages : existing.seasonalImages,
    icon: next.icon ?? existing.icon,
    animation: next.animation ?? existing.animation,
    corpseTypeId: next.corpseTypeId ?? existing.corpseTypeId,
    explosionType: next.explosionType ?? existing.explosionType,
    rightMouseAction: next.rightMouseAction ?? existing.rightMouseAction,
    missile: next.missile ?? existing.missile,
    constructionTypeId: next.constructionTypeId ?? existing.constructionTypeId,
    type: next.type !== "unknown" ? next.type : existing.type,
    landUnit: next.landUnit || existing.landUnit,
    seaUnit: next.seaUnit || existing.seaUnit,
    airUnit: next.airUnit || existing.airUnit,
    sideAttack: next.sideAttack || existing.sideAttack,
    rotationSpeed: next.rotationSpeed !== 0 ? next.rotationSpeed : existing.rotationSpeed,
    elevated: next.elevated || existing.elevated,
    shadow: next.shadow ?? existing.shadow,
    woodImprove: next.woodImprove || existing.woodImprove,
    oilImprove: next.oilImprove || existing.oilImprove,
    center: next.center || existing.center,
    level: next.level !== 0 ? next.level : existing.level,
    builderOutside: next.builderOutside || existing.builderOutside,
    teleporter: next.teleporter || existing.teleporter,
    numDirections: next.numDirections !== 0 ? next.numDirections : existing.numDirections,
    onReady: next.onReady ?? existing.onReady,
    hitPoints: next.hitPoints > 0 ? next.hitPoints : existing.hitPoints,
    burnPercent: next.burnPercent !== 0 ? next.burnPercent : existing.burnPercent,
    burnDamageRate: next.burnDamageRate !== 0 ? next.burnDamageRate : existing.burnDamageRate,
    drawLevel: next.drawLevel !== 0 ? next.drawLevel : existing.drawLevel,
    priority: next.priority !== 0 ? next.priority : existing.priority,
    points: next.points !== 0 ? next.points : existing.points,
    annoyComputerFactor: next.annoyComputerFactor !== 0 ? next.annoyComputerFactor : existing.annoyComputerFactor,
    armor: next.armor !== 0 ? next.armor : existing.armor,
    basicDamage: next.basicDamage !== 0 ? next.basicDamage : existing.basicDamage,
    piercingDamage: next.piercingDamage !== 0 ? next.piercingDamage : existing.piercingDamage,
    minAttackRange: next.minAttackRange !== 0 ? next.minAttackRange : existing.minAttackRange,
    maxAttackRange: next.maxAttackRange !== 0 ? next.maxAttackRange : existing.maxAttackRange,
    sightRange: next.sightRange !== 0 ? next.sightRange : existing.sightRange,
    computerReactionRange: next.computerReactionRange !== 0 ? next.computerReactionRange : existing.computerReactionRange,
    personReactionRange: next.personReactionRange !== 0 ? next.personReactionRange : existing.personReactionRange,
    speed: next.speed !== 0 ? next.speed : existing.speed,
    supply: next.supply !== 0 ? next.supply : existing.supply,
    demand: next.demand !== 0 ? next.demand : existing.demand,
    maxOnBoard: next.maxOnBoard !== 0 ? next.maxOnBoard : existing.maxOnBoard,
    canTransport: next.canTransport.length > 0 ? next.canTransport : existing.canTransport,
    autoRepairRange: next.autoRepairRange !== 0 ? next.autoRepairRange : existing.autoRepairRange,
    repairRange: next.repairRange !== 0 ? next.repairRange : existing.repairRange,
    repairHp: next.repairHp !== 0 ? next.repairHp : existing.repairHp,
    repairCosts: next.repairCosts.length > 0 ? next.repairCosts : existing.repairCosts,
    improveProduction: Object.keys(next.improveProduction).length > 0 ? next.improveProduction : existing.improveProduction,
    decayRate: next.decayRate !== 0 ? next.decayRate : existing.decayRate,
    canAttack: next.canAttack || existing.canAttack,
    canTargetLand: next.canTargetLand || existing.canTargetLand,
    canTargetSea: next.canTargetSea || existing.canTargetSea,
    canTargetAir: next.canTargetAir || existing.canTargetAir,
    groundAttack: next.groundAttack || existing.groundAttack,
    detectCloak: next.detectCloak || existing.detectCloak,
    coward: next.coward || existing.coward,
    gatherResources: next.gatherResources.length > 0 ? next.gatherResources : existing.gatherResources,
    resourceCapacity: Object.keys(next.resourceCapacity ?? {}).length > 0 ? next.resourceCapacity : existing.resourceCapacity,
    resourceStep: Object.keys(next.resourceStep ?? {}).length > 0 ? next.resourceStep : existing.resourceStep,
    waitAtResource: Object.keys(next.waitAtResource ?? {}).length > 0 ? next.waitAtResource : existing.waitAtResource,
    waitAtDepot: Object.keys(next.waitAtDepot ?? {}).length > 0 ? next.waitAtDepot : existing.waitAtDepot,
    canCastSpells: next.canCastSpells.length > 0 ? next.canCastSpells : existing.canCastSpells,
    storesResources: next.storesResources.length > 0 ? next.storesResources : existing.storesResources,
    givesResource: next.givesResource ?? existing.givesResource,
    canHarvest: next.canHarvest || existing.canHarvest,
    building: next.building || existing.building,
    mainFacility: next.mainFacility || existing.mainFacility,
    manaEnabled: next.manaEnabled ?? existing.manaEnabled,
    manaMax: next.manaMax !== 0 ? next.manaMax : existing.manaMax,
    manaInitial: next.manaInitial !== 0 ? next.manaInitial : existing.manaInitial,
    manaIncrease: next.manaIncrease !== 0 ? next.manaIncrease : existing.manaIncrease,
    selectableByRectangle: next.selectableByRectangle && existing.selectableByRectangle,
    indestructible: next.indestructible || existing.indestructible,
    nonSolid: next.nonSolid || existing.nonSolid,
    visibleUnderFog: next.visibleUnderFog || existing.visibleUnderFog,
    permanentCloak: next.permanentCloak || existing.permanentCloak,
    organic: next.organic || existing.organic,
    isUndead: next.isUndead || existing.isUndead,
    hero: next.hero || existing.hero,
    volatile: next.volatile || existing.volatile,
    randomMovementProbability: next.randomMovementProbability !== 0 ? next.randomMovementProbability : existing.randomMovementProbability,
    randomMovementDistance: next.randomMovementDistance !== 1 ? next.randomMovementDistance : existing.randomMovementDistance,
    clicksToExplode: next.clicksToExplode !== 0 ? next.clicksToExplode : existing.clicksToExplode,
    neutral: next.neutral || existing.neutral,
    neutralMinimapColor: next.neutralMinimapColor ? next.neutralMinimapColor : existing.neutralMinimapColor,
    shoreBuilding: next.shoreBuilding || existing.shoreBuilding,
    buildingRules: next.buildingRules.length > 0 ? next.buildingRules : existing.buildingRules,
    replaceOnBuild: next.replaceOnBuild || existing.replaceOnBuild,
    replaceOnDie: next.replaceOnDie || existing.replaceOnDie,
    revealer: next.revealer || existing.revealer,
    vanishes: next.vanishes || existing.vanishes,
    tileSize: next.tileSize[0] > 0 && next.tileSize[1] > 0 ? next.tileSize : existing.tileSize,
    boxSize: next.boxSize[0] > 0 && next.boxSize[1] > 0 ? next.boxSize : existing.boxSize,
    costs: next.costs.length > 0 ? next.costs : existing.costs,
    sounds: Object.keys(next.sounds).length > 0 ? next.sounds : existing.sounds
  };
}

function parseCanGatherResources(body) {
  const start = body.indexOf("CanGatherResources");
  if (start === -1) {
    return [];
  }
  const openIndex = body.indexOf("{", start);
  if (openIndex === -1) {
    return [];
  }
  const gatherBody = findBalancedBody(body, openIndex);
  return uniqueStrings([...gatherBody.matchAll(/"resource-id",\s*"([^"]+)"/g)].map((match) => match[1]));
}

function parseResourceCapacity(body) {
  return parseResourceNumericField(body, "resource-capacity");
}

function parseResourceNumericField(body, fieldName) {
  const start = body.indexOf("CanGatherResources");
  if (start === -1) {
    return {};
  }
  const openIndex = body.indexOf("{", start);
  if (openIndex === -1) {
    return {};
  }
  const gatherBody = findBalancedBody(body, openIndex);
  const values = {};
  const fieldPattern = new RegExp(`"${escapeRegExp(fieldName)}",\\s*(-?\\d+)`);
  for (const match of gatherBody.matchAll(/\{([\s\S]*?)\}/g)) {
    const entry = match[1];
    const resource = entry.match(/"resource-id",\s*"([^"]+)"/)?.[1] ?? null;
    const value = Number(entry.match(fieldPattern)?.[1] ?? NaN);
    if (resource && Number.isFinite(value) && value > 0) {
      values[resource] = value;
    }
  }
  return values;
}

function parseCostList(source) {
  return source.replaceAll('"', "").split(",").map((part) => part.trim()).filter(Boolean);
}

function parseColorTuple(source) {
  const parts = source.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return parts.map((part) => Math.max(0, Math.min(255, Math.round(part))));
}

function parsePlayerColors(source) {
  const body = readCallBody(source, "DefinePlayerColors");
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

function parsePlayerColorIndex(source) {
  const match = source.match(/DefinePlayerColorIndex\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
  return match ? { start: Number(match[1]), count: Number(match[2]) } : null;
}

function parseDefaultPlayerNames(source) {
  const start = source.indexOf("local default_names");
  if (start < 0) {
    return {};
  }
  const end = source.indexOf("for i=0,7 do", start);
  const body = source.slice(start, end > start ? end : undefined);
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

function parseRaceUnitEquivalents(source) {
  const start = source.indexOf("local t = {");
  const end = source.indexOf("HumanEquivalent = {}", start);
  const body = start >= 0 ? source.slice(start, end > start ? end : undefined) : "";
  const human = {};
  const orc = {};
  for (const match of body.matchAll(/\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\}/g)) {
    human[match[2]] = match[1];
    orc[match[1]] = match[2];
  }
  return { human, orc };
}

function parseRaceNames(source) {
  const body = readCallBody(source, "DefineRaceNames");
  const races = [];
  for (const match of body.matchAll(/"race"\s*,\s*\{([\s\S]*?)\}/g)) {
    const fields = match[1];
    const name = fields.match(/"name"\s*,\s*"([^"]+)"/)?.[1] ?? null;
    const display = fields.match(/"display"\s*,\s*_?\(\s*"([^"]+)"\s*\)|"display"\s*,\s*"([^"]+)"/)?.[1] ?? fields.match(/"display"\s*,\s*"([^"]+)"/)?.[1] ?? null;
    if (name) {
      races.push({ name, display: cleanSourceText(display ?? name), visible: /"visible"/.test(fields) });
    }
  }
  return races;
}

function sourceConvertedUnitType(typeId, race, raceUnitEquivalents = sourceRaceUnitEquivalents) {
  const normalizedRace = race === "orc" ? "orc" : race === "human" ? "human" : null;
  return normalizedRace ? raceUnitEquivalents[normalizedRace]?.[typeId] ?? typeId : typeId;
}

function parseUiColor(source, name) {
  const match = source.match(new RegExp(`UI\\.${name}\\s*=\\s*CColor\\(\\s*([^)]*?)\\s*\\)`));
  return match ? parseColorTuple(match[1]) : null;
}

function parseUiBool(source, name) {
  const match = source.match(new RegExp(`UI\\.${name}\\s*=\\s*(true|false)`));
  return match ? match[1] === "true" : null;
}

function parseScrollMargins(source) {
  const match = source.match(/SetScrollMargins\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/);
  return match ? { top: Number(match[1]), right: Number(match[2]), bottom: Number(match[3]), left: Number(match[4]) } : null;
}

function parseUiFontColors(source) {
  const normal = source.match(/UI\.NormalFontColor\s*=\s*"([^"]+)"/)?.[1] ?? null;
  const reverse = source.match(/UI\.ReverseFontColor\s*=\s*"([^"]+)"/)?.[1] ?? null;
  return normal || reverse ? { normal, reverse } : null;
}

function parseSourceNumberConstants(scriptSources) {
  const constants = new Map();
  for (const source of scriptSources.values()) {
    for (const match of stripLuaComments(source).matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(-?\d+)\b/g)) {
      constants.set(match[1], Number(match[2]));
    }
  }
  return constants;
}

function parseFontDefinitions(source, sourcePath, constants = new Map()) {
  const fonts = [];
  const uncommented = stripLuaComments(source);
  for (const match of uncommented.matchAll(/CFont:New\(\s*"([^"]+)"\s*,\s*CGraphic:New\(\s*"([^"]+)"\s*,\s*([^,\n\r)]+)\s*,\s*(-?\d+)\s*\)\s*\)/g)) {
    const id = match[1];
    const file = match[2];
    const widthToken = match[3].trim();
    const glyphWidth = /^-?\d+$/.test(widthToken) ? Number(widthToken) : constants.get(widthToken);
    if (!Number.isFinite(glyphWidth)) {
      continue;
    }
    fonts.push({
      id,
      file,
      glyphWidth,
      glyphHeight: Number(match[4]),
      source: sourcePath
    });
  }
  return fonts;
}

function parseFontColorDefinitions(source, sourcePath) {
  const colors = [];
  const uncommented = stripLuaComments(source);
  for (const match of uncommented.matchAll(/DefineFontColor\(\s*"([^"]+)"\s*,\s*\{/g)) {
    const openIndex = match.index + match[0].lastIndexOf("{");
    const body = findBalancedBody(uncommented, openIndex);
    const numbers = [...body.matchAll(/-?\d+/g)].map((entry) => Number(entry[0]));
    const triples = [];
    for (let index = 0; index + 2 < numbers.length; index += 3) {
      triples.push([numbers[index], numbers[index + 1], numbers[index + 2]]);
    }
    if (triples.length > 0) {
      colors.push({
        id: match[1],
        colors: triples,
        source: sourcePath
      });
    }
  }
  return colors;
}

function parseUiButtonPanel(source) {
  const x = Number(source.match(/UI\.ButtonPanel\.X\s*=\s*(-?\d+)/)?.[1] ?? 0);
  const y = Number(source.match(/UI\.ButtonPanel\.Y\s*=\s*(-?\d+)/)?.[1] ?? 0);
  const slots = [...source.matchAll(/AddButtonPanelButton\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g)].map((match, index) => ({
    slot: index,
    x: Number(match[1]) - x,
    y: Number(match[2]) - y
  }));
  return Number.isFinite(x) && Number.isFinite(y) && slots.length > 0 ? { x, y, slots } : null;
}

function parseUiInfoPanel(source, videoSize = sourceVideoSize()) {
  const x = Number(source.match(/UI\.InfoPanel\.X\s*=\s*(-?\d+)/)?.[1] ?? 0);
  const y = evalUiNumberExpression(source.match(/UI\.InfoPanel\.Y\s*=\s*([^\n\r]+)/)?.[1] ?? "160", videoSize);
  const graphic = source.match(/UI\.InfoPanel\.G\s*=\s*CGraphic:New\(\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  const singleSelected = parseUiAssignedButton(source, "SingleSelectedButton", x, y, videoSize);
  const singleTraining = parseUiAssignedButton(source, "SingleTrainingButton", x, y, videoSize);
  const upgrading = parseUiAssignedButton(source, "UpgradingButton", x, y, videoSize);
  const researching = parseUiAssignedButton(source, "ResearchingButton", x, y, videoSize);
  const selectedSlots = parseUiPanelButtonCalls(source, "AddSelectedButton", x, y, videoSize);
  const trainingSlots = parseUiPanelButtonCalls(source, "AddTrainingButton", x, y, videoSize);
  const transportingSlots = parseUiPanelButtonCalls(source, "AddTransportingButton", x, y, videoSize);
  const maxSelectedText = parseUiMaxSelectedText(source, x, y, videoSize);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !graphic) {
    return null;
  }
  return {
    x,
    y,
    width: Number(graphic[2]),
    height: Number(graphic[3]),
    singleSelected,
    selectedSlots,
    maxSelectedText,
    singleTraining,
    trainingSlots,
    upgrading,
    researching,
    transportingSlots
  };
}

function parseUiAssignedButton(source, propertyName, panelX, panelY, videoSize = sourceVideoSize()) {
  const propertyIndex = source.indexOf(`UI.${propertyName} = b`);
  if (propertyIndex === -1) {
    return null;
  }
  const assignments = [...source.slice(0, propertyIndex).matchAll(/b\s*=\s*CUIButton:new\(\)[\s\S]*?b\.X\s*=\s*([^\n\r]+)[\s\S]*?b\.Y\s*=\s*([^\n\r]+)[\s\S]*?b\.Style/g)];
  const assignment = assignments.at(-1);
  if (!assignment) {
    return null;
  }
  return {
    slot: 0,
    x: evalUiNumberExpression(assignment[1], videoSize) - panelX,
    y: evalUiNumberExpression(assignment[2], videoSize) - panelY
  };
}

function parseUiPanelButtonCalls(source, functionName, panelX, panelY, videoSize = sourceVideoSize()) {
  return [...source.matchAll(new RegExp(`${functionName}\\(\\s*([^,]+)\\s*,\\s*([^\\)]+)\\)`, "g"))]
    .map((match) => ({
      slot: 0,
      x: evalUiNumberExpression(match[1], videoSize) - panelX,
      y: evalUiNumberExpression(match[2], videoSize) - panelY
    }))
    .filter((slot) => Number.isFinite(slot.x) && Number.isFinite(slot.y))
    .map((slot, index) => ({ ...slot, slot: index }));
}

function parseUiMaxSelectedText(source, panelX, panelY, videoSize = sourceVideoSize()) {
  const x = source.match(/UI\.MaxSelectedTextX\s*=\s*([^\n\r]+)/)?.[1] ?? null;
  const y = source.match(/UI\.MaxSelectedTextY\s*=\s*([^\n\r]+)/)?.[1] ?? null;
  if (!x || !y) {
    return null;
  }
  return {
    x: evalUiNumberExpression(x, videoSize) - panelX,
    y: evalUiNumberExpression(y, videoSize) - panelY,
    font: source.match(/UI\.MaxSelectedFont\s*=\s*Fonts\["([^"]+)"\]/)?.[1] ?? "game"
  };
}

function sourceVideoSize(width = 640, height = 480) {
  return { width, height };
}

function evalUiNumberExpression(expression, videoSize = sourceVideoSize()) {
  const sanitized = expression
    .replaceAll("Video.Height", String(videoSize.height))
    .replaceAll("Video.Width", String(videoSize.width))
    .trim();
  if (!/^[\d\s+\-*/().]+$/.test(sanitized)) {
    return NaN;
  }
  try {
    return Number(Function(`"use strict"; return (${sanitized});`)());
  } catch {
    return NaN;
  }
}

function parseUiStatusLine(source, videoSize = sourceVideoSize()) {
  const textXMatch = source.match(/UI\.StatusLine\.TextX\s*=\s*(\d+)\s*\+\s*(\d+)/);
  const textX = textXMatch ? Number(textXMatch[1]) + Number(textXMatch[2]) : Number(source.match(/UI\.StatusLine\.TextX\s*=\s*(-?\d+)/)?.[1] ?? NaN);
  const textYMatch = source.match(/UI\.StatusLine\.TextY\s*=\s*Video\.Height\s*\+\s*(\d+)\s*-\s*(\d+)/);
  const textYFromBottom = textYMatch ? Number(textYMatch[2]) - Number(textYMatch[1]) : NaN;
  const widthMatch = source.match(/UI\.StatusLine\.Width\s*=\s*Video\.Width\s*-\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
  const font = source.match(/UI\.StatusLine\.Font\s*=\s*Fonts\["([^"]+)"\]/)?.[1] ?? "game";
  if (!Number.isFinite(textX) || !Number.isFinite(textYFromBottom) || !widthMatch) {
    return null;
  }
  return {
    textX,
    textYFromBottom,
    widthLeft: Number(widthMatch[1]) + Number(widthMatch[2]) + Number(widthMatch[3]),
    widthRightMargin: Number(widthMatch[1]),
    font
  };
}

function parseUiMessageLayout(source) {
  const font = source.match(/UI\.MessageFont\s*=\s*Fonts\["([^"]+)"\]/)?.[1] ?? null;
  const scrollSpeed = Number(source.match(/UI\.MessageScrollSpeed\s*=\s*(-?\d+)/)?.[1] ?? NaN);
  if (!font && !Number.isFinite(scrollSpeed)) {
    return null;
  }
  return {
    font: font ?? "game",
    scrollSpeed: Number.isFinite(scrollSpeed) ? scrollSpeed : 5
  };
}

function parseUiMenuButtons(source) {
  const parseButton = (key) => {
    const xExpression = source.match(new RegExp(`UI\\.${key}\\.X\\s*=\\s*([^\\n\\r]+)`))?.[1] ?? null;
    const yExpression = source.match(new RegExp(`UI\\.${key}\\.Y\\s*=\\s*([^\\n\\r]+)`))?.[1] ?? null;
    const text = source.match(new RegExp(`UI\\.${key}\\.Text\\s*=\\s*_\\("([^"]+)"\\)`))?.[1] ?? null;
    const style = source.match(new RegExp(`UI\\.${key}\\.Style\\s*=\\s*FindButtonStyle\\("([^"]+)"\\)`))?.[1] ?? null;
    if (!xExpression || !yExpression || !text || !style) {
      return null;
    }
    const x = evalUiNumberExpression(xExpression);
    const y = evalUiNumberExpression(yExpression);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return {
      x,
      y,
      text: cleanSourceText(text),
      style,
      callback: parseUiMenuButtonCallback(source, key)
    };
  };
  const menu = parseButton("MenuButton");
  const networkMenu = parseButton("NetworkMenuButton");
  const networkDiplomacy = parseButton("NetworkDiplomacyButton");
  if (!menu && !networkMenu && !networkDiplomacy) {
    return null;
  }
  return { menu, networkMenu, networkDiplomacy };
}

function parseUiMenuButtonCallback(source, key) {
  const marker = `UI.${key}:SetCallback(`;
  const start = source.indexOf(marker);
  if (start === -1) {
    return null;
  }
  const openIndex = source.indexOf("(", start);
  const body = findBalancedCallBody(source, openIndex);
  if (/RunDiplomacyMenu\s*\(/.test(body)) {
    return "diplomacy-menu";
  }
  if (/RunGameMenu\s*\(/.test(body)) {
    return "game-menu";
  }
  if (/RunInEditorMenu\s*\(/.test(body)) {
    return "editor-menu";
  }
  return null;
}

function parseButtonStyles(source) {
  const styles = {};
  const marker = "DefineButtonStyle(";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }
    const id = source.slice(start).match(/^DefineButtonStyle\(\s*"([^"]+)"/)?.[1] ?? null;
    const openIndex = source.indexOf("{", start);
    if (!id || openIndex === -1) {
      cursor = start + marker.length;
      continue;
    }
    const body = findBalancedBody(source, openIndex);
    const defaultStart = body.search(/Default\s*=\s*\{/);
    const clickedStart = body.search(/Clicked\s*=\s*\{/);
    const defaultBody = defaultStart >= 0 ? findBalancedBody(body, body.indexOf("{", defaultStart)) : "";
    const clickedBody = clickedStart >= 0 ? findBalancedBody(body, body.indexOf("{", clickedStart)) : "";
    const defaultFile = readLuaStringField(defaultBody, "File");
    const clickedFile = readLuaStringField(clickedBody, "File");
    styles[id] = {
      id,
      race: sourceButtonStyleRace(defaultFile ?? clickedFile),
      size: readLuaNumberTupleField(body, "Size") ?? [0, 0],
      font: readLuaStringField(body, "Font") ?? "game",
      textNormalColor: readLuaStringField(body, "TextNormalColor"),
      textReverseColor: readLuaStringField(body, "TextReverseColor"),
      textAlign: readLuaStringField(body, "TextAlign"),
      textPos: readLuaNumberTupleField(body, "TextPos") ?? [0, 0],
      defaultFile,
      defaultSize: readLuaNumberTupleField(defaultBody, "Size"),
      defaultFrame: readLuaNumberField(defaultBody, "Frame", null),
      clickedFile,
      clickedSize: readLuaNumberTupleField(clickedBody, "Size"),
      clickedFrame: readLuaNumberField(clickedBody, "Frame", null)
    };
    cursor = openIndex + body.length + 2;
  }
  return styles;
}

function sourceButtonStyleRace(file) {
  if (file === "ui/buttons_2.png") {
    return "orc";
  }
  if (file === "ui/buttons_1.png") {
    return "human";
  }
  return null;
}

function parseUiMapArea(source, videoSize = sourceVideoSize()) {
  const x = Number(source.match(/UI\.MapArea\.X\s*=\s*(-?\d+)/)?.[1] ?? NaN);
  const y = Number(source.match(/UI\.MapArea\.Y\s*=\s*(-?\d+)/)?.[1] ?? NaN);
  const endX = source.match(/UI\.MapArea\.EndX\s*=\s*Video\.Width\s*-\s*(\d+)\s*-\s*(\d+)/);
  const endY = source.match(/UI\.MapArea\.EndY\s*=\s*Video\.Height\s*-\s*(\d+)\s*-\s*(\d+)/);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !endX || !endY) {
    return null;
  }
  return {
    x,
    y,
    rightMargin: Number(endX[1]) + Number(endX[2]),
    bottomMargin: Number(endY[1]) + Number(endY[2]),
    baseWidth: videoSize.width,
    baseHeight: videoSize.height
  };
}

function parseUiMinimap(source, videoSize = sourceVideoSize()) {
  const x = evalUiNumberExpression(source.match(/UI\.Minimap\.X\s*=\s*([^\n\r]+)/)?.[1] ?? "", videoSize);
  const y = evalUiNumberExpression(source.match(/UI\.Minimap\.Y\s*=\s*([^\n\r]+)/)?.[1] ?? "", videoSize);
  const width = evalUiNumberExpression(source.match(/UI\.Minimap\.W\s*=\s*([^\n\r]+)/)?.[1] ?? "", videoSize);
  const height = evalUiNumberExpression(source.match(/UI\.Minimap\.H\s*=\s*([^\n\r]+)/)?.[1] ?? "", videoSize);
  return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
}

function parsePanelContents(source, sourcePath) {
  const uncommented = stripLuaComments(source);
  const callBody = readCallBody(uncommented, "DefinePanelContents");
  if (!callBody) {
    return [];
  }
  const constants = parseLocalNumberConstants(uncommented);
  const panels = [];
  for (const panelBody of parseTopLevelLuaTables(callBody)) {
    const ident = readLuaStringField(panelBody, "Ident");
    const contentsStart = panelBody.search(/\bContents\s*=\s*\{/);
    if (!ident || contentsStart === -1) {
      continue;
    }
    const pos = readLuaPosition(panelBody, constants);
    const contentsOpen = panelBody.indexOf("{", contentsStart);
    const contentsBody = contentsOpen >= 0 ? findBalancedBody(panelBody, contentsOpen) : "";
    panels.push({
      ident,
      x: pos?.[0] ?? 0,
      y: pos?.[1] ?? 0,
      defaultFont: readLuaStringField(panelBody, "DefaultFont"),
      conditions: parseLuaConditionMap(readLuaTableField(panelBody, "Condition")),
      items: parseTopLevelLuaTables(contentsBody)
        .map((itemBody) => parsePanelContentItem(itemBody, constants))
        .filter(Boolean),
      source: sourcePath
    });
  }
  return panels;
}

function parseDecorations(source, sourcePath) {
  const uncommented = stripLuaComments(source);
  const decorations = [];
  const marker = "DefineDecorations(";
  let cursor = 0;
  while (cursor < uncommented.length) {
    const start = uncommented.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }
    const openIndex = uncommented.indexOf("{", start);
    if (openIndex === -1) {
      cursor = start + marker.length;
      continue;
    }
    const body = findBalancedBody(uncommented, openIndex);
    const index = readLuaStringField(body, "Index");
    if (index) {
      const methodBody = readLuaTableField(body, "Method");
      const method = methodBody.match(/^\s*"([^"]+)"/)?.[1] ?? "unknown";
      const methodStrings = [...methodBody.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
      decorations.push({
        index,
        hideNeutral: readLuaBoolField(body, "HideNeutral", false),
        showOpponent: readLuaBoolField(body, "ShowOpponent", false),
        showWhenNull: readLuaBoolField(body, "ShowWhenNull", false),
        showWhenMax: readLuaBoolField(body, "ShowWhenMax", false),
        centerX: readLuaBoolField(body, "CenterX", false),
        offset: readLuaNumberTupleField(body, "Offset"),
        offsetPercent: readLuaNumberTupleField(body, "OffsetPercent"),
        method,
        sprite: methodStrings[1] ?? null,
        frame: Number.isFinite(Number(methodBody.match(/,\s*(-?\d+)\s*\}/)?.[1])) ? Number(methodBody.match(/,\s*(-?\d+)\s*\}/)?.[1]) : null,
        source: sourcePath
      });
    }
    cursor = openIndex + body.length + 2;
  }
  return decorations;
}

function parseLocalNumberConstants(source) {
  const constants = new Map();
  for (const match of source.matchAll(/\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+)/g)) {
    constants.set(match[1], Number(match[2]));
  }
  return constants;
}

function parseTopLevelLuaTables(body) {
  const tables = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const previous = body[index - 1];
    if (char === '"' && previous !== "\\") {
      inString = !inString;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        tables.push(body.slice(start + 1, index));
        start = -1;
      }
    }
  }
  return tables;
}

function parsePanelContentItem(body, constants) {
  const pos = readLuaPosition(body, constants);
  const moreStart = body.search(/\bMore\s*=\s*\{/);
  if (!pos || moreStart === -1) {
    return null;
  }
  const moreOpen = body.indexOf("{", moreStart);
  const moreBody = moreOpen >= 0 ? findBalancedBody(body, moreOpen) : "";
  const kind = moreBody.match(/^\s*"([^"]+)"/)?.[1] ?? "Unknown";
  return {
    x: pos[0],
    y: pos[1],
    kind,
    variable: readLuaStringField(moreBody, "Variable"),
    variable1: readLuaStringField(moreBody, "Variable1"),
    variable2: readLuaStringField(moreBody, "Variable2"),
    label: parsePanelContentLabel(moreBody),
    format: readLuaTranslatedStringField(moreBody, "Format"),
    width: readLuaNumberField(moreBody, "Width", null),
    height: readLuaNumberField(moreBody, "Height", null),
    conditions: parseLuaConditionMap(readLuaTableField(body, "Condition"))
  };
}

function parsePanelContentLabel(body) {
  const textMatch = body.match(/Text\s*=\s*_?\("([^"]+)"\)/)
    ?? body.match(/More\s*=\s*\{\s*"Text"\s*,\s*_?\("([^"]+)"\)/)
    ?? body.match(/_\("([^"]+)"\)/);
  return textMatch ? cleanSourceText(textMatch[1]) : null;
}

function readLuaPosition(body, constants) {
  const match = body.match(/\bPos\s*=\s*\{\s*([^,}]+)\s*,\s*([^}]+)\}/);
  if (!match) {
    return null;
  }
  return [evalLuaNumberToken(match[1], constants), evalLuaNumberToken(match[2], constants)];
}

function evalLuaNumberToken(token, constants) {
  const trimmed = token.trim();
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return constants.get(trimmed) ?? 0;
}

function readLuaTableField(body, field) {
  const fieldStart = body.search(new RegExp(`\\b${field}\\s*=\\s*\\{`));
  if (fieldStart === -1) {
    return "";
  }
  const openIndex = body.indexOf("{", fieldStart);
  return openIndex >= 0 ? findBalancedBody(body, openIndex) : "";
}

function parseLuaConditionMap(body) {
  const conditions = {};
  if (!body) {
    return conditions;
  }
  for (const match of body.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]+)"|(true|false))/g)) {
    conditions[match[1]] = match[2] ?? match[3] === "true";
  }
  return conditions;
}

function readLuaBoolField(body, field, fallback) {
  const value = body.match(new RegExp(`\\b${field}\\s*=\\s*(true|false)`))?.[1];
  return value ? value === "true" : fallback;
}

function readLuaNumberTupleField(body, field) {
  const match = body.match(new RegExp(`\\b${field}\\s*=\\s*\\{\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\}`));
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function parseBriefingLayout(source) {
  const readScaledX = (pattern, fallback) => Number(source.match(pattern)?.[1] ?? fallback);
  const readScaledY = (pattern, fallback) => Number(source.match(pattern)?.[1] ?? fallback);
  const titleSum = source.match(/GameDefinition\["Briefing"\]\["X"\]\s*\+\s*\((\d+)\s*\+\s*(\d+)\)\s*\/\s*2\s*\*\s*GameDefinition\["Briefing"\]\["Width"\]\s*\/\s*640/);
  const titleX = titleSum ? (Number(titleSum[1]) + Number(titleSum[2])) / 2 : 205;
  return {
    baseWidth: 640,
    baseHeight: 480,
    titleX,
    titleY: readScaledY(/GameDefinition\["Briefing"\]\["Y"\]\s*\+\s*(\d+)\s*\*\s*GameDefinition\["Briefing"\]\["Height"\]\s*\/\s*480,\s*Fonts\["large"\],\s*true/, 28),
    textX: readScaledX(/GameDefinition\["Briefing"\]\["X"\]\s*\+\s*(\d+)\s*\*\s*GameDefinition\["Briefing"\]\["Width"\]\s*\/\s*640,\s*GameDefinition\["Briefing"\]\["Y"\]\s*\+\s*80\s*\*/, 70),
    textY: readScaledY(/GameDefinition\["Briefing"\]\["Y"\]\s*\+\s*(\d+)\s*\*\s*GameDefinition\["Briefing"\]\["Height"\]\s*\/\s*480\)\s*[\r\n\s]*menu:addMultiLineLabel/, 80),
    textWidth: Number(source.match(/menu:addMultiLineLabel\([\s\S]*?,\s*Fonts\["large"\],\s*false,\s*(\d+)\s*\)/)?.[1] ?? 320),
    objectivesX: readScaledX(/_\("Objectives:"\),\s*GameDefinition\["Briefing"\]\["X"\]\s*\+\s*(\d+)\s*\*\s*GameDefinition\["Briefing"\]\["Width"\]\s*\/\s*640/, 70),
    objectivesY: readScaledY(/_\("Objectives:"\)[\s\S]*?GameDefinition\["Briefing"\]\["Y"\]\s*\+\s*(\d+)\s*\*\s*GameDefinition\["Briefing"\]\["Height"\]\s*\/\s*480/, 306),
    objectivesWidth: Number(source.match(/l:setLineWidth\(\s*(\d+)\s*\*\s*GameDefinition\["Briefing"\]\["Width"\]\s*\/\s*640\s*\)/)?.[1] ?? 250),
    continueButtonX: readScaledX(/"Continue"[\s\S]*?GameDefinition\["Briefing"\]\["X"\]\s*\+\s*(\d+)\s*\*\s*GameDefinition\["Briefing"\]\["Width"\]\s*\/\s*640/, 455),
    continueButtonY: readScaledY(/"Continue"[\s\S]*?GameDefinition\["Briefing"\]\["Y"\]\s*\+\s*(\d+)\s*\*\s*GameDefinition\["Briefing"\]\["Height"\]\s*\/\s*480/, 440),
    exitButtonOffsetX: Number(source.match(/"Exit"[\s\S]*?GameDefinition\["Briefing"\]\["Width"\]\s*\/\s*640\s*-\s*(\d+)/)?.[1] ?? 133),
    characterXOffsetFromRight: Number(source.match(/local charx\s*=\s*GameDefinition\["Briefing"\]\["X"\]\s*\+\s*GameDefinition\["Briefing"\]\["Width"\]\s*-\s*(\d+)/)?.[1] ?? 450),
    characterY: Number(source.match(/local chary\s*=\s*GameDefinition\["Briefing"\]\["Y"\]\s*\+\s*(\d+)/)?.[1] ?? 10)
  };
}

function parseSpeedFactors(source) {
  const setSpeeds = positiveNumber(source.match(/SetSpeeds\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? 1;
  return {
    build: positiveNumber(source.match(/SetSpeedBuild\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? setSpeeds,
    train: positiveNumber(source.match(/SetSpeedTrain\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? setSpeeds,
    upgrade: positiveNumber(source.match(/SetSpeedUpgrade\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? setSpeeds,
    research: positiveNumber(source.match(/SetSpeedResearch\(\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null) ?? setSpeeds,
    resourceHarvest: parseResourceSpeedFactors(source, "SetSpeedResourcesHarvest", setSpeeds),
    resourceReturn: parseResourceSpeedFactors(source, "SetSpeedResourcesReturn", setSpeeds)
  };
}

function parseResourceSpeedFactors(source, functionName, fallback) {
  const factors = {};
  const pattern = new RegExp(`${functionName}\\(\\s*"([^"]+)"\\s*,\\s*(\\d+(?:\\.\\d+)?)\\s*\\)`, "g");
  for (const match of source.matchAll(pattern)) {
    factors[match[1]] = positiveNumber(match[2]) ?? fallback;
  }
  return factors;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseByteTupleCall(source, functionName, fallback) {
  const body = readCallBody(source, functionName);
  if (!body) {
    return fallback;
  }
  const parts = body.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return fallback;
  }
  return parts.map((part) => Math.max(0, Math.min(255, Math.round(part))));
}

function parseCanCastSpells(body) {
  const match = body.match(/CanCastSpell\s*=\s*\{([^}]+)\}/);
  if (!match) {
    return [];
  }
  return uniqueStrings([...match[1].matchAll(/"([^"]+)"/g)].map((spellMatch) => spellMatch[1]));
}

function parseManaEnabled(body) {
  const match = body.match(/(?:^|[\n,{]\s*)Mana\s*=\s*\{([^}]+)\}/m);
  if (!match) {
    return undefined;
  }
  if (/Enable\s*=\s*false/.test(match[1])) {
    return false;
  }
  return /Enable\s*=\s*true/.test(match[1]);
}

function parseVariableDefaults(source) {
  const manaMatch = source.match(/DefineVariables\(\s*"Mana"\s*,\s*\{([^}]+)\}/);
  if (!manaMatch) {
    return {};
  }
  return {
    mana: {
      max: Number(manaMatch[1].match(/Max\s*=\s*(-?\d+)/)?.[1] ?? 0),
      initial: Number(manaMatch[1].match(/Value\s*=\s*(-?\d+)/)?.[1] ?? 0),
      increase: Number(manaMatch[1].match(/Increase\s*=\s*(-?\d+)/)?.[1] ?? 0),
      enabled: /Enable\s*=\s*true/.test(manaMatch[1])
    }
  };
}

function parseManaConfig(body, defaults = {}) {
  const enabled = parseManaEnabled(body);
  if (enabled !== true) {
    return {
      enabled,
      max: 0,
      initial: 0,
      increase: 0
    };
  }
  const manaBody = body.match(/(?:^|[\n,{]\s*)Mana\s*=\s*\{([^}]+)\}/m)?.[1] ?? "";
  const max = Number(manaBody.match(/Max\s*=\s*(-?\d+)/)?.[1] ?? defaults.max ?? 0);
  const initial = Number(manaBody.match(/Value\s*=\s*(-?\d+)/)?.[1] ?? defaults.initial ?? max);
  const increase = Number(manaBody.match(/Increase\s*=\s*(-?\d+)/)?.[1] ?? defaults.increase ?? 0);
  return {
    enabled,
    max: Number.isFinite(max) ? Math.max(0, max) : 0,
    initial: Number.isFinite(initial) ? Math.max(0, initial) : 0,
    increase: Number.isFinite(increase) ? Math.max(0, increase) : 0
  };
}

function parseShadowDefinition(body) {
  const match = body.match(/Shadow\s*=\s*ShadowDefinition\(\s*(-?\d+)\s*\)/);
  if (!match) {
    return null;
  }
  return Math.max(0, Number(match[1]));
}

function parseCanStoreResources(body) {
  const match = body.match(/CanStore\s*=\s*\{([^}]+)\}/);
  if (!match) {
    return [];
  }
  return uniqueStrings([...match[1].matchAll(/"([^"]+)"/g)].map((resourceMatch) => resourceMatch[1]));
}

function parseCanTransport(body) {
  const match = body.match(/CanTransport\s*=\s*\{([^}]+)\}/);
  if (!match) {
    return [];
  }
  return uniqueStrings([...match[1].matchAll(/"([^"]+)"/g)]
    .map((transportMatch) => transportMatch[1])
    .filter((flag) => flag === "LandUnit" || flag === "SeaUnit" || flag === "AirUnit"));
}

function parseImproveProduction(body) {
  const match = body.match(/ImproveProduction\s*=\s*\{\s*"([^"]+)"\s*,\s*(-?\d+)\s*\}/);
  if (!match) {
    return {};
  }
  return { [match[1]]: Number(match[2]) };
}

function parseBuildingRules(body) {
  const start = body.indexOf("BuildingRules");
  if (start === -1) {
    return [];
  }
  const openIndex = body.indexOf("{", start);
  if (openIndex === -1) {
    return [];
  }
  const rulesBody = findBalancedBody(body, openIndex);
  const distanceRules = [...rulesBody.matchAll(/"distance"\s*,\s*\{[^}]*Distance\s*=\s*(-?\d+)[^}]*DistanceType\s*=\s*"([^"]+)"[^}]*Type\s*=\s*"([^"]+)"/g)]
    .map((match) => ({
      kind: "distance",
      typeId: match[3],
      distance: Number(match[1]),
      distanceType: match[2]
    }));
  const ontopRules = [...rulesBody.matchAll(/"ontop"\s*,\s*\{[^}]*Type\s*=\s*"([^"]+)"[^}]*\}/g)]
    .map((match) => {
      const ruleBody = match[0];
      return {
        kind: "ontop",
        typeId: match[1],
        replaceOnBuild: /ReplaceOnBuild\s*=\s*true/.test(ruleBody),
        replaceOnDie: /ReplaceOnDie\s*=\s*true/.test(ruleBody)
      };
    });
  return [...distanceRules, ...ontopRules];
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseUnitSounds(body) {
  const marker = /\bSounds\s*=/g;
  const match = marker.exec(body);
  if (!match) {
    return {};
  }
  const openIndex = body.indexOf("{", match.index);
  if (openIndex === -1) {
    return {};
  }
  const soundBody = findBalancedBody(body, openIndex);
  const strings = [...stripLuaLineComments(soundBody).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const sounds = {};
  for (let index = 0; index < strings.length - 1; index += 2) {
    sounds[strings[index]] = strings[index + 1];
  }
  return sounds;
}

function stripLuaLineComments(source) {
  return source.replace(/--[^\n\r]*/g, "");
}

function parseSoundDefinitions(source) {
  const sounds = [];
  const pattern = /MakeSound\(\s*"([^"]+)"\s*,\s*([\s\S]*?)\)/g;
  let match;
  while ((match = pattern.exec(source))) {
    const id = match[1];
    const files = [...match[2].matchAll(/"([^"]+\.(?:wav|ogg|mid)(?:\.gz)?)"/gi)].map((fileMatch) => fileMatch[1]);
    if (files.length > 0) {
      sounds.push({ id, files });
    }
  }
  return sounds;
}

function parseSoundRanges(source) {
  const ranges = new Map();
  for (const match of source.matchAll(/SetSoundRange\(\s*"([^"]+)"\s*,\s*(-?\d+)\s*\)/g)) {
    ranges.set(match[1], Math.max(0, Math.min(255, Number(match[2]))));
  }
  return ranges;
}

const unitSoundEvents = ["selected", "acknowledge", "ready", "dead", "help", "attack"];

function parseSoundMappings(source) {
  const mappings = new Map();
  for (const match of source.matchAll(/MapSound\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)) {
    mappings.set(match[1], match[2]);
  }
  return mappings;
}

function parseTilesetSoundMappings(source) {
  const tables = new Map();
  for (const tableName of ["CritterSounds", "CritterSoundsDeath"]) {
    const match = source.match(new RegExp(`local\\s+${tableName}\\s*=\\s*\\{([\\s\\S]*?)\\}`));
    if (!match) {
      continue;
    }
    const entries = {};
    for (const entry of match[1].matchAll(/\b(summer|winter|wasteland|swamp)\s*=\s*"([^"]+)"/g)) {
      entries[entry[1]] = entry[2];
    }
    tables.set(tableName, entries);
  }

  const mappings = new Map();
  for (const match of source.matchAll(/MapSound\(\s*"([^"]+)"\s*,\s*(\w+)\[wargus\.tileset\]\s*\)/g)) {
    const soundKey = match[1];
    const table = tables.get(match[2]);
    const unitSound = splitUnitSoundKey(soundKey);
    if (!table || !unitSound) {
      continue;
    }
    const unitTypeId = soundKeyToUnitTypeId(unitSound.unitKey);
    if (!unitTypeId) {
      continue;
    }
    for (const [tileset, soundId] of Object.entries(table)) {
      mappings.set(`${unitTypeId}:${tileset}:${unitSound.event}`, { soundKey, unitTypeId, tileset, event: unitSound.event, soundId });
    }
  }
  return mappings;
}

function splitUnitSoundKey(soundKey) {
  for (const event of unitSoundEvents) {
    const hyphenSuffix = `-${event}`;
    if (soundKey.endsWith(hyphenSuffix)) {
      return { unitKey: soundKey.slice(0, -hyphenSuffix.length), event };
    }
    const spaceSuffix = ` ${event}`;
    if (soundKey.endsWith(spaceSuffix)) {
      return { unitKey: soundKey.slice(0, -spaceSuffix.length).replace(/\s+/g, "-"), event };
    }
  }
  return null;
}

function soundKeyToUnitTypeId(key) {
  if (!key) {
    return null;
  }
  const aliases = {
    axethrower: "unit-axethrower",
    "cho-gall": "unit-double-head",
    dwarves: "unit-dwarves",
    "elven-destroyer": "unit-human-destroyer",
    "giant-turtle": "unit-orc-submarine",
    "gnomish-submarine": "unit-human-submarine",
    "gul-dan": "unit-ice-bringer",
    lothar: "unit-wise-man",
    "troll-destroyer": "unit-orc-destroyer",
    "uther-lightbringer": "unit-man-of-light",
    zuljin: "unit-sharp-axe"
  };
  return aliases[key] ?? `unit-${key}`;
}

function resolveSoundAlias(soundId, soundAliases) {
  let current = soundId;
  const seen = new Set();
  while (soundAliases.has(current) && !seen.has(current)) {
    seen.add(current);
    current = soundAliases.get(current);
  }
  return current;
}

function parseSoundGroups(source) {
  const groups = [];
  const pattern = /MakeSoundGroup\(\s*"([^"]+)"\s*,\s*([\s\S]*?)\)/g;
  let match;
  while ((match = pattern.exec(source))) {
    const id = match[1];
    const members = [...match[2].matchAll(/"([^"]+)"/g)].map((memberMatch) => memberMatch[1]);
    if (members.length > 0) {
      groups.push({ id, members });
    }
  }
  return groups;
}

function parseGameSounds(source) {
  const gameSounds = [];
  const soundVariables = new Map();
  for (const match of source.matchAll(/\b(\w+)\s*=\s*MakeSound\(\s*"([^"]+)"/g)) {
    soundVariables.set(match[1], match[2]);
  }
  const start = source.indexOf("DefineGameSounds(");
  if (start === -1) {
    return gameSounds;
  }
  const openIndex = source.indexOf("(", start);
  const body = source.slice(openIndex + 1, findBalancedParenEnd(source, openIndex));
  const pattern = /"([^"]+)"\s*,\s*\{\s*"([^"]+)"\s*,\s*([^}]+)\}/g;
  let match;
  while ((match = pattern.exec(body))) {
    const soundExpression = match[3];
    const soundId = soundExpression.match(/MakeSound\(\s*"([^"]+)"/)?.[1]
      ?? soundVariables.get(soundExpression.trim())
      ?? null;
    if (soundId) {
      gameSounds.push({
        event: match[1],
        race: match[2],
        soundId
      });
    }
  }
  for (const line of body.split(/\r?\n/)) {
    const simpleMatch = line.match(/^\s*"([^"]+)"\s*,\s*(\w+)\s*,?\s*$/);
    if (!simpleMatch) {
      continue;
    }
    const soundId = soundVariables.get(simpleMatch[2]);
    if (soundId) {
      gameSounds.push({
        event: simpleMatch[1],
        race: "any",
        soundId
      });
    }
  }
  return gameSounds;
}

function parseMissileDefinitions(source) {
  const missileClassVariables = parseStringVariables(source);
  const missiles = [];
  const marker = 'DefineMissileType("';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }
    const idStart = start + marker.length;
    const idEnd = source.indexOf('"', idStart);
    const id = source.slice(idStart, idEnd);
    const bodyStart = source.indexOf("{", idEnd);
    if (bodyStart === -1) {
      cursor = idEnd;
      continue;
    }
    const body = findBalancedBody(source, bodyStart);
    const sizeMatch = body.match(/Size\s*=\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}/);
    const damage = parseMissileDamage(body);
    missiles.push({
      id,
      file: body.match(/File\s*=\s*"([^"]+)"/)?.[1] ?? null,
      size: sizeMatch ? [Number(sizeMatch[1]), Number(sizeMatch[2])] : null,
      frames: Number(body.match(/Frames\s*=\s*(-?\d+)/)?.[1] ?? 0),
      numDirections: Number(body.match(/NumDirections\s*=\s*(-?\d+)/)?.[1] ?? 1),
      className: parseMissileClassName(body, missileClassVariables),
      sleep: Number(body.match(/Sleep\s*=\s*(-?\d+)/)?.[1] ?? 0),
      speed: Number(body.match(/(?:^|[\n,{]\s*)Speed\s*=\s*(-?\d+)/m)?.[1] ?? 0),
      blizzardSpeed: Number(body.match(/BlizzardSpeed\s*=\s*(-?\d+)/)?.[1] ?? 0),
      range: Number(body.match(/Range\s*=\s*(-?\d+)/)?.[1] ?? 0),
      drawLevel: Number(body.match(/DrawLevel\s*=\s*(-?\d+)/)?.[1] ?? 0),
      impactSound: body.match(/ImpactSound\s*=\s*"([^"]+)"/)?.[1] ?? null,
      firedSound: body.match(/FiredSound\s*=\s*"([^"]+)"/)?.[1] ?? null,
      impactMissile: body.match(/ImpactMissile\s*=\s*"([^"]+)"/)?.[1] ?? null,
      splashFactor: Number(body.match(/SplashFactor\s*=\s*(-?\d+)/)?.[1] ?? 0),
      numBounces: Number(body.match(/NumBounces\s*=\s*(-?\d+)/)?.[1] ?? 0),
      canHitOwner: /CanHitOwner\s*=\s*true/.test(body),
      friendlyFire: /FriendlyFire\s*=\s*true/.test(body),
      damage
    });
    cursor = bodyStart + body.length + 2;
  }
  return missiles;
}

function parseStringVariables(source) {
  const variables = new Map();
  for (const match of stripLuaComments(source).matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]+)"/gm)) {
    variables.set(match[1], match[2]);
  }
  return variables;
}

function parseMissileClassName(body, variables) {
  const literal = body.match(/Class\s*=\s*"([^"]+)"/)?.[1];
  if (literal) {
    return literal;
  }
  const variable = body.match(/Class\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? null;
  return variable ? variables.get(variable) ?? variable : null;
}

function parseMissileDamage(body) {
  const rand = body.match(/Damage\s*=\s*Rand\s*\(\s*(-?\d+)\s*\)/);
  if (rand) {
    const random = Math.max(0, Number(rand[1]));
    return { base: 0, random, expression: `Rand(${random})` };
  }
  const fixed = body.match(/Damage\s*=\s*(-?\d+)/);
  if (fixed) {
    const base = Number(fixed[1]);
    return { base, random: 0, expression: String(base) };
  }
  return null;
}

function parseBurningBuildingStages(source) {
  const start = source.indexOf("DefineBurningBuilding(");
  if (start === -1) {
    return [];
  }
  const openIndex = source.indexOf("(", start);
  if (openIndex === -1) {
    return [];
  }
  let depth = 0;
  let bodyEnd = openIndex;
  for (; bodyEnd < source.length; bodyEnd += 1) {
    const char = source[bodyEnd];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) {
      break;
    }
  }
  const body = source.slice(openIndex + 1, bodyEnd);
  const stages = [];
  const stagePattern = /\{\s*"percent"\s*,\s*(-?\d+)(?:\s*,\s*"missile"\s*,\s*"([^"]+)")?\s*\}/g;
  let match;
  while ((match = stagePattern.exec(body))) {
    stages.push({
      percent: Number(match[1]),
      missile: match[2] ?? null
    });
  }
  return stages;
}

function parseAllowRules(source) {
  const rules = [];
  const functionBodies = new Map();
  const functionPattern = /function\s+(DefineAllow[A-Za-z0-9_]+)\(([^)]*)\)([\s\S]*?)\nend/g;
  let functionMatch;
  while ((functionMatch = functionPattern.exec(source))) {
    functionBodies.set(functionMatch[1], {
      params: functionMatch[2].split(",").map((param) => param.trim()).filter(Boolean),
      body: functionMatch[3]
    });
  }

  for (const [name, definition] of functionBodies) {
    const unitsMatch = definition.body.match(/local\s+units\s*=\s*\{([\s\S]*?)\}/);
    const flagParam = definition.body.match(/DefineAllow\(unitName,\s*([A-Za-z_][A-Za-z0-9_]*)\)/)?.[1] ?? null;
    if (!unitsMatch || !flagParam) {
      continue;
    }
    const flagParamIndex = definition.params.indexOf(flagParam);
    const ids = [...unitsMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    const callPattern = new RegExp(`${name}\\(\\s*"([^"]+)"\\s*\\)`, "g");
    let callMatch;
    while ((callMatch = callPattern.exec(source))) {
      const flags = callMatch[1];
      for (const id of ids) {
        if (flagParamIndex === 0) {
          rules.push({ id, flags });
        }
      }
    }
  }

  for (const match of source.matchAll(/DefineAllow\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)) {
    rules.push({ id: match[1], flags: match[2] });
  }
  return rules;
}

function parseDependencyRules(source) {
  const uncommented = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const rules = [];
  const marker = "DefineDependency(";
  let cursor = 0;
  while (cursor < uncommented.length) {
    const start = uncommented.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }
    const openIndex = start + marker.length - 1;
    let depth = 0;
    let bodyEnd = openIndex;
    for (; bodyEnd < uncommented.length; bodyEnd += 1) {
      const char = uncommented[bodyEnd];
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (depth === 0) {
        break;
      }
    }
    const body = uncommented.slice(openIndex + 1, bodyEnd);
    const id = body.match(/^\s*"([^"]+)"/)?.[1] ?? null;
    if (!id) {
      cursor = bodyEnd + 1;
      continue;
    }
    const alternatives = [...body.matchAll(/\{([^}]*)\}/g)]
      .map((listMatch) => [...listMatch[1].matchAll(/"([^"]+)"/g)].map((itemMatch) => itemMatch[1]))
      .filter((items) => items.length > 0);
    if (alternatives.length > 0) {
      rules.push({ id, alternatives });
    }
    cursor = bodyEnd + 1;
  }
  return rules;
}

function parseButtonDefinitions(source) {
  const uncommented = stripLuaComments(source);
  const buttons = [];
  const marker = "DefineButton(";
  let cursor = 0;
  while (cursor < uncommented.length) {
    const start = uncommented.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }
    const openIndex = uncommented.indexOf("{", start);
    if (openIndex === -1) {
      cursor = start + marker.length;
      continue;
    }
    const body = findBalancedBody(uncommented, openIndex);
    const action = readLuaStringField(body, "Action");
    if (!action) {
      cursor = openIndex + body.length + 2;
      continue;
    }
    buttons.push({
      pos: readLuaNumberField(body, "Pos", 0),
      level: readLuaNumberField(body, "Level", 0),
      alwaysShow: readLuaBoolField(body, "AlwaysShow", false),
      icon: readLuaStringField(body, "Icon"),
      action,
      value: readLuaValueField(body, "Value"),
      allowed: readLuaStringField(body, "Allowed"),
      allowArg: readLuaStringArrayField(body, "AllowArg"),
      key: readLuaStringField(body, "Key"),
      hint: readLuaTranslatedStringField(body, "Hint"),
      popup: readLuaStringField(body, "Popup"),
      forUnit: readLuaStringArrayField(body, "ForUnit"),
      extensionCondition: sourceExtensionConditionAt(uncommented, start)
    });
    cursor = openIndex + body.length + 2;
  }
  return buttons;
}

function sourceExtensionConditionAt(source, index) {
  const stack = [];
  const prefix = source.slice(0, Math.max(0, index));
  for (const rawLine of prefix.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^if\s*\(\s*wargus\.extensions\s*\)\s*then\b/.test(line)) {
      stack.push({ kind: "extension", value: true });
    } else if (/^if\b.*\bthen\b/.test(line)) {
      stack.push({ kind: "other" });
    } else if (/^do\b/.test(line)) {
      stack.push({ kind: "other" });
    } else if (/^else\b/.test(line)) {
      const top = stack[stack.length - 1];
      if (top?.kind === "extension") {
        top.value = !top.value;
      }
    } else if (/^end\b/.test(line)) {
      stack.pop();
    }
  }
  const active = [...stack].reverse().find((entry) => entry.kind === "extension");
  return active ? active.value : null;
}

function parsePopupDefinitions(source) {
  const uncommented = stripLuaComments(source);
  const popups = [];
  const marker = "DefinePopup(";
  let cursor = 0;
  while (cursor < uncommented.length) {
    const start = uncommented.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }
    const openIndex = uncommented.indexOf("{", start);
    if (openIndex === -1) {
      cursor = start + marker.length;
      continue;
    }
    const body = findBalancedBody(uncommented, openIndex);
    const id = readLuaStringField(body, "Ident");
    if (!id) {
      cursor = openIndex + body.length + 2;
      continue;
    }
    const variableNames = uniqueStrings([...body.matchAll(/Variable\s*=\s*"([^"]+)"/g)].map((match) => match[1]));
    const extraHints = uniqueStrings([...body.matchAll(/Text\s*=\s*_?\("([^"]+)"\)/g)].map((match) => cleanSourceText(match[1])));
    const conditionalHints = {};
    for (const match of body.matchAll(/Condition\s*=\s*\{[^}]*ButtonAction\s*=\s*"([^"]+)"[^}]*\}[\s\S]*?Text\s*=\s*_?\("([^"]+)"\)/g)) {
      const action = match[1];
      const hint = cleanSourceText(match[2]);
      if (!hint) {
        continue;
      }
      conditionalHints[action] ??= [];
      conditionalHints[action].push(hint);
    }
    popups.push({
      id,
      race: "any",
      kind: "commands",
      hasHint: /InfoType\s*=\s*"Hint"/.test(body),
      hasDescription: /InfoType\s*=\s*"Description"/.test(body),
      showsCosts: /More\s*=\s*\{\s*"Costs"/.test(body),
      variables: variableNames,
      actionHints: uniqueStrings([...body.matchAll(/ButtonAction\s*=\s*"([^"]+)"/g)].map((match) => match[1])),
      conditionalHints: Object.fromEntries(Object.entries(conditionalHints).map(([action, hints]) => [action, uniqueStrings(hints)])),
      extraHints
    });
    cursor = openIndex + body.length + 2;
  }
  return popups;
}

function enrichPopupDefinitionsFromButtons(popupsById, buttons) {
  const referencesByPopup = new Map();
  for (const button of buttons) {
    if (!button.popup || !popupsById.has(button.popup)) {
      continue;
    }
    const reference = referencesByPopup.get(button.popup) ?? {
      races: new Set(),
      kinds: new Set()
    };
    const race = sourceButtonScriptRace(button.source);
    if (race) {
      reference.races.add(race);
    }
    const kind = sourceButtonPopupKind(button);
    if (kind) {
      reference.kinds.add(kind);
    }
    referencesByPopup.set(button.popup, reference);
  }

  for (const [popupId, reference] of referencesByPopup) {
    const popup = popupsById.get(popupId);
    if (!popup) {
      continue;
    }
    popupsById.set(popupId, {
      ...popup,
      race: sourcePopupRaceFromReferences(reference.races),
      kind: sourcePopupKindFromReferences(reference.kinds)
    });
  }
}

function sourceButtonScriptRace(scriptFile) {
  if (scriptFile.startsWith("scripts/human/")) {
    return "human";
  }
  if (scriptFile.startsWith("scripts/orc/")) {
    return "orc";
  }
  return null;
}

function sourceButtonPopupKind(button) {
  if (button.action === "build" || button.action === "upgrade-to") {
    return "building";
  }
  if (button.action === "train-unit") {
    return "unit";
  }
  if (button.action === "research" || button.action === "cast-spell") {
    return "upgrade";
  }
  return "commands";
}

function sourcePopupRaceFromReferences(races) {
  if (races.size === 1) {
    return [...races][0];
  }
  return "any";
}

function sourcePopupKindFromReferences(kinds) {
  if (kinds.size === 1) {
    return [...kinds][0];
  }
  if (kinds.has("commands")) {
    return "commands";
  }
  if (kinds.has("building")) {
    return "building";
  }
  if (kinds.has("unit")) {
    return "unit";
  }
  if (kinds.has("upgrade")) {
    return "upgrade";
  }
  return "commands";
}

function parseEngineSettings(source) {
  const uncommented = stripLuaComments(source);
  const clampByte = (value, fallback) => {
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(255, Math.round(parsed))) : fallback;
  };
  const parseFogOfWarBlur = () => {
    const match = uncommented.match(/SetFogOfWarBlur\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+)\s*\)/);
    const simpleRadius = Number(match?.[1] ?? 2.0);
    const bilinearRadius = Number(match?.[2] ?? 1.5);
    const iterations = Number(match?.[3] ?? 3);
    return {
      simpleRadius: Number.isFinite(simpleRadius) && simpleRadius > 0 ? simpleRadius : 2.0,
      bilinearRadius: Number.isFinite(bilinearRadius) && bilinearRadius > 0 ? bilinearRadius : 1.5,
      iterations: Number.isFinite(iterations) && iterations > 0 ? Math.max(1, Math.min(255, Math.round(iterations))) : 3
    };
  };
  const readPreferenceBool = (name, fallback) => {
    const match = uncommented.match(new RegExp(`(?<![.\\w])${name}\\s*=\\s*(true|false)`));
    return match ? match[1] === "true" : fallback;
  };
  const readPreferenceString = (name, fallback) => uncommented.match(new RegExp(`(?<![.\\w])${name}\\s*=\\s*"([^"]*)"`))?.[1] ?? fallback;
  const readPreferenceTranslatedString = (name, fallback) => uncommented.match(new RegExp(`(?<![.\\w])${name}\\s*=\\s*(?:_\\()?\"([^"]*)\"\\)?`))?.[1] ?? fallback;
  const showButtonPopupsDefault = readPreferenceBool("ShowButtonPopups", true);
  const showCommandKeyDefault = readPreferenceBool("ShowCommandKey", true);
  const showDamageDefault = readPreferenceBool("ShowDamage", false);
  const showMessagesDefault = readPreferenceBool("ShowMessages", true);
  const showOrdersDefault = readPreferenceBool("ShowOrders", true);
  const readPreferenceAssignmentBool = (name, fallback) => {
    const match = uncommented.match(new RegExp(`Preference\\.${name}\\s*=\\s*(true|false|[01])`));
    if (!match) {
      return fallback;
    }
    return match[1] === "true" || match[1] === "1";
  };
  const readPreferenceAssignmentNumber = (name, fallback) => {
    const match = uncommented.match(new RegExp(`Preference\\.${name}\\s*=\\s*(-?\\d+)`));
    const value = Number(match?.[1] ?? fallback);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
  };
  const showTipsDefault = readPreferenceBool("ShowTips", true);
  const pauseOnLeaveDefault = readPreferenceBool("PauseOnLeave", true);
  const sourceDamageMissileId = uncommented.match(/SetDamageMissile\(\s*"([^"]+)"\s*\)/)?.[1] ?? null;
  const damageMissileId = showDamageDefault ? sourceDamageMissileId : null;
  const sourceName = uncommented.match(/wargus\.Name\s*=\s*(?:_\()?\"([^"]+)\"/)?.[1] ?? null;
  const fullGameName = uncommented.match(/SetFullGameName\(\s*wargus\.Name\s*\)/) ? sourceName : uncommented.match(/SetFullGameName\(\s*(?:_\()?\"([^"]+)\"/)?.[1] ?? sourceName;
  const gameCopyright = uncommented.match(/wargus\.Copyright\s*=\s*(?:_\()?\"([^"]+)\"/)?.[1] ?? null;
  const readPreferenceNumber = (name, fallback) => Number(uncommented.match(new RegExp(`(?<![.\\w])${name}\\s*=\\s*(\\d+)`))?.[1] ?? fallback);
  const revealMapMode = (() => {
    const mode = uncommented.match(/RevealMap\(\s*"([^"]+)"\s*\)/)?.[1] ?? "hidden";
    return ["hidden", "known", "explored"].includes(mode) ? mode : "hidden";
  })();
  const videoWidthDefault = readPreferenceNumber("VideoWidth", 640);
  const videoHeightDefault = readPreferenceNumber("VideoHeight", 480);
  const videoSize = sourceVideoSize(videoWidthDefault, videoHeightDefault);
  return {
    buildingCapture: uncommented.match(/SetBuildingCapture\(\s*(true|false)\s*\)/)?.[1] === "true",
    clickMissileId: uncommented.match(/SetClickMissile\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
    damageMissileId,
    sourceDamageMissileId,
    defaultIncomes: parseDefaultNumberList(uncommented, "DefineDefaultIncomes"),
    defaultResourceActions: parseDefaultStringList(uncommented, "DefineDefaultActions"),
    defaultResourceAmounts: parseDefaultResourceAmounts(uncommented),
    defaultResourceMaxAmounts: parseDefaultNumberList(uncommented, "DefineDefaultResourceMaxAmounts"),
    defaultResourceNames: parseDefaultStringList(uncommented, "DefineDefaultResourceNames"),
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
    fogOfWarBilinear: uncommented.match(/FogOfWarBilinear\s*=\s*(true|false)/)?.[1] === "true",
    fogOfWarBlur: parseFogOfWarBlur(),
    fogOfWarEasingSteps: clampByte(uncommented.match(/SetFogOfWarEasingSteps\(\s*(-?\d+)\s*\)/)?.[1], 8),
    fogOfWarEnabled: uncommented.match(/FogOfWar\s*=\s*(true|false)/)?.[1] !== "false",
    fogOfWarGraphics: uncommented.match(/SetFogOfWarGraphics\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
    fogOfWarOpacityLevels: parseByteTupleCall(uncommented, "SetFogOfWarOpacityLevels", [0x7f, 0xbe, 0xfe]),
    fogOfWarType: uncommented.match(/FogOfWarType\s*=\s*"([^"]+)"/)?.[1] ?? null,
    fieldOfViewType: uncommented.match(/SetFieldOfViewType\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
    opaqueTerrainTypes: parseDefaultStringList(uncommented, "SetOpaqueFor"),
    forestRegenerationSeconds: Number(uncommented.match(/SetForestRegeneration\(\s*(-?\d+)\s*\)/)?.[1] ?? 0),
    fullGameName,
    gameName: uncommented.match(/SetGameName\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
    gameVersion: uncommented.match(/wargus\.Version\s*=\s*"([^"]+)"/)?.[1] ?? null,
    gameHomepage: uncommented.match(/wargus\.Homepage\s*=\s*"([^"]+)"/)?.[1] ?? null,
    gameCopyright,
    gameLicense: uncommented.match(/wargus\.Licen[cs]e\s*=\s*"([^"]+)"/)?.[1] ?? null,
    globalBuildingLimit: Number(uncommented.match(/SetAllPlayersBuildingLimit\(\s*(\d+)\s*\)/)?.[1] ?? 0),
    globalTotalUnitLimit: Number(uncommented.match(/SetAllPlayersTotalUnitLimit\(\s*(\d+)\s*\)/)?.[1] ?? 0),
    globalUnitLimit: Number(uncommented.match(/SetAllPlayersUnitLimit\(\s*(\d+)\s*\)/)?.[1] ?? 0),
    grabMouseDefault: readPreferenceBool("GrabMouse", false),
    groupKeysDefault: readPreferenceString("GroupKeys", "0123456789`"),
    hardwareCursorDefault: readPreferenceBool("HardwareCursor", false),
    highlightPassabilityDefault: uncommented.match(/SetHighlightPassability\(\s*(true|false)\s*\)/)?.[1] === "true",
    holdClickDelayMsDefault: readPreferenceNumber("HoldClickDelayInMs", 1000),
    iconsShiftDefault: readPreferenceAssignmentBool("IconsShift", true),
    keepRatioDefault: readPreferenceBool("KeepRatio", true),
    keyScrollSpeedDefault: readPreferenceNumber("KeyScrollSpeed", 4),
    lastDifficultyDefault: readPreferenceNumber("LastDifficulty", 2),
    leaveStopScrollingDefault: readPreferenceBool("LeaveStopScrolling", true),
    maxSelectable: Number(uncommented.match(/SetMaxSelectable\(\s*(\d+)\s*\)/)?.[1] ?? 0),
    menuRace: uncommented.match(/SetMenuRace\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
    defaultRace: uncommented.match(/function\s+SetDefaultRaceView\(\)[\s\S]*?SetPlayerData\(\s*GetThisPlayer\(\)\s*,\s*"RaceName"\s*,\s*"([^"]+)"\s*\)/)?.[1] ?? null,
    mapGridDefault: readPreferenceBool("MapGrid", false),
    minimapFogOfWarOpacityLevels: parseByteTupleCall(uncommented, "SetMMFogOfWarOpacityLevels", [0x55, 0xaa, 0xff]),
    minimapWithTerrainDefault: readPreferenceBool("MinimapWithTerrain", true),
    mineNotificationsDefault: readPreferenceBool("MineNotifications", true),
    musicEnabledDefault: readPreferenceBool("MusicEnabled", true),
    musicVolumeDefault: readPreferenceNumber("MusicVolume", 128),
    networkGameDefault: false,
    debugFlagsDefault: uncommented.match(/IsDebugEnabled\s*=\s*true/) ? ["debug"] : [],
    mouseScrollSpeedControlDefault: readPreferenceNumber("MouseScrollSpeedControl", 15),
    mouseScrollSpeedDefault: readPreferenceNumber("MouseScrollSpeed", 1),
    mouseScrollSpeedPressedDefault: readPreferenceNumber("MouseScrollSpeedDefault", 4),
    scrollMargins: parseScrollMargins(uncommented),
    pauseOnLeaveDefault,
    playerNameDefault: uncommented.match(/PlayerName\s*=\s*"([^"]*)"/)?.[1] ?? null,
    playerColorIndex: parsePlayerColorIndex(uncommented),
    playerColors: parsePlayerColors(uncommented),
    defaultPlayerNames: parseDefaultPlayerNames(uncommented),
    completedBarColorRgb: parseUiColor(uncommented, "CompletedBarColorRGB"),
    completedBarShadow: parseUiBool(uncommented, "CompletedBarShadow"),
    autoCastBorderColorRgb: parseUiColor(uncommented, "ButtonPanel.AutoCastBorderColorRGB"),
    autosaveMinutesDefault: readPreferenceAssignmentNumber("AutosaveMinutes", 5),
    buttonStyles: parseButtonStyles(uncommented),
    uiFontColors: parseUiFontColors(uncommented),
    buttonPanel: parseUiButtonPanel(uncommented),
    infoPanel: parseUiInfoPanel(uncommented, videoSize),
    mapArea: parseUiMapArea(uncommented, videoSize),
    minimap: parseUiMinimap(uncommented, videoSize),
    statusLine: parseUiStatusLine(uncommented, videoSize),
    messageUi: parseUiMessageLayout(uncommented),
    menuButtons: parseUiMenuButtons(uncommented),
    revealMapMode,
    revealAttacker: uncommented.match(/SetRevealAttacker\(\s*(true|false)\s*\)/)?.[1] === "true",
    revelationType: uncommented.match(/SetRevelationType\(\s*"([^"]+)"\s*\)/)?.[1] ?? null,
    rightButtonAction: /RightButtonAttacks\(\s*\)/.test(uncommented) ? "attack" : "move",
    extensionsEnabled: uncommented.match(/wargus\.extensions\s*=\s*(true|false)/)?.[1] !== "false",
    resourceUiLabels: parseResourceUiLabels(uncommented),
    resourceUiSlots: parseResourceUiSlots(uncommented, videoSize),
    selectionStyleDefault: readPreferenceTranslatedString("SelectionStyle", "corners"),
    selectionRectangleIndicatesDamageDefault: readPreferenceAssignmentBool("SelectionRectangleIndicatesDamage", false),
    sourceGameSpeedDefault: Number(uncommented.match(/(?<![.\w])GameSpeed\s*=\s*(\d+)/)?.[1] ?? 0),
    showButtonPopupsDefault,
    showCommandKeyDefault,
    showDamageDefault,
    showMessagesDefault,
    showNameDelayTicksDefault: readPreferenceAssignmentNumber("ShowNameDelay", 0),
    showNameTimeTicksDefault: readPreferenceAssignmentNumber("ShowNameTime", 0),
    showNoSelectionStatsDefault: readPreferenceAssignmentBool("ShowNoSelectionStats", true),
    noStatusLineTooltipsDefault: readPreferenceAssignmentBool("NoStatusLineTooltips", false),
    showOrdersDefault,
    showSightRangeDefault: readPreferenceAssignmentBool("ShowSightRange", false),
    showAttackRangeDefault: readPreferenceAssignmentBool("ShowAttackRange", false),
    showReactionRangeDefault: readPreferenceAssignmentBool("ShowReactionRange", false),
    showTipsDefault,
    simplifiedAutoTargetingDefault: readPreferenceBool("SimplifiedAutoTargeting", true),
    speedFactors: parseSpeedFactors(uncommented),
    stereoSoundDefault: readPreferenceBool("StereoSound", true),
    tipNumberDefault: readPreferenceNumber("TipNumber", 0),
    trainingQueue: uncommented.match(/SetTrainingQueue\(\s*(true|false)\s*\)/)?.[1] !== "false",
    useFancyBuildingsDefault: readPreferenceBool("UseFancyBuildings", false),
    videoFullScreenDefault: readPreferenceBool("VideoFullScreen", false),
    videoHeightDefault,
    videoShaderDefault: readPreferenceString("VideoShader", "none"),
    videoWidthDefault,
    viewportModeDefault: readPreferenceNumber("ViewportMode", 0)
  };
}

function parseTitleScreens(source) {
  const uncommented = stripLuaComments(source);
  const marker = "SetTitleScreens(";
  const start = uncommented.indexOf(marker);
  if (start === -1) {
    return [];
  }
  const openIndex = uncommented.indexOf("(", start);
  if (openIndex === -1) {
    return [];
  }
  const body = findBalancedCallBody(uncommented, openIndex);
  const screens = [];
  for (const match of body.matchAll(/\{([^{}]*)\}/g)) {
    const entry = match[1];
    const image = entry.match(/Image\s*=\s*"([^"]+)"/)?.[1] ?? null;
    if (!image) {
      continue;
    }
    const timeout = entry.match(/Timeout\s*=\s*(\d+(?:\.\d+)?)/)?.[1] ?? null;
    const musicLiteral = entry.match(/Music\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const music = musicLiteral ? `${musicLiteral}.mid`.replace(/\.mid\.mid$/i, ".mid") : null;
    screens.push({
      image,
      timeoutSeconds: timeout ? Number(timeout) : null,
      music,
      stretchMode: entry.includes("keep-ratio") ? "keep-ratio" : entry.includes("stretch") ? "stretch" : null
    });
  }
  return screens;
}

function parseTitleTips(source, sourcePath) {
  const uncommented = stripLuaComments(source);
  const tipsMatch = uncommented.match(/local\s+tips\s*=\s*\{([\s\S]*?)\n\}/);
  const body = tipsMatch?.[1] ?? "";
  return [...body.matchAll(/_\("((?:\\.|[^"])*)"\)/g)]
    .map((match) => ({
      text: unescapeLuaString(match[1]),
      source: sourcePath
    }))
    .filter((tip) => tip.text.length > 0);
}

function parseCursorDefinitions(source, sourcePath) {
  const uncommented = stripLuaComments(source);
  const cursors = [];
  let cursor = 0;
  const marker = "DefineCursor(";
  while ((cursor = uncommented.indexOf(marker, cursor)) !== -1) {
    const openIndex = uncommented.indexOf("(", cursor);
    const closeIndex = findBalancedParenEnd(uncommented, openIndex);
    const body = uncommented.slice(openIndex + 1, closeIndex);
    const name = body.match(/Name\s*=\s*"([^"]+)"/)?.[1];
    const race = body.match(/Race\s*=\s*"([^"]+)"/)?.[1] ?? "any";
    const file = body.match(/File\s*=\s*"([^"]+)"/)?.[1];
    const hotSpot = body.match(/HotSpot\s*=\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}/);
    const size = body.match(/Size\s*=\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}/);
    if (name && file && hotSpot && size) {
      cursors.push({
        name,
        race,
        file,
        hotSpot: [Number(hotSpot[1]), Number(hotSpot[2])],
        size: [Number(size[1]), Number(size[2])],
        source: sourcePath
      });
    }
    cursor = closeIndex + 1;
  }
  return cursors;
}

function cursorDefinitionsWithDerivedBlockedCursors(cursors) {
  const blockedFiles = {
    human: "ui/human/cursors/human_dont_click_here.png",
    orc: "ui/orc/cursors/orcish_dont_click_here.png"
  };
  const records = [...cursors];
  for (const [race, file] of Object.entries(blockedFiles)) {
    if (records.some((cursor) => cursor.race === race && cursor.name === "cursor-blocked")) {
      continue;
    }
    const point = records.find((cursor) => cursor.race === race && cursor.name === "cursor-point");
    records.push({
      name: "cursor-blocked",
      race,
      file,
      hotSpot: point?.hotSpot ?? [3, 2],
      size: point?.size ?? [32, 32],
      source: `${point?.source ?? "scripts/ui.lua"}#derived-blocked`
    });
  }
  return records;
}

function parseMusicCues(scriptSources) {
  const cues = [];
  for (const [race, scriptFile] of [["human", "scripts/human/ui_pandora.lua"], ["orc", "scripts/orc/ui_pandora.lua"]]) {
    const source = stripLuaComments(scriptSources.get(scriptFile) ?? "");
    const playlist = parseWargusPlaylist(source);
    if (playlist.length > 0) {
      cues.push({ kind: "battle", race, files: playlist, source: scriptFile });
    }
  }
  const resultsSource = stripLuaComments(scriptSources.get("scripts/menus/results.lua") ?? "");
  for (const [kind, label] of [["victory", "Victory"], ["defeat", "Defeat"]]) {
    for (const race of ["human", "orc"]) {
      const file = parseRaceResultMusic(resultsSource, race, label);
      if (file) {
        cues.push({ kind, race, files: [file], source: "scripts/menus/results.lua" });
      }
    }
  }
  const campaignSource = stripLuaComments(scriptSources.get("scripts/menus/campaign.lua") ?? "");
  for (const race of ["human", "orc"]) {
    const file = parseRaceBriefingMusic(campaignSource, race);
    if (file) {
      cues.push({ kind: "briefing", race, files: [file], source: "scripts/menus/campaign.lua" });
    }
  }
  return cues.sort((a, b) => a.kind.localeCompare(b.kind) || a.race.localeCompare(b.race));
}

function parseResultScreens(source, sourcePath) {
  const uncommented = stripLuaComments(source);
  const constants = new Map();
  for (const match of uncommented.matchAll(/local\s+([ho](?:victory|defeat))\s*=\s*"([^"]+)"/g)) {
    constants.set(match[1], match[2]);
  }
  const entries = [
    { status: "victory", race: "human", key: "hvictory" },
    { status: "defeat", race: "human", key: "hdefeat" },
    { status: "draw", race: "human", key: "hdefeat" },
    { status: "victory", race: "orc", key: "ovictory" },
    { status: "defeat", race: "orc", key: "odefeat" },
    { status: "draw", race: "orc", key: "odefeat" }
  ];
  return entries
    .map((entry) => ({
      status: entry.status,
      race: entry.race,
      image: constants.get(entry.key),
      source: sourcePath
    }))
    .filter((entry) => entry.image);
}

function parseResultRanks(source, sourcePath) {
  const uncommented = stripLuaComments(source);
  const ranks = [];
  for (const [race, tableName] of [["human", "humanRanks"], ["orc", "orcRanks"]]) {
    const tableMatch = uncommented.match(new RegExp(`local\\s+${tableName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`));
    const tableBody = tableMatch?.[1] ?? "";
    for (const match of tableBody.matchAll(/(\d+)\s*,\s*_\("((?:\\.|[^"])*)"\)/g)) {
      ranks.push({
        race,
        threshold: Number(match[1]),
        name: unescapeLuaString(match[2]),
        source: sourcePath
      });
    }
  }
  return ranks.sort((a, b) => a.race.localeCompare(b.race) || a.threshold - b.threshold);
}

function parseWargusPlaylist(source) {
  const match = source.match(/wargus\.playlist\s*=\s*\{([\s\S]*?)\}/);
  if (!match) {
    return [];
  }
  const files = [...match[1].matchAll(/"([^"]+)"\s*\.\.\s*wargus\.music_extension/g)].map((entry) => normalizeMusicFile(entry[1]));
  const bneInsert = source.match(/table\.insert\(\s*wargus\.playlist\s*,\s*"([^"]+)"\s*\.\.\s*wargus\.music_extension\s*\)/);
  if (bneInsert) {
    files.push(normalizeMusicFile(bneInsert[1]));
  }
  return [...new Set(files)].filter((file) => allFilesSet.has(file));
}

function parseRaceResultMusic(source, race, label) {
  const prefix = race === "human" ? "Human" : "Orc";
  const pattern = new RegExp(`PlayMusic\\(\\s*"music/${prefix} ${label}"\\s*\\.\\.\\s*wargus\\.music_extension\\s*\\)`);
  return pattern.test(source) ? `music/${prefix} ${label}.mid` : null;
}

function parseRaceBriefingMusic(source, race) {
  const prefix = race === "human" ? "Human" : "Orc";
  const pattern = new RegExp(`PlayMusic\\(\\s*"music/${prefix} Briefing"\\s*\\.\\.\\s*wargus\\.music_extension\\s*\\)`);
  return pattern.test(source) ? `music/${prefix} Briefing.mid` : null;
}

function normalizeMusicFile(value) {
  return `${value}.mid`.replace(/\.mid\.mid$/i, ".mid");
}

function unescapeLuaString(value) {
  return value
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function parseDefaultResourceAmounts(source) {
  const match = source.match(/DefineDefaultResourceAmounts\(([^)]*)\)/s);
  if (!match) {
    return {};
  }
  const amounts = {};
  for (const resourceMatch of match[1].matchAll(/"([^"]+)"\s*,\s*(-?\d+)/g)) {
    amounts[resourceMatch[1]] = Math.max(0, Number(resourceMatch[2]));
  }
  return amounts;
}

function readCallBody(source, functionName) {
  const start = source.indexOf(`${functionName}(`);
  if (start === -1) {
    return "";
  }
  const openIndex = source.indexOf("(", start);
  return source.slice(openIndex + 1, findBalancedParenEnd(source, openIndex));
}

function parseDefaultNumberList(source, functionName) {
  return [...readCallBody(source, functionName).matchAll(/-?\d+/g)].map((match) => Number(match[0]));
}

function parseDefaultStringList(source, functionName) {
  return [...readCallBody(source, functionName).matchAll(/_\("([^"]+)"\)|"([^"]+)"/g)]
    .map((match) => cleanSourceText(match[1] ?? match[2] ?? ""))
    .filter(Boolean);
}

function parseResourceUiLabels(source) {
  const match = source.match(/ResourcesOnUI\s*=\s*\{/);
  if (!match) {
    return [];
  }
  const openIndex = source.indexOf("{", match.index);
  const body = findBalancedBody(source, openIndex);
  return [...body.matchAll(/_\("([^"]+)"\)|"([^"]+)"/g)]
    .map((labelMatch) => cleanSourceText(labelMatch[1] ?? labelMatch[2] ?? ""))
    .filter(Boolean);
}

const resourceUiKeyMap = {
  "1": { key: "gold", resource: "gold" },
  "2": { key: "wood", resource: "wood" },
  "3": { key: "oil", resource: "oil" },
  FoodCost: { key: "food", resource: "food" },
  ScoreCost: { key: "score", resource: "score" },
  ManaResCost: { key: "mana", resource: "mana" },
  FreeWorkersCount: { key: "workers", resource: "workers" }
};

function parseResourceUiSlots(source, videoSize = sourceVideoSize()) {
  const slots = new Map();
  const graphicPattern = /UI\.Resources\[(\d+|[A-Za-z]\w*)\]\.G\s*=\s*CGraphic:New\(\s*"([^"]+)"\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g;
  for (const match of source.matchAll(graphicPattern)) {
    const mapped = resourceUiKeyMap[match[1]];
    if (!mapped) {
      continue;
    }
    slots.set(match[1], {
      key: mapped.key,
      resource: mapped.resource,
      graphic: normalizeResourceGraphicPath(match[2]),
      frame: 0,
      frameWidth: Math.max(1, Number(match[3])),
      frameHeight: Math.max(1, Number(match[4])),
      iconX: 0,
      iconY: 0,
      textX: 0,
      textY: 0,
      hidden: false
    });
  }
  for (const [slotId, slot] of slots) {
    slot.frame = readResourceUiNumber(source, slotId, "IconFrame", 0, videoSize);
    slot.iconX = readResourceUiNumber(source, slotId, "IconX", 0, videoSize);
    slot.iconY = readResourceUiNumber(source, slotId, "IconY", 0, videoSize);
    slot.textX = readResourceUiNumber(source, slotId, "TextX", 0, videoSize);
    slot.textY = readResourceUiNumber(source, slotId, "TextY", 0, videoSize);
    slot.hidden = slot.iconX < 0 || slot.iconY < 0 || slot.textX < 0 || slot.textY < 0;
  }
  return [...slots.values()].sort((a, b) => a.iconX - b.iconX || a.key.localeCompare(b.key));
}

function normalizeResourceGraphicPath(value) {
  return value.startsWith("graphics/") ? value.slice("graphics/".length) : value;
}

function readResourceUiNumber(source, slotId, property, fallback, videoSize = sourceVideoSize()) {
  const escapedSlot = slotId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`UI\\.Resources\\[${escapedSlot}\\]\\.${property}\\s*=\\s*([^\\n\\r]+)`));
  return match ? evaluateSourceNumberExpression(match[1], fallback, videoSize) : fallback;
}

function evaluateSourceNumberExpression(expression, fallback, videoSize = sourceVideoSize()) {
  const normalized = expression
    .replace(/Video\.Width/g, String(videoSize.width))
    .replace(/Video\.Height/g, String(videoSize.height))
    .replace(/\s+/g, "");
  if (!/^-?\d+(?:[+-]\d+)*$/.test(normalized)) {
    return fallback;
  }
  return normalized.match(/[+-]?\d+/g)?.reduce((total, value) => total + Number(value), 0) ?? fallback;
}

function cleanSourceText(text) {
  return text
    .replace(/~!/g, "")
    .replace(/~<([^~>]+)~>/g, "$1")
    .replace(/~/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpellDefinitions(source) {
  const uncommented = stripLuaComments(source);
  const spells = [];
  const marker = "DefineSpell(";
  let cursor = 0;
  while (cursor < uncommented.length) {
    const start = uncommented.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }
    const openIndex = start + marker.length - 1;
    const bodyEnd = findBalancedParenEnd(uncommented, openIndex);
    const body = uncommented.slice(openIndex + 1, bodyEnd);
    const id = body.match(/^\s*"([^"]+)"/)?.[1] ?? null;
    if (!id) {
      cursor = bodyEnd + 1;
      continue;
    }
    const actionBody = readLuaTableAfterKey(body, "action");
    const conditionBody = readLuaTableAfterKey(body, "condition");
    const autocastBody = readLuaTableAfterKey(body, "autocast");
    const aiCastBody = readLuaTableAfterKey(body, "ai-cast");
    const autocastConditionBody = autocastBody ? readLuaTableAfterKey(autocastBody, "condition") : null;
    const aiCastConditionBody = aiCastBody ? readLuaTableAfterKey(aiCastBody, "condition") : null;
    const rangeRaw = readCclValueAfterKey(body, "range");
    const autocastRangeRaw = autocastBody ? readCclValueAfterKey(autocastBody, "range") : null;
    const aiCastRangeRaw = aiCastBody ? readCclValueAfterKey(aiCastBody, "range") : null;
    spells.push({
      id,
      showName: readCclStringAfterKey(body, "showname"),
      manaCost: Number(readCclValueAfterKey(body, "manacost") ?? 0),
      range: rangeRaw === "infinite" ? "infinite" : rangeRaw !== null && Number.isFinite(Number(rangeRaw)) ? Number(rangeRaw) : null,
      autocastRange: autocastRangeRaw !== null && Number.isFinite(Number(autocastRangeRaw)) ? Number(autocastRangeRaw) : null,
      aiCastRange: aiCastRangeRaw !== null && Number.isFinite(Number(aiCastRangeRaw)) ? Number(aiCastRangeRaw) : null,
      autocastPriority: parseSpellAutoCastPriority(autocastBody),
      aiCastPriority: parseSpellAutoCastPriority(aiCastBody),
      autocastPositionCallback: parseSpellPositionAutocastCallback(autocastBody),
      aiCastPositionCallback: parseSpellPositionAutocastCallback(aiCastBody),
      autocastHitPointMinPercent: autocastBody ? readNestedPercentField(autocastBody, "HitPoints", "MinValuePercent") : null,
      autocastHitPointMaxPercent: autocastBody ? readNestedPercentField(autocastBody, "HitPoints", "MaxValuePercent") : null,
      aiCastHitPointMinPercent: aiCastBody ? readNestedPercentField(aiCastBody, "HitPoints", "MinValuePercent") : null,
      aiCastHitPointMaxPercent: aiCastBody ? readNestedPercentField(aiCastBody, "HitPoints", "MaxValuePercent") : null,
      autocastManaMinPercent: autocastBody ? readNestedPercentField(autocastBody, "Mana", "MinValuePercent") : null,
      autocastManaMaxPercent: autocastBody ? readNestedPercentField(autocastBody, "Mana", "MaxValuePercent") : null,
      aiCastManaMinPercent: aiCastBody ? readNestedPercentField(aiCastBody, "Mana", "MinValuePercent") : null,
      aiCastManaMaxPercent: aiCastBody ? readNestedPercentField(aiCastBody, "Mana", "MaxValuePercent") : null,
      conditionVariableRules: parseSpellVariableConditionRules(conditionBody),
      autocastVariableRules: parseSpellVariableConditionRules(autocastConditionBody),
      aiCastVariableRules: parseSpellVariableConditionRules(aiCastConditionBody),
      target: readCclStringAfterKey(body, "target"),
      repeatCast: body.includes('"repeat-cast"'),
      dependUpgrade: readCclStringAfterKey(body, "depend-upgrade"),
      soundWhenCast: readCclStringAfterKey(body, "sound-when-cast"),
      actionTypes: parseSpellActionTypes(actionBody),
      adjustVitals: parseSpellAdjustVitals(actionBody),
      variableAdjustments: parseSpellVariableAdjustments(actionBody),
      areaAdjustVitals: parseSpellAreaAdjustVitals(actionBody),
      missileSpawns: parseSpellMissileSpawns(actionBody),
      missileDamages: parseSpellMissileDamages(actionBody),
      captures: parseSpellCaptures(actionBody),
      demolishes: parseSpellDemolishes(actionBody),
      areaBombardments: parseSpellAreaBombardments(actionBody),
      polymorphs: parseSpellPolymorphs(actionBody),
      spawnPortals: parseSpellSpawnPortals(actionBody),
      summons: parseSpellSummons(actionBody, uncommented, start),
      callbackUnitVariables: parseSpellCallbackUnitVariables(actionBody, uncommented),
      missiles: uniqueStrings(actionBody ? [...actionBody.matchAll(/"missile"\s*,\s*"([^"]+)"/g)].map((match) => match[1]) : []),
      conditions: cclStringTokens(conditionBody),
      autocast: cclStringTokens(autocastBody),
      aiCast: cclStringTokens(aiCastBody)
    });
    cursor = bodyEnd + 1;
  }
  return spells;
}

function cclStringTokens(body) {
  return body ? [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]) : [];
}

function parseSpellActionTypes(actionBody) {
  if (!actionBody) {
    return [];
  }
  const actionTypes = [];
  let depth = 0;
  for (let index = 0; index < actionBody.length; index += 1) {
    const char = actionBody[index];
    if (char === "{") {
      if (depth === 0) {
        const body = findBalancedBody(actionBody, index);
        const actionType = body.match(/^\s*"([^"]+)"/)?.[1] ?? null;
        if (actionType) {
          actionTypes.push(actionType);
        }
        index += body.length + 1;
        continue;
      }
      depth += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return uniqueStrings(actionTypes);
}

function parseSpellAutoCastPriority(body) {
  if (!body) {
    return null;
  }
  const match = body.match(/"priority"\s*,\s*\{\s*"([^"]+)"\s*,\s*(true|false)\s*\}/);
  return match ? { variable: match[1], reverseSort: match[2] === "true" } : null;
}

function parseSpellPositionAutocastCallback(body) {
  if (!body) {
    return null;
  }
  return body.match(/"position-autocast"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? null;
}

function parseSpellVariableConditionRules(body) {
  if (!body) {
    return [];
  }
  const rules = [];
  const pattern = /"([A-Za-z][A-Za-z0-9_]*)"\s*,\s*\{/g;
  for (const match of body.matchAll(pattern)) {
    const variable = match[1];
    const openIndex = body.indexOf("{", match.index);
    if (openIndex < 0) {
      continue;
    }
    const ruleBody = findBalancedBody(body, openIndex);
    const rule = {
      variable,
      enable: readConditionModeField(ruleBody, "Enable"),
      exactValue: readConditionNumberField(ruleBody, "ExactValue"),
      exceptValue: readConditionNumberField(ruleBody, "ExceptValue"),
      minValue: readConditionNumberField(ruleBody, "MinValue"),
      maxValue: readConditionNumberField(ruleBody, "MaxValue"),
      minMax: readConditionNumberField(ruleBody, "MinMax"),
      minValuePercent: readConditionNumberField(ruleBody, "MinValuePercent"),
      maxValuePercent: readConditionNumberField(ruleBody, "MaxValuePercent"),
      conditionApplyOnCaster: readLuaBoolField(ruleBody, "ConditionApplyOnCaster", false)
    };
    rules.push(rule);
  }
  return rules;
}

function readConditionNumberField(body, field) {
  const match = body.match(new RegExp(`\\b${field}\\s*=\\s*(-?\\d+)`));
  return match ? Number(match[1]) : null;
}

function readConditionModeField(body, field) {
  const match = body.match(new RegExp(`\\b${field}\\s*=\\s*(?:\"(only|false|ignore)\"|(true|false))`));
  if (!match) {
    return null;
  }
  if (match[1]) {
    return match[1];
  }
  return match[2] === "true" ? "only" : "false";
}

function parseSpellAdjustVitals(actionBody) {
  if (!actionBody) {
    return [];
  }
  return [...actionBody.matchAll(/\{\s*"adjust-vitals"\s*,\s*"([^"]+)"\s*,\s*(-?\d+)/g)]
    .map((match) => ({ variable: match[1], amount: Number(match[2]) }))
    .filter((entry) => Number.isFinite(entry.amount));
}

function parseSpellVariableAdjustments(actionBody) {
  if (!actionBody) {
    return [];
  }
  const adjustments = [];
  const marker = /\{\s*"adjust-variable"\s*,\s*\{/g;
  for (const match of actionBody.matchAll(marker)) {
    const body = findBalancedBody(actionBody, actionBody.indexOf("{", match.index + match[0].indexOf("{") + 1));
    for (const entry of body.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\s*=\s*(-?\d+)/g)) {
      adjustments.push({ variable: entry[1], amount: Number(entry[2]) });
    }
  }
  return adjustments.filter((entry) => Number.isFinite(entry.amount));
}

function parseSpellAreaAdjustVitals(actionBody) {
  if (!actionBody) {
    return [];
  }
  const adjustments = [];
  const marker = /\{\s*"area-adjust-vitals"/g;
  for (const match of actionBody.matchAll(marker)) {
    const body = findBalancedBody(actionBody, match.index);
    adjustments.push({
      hitPoints: readActionNumber(body, "hit-points"),
      manaPoints: readActionNumber(body, "mana-points"),
      shieldPoints: readActionNumber(body, "shield-points"),
      range: readActionNumber(body, "range"),
      useMana: body.includes('"use-mana"')
    });
  }
  return adjustments;
}

function parseSpellMissileDamages(actionBody) {
  return parseSpellMissileSpawns(actionBody)
    .filter((spawn) => typeof spawn.damage === "number")
    .map((spawn) => ({ ...spawn, damage: spawn.damage }));
}

function parseSpellMissileSpawns(actionBody) {
  if (!actionBody) {
    return [];
  }
  const spawns = [];
  const marker = /\{\s*"spawn-missile"/g;
  for (const match of actionBody.matchAll(marker)) {
    const body = findBalancedBody(actionBody, match.index);
    const missile = body.match(/"missile"\s*,\s*"([^"]+)"/)?.[1] ?? null;
    const damage = Number(body.match(/"damage"\s*,\s*(-?\d+)/)?.[1] ?? NaN);
    if (missile) {
      const startPoint = readLuaTableAfterKey(body, "start-point");
      const endPoint = readLuaTableAfterKey(body, "end-point");
      spawns.push({
        missile,
        damage: Number.isFinite(damage) ? damage : null,
        delay: readActionNumber(body, "delay"),
        ttl: readActionNumber(body, "ttl"),
        startBase: startPoint ? readSpellPointBase(startPoint) : null,
        startOffsetX: startPoint ? readActionNumber(startPoint, "add-x") : null,
        startOffsetY: startPoint ? readActionNumber(startPoint, "add-y") : null,
        endBase: endPoint ? readSpellPointBase(endPoint) : null,
        endOffsetX: endPoint ? readActionNumber(endPoint, "add-x") : null,
        endOffsetY: endPoint ? readActionNumber(endPoint, "add-y") : null
      });
    }
  }
  return spawns;
}

function readSpellPointBase(body) {
  const baseIndex = body.indexOf('"base"');
  if (baseIndex < 0) {
    return null;
  }
  const afterBase = body.slice(baseIndex + '"base"'.length);
  return afterBase.match(/"([^"]+)"/)?.[1] ?? null;
}

function parseSpellCaptures(actionBody) {
  if (!actionBody) {
    return [];
  }
  const captures = [];
  const marker = /\{\s*"capture"/g;
  for (const match of actionBody.matchAll(marker)) {
    const body = findBalancedBody(actionBody, match.index);
    captures.push({
      sacrifice: body.includes('"sacrifice"'),
      joinToAiForce: body.includes('"join-to-ai-force"'),
      damage: readActionNumber(body, "damage"),
      percent: readActionNumber(body, "percent")
    });
  }
  return captures;
}

function parseSpellDemolishes(actionBody) {
  if (!actionBody) {
    return [];
  }
  const demolishes = [];
  const marker = /\{\s*"demolish"/g;
  for (const match of actionBody.matchAll(marker)) {
    const body = findBalancedBody(actionBody, match.index);
    demolishes.push({
      range: readActionNumber(body, "range"),
      damage: readActionNumber(body, "damage")
    });
  }
  return demolishes;
}

function parseSpellAreaBombardments(actionBody) {
  if (!actionBody) {
    return [];
  }
  const bombardments = [];
  const marker = /\{\s*"area-bombardment"/g;
  for (const match of actionBody.matchAll(marker)) {
    const body = findBalancedBody(actionBody, match.index);
    const missile = body.match(/"missile"\s*,\s*"([^"]+)"/)?.[1] ?? null;
    if (!missile) {
      continue;
    }
    bombardments.push({
      missile,
      fields: readActionNumber(body, "fields"),
      shards: readActionNumber(body, "shards"),
      damage: readActionNumber(body, "damage"),
      startOffsetX: readActionNumber(body, "start-offset-x"),
      startOffsetY: readActionNumber(body, "start-offset-y")
    });
  }
  return bombardments;
}

function parseSpellPolymorphs(actionBody) {
  if (!actionBody) {
    return [];
  }
  const polymorphs = [];
  const marker = /\{\s*"polymorph"/g;
  for (const match of actionBody.matchAll(marker)) {
    const body = findBalancedBody(actionBody, match.index);
    const newForm = body.match(/"new-form"\s*,\s*"([^"]+)"/)?.[1] ?? null;
    if (!newForm) {
      continue;
    }
    polymorphs.push({
      newForm,
      playerNeutral: body.includes('"player-neutral"')
    });
  }
  return polymorphs;
}

function parseSpellSpawnPortals(actionBody) {
  if (!actionBody) {
    return [];
  }
  const portals = [];
  const marker = /\{\s*"spawn-portal"/g;
  for (const match of actionBody.matchAll(marker)) {
    const body = findBalancedBody(actionBody, match.index);
    const unitTypeId = body.match(/"portal-type"\s*,\s*"([^"]+)"/)?.[1] ?? null;
    if (!unitTypeId) {
      continue;
    }
    portals.push({
      unitTypeId,
      timeToLive: readActionNumber(body, "time-to-live"),
      currentPlayer: body.includes('"current-player"')
    });
  }
  return portals;
}

function parseSpellSummons(actionBody, source = "", spellStart = 0) {
  if (!actionBody) {
    return [];
  }
  const summons = [];
  const marker = /\{\s*"summon"/g;
  for (const match of actionBody.matchAll(marker)) {
    const body = findBalancedBody(actionBody, match.index);
    const literalUnitTypeId = body.match(/"unit-type"\s*,\s*"([^"]+)"/)?.[1] ?? null;
    const variableName = body.match(/"unit-type"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? null;
    const unitTypeId = literalUnitTypeId ?? (variableName ? latestStringAssignmentBefore(source, variableName, spellStart) : null);
    if (!unitTypeId) {
      continue;
    }
    summons.push({
      unitTypeId,
      timeToLive: readActionNumber(body, "time-to-live"),
      requireCorpse: body.includes('"require-corpse"')
    });
  }
  return summons;
}

function latestStringAssignmentBefore(source, variableName, beforeIndex) {
  if (!source || beforeIndex <= 0) {
    return null;
  }
  const pattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(variableName)}\\s*=\\s*"([^"]+)"`, "g");
  let match;
  let value = null;
  while ((match = pattern.exec(source)) && match.index < beforeIndex) {
    value = match[1];
  }
  return value;
}

function parseSpellCallbackUnitVariables(actionBody, source) {
  if (!actionBody) {
    return [];
  }
  const variables = [];
  const callbackNames = uniqueStrings([...actionBody.matchAll(/"lua-callback"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]));
  for (const callback of callbackNames) {
    const body = readLuaFunctionBody(source, callback);
    if (!body) {
      continue;
    }
    const unitTypeId = body.match(/CreateUnit\(\s*"([^"]+)"/)?.[1] ?? null;
    for (const variable of body.matchAll(/SetUnitVariable\([^,]+,\s*"([^"]+)"\s*,\s*(-?\d+)/g)) {
      variables.push({ callback, unitTypeId, variable: variable[1], value: Number(variable[2]) });
    }
  }
  return variables.filter((variable) => Number.isFinite(variable.value));
}

function readLuaFunctionBody(source, functionName) {
  const pattern = new RegExp(`local\\s+function\\s+${functionName}\\s*\\([^)]*\\)`);
  const match = pattern.exec(source);
  if (!match) {
    return null;
  }
  const start = match.index + match[0].length;
  const end = source.indexOf("\nend", start);
  return end === -1 ? null : source.slice(start, end);
}

function readActionNumber(body, key) {
  const value = Number(body.match(new RegExp(`"${key}"\\s*,\\s*(-?\\d+)`))?.[1] ?? NaN);
  return Number.isFinite(value) ? value : null;
}

function stripLuaComments(source) {
  return source
    .replace(/--\[\[[\s\S]*?\]\]/g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function findBalancedParenEnd(source, openIndex) {
  let depth = 0;
  let inString = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];
    if (char === '"' && previous !== "\\") {
      inString = !inString;
    }
    if (inString) {
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) {
      return index;
    }
  }
  return source.length;
}

function readCclStringAfterKey(body, key) {
  const value = readCclValueAfterKey(body, key);
  return value !== null && !/^-?\d+$/.test(value) ? value : null;
}

function readCclValueAfterKey(body, key) {
  const match = body.match(new RegExp(`"${key}"\\s*,\\s*(?:_\\("([^"]+)"\\)|"([^"]+)"|(-?\\d+))`));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function readLuaTableAfterKey(body, key) {
  const keyMatch = new RegExp(`"${key}"\\s*,\\s*\\{`).exec(body);
  if (!keyMatch) {
    return null;
  }
  const openIndex = body.indexOf("{", keyMatch.index);
  return findBalancedBody(body, openIndex);
}

function readLuaNumberField(body, field, fallback) {
  const match = body.match(new RegExp(`${field}\\s*=\\s*(-?\\d+)`));
  return match ? Number(match[1]) : fallback;
}

function readNestedPercentField(body, variable, field) {
  const match = body.match(new RegExp(`"${variable}"\\s*,\\s*\\{[^}]*${field}\\s*=\\s*(-?\\d+)`));
  return match ? Number(match[1]) : null;
}

function readLuaStringField(body, field) {
  return body.match(new RegExp(`${field}\\s*=\\s*"([^"]+)"`))?.[1] ?? null;
}

function readLuaValueField(body, field) {
  return readLuaStringField(body, field)
    ?? body.match(new RegExp(`${field}\\s*=\\s*(-?\\d+)`))?.[1]
    ?? null;
}

function readLuaTranslatedStringField(body, field) {
  return body.match(new RegExp(`${field}\\s*=\\s*_\\("([^"]+)"\\)`))?.[1]
    ?? readLuaStringField(body, field);
}

function readLuaStringArrayField(body, field) {
  const fieldStart = body.search(new RegExp(`${field}\\s*=\\s*\\{`));
  if (fieldStart === -1) {
    return [];
  }
  const openIndex = body.indexOf("{", fieldStart);
  if (openIndex === -1) {
    return [];
  }
  const arrayBody = findBalancedBody(body, openIndex);
  return uniqueStrings([...arrayBody.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

function parseUpgradeDefinitions(source) {
  const upgrades = new Map();
  for (const match of source.matchAll(/CUpgrade:New\("([^"]+)"\)/g)) {
    upgrades.set(match[1], {
      id: match[1],
      icon: null,
      costs: { time: 0, gold: 0, wood: 0, oil: 0 },
      modifiers: [],
      appliesTo: [],
      conversions: []
    });
  }
  const tableMatch = source.match(/local\s+upgrades\s*=\s*\{([\s\S]*?)\n\}/);
  if (tableMatch) {
    const entryPattern = /\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*\{([^}]+)\}\s*\}/g;
    let match;
    while ((match = entryPattern.exec(tableMatch[1]))) {
      const costs = match[3].split(",").map((part) => Number(part.trim())).filter((value) => Number.isFinite(value));
      upgrades.set(match[1], {
        id: match[1],
        icon: match[2],
        costs: {
          time: costs[0] ?? 0,
          gold: costs[1] ?? 0,
          wood: costs[2] ?? 0,
          oil: costs[3] ?? 0
        },
        modifiers: [],
        appliesTo: [],
        conversions: []
      });
    }
  }

  const modifierPattern = /DefineModifier\("([^"]+)"\s*,([\s\S]*?)\)/g;
  let modifierMatch;
  while ((modifierMatch = modifierPattern.exec(source))) {
    const id = modifierMatch[1];
    const body = modifierMatch[2];
    const upgrade = upgrades.get(id) ?? { id, icon: null, costs: { time: 0, gold: 0, wood: 0, oil: 0 }, modifiers: [], appliesTo: [], conversions: [] };
    let lastApplyTo = null;
    for (const item of body.matchAll(/\{"([^"]+)",\s*"?([^"}]+)"?\}/g)) {
      const key = item[1];
      const rawValue = item[2].trim();
      if (key === "apply-to") {
        upgrade.appliesTo.push(rawValue);
        lastApplyTo = rawValue;
      } else if (key === "convert-to" && lastApplyTo) {
        upgrade.conversions.push({ fromTypeId: lastApplyTo, toTypeId: rawValue });
      } else if (["PiercingDamage", "BasicDamage", "Armor", "AttackRange", "SightRange", "Level", "regeneration-rate", "regeneration-frequency"].includes(key)) {
        upgrade.modifiers.push({ stat: key, value: Number(rawValue) });
      }
    }
    upgrades.set(id, upgrade);
  }
  return [...upgrades.values()];
}

function mergeUpgradeDefinition(existing, next) {
  if (!existing) {
    return next;
  }
  const existingCostTotal = upgradeCostTotal(existing.costs);
  const nextCostTotal = upgradeCostTotal(next.costs);
  return {
    ...existing,
    ...next,
    icon: next.icon ?? existing.icon,
    costs: nextCostTotal > 0 || existingCostTotal === 0 ? next.costs : existing.costs,
    modifiers: next.modifiers.length > 0 ? next.modifiers : existing.modifiers,
    appliesTo: next.appliesTo.length > 0 ? uniqueStrings([...existing.appliesTo, ...next.appliesTo]) : existing.appliesTo,
    conversions: next.conversions.length > 0 ? uniqueConversions([...existing.conversions, ...next.conversions]) : existing.conversions
  };
}

function upgradeCostTotal(costs) {
  return (costs?.time ?? 0) + (costs?.gold ?? 0) + (costs?.wood ?? 0) + (costs?.oil ?? 0);
}

function uniqueConversions(conversions) {
  const seen = new Set();
  const unique = [];
  for (const conversion of conversions) {
    const key = `${conversion.fromTypeId}->${conversion.toTypeId}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(conversion);
    }
  }
  return unique;
}

function parseFramesFromCommands(commands) {
  const frames = [];
  let currentWait = 1;
  for (const command of commands) {
    const frame = command.match(/^frame\s+(-?\d+)/);
    const wait = command.match(/^wait\s+(\d+)/);
    if (frame) {
      frames.push({ frame: Number(frame[1]), wait: currentWait });
      currentWait = 1;
    } else if (wait && frames.length > 0) {
      frames[frames.length - 1].wait = Number(wait[1]);
    }
  }
  return frames;
}

function parseFramesFromArrayBody(arrayBody) {
  return parseFramesFromCommands([...arrayBody.matchAll(/"([^"]+)"/g)].map((commandMatch) => commandMatch[1]));
}

function parseAnimationVariables(source) {
  const variables = new Map();
  const aliases = [];
  const assignmentPattern = /(?:local\s+)?([A-Za-z][A-Za-z0-9_]*)\s*=\s*\{/g;
  let match;
  while ((match = assignmentPattern.exec(source))) {
    const variableName = match[1];
    const openIndex = source.indexOf("{", match.index);
    const body = findBalancedBody(source, openIndex);
    const frames = parseFramesFromArrayBody(body);
    if (frames.length > 0) {
      variables.set(variableName, frames);
    }
    assignmentPattern.lastIndex = openIndex + body.length + 2;
  }
  const aliasPattern = /(?:local\s+)?([A-Za-z][A-Za-z0-9_]*)\s*=\s*([A-Za-z][A-Za-z0-9_]*)/g;
  while ((match = aliasPattern.exec(source))) {
    aliases.push([match[1], match[2]]);
  }
  return { variables, aliases };
}

function parseAnimationDefinitions(source, animationVariables) {
  const animations = [];
  const marker = 'DefineAnimations("';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start === -1) {
      break;
    }
    const idStart = start + marker.length;
    const idEnd = source.indexOf('"', idStart);
    const id = source.slice(idStart, idEnd);
    const bodyStart = source.indexOf("{", idEnd);
    if (bodyStart === -1) {
      cursor = idEnd;
      continue;
    }
    const body = findBalancedBody(source, bodyStart);
    const actions = {};
    const actionPattern = /([A-Za-z_]+)\s*=\s*\{([\s\S]*?)\}/g;
    let match;
    while ((match = actionPattern.exec(body))) {
      const actionName = match[1];
      const frames = parseFramesFromArrayBody(match[2]);
      if (frames.length > 0) {
        actions[actionName] = frames;
      }
    }
    const referencePattern = /([A-Za-z_]+)\s*=\s*([A-Za-z][A-Za-z0-9_]*)/g;
    while ((match = referencePattern.exec(body))) {
      const actionName = match[1];
      const variableName = match[2];
      if (!actions[actionName] && animationVariables.has(variableName)) {
        actions[actionName] = animationVariables.get(variableName);
      }
    }
    animations.push({ id, actions });
    cursor = bodyStart + body.length + 2;
  }
  return animations;
}

function parseMapSetup(relativePath, source, presentation) {
  const starts = [];
  const players = new Map();
  const playerTypes = new Map((presentation.playerTypes ?? []).map((entry) => [entry.player, entry.playerType]));
  const aiTypeOverrides = new Map((presentation.aiTypeOverrides ?? []).map((entry) => [entry.player, entry.ai]));
  const playerSymbols = parseMapSetupPlayerSymbols(source);
  const state = {};
  const teams = [];
  const diplomacy = [];
  const sharedVision = [];
  const units = [];
  const unitAliases = new Map();
  const teleportDestinations = [];
  const tiles = [];
  let tileset = null;
  let lastUnitIndex = -1;

  const ensurePlayer = (player) => {
    if (!players.has(player)) {
      players.set(player, {
        player,
        resources: {},
        race: null,
        ai: aiTypeOverrides.get(player) ?? null,
        playerType: playerTypes.get(player) ?? null,
        startView: null
      });
    }
    return players.get(player);
  };
  const applySourcePlayerSetup = (player, race, ai, gold, wood, oil, x, y) => {
    const setupPlayer = ensurePlayer(player);
    setupPlayer.startView = { x, y };
    setupPlayer.resources.wood = wood;
    setupPlayer.resources.gold = gold;
    setupPlayer.resources.oil = oil;
    setupPlayer.race = sourceSetupRace(race);
    setupPlayer.ai = ai;
    starts.push({ player, x, y });
  };

  for (const line of source.split(/\r?\n/)) {
    let match = line.match(/SetStartView\((\d+),\s*(-?\d+),\s*(-?\d+)\)/);
    if (match) {
      const player = Number(match[1]);
      const startView = { x: Number(match[2]), y: Number(match[3]) };
      ensurePlayer(player).startView = startView;
      starts.push({ player, ...startView });
      continue;
    }

    match = line.match(/SetupPlayer\(\s*(\d+),\s*"([^"]+)",\s*"([^"]+)",\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\)/);
    if (match) {
      applySourcePlayerSetup(Number(match[1]), match[2], match[3], Number(match[4]), Number(match[5]), Number(match[6]), Number(match[7]), Number(match[8]));
      continue;
    }

    match = line.match(/SetPlayerGame2015\(\s*(\d+),\s*"([^"]+)",\s*"([^"]+)",\s*"[^"]*",\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)/);
    if (match) {
      applySourcePlayerSetup(Number(match[1]), match[2], match[3], Number(match[4]), Number(match[5]), Number(match[6]), Number(match[7]), Number(match[8]));
      continue;
    }

    match = line.match(/SetPlayerData\((\d+),\s*"Resources",\s*"([^"]+)",\s*(-?\d+)\)/);
    if (match) {
      ensurePlayer(Number(match[1])).resources[match[2]] = Number(match[3]);
      continue;
    }

    match = line.match(/SetPlayerData\((\d+),\s*"RaceName",\s*"([^"]+)"\)/);
    if (match) {
      ensurePlayer(Number(match[1])).race = match[2];
      continue;
    }

    match = line.match(/SetAiType\((\d+),\s*"([^"]+)"\)/);
    if (match) {
      ensurePlayer(Number(match[1])).ai = match[2];
      continue;
    }

    match = line.match(/SetFogOfWar\(\s*(true|false)\s*\)/);
    if (match) {
      state.fogOfWar = match[1] === "true";
      continue;
    }

    match = line.match(/SetGamePaused\(\s*(true|false)\s*\)/);
    if (match) {
      state.gamePaused = match[1] === "true";
      continue;
    }

    match = line.match(/SetGameSpeed\(\s*(-?\d+(?:\.\d+)?)\s*\)/);
    if (match) {
      state.gameSpeed = Number(match[1]);
      continue;
    }

    match = line.match(/SetMapTeams\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      teams.push({ player: Number(match[1]), team: Number(match[2]), position: Number(match[3]) });
      continue;
    }

    match = line.match(/SetDiplomacy\(\s*([A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*,\s*"([^"]+)"\s*,\s*([A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*\)/);
    if (match) {
      const state = normalizeDiplomacyState(match[2]);
      const player = mapSetupPlayerReferenceToNumber(match[1], playerSymbols);
      const otherPlayer = mapSetupPlayerReferenceToNumber(match[3], playerSymbols);
      if (state && player !== null && otherPlayer !== null) {
        diplomacy.push({ player, state, otherPlayer });
      }
      continue;
    }

    match = line.match(/SetSharedVision\(\s*([A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*,\s*(true|false)\s*,\s*([A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*\)/);
    if (match) {
      const player = mapSetupPlayerReferenceToNumber(match[1], playerSymbols);
      const otherPlayer = mapSetupPlayerReferenceToNumber(match[3], playerSymbols);
      if (player !== null && otherPlayer !== null) {
        sharedVision.push({ player, enabled: match[2] === "true", otherPlayer });
      }
      continue;
    }

    match = line.match(/LoadTileModels\("([^"]+)"\)/);
    if (match) {
      tileset = match[1];
      continue;
    }

    match = line.match(/SetTile\(\s*(-?\d+),\s*(\d+),\s*(\d+),\s*(-?\d+)(?:,\s*(-?\d+))?\)/);
    if (match) {
      tiles.push({
        id: Number(match[1]),
        x: Number(match[2]),
        y: Number(match[3]),
        value: Number(match[4])
      });
      continue;
    }

    match = line.match(/(?:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)?CreateUnit\("([^"]+)",\s*(\d+),\s*\{(-?\d+),\s*(-?\d+)\}\)/);
    if (match) {
      units.push({
        typeId: match[2],
        player: Number(match[3]),
        x: Number(match[4]),
        y: Number(match[5]),
        resourcesHeld: null,
        hitPoints: initialHitPointsForMapUnit(presentation.initialUnitHitPointRules ?? [], Number(match[3]), match[2])
      });
      lastUnitIndex = units.length - 1;
      if (match[1]) {
        unitAliases.set(match[1], lastUnitIndex);
      }
      unitAliases.set("unit", lastUnitIndex);
      continue;
    }

    match = line.match(/SetResourcesHeld\(unit,\s*(-?\d+)\)/);
    if (match && lastUnitIndex >= 0) {
      units[lastUnitIndex].resourcesHeld = Number(match[1]);
      continue;
    }

    match = line.match(/SetTeleportDestination\(\s*([A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*,\s*([A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*\)/);
    if (match) {
      const unitIndex = mapSetupUnitReferenceToIndex(match[1], unitAliases);
      const destinationIndex = mapSetupUnitReferenceToIndex(match[2], unitAliases);
      if (unitIndex !== null && destinationIndex !== null) {
        teleportDestinations.push({ unitIndex, destinationIndex });
      }
    }
  }

  for (const [player, ai] of aiTypeOverrides) {
    ensurePlayer(player).ai = ai;
  }
  for (const unit of units) {
    ensurePlayer(unit.player);
  }
  for (const start of starts) {
    ensurePlayer(start.player);
  }
  for (const team of mergeMapTeams(presentation.teams ?? [], teams)) {
    ensurePlayer(team.player);
  }
  for (const unit of units) {
    const convertedTypeId = sourceConvertedUnitType(unit.typeId, players.get(unit.player)?.race);
    if (convertedTypeId !== unit.typeId) {
      unit.typeId = convertedTypeId;
      unit.hitPoints = initialHitPointsForMapUnit(presentation.initialUnitHitPointRules ?? [], unit.player, convertedTypeId);
    }
  }

  return {
    path: relativePath,
    presentationPath: presentation.path,
    title: presentation.title,
    objectives: presentation.objectives ?? [],
    briefingText: presentation.briefingText ?? null,
    briefingVoiceFiles: presentation.briefingVoiceFiles ?? [],
    victoryRequirements: presentation.victoryRequirements ?? [],
    victoryRequirementGroups: presentation.victoryRequirementGroups ?? [],
    defeatRequirements: presentation.defeatRequirements ?? [],
    timedVictoryTriggers: presentation.timedVictoryTriggers ?? [],
    locationBuildRequirements: presentation.locationBuildRequirements ?? [],
    circleOfPowerRequirements: presentation.circleOfPowerRequirements ?? [],
    rescuedCircleRequirements: presentation.rescuedCircleRequirements ?? [],
    initialUnitHitPointRules: presentation.initialUnitHitPointRules ?? [],
    playerTypes: presentation.playerTypes ?? [],
    aiTypeOverrides: presentation.aiTypeOverrides ?? [],
    diplomacy: mergeDiplomacyRules(presentation.diplomacy ?? [], diplomacyRulesFromTeams(mergeMapTeams(presentation.teams ?? [], teams)), diplomacy),
    sharedVision: mergeSharedVisionRules(presentation.sharedVision ?? [], sharedVisionRulesFromTeams(mergeMapTeams(presentation.teams ?? [], teams)), sharedVision),
    allowOverrides: presentation.allowOverrides ?? [],
    allowedUnitTypes: presentation.allowedUnitTypes ?? [],
    allowedUpgradeTypes: presentation.allowedUpgradeTypes ?? [],
    aiForcePlans: presentation.aiForcePlans ?? [],
    width: presentation.width,
    height: presentation.height,
    highgroundsEnabled: presentation.highgroundsEnabled === true,
    tileset,
    state,
    players: [...players.values()].sort((a, b) => a.player - b.player),
    teams: mergeMapTeams(presentation.teams ?? [], teams),
    starts,
    units,
    teleportDestinations,
    tiles,
    tileStats: summarizeTiles(tiles)
  };
}

function sourceSetupRace(race) {
  return race === "man" ? "human" : race;
}

function parseMapSetupPlayerSymbols(source) {
  const symbols = new Map();
  const triggerStart = source.search(/\bAddTrigger\s*\(/);
  const preTriggerSource = triggerStart >= 0 ? source.slice(0, triggerStart) : source;
  for (const line of preTriggerSource.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*|-?\d+)\s*(?:--.*)?$/);
    if (!match) {
      continue;
    }
    const value = mapSetupPlayerReferenceToNumber(match[2], symbols);
    if (value !== null) {
      symbols.set(match[1], value);
    }
  }
  return symbols;
}

function mapSetupPlayerReferenceToNumber(reference, playerSymbols) {
  if (/^-?\d+$/.test(reference)) {
    return Number(reference);
  }
  return playerSymbols.get(reference) ?? null;
}

function mapSetupUnitReferenceToIndex(reference, unitAliases) {
  if (/^-?\d+$/.test(reference)) {
    const unitNumber = Number(reference);
    return unitNumber > 0 ? unitNumber - 1 : null;
  }
  return unitAliases.get(reference) ?? null;
}

function findCampaignScriptPath(setupPath) {
  if (!setupPath.startsWith("campaigns/")) {
    return null;
  }
  const base = setupPath.replace(/\.sms(?:\.gz)?$/i, "");
  const candidates = [`${base}_c.sms`, `${base}_c.sms.gz`];
  return candidates.find((candidate) => allFilesSet.has(candidate)) ?? null;
}

function parsePlayerTypes(source) {
  const match = source.match(/DefinePlayerTypes\(([^)]*)\)/);
  const playerTypes = [];
  if (!match) {
    return playerTypes;
  }
  [...match[1].matchAll(/"([^"]+)"/g)].forEach((typeMatch, index) => {
    playerTypes.push({ player: index, playerType: typeMatch[1] });
  });
  return playerTypes;
}

function mergePlayerTypes(...groups) {
  const byPlayer = new Map();
  for (const group of groups) {
    for (const rule of group ?? []) {
      byPlayer.set(rule.player, rule);
    }
  }
  return [...byPlayer.values()].sort((a, b) => a.player - b.player);
}

function parseAiTypeOverrides(source) {
  return [...source.matchAll(/SetAiType\(\s*(\d+)\s*,\s*"([^"]+)"\s*\)/g)]
    .map((match) => ({ player: Number(match[1]), ai: match[2] }));
}

function parseTimedVictoryTriggers(source) {
  const triggers = [];
  for (const match of source.matchAll(/local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)[\s\S]*?PlaySound\("([^"]+)"\)[\s\S]*?\1\s*=\s*\1\s*-\s*1[\s\S]*?\1\s*<=\s*0[\s\S]*?ActionVictory\(\)/g)) {
    if (!/IfRescuedNearUnit|unit-circle-of-power|unit-pile-circle/.test(match[0])) {
      continue;
    }
    triggers.push({
      kind: "circle-of-power",
      delayTicks: Number(match[2]),
      soundId: sourceSoundEvent(match[3])
    });
  }
  return triggers;
}

function sourceSoundEvent(soundId) {
  const rescueMatch = soundId.match(/^rescue \((human|orc)\)$/);
  return rescueMatch ? "rescue" : soundId;
}

function parseCircleOfPowerRequirements(source) {
  return [...source.matchAll(/IfNearUnit\(\s*"this"\s*,\s*"[^"]+"\s*,\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)]
    .filter((match) => match[2].startsWith("unit-") && (match[3] === "unit-circle-of-power" || match[3] === "unit-pile-circle"))
    .map((match) => ({
      unitTypeId: match[2],
      circleTypeId: match[3],
      minimum: Number(match[1])
    }));
}

function parseRescuedCircleRequirements(source) {
  const requirements = [];
  const rescuePattern = /IfRescuedNearUnit\(\s*"this"\s*,\s*"[^"]+"\s*,\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g;
  const clauses = [...source.matchAll(rescuePattern)]
    .map((match) => ({ minimum: Number(match[1]), unitTypeId: match[2], circleTypeId: match[3], start: match.index ?? 0 }))
    .filter((clause) => clause.unitTypeId.startsWith("unit-") && (clause.circleTypeId === "unit-circle-of-power" || clause.circleTypeId === "unit-pile-circle"));
  const consumed = new Set();
  for (let index = 0; index < clauses.length; index += 1) {
    if (consumed.has(index)) {
      continue;
    }
    const clause = clauses[index];
    const alternatives = [clause.unitTypeId];
    for (let nextIndex = index + 1; nextIndex < clauses.length; nextIndex += 1) {
      const next = clauses[nextIndex];
      const between = source.slice(clause.start, next.start);
      if (clause.minimum === next.minimum && clause.circleTypeId === next.circleTypeId && /\bor\b/.test(between) && !/\band\b/.test(between)) {
        alternatives.push(next.unitTypeId);
        consumed.add(nextIndex);
      }
    }
    requirements.push({
      unitTypeIds: [...new Set(alternatives)].sort(),
      circleTypeId: clause.circleTypeId,
      minimum: clause.minimum
    });
  }
  return requirements;
}

function initialHitPointsForMapUnit(rules, player, unitTypeId) {
  const exact = rules.find((rule) => rule.player === player && rule.unitTypeId === unitTypeId);
  const fallback = rules.find((rule) => rule.player === player && rule.unitTypeId === null);
  return exact?.hitPoints ?? fallback?.hitPoints ?? null;
}

async function parseCampaignMetadata(setupPath) {
  const campaignScriptPath = findCampaignScriptPath(setupPath);
  if (!campaignScriptPath) {
    return emptyCampaignMetadata();
  }
  const campaignSource = await readMaybeGzip(path.join(dataRoot, campaignScriptPath));
  const c2Path = campaignSource.match(/Load\("([^"]+_c2\.sms(?:\.gz)?)"\)/)?.[1]
    ?? campaignScriptPath.replace(/_c\.sms(?:\.gz)?$/i, "_c2.sms");
  const c2Source = allFilesSet.has(c2Path) ? await readMaybeGzip(path.join(dataRoot, c2Path)) : "";
  return {
    title: parseCampaignTitle(c2Source),
    objectives: parseCampaignObjectives(c2Source),
    briefingText: await parseBriefingText(campaignSource),
    briefingVoiceFiles: parseBriefingVoiceFiles(campaignSource),
    victoryRequirements: parseVictoryRequirements(campaignSource),
    victoryRequirementGroups: parseVictoryRequirementGroups(campaignSource),
    defeatRequirements: parseDefeatRequirements(campaignSource),
    timedVictoryTriggers: parseTimedVictoryTriggers(campaignSource),
    locationBuildRequirements: parseLocationBuildRequirements(campaignSource),
    circleOfPowerRequirements: parseCircleOfPowerRequirements(campaignSource),
    rescuedCircleRequirements: parseRescuedCircleRequirements(campaignSource),
    initialUnitHitPointRules: parseInitialUnitHitPointRules(campaignSource),
    playerTypes: parsePlayerTypes(campaignSource),
    aiTypeOverrides: parseAiTypeOverrides(campaignSource),
    diplomacy: parseDiplomacyRules(campaignSource),
    sharedVision: parseSharedVisionRules(campaignSource),
    allowOverrides: parseCampaignAllowOverrides(campaignSource),
    allowedUnitTypes: parseAllowedUnitTypes(campaignSource),
    allowedUpgradeTypes: parseAllowedUpgradeTypes(campaignSource),
    aiForcePlans: parseAiForcePlans(campaignSource)
  };
}

function emptyCampaignMetadata() {
  return { title: null, objectives: [], briefingText: null, briefingVoiceFiles: [], victoryRequirements: [], victoryRequirementGroups: [], defeatRequirements: [], timedVictoryTriggers: [], locationBuildRequirements: [], circleOfPowerRequirements: [], rescuedCircleRequirements: [], initialUnitHitPointRules: [], playerTypes: [], aiTypeOverrides: [], diplomacy: [], sharedVision: [], allowOverrides: [], allowedUnitTypes: [], allowedUpgradeTypes: [], aiForcePlans: [] };
}

function parseCampaignTitle(source) {
  return source.match(/title\s*=\s*"([^"]+)"/)?.[1] ?? null;
}

function parseCampaignObjectives(source) {
  const body = source.match(/objectives\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1].replace(/^-/, "").trim()).filter(Boolean);
}

async function parseBriefingText(source) {
  const textPath = source.match(/Briefing\([\s\S]*?"([^"]+\.txt)"/)?.[1];
  if (!textPath || !allFilesSet.has(textPath)) {
    return null;
  }
  const text = await readMaybeGzip(path.join(dataRoot, textPath));
  return text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
}

function parseBriefingVoiceFiles(source) {
  const briefingStart = source.indexOf("Briefing(");
  if (briefingStart === -1) {
    return [];
  }
  const briefingEnd = source.indexOf(")\n", briefingStart);
  const body = source.slice(briefingStart, briefingEnd === -1 ? undefined : briefingEnd);
  return [...body.matchAll(/"([^"]+\.wav)"/g)].map((match) => match[1]);
}

function parseVictoryRequirements(source) {
  return parseVictoryRequirementGroups(source)[0]?.clauses ?? [];
}

function parseVictoryRequirementGroups(source) {
  return parseTriggerBodies(source, "ActionVictory")
    .map((trigger) => ({ clauses: parseVictoryRequirementClauses(trigger) }))
    .filter((group) => group.clauses.length > 0);
}

function parseVictoryRequirementClauses(trigger) {
  const requirements = [];
  for (const match of trigger.matchAll(/GetPlayerData\(GetThisPlayer\(\),\s*"UnitTypesCount",\s*"([^"]+)"\)\s*>=\s*(\d+)/g)) {
    requirements.push({ kind: "unit-count", unitTypeId: match[1], minimum: Number(match[2]) });
  }
  for (const match of trigger.matchAll(/GetPlayerData\(GetThisPlayer\(\),\s*"UnitTypesCount",\s*"([^"]+)"\)\s*==\s*(\d+)/g)) {
    requirements.push({ kind: "unit-count-exact", unitTypeId: match[1], count: Number(match[2]) });
  }
  for (const match of trigger.matchAll(/GetPlayerData\((\d+),\s*"UnitTypesCount",\s*"([^"]+)"\)\s*==\s*0/g)) {
    requirements.push({ kind: "unit-destroyed", player: Number(match[1]), unitTypeId: match[2] });
  }
  for (const match of trigger.matchAll(/GetPlayerData\((\d+),\s*"TotalNumUnits"\)\s*==\s*0/g)) {
    requirements.push({ kind: "player-defeated", player: Number(match[1]) });
  }
  if (/GetNumOpponents\(\s*GetThisPlayer\(\)\s*\)\s*==\s*0/.test(trigger)) {
    requirements.push({ kind: "opponents-defeated" });
  }
  return requirements;
}

function parseLocationBuildRequirements(source) {
  const requirements = [];
  for (const trigger of parseTriggerBodies(source, "ActionVictory")) {
    const clauses = [...trigger.matchAll(/GetNumUnitsAt\(\s*(GetThisPlayer\(\)|\d+)\s*,\s*"([^"]+)"\s*,\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*,\s*\{\s*(-?\d+)\s*,\s*(-?\d+)\s*\}\s*\)\s*>\s*(\d+)/g)]
      .map((match) => ({
        player: parseSourcePlayer(match[1]),
        unitTypeId: match[2],
        minX: Number(match[3]),
        minY: Number(match[4]),
        maxX: Number(match[5]),
        maxY: Number(match[6]),
        minimum: Number(match[7]) + 1
      }));
    if (clauses.length > 0) {
      requirements.push({ clauses });
    }
  }
  return requirements;
}

function parseDefeatRequirements(source) {
  const requirements = [];
  for (const trigger of parseTriggerBodies(source, "ActionDefeat")) {
    const playerDefeated = trigger.match(/GetPlayerData\(\s*(GetThisPlayer\(\)|\d+)\s*,\s*"TotalNumUnits"\s*\)\s*==\s*0/);
    if (playerDefeated) {
      requirements.push({ kind: "player-defeated", player: parseSourcePlayer(playerDefeated[1]) });
      continue;
    }
    const countMatches = [...trigger.matchAll(/GetPlayerData\(\s*(GetThisPlayer\(\)|\d+)\s*,\s*"UnitTypesCount"\s*,\s*"([^"]+)"\s*\)\s*==\s*0/g)];
    if (countMatches.length > 0 && countMatches.every((match) => match[2] === countMatches[0][2])) {
      requirements.push({
        kind: "unit-group-destroyed",
        unitTypeId: countMatches[0][2],
        players: countMatches.map((match) => parseSourcePlayer(match[1]))
      });
      continue;
    }
    const countBelow = trigger.match(/\(([\s\S]*?)\)\s*<\s*(\d+)/);
    if (countBelow) {
      const parts = [...countBelow[1].matchAll(/GetPlayerData\(\s*(GetThisPlayer\(\)|\d+)\s*,\s*"UnitTypesCount"\s*,\s*"([^"]+)"\s*\)/g)];
      if (parts.length > 0 && parts.every((match) => match[2] === parts[0][2])) {
        requirements.push({
          kind: "unit-count-below",
          unitTypeId: parts[0][2],
          players: parts.map((match) => parseSourcePlayer(match[1])),
          threshold: Number(countBelow[2])
        });
      }
    }
  }
  return requirements;
}

function parseDiplomacyRules(source) {
  return [...source.matchAll(/SetDiplomacy\(\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)/g)]
    .map((match) => ({
      player: Number(match[1]),
      state: normalizeDiplomacyState(match[2]),
      otherPlayer: Number(match[3])
    }))
    .filter((rule) => rule.state !== null);
}

function parseSharedVisionRules(source) {
  return [...source.matchAll(/SetSharedVision\(\s*(\d+)\s*,\s*(true|false)\s*,\s*(\d+)\s*\)/g)]
    .map((match) => ({
      player: Number(match[1]),
      enabled: match[2] === "true",
      otherPlayer: Number(match[3])
    }));
}

function normalizeDiplomacyState(value) {
  if (value === "enemy" || value === "allied" || value === "neutral") {
    return value;
  }
  return null;
}

function parseCampaignAllowOverrides(source) {
  return [...source.matchAll(/DefineAllow\(\s*"([^"]+)"\s*,\s*"([AFR]+)"\s*\)/g)]
    .map((match) => ({ id: match[1], flags: match[2] }));
}

function parseInitialUnitHitPointRules(source) {
  const rules = [];
  for (const match of source.matchAll(/for\s+\w+\s*,\s*unit\s+in\s+ipairs\(GetUnits\((\d+)\)\)\s+do\s+if\s+GetUnitVariable\(unit,\s*"Ident"\)\s*==\s*"([^"]+)"\s*then\s+SetUnitVariable\(unit,\s*"HitPoints",\s*(-?\d+)\)\s+else\s+SetUnitVariable\(unit,\s*"HitPoints",\s*(-?\d+)\)\s+end\s+end/g)) {
    rules.push({ player: Number(match[1]), unitTypeId: match[2], hitPoints: Number(match[3]) });
    rules.push({ player: Number(match[1]), unitTypeId: null, hitPoints: Number(match[4]) });
  }
  return rules;
}

function parseTriggerBodies(source, actionName) {
  const bodies = [];
  let start = 0;
  while ((start = source.indexOf("AddTrigger(", start)) !== -1) {
    const openIndex = source.indexOf("(", start);
    const closeIndex = findBalancedParenEnd(source, openIndex);
    const call = source.slice(openIndex + 1, closeIndex);
    const match = call.match(new RegExp(`function\\s*\\(\\s*\\)\\s*return\\s*([\\s\\S]*?)\\s*end\\s*,\\s*function\\s*\\(\\s*\\)\\s*return\\s*${actionName}\\s*\\(\\s*\\)\\s*end`));
    if (match) {
      bodies.push(match[1]);
    }
    start = closeIndex + 1;
  }
  return bodies;
}

function parseSourcePlayer(value) {
  return value === "GetThisPlayer()" ? "self" : Number(value);
}

function parseAllowedUnitTypes(source) {
  return parseAllowedObjectTypes(source, "unit-");
}

function parseAllowedUpgradeTypes(source) {
  return parseAllowedObjectTypes(source, "upgrade-");
}

function parseAllowedObjectTypes(source, prefix) {
  const allowed = new Set();
  for (const tableMatch of source.matchAll(/local\s+allowed[A-Za-z]+Units\s*=\s*\{([\s\S]*?)\}/g)) {
    for (const unitMatch of tableMatch[1].matchAll(/"([^"]+)"/g)) {
      if (unitMatch[1].startsWith(prefix)) {
        allowed.add(unitMatch[1]);
      }
    }
  }
  return [...allowed].sort();
}

function parseTilesetTerrain(scriptFile, source) {
  if (!source.includes("DefineTileset(")) {
    return null;
  }
  const name = source.match(/DefineTileset\("name",\s*"([^"]+)"/)?.[1] ?? path.basename(scriptFile, ".lua");
  const image = source.match(/"image",\s*"([^"]+)"/)?.[1] ?? null;
  const colorCycleAll = source.match(/SetColorCycleAll\(\s*(true|false)\s*\)/)?.[1] === "true";
  const colorCycleRanges = [...source.matchAll(/AddColorCyclingRange\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)(?:\s*--\s*([^\n\r]+))?/g)]
    .map((match) => ({
      start: Number(match[1]),
      end: Number(match[2]),
      label: cleanSourceText(match[3] ?? "")
    }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const slotsStart = source.indexOf('"slots"');
  if (slotsStart === -1) {
    return null;
  }
  const slots = new Map();
  let currentFlags = [];
  for (const rawLine of source.slice(slotsStart).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('"solid"') || line.startsWith('"mixed"')) {
      const afterOpen = line.slice(line.indexOf("{") + 1);
      const flagsText = afterOpen.includes("{") ? afterOpen.slice(0, afterOpen.indexOf("{")) : afterOpen;
      currentFlags = [...new Set([...flagsText.matchAll(/"([^"]+)"/g)].map((match) => match[1].toLowerCase()))];
    }
    const slotMatch = line.match(/--\s*([0-9a-fA-F]{3,4})\b/);
    if (slotMatch && currentFlags.length > 0) {
      slots.set(parseInt(slotMatch[1], 16), currentFlags);
    }
    if (line.startsWith("}") || line.startsWith("})")) {
      break;
    }
  }
  if (slots.size === 0) {
    return null;
  }
  return {
    script: scriptFile,
    name,
    image,
    colorCycleAll,
    colorCycleRanges,
    slots: [...slots.entries()]
      .map(([slot, flags]) => ({ slot, flags }))
      .sort((a, b) => a.slot - b.slot)
  };
}

function parseAiUnitHelpers(source) {
  const helpers = new Map();
  const uncommented = stripLuaComments(source);
  const declarations = [...uncommented.matchAll(/function\s+(Ai[A-Za-z0-9_]+)\(race\)/g)];
  for (let index = 0; index < declarations.length; index += 1) {
    const match = declarations[index];
    const name = match[1];
    const bodyStart = match.index + match[0].length;
    const bodyEnd = declarations[index + 1]?.index ?? uncommented.length;
    const body = uncommented.slice(bodyStart, bodyEnd);
    const human = body.match(/if\s*\(race\s*==\s*race1\)\s*then\s*return\s*"([^"]+)"/)?.[1] ?? null;
    const orcReturns = [...body.matchAll(/return\s+"([^"]+)"/g)].map((candidate) => candidate[1]);
    const orc = orcReturns.length > 1 ? orcReturns[orcReturns.length - 1] : null;
    if (human && orc) {
      helpers.set(name, { human, orc });
    }
  }
  return helpers;
}

function resolveAiUnitExpression(expression, race, helpers) {
  const trimmed = expression.trim();
  const literal = trimmed.match(/^"([^"]+)"$/);
  if (literal) {
    return literal[1];
  }
  const helper = trimmed.match(/^(Ai[A-Za-z0-9_]+)\(\s*(?:race|"human"|"orc")?\s*\)$/);
  if (!helper) {
    return null;
  }
  const values = helpers.get(helper[1]);
  return values?.[race] ?? null;
}

function splitLuaCallArguments(body) {
  const args = [];
  let start = 0;
  let depth = 0;
  let inString = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "\"" && body[index - 1] !== "\\") {
      inString = !inString;
    } else if (!inString && char === "(") {
      depth += 1;
    } else if (!inString && char === ")") {
      depth -= 1;
    } else if (!inString && depth === 0 && char === ",") {
      args.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  args.push(body.slice(start).trim());
  return args;
}

function sourceUnitDatabaseCalls(source) {
  const calls = [];
  const marker = "UnitDatabaseSetup(";
  let cursor = 0;
  while ((cursor = source.indexOf(marker, cursor)) !== -1) {
    const openIndex = source.indexOf("(", cursor);
    const closeIndex = findBalancedParenEnd(source, openIndex);
    calls.push(splitLuaCallArguments(source.slice(openIndex + 1, closeIndex)));
    cursor = closeIndex + 1;
  }
  return calls;
}

function parseSourceUnitDatabase(aiSource, databaseSource) {
  const helpers = parseAiUnitHelpers(aiSource);
  const records = new Map();
  const source = stripLuaComments(databaseSource);
  for (const args of sourceUnitDatabaseCalls(source)) {
    if (args.length !== 6 || !/^"/.test(args[3]) || !/^"/.test(args[4]) || !/^"/.test(args[5]) || args[2] === "\"For the Motherland\"") {
      continue;
    }
    const races = args[0] === "race" ? ["human", "orc"] : [args[0].slice(1, -1) === "man" ? "human" : args[0].slice(1, -1)];
    for (const race of races) {
      if (race !== "human" && race !== "orc") {
        continue;
      }
      const unitTypeId = resolveAiUnitExpression(args[1], race, helpers);
      const producerTypeId = resolveAiUnitExpression(args[2], race, helpers);
      if (!unitTypeId || !producerTypeId) {
        continue;
      }
      records.set(`${race}:${unitTypeId}`, {
        race,
        unitTypeId,
        producerTypeId,
        category: args[3].slice(1, -1),
        class: args[4].slice(1, -1),
        rank: args[5].slice(1, -1),
        castCosts: { gold: 0, wood: 0, oil: 0 },
        source: "scripts/database.lua"
      });
    }
  }
  for (const args of sourceUnitDatabaseCalls(source)) {
    if (args.length !== 6 || !/^"/.test(args[0]) || !/^"/.test(args[1]) || args[2] !== "\"For the Motherland\"") {
      continue;
    }
    const race = args[0].slice(1, -1) === "man" ? "human" : args[0].slice(1, -1);
    if (race !== "human" && race !== "orc") {
      continue;
    }
    const key = `${race}:${args[1].slice(1, -1)}`;
    const existing = records.get(key);
    if (!existing) {
      continue;
    }
    records.set(key, {
      ...existing,
      castCosts: {
        gold: Number(args[3]),
        wood: Number(args[4]),
        oil: Number(args[5])
      }
    });
  }
  return [...records.values()].sort((a, b) => a.race.localeCompare(b.race) || a.unitTypeId.localeCompare(b.unitTypeId));
}

function applyUnitDatabaseHeroTraits(unitsById, unitDatabase) {
  for (const entry of unitDatabase) {
    if (entry.rank !== "hero" && entry.class !== "hero") {
      continue;
    }
    const unit = unitsById.get(entry.unitTypeId);
    if (unit) {
      unit.hero = true;
    }
  }
}

function parseAiForcePlans(source) {
  const functionLoops = new Map();
  const uncommented = stripLuaComments(source);
  for (const match of uncommented.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\(\)\s+return\s+AiLoop\(([A-Za-z_][A-Za-z0-9_]*)/g)) {
    functionLoops.set(match[1], match[2]);
  }
  const plans = [];
  for (const match of uncommented.matchAll(/DefineAi\(\s*"([^"]+)"[\s\S]*?,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) {
    const loopName = functionLoops.get(match[2]);
    if (!loopName) {
      continue;
    }
    const attackForces = aiAttackForcesForLoop(source, loopName, new Set());
    if (attackForces.sizes.length === 0) {
      continue;
    }
    plans.push({
      ai: match[1],
      attackForceSize: Math.max(3, Math.min(...attackForces.sizes)),
      attackForceIds: attackForces.ids,
      forceSizes: [...new Set(attackForces.sizes)].sort((a, b) => a - b),
      attackWaveSizes: attackForces.sizes.map((size) => Math.max(3, size)),
      attackWaveUnitTargets: attackForces.waveUnitTargets,
      defendForceSize: attackForces.defendSize,
      attackDelayTicks: aiAttackDelayTicksForLoop(source, loopName, new Set()),
      initialAttackDelayTicks: aiInitialAttackDelayTicksForLoop(source, loopName, new Set()),
      attackUnitTargets: attackForces.unitTargets,
      buildOrder: aiBuildOrderForLoop(source, loopName, new Set()),
      buildDepots: aiBuildDepotsForLoop(source, loopName, new Set()),
      preferredAttackUnitTypes: attackForces.typeIds,
      workerTarget: aiWorkerTargetForLoop(source, loopName, new Set()),
      tankerTarget: aiSetTargetForLoop(source, loopName, "AiTanker", new Set()),
      transportTarget: aiSetTargetForLoop(source, loopName, "AiTransporter", new Set()),
      collectWeights: aiCollectWeightsForLoop(source, loopName, new Set()),
      researchOrder: aiResearchOrderForLoop(source, loopName, new Set())
    });
  }
  return plans.sort((left, right) => left.ai.localeCompare(right.ai));
}

function parseAiDefinitions(source, sourcePath) {
  const definitions = [];
  const uncommented = stripLuaComments(source);
  const defaultNames = parseAiDefaultNames(uncommented);
  for (const match of uncommented.matchAll(/DefineAi\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) {
    definitions.push({
      name: match[1],
      race: match[2],
      class: match[3],
      script: match[4],
      defaultName: defaultNames.get(match[4]) ?? null,
      source: sourcePath
    });
  }
  return definitions;
}

function parseAiDefaultNames(source) {
  const names = new Map();
  const functionPattern = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)/g;
  const matches = [...source.matchAll(functionPattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? source.length;
    const body = source.slice(bodyStart, bodyEnd);
    const name = body.match(/AiJadeite_Set_Name_2010\(\s*"([^"]+)"\s*\)/)?.[1]
      ?? body.match(/AiCharacter_Set_Name_2015\(\s*"([^"]+)"\s*\)/)?.[1]
      ?? null;
    if (name) {
      names.set(match[1], name);
    }
  }
  return names;
}

function aiAttackForcesForLoop(source, loopName, seen) {
  if (seen.has(loopName)) {
    return { ids: [], sizes: [], waveUnitTargets: [], typeIds: [], unitTargets: [], defendSize: 0 };
  }
  seen.add(loopName);
  const body = source.match(new RegExp(`(?:local\\s+)?${escapeRegExp(loopName)}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) {
    return { ids: [], sizes: [], waveUnitTargets: [], typeIds: [], unitTargets: [], defendSize: 0 };
  }
  const definitions = new Map();
  for (const match of body.matchAll(/AiForce\(\s*(\d+)\s*,\s*\{([^}]*)\}/g)) {
    const id = Number(match[1]);
    const total = [...match[2].matchAll(/,\s*(\d+)/g)].reduce((sum, count) => sum + Number(count[1]), 0);
    const typeIds = [];
    const unitTargets = new Map();
    for (const entry of match[2].matchAll(/(Ai[A-Za-z0-9_]+)\(\)\s*,\s*(\d+)/g)) {
      const count = Number(entry[2]);
      if (count > 0) {
        const ids = aiForceUnitTypeIds[entry[1]] ?? [];
        typeIds.push(...ids);
        for (const unitTypeId of ids) {
          unitTargets.set(unitTypeId, (unitTargets.get(unitTypeId) ?? 0) + count);
        }
      }
    }
    if (total > 0) {
      definitions.set(id, { size: total, typeIds, unitTargets });
    }
  }
  const attackGroups = aiAttackForceGroupsForBody(body);
  const attackIds = attackGroups.flat();
  const selectedIds = attackIds.length > 0 ? attackIds : [...definitions.keys()];
  const defendIds = [...body.matchAll(/AiForceRole\(\s*(\d+)\s*,\s*"defend"\s*\)/g)].map((match) => Number(match[1]));
  let defendSize = 0;
  for (const id of defendIds) {
    defendSize = Math.max(defendSize, definitions.get(id)?.size ?? 0);
  }
  const ids = [];
  const sizes = attackGroups.length > 0
    ? attackGroups
      .map((group) => group.reduce((sum, id) => sum + (definitions.get(id)?.size ?? 0), 0))
      .filter((size) => size > 0)
    : [];
  const waveUnitTargets = attackGroups
    .map((group) => aiCombinedForceUnitTargets(group, definitions))
    .filter((targets) => targets.length > 0);
  const typeIds = [];
  const unitTargets = new Map();
  for (const id of selectedIds) {
    const force = definitions.get(id);
    if (force) {
      ids.push(id);
      typeIds.push(...force.typeIds);
      for (const [unitTypeId, count] of force.unitTargets) {
        unitTargets.set(unitTypeId, Math.max(unitTargets.get(unitTypeId) ?? 0, count));
      }
    }
  }
  if (sizes.length === 0) {
    for (const id of selectedIds) {
      const size = definitions.get(id)?.size ?? 0;
      if (size > 0) {
        sizes.push(size);
      }
    }
  }
  for (const nested of body.matchAll(/AiLoop\(([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const nestedForces = aiAttackForcesForLoop(source, nested[1], seen);
    ids.push(...nestedForces.ids);
    sizes.push(...nestedForces.sizes);
    waveUnitTargets.push(...nestedForces.waveUnitTargets);
    typeIds.push(...nestedForces.typeIds);
    defendSize = Math.max(defendSize, nestedForces.defendSize);
    for (const target of nestedForces.unitTargets) {
      unitTargets.set(target.unitTypeId, Math.max(unitTargets.get(target.unitTypeId) ?? 0, target.count));
    }
  }
  const normalizedWaveUnitTargets = [];
  if (waveUnitTargets.length > 0) {
    for (let index = 0; index < sizes.length; index += 1) {
      normalizedWaveUnitTargets.push(waveUnitTargets[index % waveUnitTargets.length]);
    }
  }
  return {
    ids: [...new Set(ids)].sort((a, b) => a - b),
    sizes,
    waveUnitTargets: normalizedWaveUnitTargets,
    typeIds: [...new Set(typeIds)],
    defendSize,
    unitTargets: [...unitTargets.entries()]
      .map(([unitTypeId, count]) => ({ unitTypeId, count }))
      .sort((left, right) => right.count - left.count || left.unitTypeId.localeCompare(right.unitTypeId))
  };
}

function aiCombinedForceUnitTargets(forceIds, definitions) {
  const combined = new Map();
  for (const id of forceIds) {
    const force = definitions.get(id);
    if (!force) {
      continue;
    }
    for (const [unitTypeId, count] of force.unitTargets) {
      combined.set(unitTypeId, (combined.get(unitTypeId) ?? 0) + count);
    }
  }
  return [...combined.entries()]
    .map(([unitTypeId, count]) => ({ unitTypeId, count }))
    .sort((left, right) => right.count - left.count || left.unitTypeId.localeCompare(right.unitTypeId));
}

function aiAttackForceGroupsForBody(body) {
  const groups = [];
  for (const match of body.matchAll(/function\(\)[\s\S]*?AiAttackWithForce\(\s*\d+\s*\)[\s\S]*?end/g)) {
    const ids = [...match[0].matchAll(/AiAttackWithForce\(\s*(\d+)\s*\)/g)].map((idMatch) => Number(idMatch[1]));
    if (ids.length > 0) {
      groups.push(ids);
    }
  }
  return groups;
}

function aiAttackDelayTicksForLoop(source, loopName, seen) {
  if (seen.has(loopName)) {
    return null;
  }
  seen.add(loopName);
  const body = source.match(new RegExp(`(?:local\\s+)?${escapeRegExp(loopName)}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) {
    return null;
  }
  const sleeps = [...body.matchAll(/AiSleep\(\s*(\d+)\s*\)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value > 0 && value < 65535);
  for (const nested of body.matchAll(/AiLoop\(([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const delay = aiAttackDelayTicksForLoop(source, nested[1], seen);
    if (delay !== null) {
      sleeps.push(delay);
    }
  }
  return sleeps.length > 0 ? Math.max(30, Math.min(...sleeps)) : null;
}

function aiInitialAttackDelayTicksForLoop(source, loopName, seen) {
  if (seen.has(loopName)) {
    return null;
  }
  seen.add(loopName);
  const body = source.match(new RegExp(`(?:local\\s+)?${escapeRegExp(loopName)}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) {
    return null;
  }
  const firstAttackIndex = body.search(/AiAttackWithForce\(\s*\d+\s*\)/);
  if (firstAttackIndex !== -1) {
    const sleeps = [...body.slice(0, firstAttackIndex).matchAll(/AiSleep\(\s*(\d+)\s*\)/g)]
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value < 65535);
    if (sleeps.length > 0) {
      return Math.max(30, sleeps[sleeps.length - 1]);
    }
  }
  for (const nested of body.matchAll(/AiLoop\(([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const delay = aiInitialAttackDelayTicksForLoop(source, nested[1], seen);
    if (delay !== null) {
      return delay;
    }
  }
  return null;
}

const aiNeedBuildRoles = {
  AiCityCenter: "town-center",
  AiBetterCityCenter: "town-center-tier2",
  AiBestCityCenter: "town-center-tier3",
  AiFarm: "supply",
  AiBarracks: "barracks",
  AiLumberMill: "lumber-mill",
  AiBlacksmith: "blacksmith",
  AiTower: "tower",
  AiStables: "advanced-melee",
  AiTemple: "holy",
  AiMageTower: "caster",
  AiAirport: "air",
  AiScientific: "demolition",
  AiHarbor: "shipyard",
  AiFoundry: "foundry",
  AiRefinery: "refinery",
  AiPlatform: "oil-platform"
};

const aiUpgradeBuildRoles = {
  AiBetterCityCenter: "town-center-tier2",
  AiBestCityCenter: "town-center-tier3",
  AiGuardTower: "guard-tower",
  AiCannonTower: "cannon-tower"
};

const aiSetBuildRoles = {
  AiCityCenter: "town-center",
  AiFarm: "supply",
  AiBarracks: "barracks",
  AiLumberMill: "lumber-mill",
  AiBlacksmith: "blacksmith",
  AiTower: "tower",
  AiStables: "advanced-melee",
  AiTemple: "holy",
  AiMageTower: "caster",
  AiAirport: "air",
  AiScientific: "demolition",
  AiHarbor: "shipyard",
  AiFoundry: "foundry",
  AiRefinery: "refinery",
  AiPlatform: "oil-platform"
};

const aiWaitBuildRoles = {
  AiCityCenter: "town-center",
  AiBetterCityCenter: "town-center-tier2",
  AiBestCityCenter: "town-center-tier3",
  AiBarracks: "barracks",
  AiLumberMill: "lumber-mill",
  AiAirport: "air"
};

function aiBuildOrderForLoop(source, loopName, seen) {
  if (seen.has(loopName)) {
    return [];
  }
  seen.add(loopName);
  const body = source.match(new RegExp(`(?:local\\s+)?${escapeRegExp(loopName)}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) {
    return [];
  }
  const order = [];
  for (const match of body.matchAll(/AiNeed\(\s*([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\)/g)) {
    const role = aiNeedBuildRoles[match[1]];
    if (role) {
      order.push(role);
    }
  }
  for (const match of body.matchAll(/AiUpgradeTo\(\s*([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\)/g)) {
    const role = aiUpgradeBuildRoles[match[1]];
    if (role) {
      order.push(role);
    }
  }
  for (const match of body.matchAll(/AiSet\(\s*([A-Za-z_][A-Za-z0-9_]*)\(\)\s*,\s*(\d+)\s*\)/g)) {
    const role = aiSetBuildRoles[match[1]];
    const count = Math.min(60, Math.max(0, Number(match[2])));
    if (role && count > 0) {
      order.push(...Array.from({ length: count }, () => role));
    }
  }
  for (const match of body.matchAll(/AiWait\(\s*([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\)/g)) {
    const role = aiWaitBuildRoles[match[1]];
    if (role) {
      order.push(role);
    }
  }
  for (const nested of body.matchAll(/AiLoop\(([A-Za-z_][A-Za-z0-9_]*)/g)) {
    order.push(...aiBuildOrderForLoop(source, nested[1], seen));
  }
  return order;
}

function aiBuildDepotsForLoop(source, loopName, seen) {
  if (seen.has(loopName)) {
    return true;
  }
  seen.add(loopName);
  const body = source.match(new RegExp(`(?:local\\s+)?${escapeRegExp(loopName)}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) {
    return true;
  }
  const explicit = [...body.matchAll(/AiSetBuildDepots\(\s*(true|false)\s*\)/g)].map((match) => match[1] === "true");
  if (explicit.length > 0) {
    return explicit[explicit.length - 1];
  }
  for (const nested of body.matchAll(/AiLoop\(([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (!aiBuildDepotsForLoop(source, nested[1], seen)) {
      return false;
    }
  }
  return true;
}

const aiForceUnitTypeIds = {
  AiSoldier: ["unit-footman", "unit-grunt"],
  AiEliteSoldier: ["unit-paladin", "unit-ogre-mage"],
  AiBones: ["unit-skeleton"],
  AiShooter: ["unit-archer", "unit-axethrower"],
  AiEliteShooter: ["unit-ranger", "unit-berserker"],
  AiCavalry: ["unit-knight", "unit-ogre"],
  AiCavalryMage: ["unit-paladin", "unit-ogre-mage"],
  AiMage: ["unit-mage", "unit-death-knight"],
  AiCatapult: ["unit-ballista", "unit-catapult"],
  AiFlyer: ["unit-gryphon-rider", "unit-dragon"],
  AiScout: ["unit-balloon", "unit-zeppelin"],
  AiTanker: ["unit-human-oil-tanker", "unit-orc-oil-tanker"],
  AiSubmarine: ["unit-human-submarine", "unit-orc-submarine"],
  AiDestroyer: ["unit-human-destroyer", "unit-orc-destroyer"],
  AiBattleship: ["unit-battleship", "unit-ogre-juggernaught"],
  AiTransporter: ["unit-human-transport", "unit-orc-transport"]
};

function aiWorkerTargetForLoop(source, loopName, seen) {
  return aiSetTargetForLoop(source, loopName, "AiWorker", seen);
}

function aiSetTargetForLoop(source, loopName, roleName, seen) {
  if (seen.has(loopName)) {
    return null;
  }
  seen.add(loopName);
  const body = source.match(new RegExp(`(?:local\\s+)?${escapeRegExp(loopName)}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) {
    return null;
  }
  const targets = [...body.matchAll(new RegExp(`AiSet\\(\\s*${escapeRegExp(roleName)}\\(\\)\\s*,\\s*(\\d+)\\s*\\)`, "g"))].map((match) => Number(match[1])).filter((value) => value > 0);
  for (const nested of body.matchAll(/AiLoop\(([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const target = aiSetTargetForLoop(source, nested[1], roleName, seen);
    if (target !== null) {
      targets.push(target);
    }
  }
  return targets.length > 0 ? Math.max(...targets) : null;
}

function aiCollectWeightsForLoop(source, loopName, seen) {
  if (seen.has(loopName)) {
    return null;
  }
  seen.add(loopName);
  const body = source.match(new RegExp(`(?:local\\s+)?${escapeRegExp(loopName)}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) {
    return null;
  }
  const matches = [...body.matchAll(/AiSetCollect\(\s*\{([^}]*)\}\s*\)/g)];
  if (matches.length > 0) {
    const values = matches[matches.length - 1][1].split(",").map((value) => Number(value.trim()));
    return {
      gold: Math.max(0, Math.floor(values[1] ?? 0)),
      wood: Math.max(0, Math.floor(values[2] ?? 0)),
      oil: Math.max(0, Math.floor(values[3] ?? 0))
    };
  }
  for (const nested of body.matchAll(/AiLoop\(([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const weights = aiCollectWeightsForLoop(source, nested[1], seen);
    if (weights) {
      return weights;
    }
  }
  return null;
}

const aiResearchUpgradeIds = {
  AiUpgradeArmor1: ["upgrade-human-shield1", "upgrade-orc-shield1"],
  AiUpgradeArmor2: ["upgrade-human-shield2", "upgrade-orc-shield2"],
  AiUpgradeWeapon1: ["upgrade-sword1", "upgrade-battle-axe1"],
  AiUpgradeWeapon2: ["upgrade-sword2", "upgrade-battle-axe2"],
  AiUpgradeMissile1: ["upgrade-arrow1", "upgrade-throwing-axe1"],
  AiUpgradeMissile2: ["upgrade-arrow2", "upgrade-throwing-axe2"],
  AiUpgradeCatapult1: ["upgrade-ballista1", "upgrade-catapult1"],
  AiUpgradeCatapult2: ["upgrade-ballista2", "upgrade-catapult2"],
  AiUpgradeShipArmor1: ["upgrade-human-ship-armor1", "upgrade-orc-ship-armor1"],
  AiUpgradeShipArmor2: ["upgrade-human-ship-armor2", "upgrade-orc-ship-armor2"],
  AiUpgradeShipCannon1: ["upgrade-human-ship-cannon1", "upgrade-orc-ship-cannon1"],
  AiUpgradeShipCannon2: ["upgrade-human-ship-cannon2", "upgrade-orc-ship-cannon2"],
  AiUpgradeEliteShooter: ["upgrade-ranger", "upgrade-berserker"],
  AiUpgradeEliteShooter1: ["upgrade-ranger-scouting", "upgrade-berserker-scouting"],
  AiUpgradeEliteShooter2: ["upgrade-longbow", "upgrade-light-axes"],
  AiUpgradeEliteShooter3: ["upgrade-ranger-marksmanship", "upgrade-berserker-regeneration"],
  AiUpgradeCavalryMage: ["upgrade-paladin", "upgrade-ogre-mage"],
  AiCavalryMageSpell1: ["upgrade-healing", "upgrade-bloodlust"],
  AiCavalryMageSpell2: ["upgrade-exorcism", "upgrade-runes"],
  AiMageSpell1: ["upgrade-slow", "upgrade-haste"],
  AiMageSpell2: ["upgrade-flame-shield", "upgrade-raise-dead"],
  AiMageSpell3: ["upgrade-invisibility", "upgrade-whirlwind"],
  AiMageSpell4: ["upgrade-polymorph", "upgrade-unholy-armor"],
  AiMageSpell5: ["upgrade-blizzard", "upgrade-death-and-decay"]
};

function aiResearchOrderForLoop(source, loopName, seen) {
  if (seen.has(loopName)) {
    return [];
  }
  seen.add(loopName);
  const body = source.match(new RegExp(`(?:local\\s+)?${escapeRegExp(loopName)}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) {
    return [];
  }
  const order = [];
  for (const match of body.matchAll(/AiResearch\(\s*([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\)/g)) {
    order.push(...(aiResearchUpgradeIds[match[1]] ?? []));
  }
  for (const nested of body.matchAll(/AiLoop\(([A-Za-z_][A-Za-z0-9_]*)/g)) {
    order.push(...aiResearchOrderForLoop(source, nested[1], seen));
  }
  return [...new Set(order)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function parseCampaignLists() {
  const campaignFiles = files.filter((file) => file.startsWith("scripts/lists/campaigns/")).sort();
  const campaigns = [];
  for (const campaignFile of campaignFiles) {
    const source = await readFile(path.join(dataRoot, campaignFile), "utf8");
    const pathMatch = source.match(/CurrentCampaignPath\s*=\s*"([^"]+)"/);
    const raceMatch = source.match(/CurrentCampaignRace\s*=\s*"([^"]+)"/);
    const listMatch = source.match(/CampaignMapTitleList\s*=\s*\{([\s\S]*?)\}/);
    if (!pathMatch || !listMatch) {
      continue;
    }
    const campaignPath = pathMatch[1];
    const c2Files = [...listMatch[1].matchAll(/"([^"]+_c2\.sms)"/g)].map((match) => match[1]);
    const missions = [];
    for (const [index, c2File] of c2Files.entries()) {
      const setupPath = `${campaignPath}${c2File.replace(/_c2\.sms$/, ".sms.gz")}`;
      const mapPath = setupPath.replace(/\.sms\.gz$/, ".smp.gz");
      const map = maps.find((candidate) => candidate.path === mapPath);
      if (map) {
        map.campaignTitle = campaignFile.split("/").at(-1) ?? campaignFile;
        map.campaignMissionIndex = index + 1;
      }
      missions.push({
        index: index + 1,
        title: map?.title && map.title !== "(unnamed)" ? map.title : c2File.replace(/_c2\.sms$/, ""),
        mapPath,
        setupPath: map?.setupPath ?? setupPath
      });
    }
    campaigns.push({
      id: campaignFile.split("/").at(-1)?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? campaignFile,
      title: campaignFile.split("/").at(-1) ?? campaignFile,
      race: raceMatch?.[1] ?? null,
      path: campaignPath,
      missions
    });
  }
  return campaigns;
}

function sharedVisionRulesFromTeams(teams) {
  const rules = [];
  for (const left of teams) {
    for (const right of teams) {
      if (left.player === right.player || left.team <= 0 || right.team <= 0) {
        continue;
      }
      rules.push({
        player: left.player,
        enabled: left.team === right.team,
        otherPlayer: right.player
      });
    }
  }
  return rules;
}

function mergeMapTeams(...groups) {
  const byPlayer = new Map();
  for (const group of groups) {
    for (const team of group) {
      byPlayer.set(team.player, team);
    }
  }
  return [...byPlayer.values()].sort((a, b) => a.player - b.player);
}

function diplomacyRulesFromTeams(teams) {
  const rules = [];
  for (const left of teams) {
    for (const right of teams) {
      if (left.player === right.player || left.team <= 0 || right.team <= 0) {
        continue;
      }
      rules.push({
        player: left.player,
        state: left.team === right.team ? "allied" : "enemy",
        otherPlayer: right.player
      });
    }
  }
  return rules;
}

function mergeDiplomacyRules(...groups) {
  const byPair = new Map();
  for (const group of groups) {
    for (const rule of group) {
      byPair.set(`${rule.player}:${rule.otherPlayer}`, rule);
    }
  }
  return [...byPair.values()].sort((a, b) => a.player - b.player || a.otherPlayer - b.otherPlayer);
}

function mergeSharedVisionRules(...groups) {
  const byPair = new Map();
  for (const group of groups) {
    for (const rule of group) {
      byPair.set(`${rule.player}:${rule.otherPlayer}`, rule);
    }
  }
  return [...byPair.values()].sort((a, b) => a.player - b.player || a.otherPlayer - b.otherPlayer);
}

function summarizeTiles(tiles) {
  const counts = new Map();
  for (const tile of tiles) {
    counts.set(tile.id, (counts.get(tile.id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);
}

if (!(await exists(dataRoot))) {
  throw new Error(`Wargus data root does not exist: ${dataRoot}`);
}

const files = await walk(dataRoot);
const allFilesSet = new Set(files);
const mapFiles = files.filter((file) => file.endsWith(".smp") || file.endsWith(".smp.gz"));
const scriptFiles = files.filter((file) => file.startsWith("scripts/") && file.endsWith(".lua"));
const mapListScriptFiles = files.filter((file) => file.startsWith("scripts/lists/maps/") && !file.includes("."));
const imageFiles = files.filter((file) => /\.(png|jpg|jpeg)$/i.test(file));
const soundFiles = files.filter((file) => /\.(wav|ogg|mid)$/i.test(file));
const sourceRaceUnitEquivalents = parseRaceUnitEquivalents(await readFile(path.join(dataRoot, "scripts/wc2.lua"), "utf8"));
const sourceRaceNames = parseRaceNames(await readFile(path.join(dataRoot, "scripts/wc2.lua"), "utf8"));

const maps = [];
for (const relativePath of mapFiles) {
  const source = await readMaybeGzip(path.join(dataRoot, relativePath));
  const map = parsePresentedMap(relativePath, source);
  if (map) {
    map.sharedVision = sharedVisionRulesFromTeams(map.teams ?? []);
    if (map.setupPath) {
      const setupSource = await readMaybeGzip(path.join(dataRoot, map.setupPath));
      const campaign = await parseCampaignMetadata(map.setupPath);
      if (campaign.title) {
        map.title = campaign.title;
      }
      map.objectives = campaign.objectives;
      map.briefingText = campaign.briefingText;
      map.briefingVoiceFiles = campaign.briefingVoiceFiles;
      map.victoryRequirements = campaign.victoryRequirements;
      map.victoryRequirementGroups = campaign.victoryRequirementGroups;
      map.defeatRequirements = campaign.defeatRequirements;
      map.timedVictoryTriggers = campaign.timedVictoryTriggers;
      map.locationBuildRequirements = campaign.locationBuildRequirements;
      map.circleOfPowerRequirements = campaign.circleOfPowerRequirements;
      map.rescuedCircleRequirements = campaign.rescuedCircleRequirements;
      map.initialUnitHitPointRules = campaign.initialUnitHitPointRules;
      map.playerTypes = mergePlayerTypes(map.playerTypes, campaign.playerTypes);
      map.aiTypeOverrides = campaign.aiTypeOverrides;
      map.diplomacy = mergeDiplomacyRules(campaign.diplomacy, diplomacyRulesFromTeams(map.teams ?? []));
      map.sharedVision = mergeSharedVisionRules(campaign.sharedVision, sharedVisionRulesFromTeams(map.teams ?? []));
      map.allowOverrides = campaign.allowOverrides;
      map.allowedUnitTypes = campaign.allowedUnitTypes;
      map.allowedUpgradeTypes = campaign.allowedUpgradeTypes;
      map.aiForcePlans = campaign.aiForcePlans;
      const setup = parseMapSetup(map.setupPath, setupSource, map);
      map.setup = {
        path: setup.path,
        tileset: setup.tileset,
        highgroundsEnabled: setup.highgroundsEnabled,
        playerCount: setup.players.length,
        unitCount: setup.units.length,
        tileCount: setup.tiles.length,
        state: setup.state,
        starts: setup.starts,
        tileStats: setup.tileStats,
        objectives: setup.objectives,
        briefingText: setup.briefingText,
        briefingVoiceFiles: setup.briefingVoiceFiles,
        victoryRequirements: setup.victoryRequirements,
        victoryRequirementGroups: setup.victoryRequirementGroups,
        defeatRequirements: setup.defeatRequirements,
        timedVictoryTriggers: setup.timedVictoryTriggers,
        locationBuildRequirements: setup.locationBuildRequirements,
        circleOfPowerRequirements: setup.circleOfPowerRequirements,
        rescuedCircleRequirements: setup.rescuedCircleRequirements,
        initialUnitHitPointRules: setup.initialUnitHitPointRules,
        playerTypes: setup.playerTypes,
        aiTypeOverrides: setup.aiTypeOverrides,
        diplomacy: setup.diplomacy,
        sharedVision: setup.sharedVision,
        allowOverrides: setup.allowOverrides,
        allowedUnitTypes: setup.allowedUnitTypes,
        allowedUpgradeTypes: setup.allowedUpgradeTypes,
        aiForcePlans: setup.aiForcePlans
      };
    }
    maps.push(map);
  }
}

const scriptSources = new Map();
for (const scriptFile of scriptFiles) {
  scriptSources.set(scriptFile, await readFile(path.join(dataRoot, scriptFile), "utf8"));
}
const titleScreens = parseTitleScreens(scriptSources.get("scripts/stratagus.lua") ?? "");
const titleTips = parseTitleTips(scriptSources.get("scripts/menus/help.lua") ?? "", "scripts/menus/help.lua");
const cursorDefinitions = [...scriptSources.entries()]
  .flatMap(([scriptFile, source]) => parseCursorDefinitions(source, scriptFile))
  .filter((cursor) => !cursor.source.endsWith("/ui_tales.lua"))
  .sort((a, b) => a.race.localeCompare(b.race) || a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
const cursorDefinitionsWithBlocked = cursorDefinitionsWithDerivedBlockedCursors(cursorDefinitions)
  .sort((a, b) => a.race.localeCompare(b.race) || a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
const sourceNumberConstants = parseSourceNumberConstants(scriptSources);
const fontDefinitions = [...scriptSources.entries()]
  .flatMap(([scriptFile, source]) => parseFontDefinitions(source, scriptFile, sourceNumberConstants))
  .filter((font) => font.source === "scripts/fonts.lua")
  .sort((a, b) => a.id.localeCompare(b.id));
const fontColorPalettes = [...scriptSources.entries()]
  .flatMap(([scriptFile, source]) => parseFontColorDefinitions(source, scriptFile))
  .filter((palette) => palette.source === "scripts/fonts.lua")
  .sort((a, b) => a.id.localeCompare(b.id));
const musicCues = parseMusicCues(scriptSources);
const resultScreens = parseResultScreens(scriptSources.get("scripts/menus/results.lua") ?? "", "scripts/menus/results.lua");
const resultRanks = parseResultRanks(scriptSources.get("scripts/menus/results.lua") ?? "", "scripts/menus/results.lua");
const panelContents = parsePanelContents(scriptSources.get("scripts/ui.lua") ?? "", "scripts/ui.lua");
const decorations = parseDecorations(scriptSources.get("scripts/ui.lua") ?? "", "scripts/ui.lua");
const unitDatabase = parseSourceUnitDatabase(scriptSources.get("scripts/ai.lua") ?? "", scriptSources.get("scripts/database.lua") ?? "");
const tilesets = [...scriptSources.entries()]
  .map(([scriptFile, source]) => parseTilesetTerrain(scriptFile, source))
  .filter((tileset) => tileset !== null);
const mapListScriptSources = new Map();
for (const scriptFile of mapListScriptFiles) {
  mapListScriptSources.set(scriptFile, await readFile(path.join(dataRoot, scriptFile), "utf8"));
}

const animationVariables = new Map();
const animationAliases = [];
for (const source of scriptSources.values()) {
  const parsed = parseAnimationVariables(source);
  for (const [name, frames] of parsed.variables) {
    animationVariables.set(name, frames);
  }
  animationAliases.push(...parsed.aliases);
}
let resolvedAlias = true;
while (resolvedAlias) {
  resolvedAlias = false;
  for (const [alias, target] of animationAliases) {
    if (!animationVariables.has(alias) && animationVariables.has(target)) {
      animationVariables.set(alias, animationVariables.get(target));
      resolvedAlias = true;
    }
  }
}

const unitsById = new Map();
const animationsById = new Map();
const soundsById = new Map();
const upgradesById = new Map();
const missilesById = new Map();
const constructionsById = new Map();
const burningBuildingStagesByPercent = new Map();
const allowRulesById = new Map();
const dependencyRulesById = new Map();
const popupsById = new Map();
const buttons = [];
const spellsById = new Map();
const aiDefinitionsByName = new Map();
const soundGroups = [];
const gameSoundsByKey = new Map();
const soundAliases = new Map();
const mappedUnitSoundsByUnitId = new Map();
const mappedUnitSoundsByTileset = new Map();
const variableDefaults = {};
const engineSettings = { buildingCapture: false, clickMissileId: null, damageMissileId: null, sourceDamageMissileId: null, defaultIncomes: [], defaultResourceActions: [], defaultResourceAmounts: {}, defaultResourceMaxAmounts: [], defaultResourceNames: [], defaultPlayerNames: {}, raceNames: sourceRaceNames, raceUnitEquivalents: sourceRaceUnitEquivalents, deselectInMineDefault: false, doubleClickDelayMsDefault: 300, enhancedEffectsDefault: true, effectsEnabledDefault: true, effectsVolumeDefault: 128, enableKeyboardScrollingDefault: true, enableMouseScrollingDefault: true, extensionsEnabled: true, fastForwardCycleDefault: 0, frameSkipDefault: 0, formationMovementDefault: true, bigScreenDefault: false, grayscaleIconsDefault: false, allyDepositsAllowedDefault: false, aiChecksDependenciesDefault: false, aiExploresDefault: true, insideDefault: false, fogOfWarBilinear: false, fogOfWarBlur: { simpleRadius: 2.0, bilinearRadius: 1.5, iterations: 3 }, fogOfWarEasingSteps: 8, fogOfWarEnabled: true, fogOfWarGraphics: null, fogOfWarOpacityLevels: [0x7f, 0xbe, 0xfe], fogOfWarType: null, fieldOfViewType: null, opaqueTerrainTypes: [], forestRegenerationSeconds: 0, fullGameName: null, gameName: null, gameVersion: null, gameHomepage: null, gameCopyright: null, gameLicense: null, globalBuildingLimit: 0, globalTotalUnitLimit: 0, globalUnitLimit: 0, menuRace: null, defaultRace: null, grabMouseDefault: false, groupKeysDefault: "0123456789`", hardwareCursorDefault: false, highlightPassabilityDefault: false, holdClickDelayMsDefault: 1000, iconsShiftDefault: true, keepRatioDefault: true, keyScrollSpeedDefault: 4, lastDifficultyDefault: 2, leaveStopScrollingDefault: true, maxSelectable: 0, mapGridDefault: false, minimapFogOfWarOpacityLevels: [0x55, 0xaa, 0xff], minimapWithTerrainDefault: true, mineNotificationsDefault: true, musicEnabledDefault: true, musicVolumeDefault: 128, networkGameDefault: false, debugFlagsDefault: [], mouseScrollSpeedControlDefault: 15, mouseScrollSpeedDefault: 1, mouseScrollSpeedPressedDefault: 4, scrollMargins: null, pauseOnLeaveDefault: true, playerNameDefault: null, playerColorIndex: null, playerColors: [], completedBarColorRgb: null, completedBarShadow: null, autoCastBorderColorRgb: null, autosaveMinutesDefault: 5, buttonStyles: {}, uiFontColors: {}, buttonPanel: null, infoPanel: null, mapArea: null, minimap: null, statusLine: null, messageUi: null, menuButtons: {}, briefingLayout: parseBriefingLayout(scriptSources.get("scripts/database.lua") ?? ""), revealMapMode: "hidden", revealAttacker: false, revelationType: null, rightButtonAction: "move", resourceUiLabels: [], resourceUiSlots: [], selectionStyleDefault: "corners", selectionRectangleIndicatesDamageDefault: false, sourceGameSpeedDefault: 30, showButtonPopupsDefault: true, showCommandKeyDefault: true, showDamageDefault: false, showMessagesDefault: true, showNameDelayTicksDefault: 0, showNameTimeTicksDefault: 0, showNoSelectionStatsDefault: true, noStatusLineTooltipsDefault: false, showOrdersDefault: true, showSightRangeDefault: false, showAttackRangeDefault: false, showReactionRangeDefault: false, showTipsDefault: true, simplifiedAutoTargetingDefault: true, speedFactors: { build: 1, train: 1, upgrade: 1, research: 1, resourceHarvest: {}, resourceReturn: {} }, stereoSoundDefault: true, tipNumberDefault: 0, trainingQueue: true, useFancyBuildingsDefault: false, videoFullScreenDefault: false, videoHeightDefault: 480, videoShaderDefault: "none", videoWidthDefault: 640, viewportModeDefault: 0 };
for (const [scriptFile, source] of scriptSources) {
  const parsedEngineSettings = parseEngineSettings(source);
  engineSettings.buildingCapture ||= parsedEngineSettings.buildingCapture;
  engineSettings.clickMissileId ??= parsedEngineSettings.clickMissileId;
  engineSettings.damageMissileId ??= parsedEngineSettings.damageMissileId;
  engineSettings.sourceDamageMissileId ??= parsedEngineSettings.sourceDamageMissileId;
  if (parsedEngineSettings.defaultIncomes.length > 0) engineSettings.defaultIncomes = parsedEngineSettings.defaultIncomes;
  if (parsedEngineSettings.defaultResourceActions.length > 0) engineSettings.defaultResourceActions = parsedEngineSettings.defaultResourceActions;
  engineSettings.defaultResourceAmounts = { ...engineSettings.defaultResourceAmounts, ...parsedEngineSettings.defaultResourceAmounts };
  if (parsedEngineSettings.defaultResourceMaxAmounts.length > 0) engineSettings.defaultResourceMaxAmounts = parsedEngineSettings.defaultResourceMaxAmounts;
  if (parsedEngineSettings.defaultResourceNames.length > 0) engineSettings.defaultResourceNames = parsedEngineSettings.defaultResourceNames;
  engineSettings.deselectInMineDefault ||= parsedEngineSettings.deselectInMineDefault;
  if (parsedEngineSettings.doubleClickDelayMsDefault > 0) engineSettings.doubleClickDelayMsDefault = parsedEngineSettings.doubleClickDelayMsDefault;
  engineSettings.enhancedEffectsDefault &&= parsedEngineSettings.enhancedEffectsDefault;
  engineSettings.effectsEnabledDefault &&= parsedEngineSettings.effectsEnabledDefault;
  if (parsedEngineSettings.effectsVolumeDefault >= 0) engineSettings.effectsVolumeDefault = parsedEngineSettings.effectsVolumeDefault;
  engineSettings.enableKeyboardScrollingDefault &&= parsedEngineSettings.enableKeyboardScrollingDefault;
  engineSettings.enableMouseScrollingDefault &&= parsedEngineSettings.enableMouseScrollingDefault;
  if (/wargus\.extensions\s*=/.test(source)) engineSettings.extensionsEnabled = parsedEngineSettings.extensionsEnabled;
  if (parsedEngineSettings.fastForwardCycleDefault >= 0) engineSettings.fastForwardCycleDefault = parsedEngineSettings.fastForwardCycleDefault;
  if (/FogOfWarBilinear\s*=/.test(source)) engineSettings.fogOfWarBilinear = parsedEngineSettings.fogOfWarBilinear;
  if (/SetFogOfWarBlur\(/.test(source)) engineSettings.fogOfWarBlur = parsedEngineSettings.fogOfWarBlur;
  if (/SetFogOfWarEasingSteps\(/.test(source)) engineSettings.fogOfWarEasingSteps = parsedEngineSettings.fogOfWarEasingSteps;
  if (/FogOfWar\s*=/.test(source)) engineSettings.fogOfWarEnabled = parsedEngineSettings.fogOfWarEnabled;
  engineSettings.fogOfWarGraphics ??= parsedEngineSettings.fogOfWarGraphics;
  if (/SetFogOfWarOpacityLevels\(/.test(source)) engineSettings.fogOfWarOpacityLevels = parsedEngineSettings.fogOfWarOpacityLevels;
  engineSettings.fogOfWarType ??= parsedEngineSettings.fogOfWarType;
  if (scriptFile === "scripts/fov.lua") {
    engineSettings.fieldOfViewType ??= parsedEngineSettings.fieldOfViewType;
    engineSettings.opaqueTerrainTypes = parsedEngineSettings.opaqueTerrainTypes;
  }
  if (parsedEngineSettings.forestRegenerationSeconds > 0 || /SetForestRegeneration\(/.test(source)) engineSettings.forestRegenerationSeconds = Math.max(0, parsedEngineSettings.forestRegenerationSeconds);
  engineSettings.fullGameName ??= parsedEngineSettings.fullGameName;
  engineSettings.gameName ??= parsedEngineSettings.gameName;
  engineSettings.gameVersion ??= parsedEngineSettings.gameVersion;
  engineSettings.gameHomepage ??= parsedEngineSettings.gameHomepage;
  engineSettings.gameCopyright ??= parsedEngineSettings.gameCopyright;
  engineSettings.gameLicense ??= parsedEngineSettings.gameLicense;
  if (parsedEngineSettings.globalBuildingLimit > 0) engineSettings.globalBuildingLimit = parsedEngineSettings.globalBuildingLimit;
  if (parsedEngineSettings.globalTotalUnitLimit > 0) engineSettings.globalTotalUnitLimit = parsedEngineSettings.globalTotalUnitLimit;
  if (parsedEngineSettings.globalUnitLimit > 0) engineSettings.globalUnitLimit = parsedEngineSettings.globalUnitLimit;
  if (parsedEngineSettings.frameSkipDefault >= 0) engineSettings.frameSkipDefault = parsedEngineSettings.frameSkipDefault;
  if (/Preference\.FormationMovement\s*=/.test(source)) engineSettings.formationMovementDefault = parsedEngineSettings.formationMovementDefault;
  if (/Preference\.BigScreen\s*=/.test(source)) engineSettings.bigScreenDefault = parsedEngineSettings.bigScreenDefault;
  engineSettings.grayscaleIconsDefault ||= parsedEngineSettings.grayscaleIconsDefault;
  engineSettings.allyDepositsAllowedDefault ||= parsedEngineSettings.allyDepositsAllowedDefault;
  engineSettings.aiChecksDependenciesDefault ||= parsedEngineSettings.aiChecksDependenciesDefault;
  engineSettings.aiExploresDefault &&= parsedEngineSettings.aiExploresDefault;
  engineSettings.insideDefault ||= parsedEngineSettings.insideDefault;
  engineSettings.grabMouseDefault ||= parsedEngineSettings.grabMouseDefault;
  if (parsedEngineSettings.groupKeysDefault.length > 0) engineSettings.groupKeysDefault = parsedEngineSettings.groupKeysDefault;
  engineSettings.hardwareCursorDefault ||= parsedEngineSettings.hardwareCursorDefault;
  engineSettings.highlightPassabilityDefault ||= parsedEngineSettings.highlightPassabilityDefault;
  if (parsedEngineSettings.holdClickDelayMsDefault > 0) engineSettings.holdClickDelayMsDefault = parsedEngineSettings.holdClickDelayMsDefault;
  if (/Preference\.IconsShift\s*=/.test(source)) engineSettings.iconsShiftDefault = parsedEngineSettings.iconsShiftDefault;
  engineSettings.keepRatioDefault &&= parsedEngineSettings.keepRatioDefault;
  if (parsedEngineSettings.keyScrollSpeedDefault > 0) engineSettings.keyScrollSpeedDefault = parsedEngineSettings.keyScrollSpeedDefault;
  if (parsedEngineSettings.lastDifficultyDefault >= 0) engineSettings.lastDifficultyDefault = parsedEngineSettings.lastDifficultyDefault;
  engineSettings.leaveStopScrollingDefault &&= parsedEngineSettings.leaveStopScrollingDefault;
  if (parsedEngineSettings.maxSelectable > 0) engineSettings.maxSelectable = parsedEngineSettings.maxSelectable;
  engineSettings.menuRace ??= parsedEngineSettings.menuRace;
  engineSettings.defaultRace ??= parsedEngineSettings.defaultRace;
  engineSettings.mapGridDefault ||= parsedEngineSettings.mapGridDefault;
  if (/SetMMFogOfWarOpacityLevels\(/.test(source)) engineSettings.minimapFogOfWarOpacityLevels = parsedEngineSettings.minimapFogOfWarOpacityLevels;
  engineSettings.minimapWithTerrainDefault &&= parsedEngineSettings.minimapWithTerrainDefault;
  engineSettings.mineNotificationsDefault &&= parsedEngineSettings.mineNotificationsDefault;
  engineSettings.musicEnabledDefault &&= parsedEngineSettings.musicEnabledDefault;
  if (parsedEngineSettings.musicVolumeDefault >= 0) engineSettings.musicVolumeDefault = parsedEngineSettings.musicVolumeDefault;
  if (parsedEngineSettings.debugFlagsDefault.length > 0) engineSettings.debugFlagsDefault = parsedEngineSettings.debugFlagsDefault;
  if (parsedEngineSettings.mouseScrollSpeedControlDefault > 0) engineSettings.mouseScrollSpeedControlDefault = parsedEngineSettings.mouseScrollSpeedControlDefault;
  if (parsedEngineSettings.mouseScrollSpeedDefault > 0) engineSettings.mouseScrollSpeedDefault = parsedEngineSettings.mouseScrollSpeedDefault;
  if (parsedEngineSettings.mouseScrollSpeedPressedDefault > 0) engineSettings.mouseScrollSpeedPressedDefault = parsedEngineSettings.mouseScrollSpeedPressedDefault;
  if (parsedEngineSettings.scrollMargins && (scriptFile === "scripts/guichan.lua" || !engineSettings.scrollMargins)) engineSettings.scrollMargins = parsedEngineSettings.scrollMargins;
  engineSettings.pauseOnLeaveDefault &&= parsedEngineSettings.pauseOnLeaveDefault;
  engineSettings.playerNameDefault ??= parsedEngineSettings.playerNameDefault;
  engineSettings.playerColorIndex ??= parsedEngineSettings.playerColorIndex;
  if (parsedEngineSettings.playerColors.length > 0) engineSettings.playerColors = parsedEngineSettings.playerColors;
  if (Object.keys(parsedEngineSettings.defaultPlayerNames).length > 0) engineSettings.defaultPlayerNames = parsedEngineSettings.defaultPlayerNames;
  engineSettings.completedBarColorRgb ??= parsedEngineSettings.completedBarColorRgb;
  if (parsedEngineSettings.completedBarShadow !== null && scriptFile.endsWith("/ui_pandora.lua")) engineSettings.completedBarShadow ??= parsedEngineSettings.completedBarShadow;
  engineSettings.autoCastBorderColorRgb ??= parsedEngineSettings.autoCastBorderColorRgb;
  if (/Preference\.AutosaveMinutes\s*=/.test(source)) engineSettings.autosaveMinutesDefault = parsedEngineSettings.autosaveMinutesDefault;
  engineSettings.buttonStyles = { ...engineSettings.buttonStyles, ...parsedEngineSettings.buttonStyles };
  if (parsedEngineSettings.uiFontColors && scriptFile.endsWith("/ui_pandora.lua")) {
    const race = scriptFile.includes("/orc/") ? "orc" : scriptFile.includes("/human/") ? "human" : null;
    if (race) engineSettings.uiFontColors[race] = parsedEngineSettings.uiFontColors;
  }
  if (parsedEngineSettings.buttonPanel && scriptFile.endsWith("/ui_pandora.lua")) engineSettings.buttonPanel ??= parsedEngineSettings.buttonPanel;
  if (parsedEngineSettings.infoPanel && scriptFile.endsWith("/ui_pandora.lua")) engineSettings.infoPanel ??= parsedEngineSettings.infoPanel;
  if (parsedEngineSettings.mapArea && scriptFile.endsWith("/ui_pandora.lua")) engineSettings.mapArea ??= parsedEngineSettings.mapArea;
  if (parsedEngineSettings.minimap && scriptFile.endsWith("/ui_pandora.lua")) engineSettings.minimap ??= parsedEngineSettings.minimap;
  if (parsedEngineSettings.statusLine && scriptFile.endsWith("/ui_pandora.lua")) engineSettings.statusLine ??= parsedEngineSettings.statusLine;
  engineSettings.messageUi ??= parsedEngineSettings.messageUi;
  if (parsedEngineSettings.menuButtons && scriptFile.endsWith("/ui_pandora.lua")) {
    const race = scriptFile.includes("/orc/") ? "orc" : scriptFile.includes("/human/") ? "human" : null;
    if (race) engineSettings.menuButtons[race] = parsedEngineSettings.menuButtons;
  }
  engineSettings.revealAttacker ||= parsedEngineSettings.revealAttacker;
  if (/RevealMap\(\s*"/.test(source)) engineSettings.revealMapMode = parsedEngineSettings.revealMapMode;
  engineSettings.revelationType ??= parsedEngineSettings.revelationType;
  if (/RightButton(?:Moves|Attacks)\(\s*\)/.test(source)) engineSettings.rightButtonAction = parsedEngineSettings.rightButtonAction;
  if (parsedEngineSettings.resourceUiLabels.length > 0) engineSettings.resourceUiLabels = parsedEngineSettings.resourceUiLabels;
  if (parsedEngineSettings.resourceUiSlots.length > 0) {
    for (const slot of parsedEngineSettings.resourceUiSlots) {
      const existingIndex = engineSettings.resourceUiSlots.findIndex((existing) => existing.key === slot.key);
      const sourceSlot = { ...slot, source: scriptFile };
      if (existingIndex === -1 || scriptFile.endsWith("/ui_pandora.lua")) {
        if (existingIndex === -1) {
          engineSettings.resourceUiSlots.push(sourceSlot);
        } else {
          engineSettings.resourceUiSlots[existingIndex] = sourceSlot;
        }
      }
    }
    engineSettings.resourceUiSlots.sort((a, b) => a.iconX - b.iconX || a.key.localeCompare(b.key));
  }
  if (parsedEngineSettings.selectionStyleDefault) engineSettings.selectionStyleDefault = parsedEngineSettings.selectionStyleDefault;
  if (/Preference\.SelectionRectangleIndicatesDamage\s*=/.test(source)) engineSettings.selectionRectangleIndicatesDamageDefault = parsedEngineSettings.selectionRectangleIndicatesDamageDefault;
  if (parsedEngineSettings.sourceGameSpeedDefault > 0) engineSettings.sourceGameSpeedDefault = parsedEngineSettings.sourceGameSpeedDefault;
  engineSettings.showButtonPopupsDefault &&= parsedEngineSettings.showButtonPopupsDefault;
  engineSettings.showCommandKeyDefault &&= parsedEngineSettings.showCommandKeyDefault;
  engineSettings.showDamageDefault ||= parsedEngineSettings.showDamageDefault;
  engineSettings.showMessagesDefault &&= parsedEngineSettings.showMessagesDefault;
  if (/Preference\.ShowNameDelay\s*=/.test(source)) engineSettings.showNameDelayTicksDefault = parsedEngineSettings.showNameDelayTicksDefault;
  if (/Preference\.ShowNameTime\s*=/.test(source)) engineSettings.showNameTimeTicksDefault = parsedEngineSettings.showNameTimeTicksDefault;
  if (/Preference\.ShowNoSelectionStats\s*=/.test(source)) engineSettings.showNoSelectionStatsDefault = parsedEngineSettings.showNoSelectionStatsDefault;
  if (/Preference\.NoStatusLineTooltips\s*=/.test(source)) engineSettings.noStatusLineTooltipsDefault = parsedEngineSettings.noStatusLineTooltipsDefault;
  engineSettings.showOrdersDefault &&= parsedEngineSettings.showOrdersDefault;
  if (/Preference\.ShowSightRange\s*=/.test(source)) engineSettings.showSightRangeDefault = parsedEngineSettings.showSightRangeDefault;
  if (/Preference\.ShowAttackRange\s*=/.test(source)) engineSettings.showAttackRangeDefault = parsedEngineSettings.showAttackRangeDefault;
  if (/Preference\.ShowReactionRange\s*=/.test(source)) engineSettings.showReactionRangeDefault = parsedEngineSettings.showReactionRangeDefault;
  engineSettings.showTipsDefault &&= parsedEngineSettings.showTipsDefault;
  engineSettings.simplifiedAutoTargetingDefault &&= parsedEngineSettings.simplifiedAutoTargetingDefault;
  engineSettings.speedFactors = parsedEngineSettings.speedFactors;
  engineSettings.stereoSoundDefault &&= parsedEngineSettings.stereoSoundDefault;
  if (parsedEngineSettings.tipNumberDefault >= 0) engineSettings.tipNumberDefault = parsedEngineSettings.tipNumberDefault;
  engineSettings.trainingQueue &&= parsedEngineSettings.trainingQueue;
  engineSettings.useFancyBuildingsDefault ||= parsedEngineSettings.useFancyBuildingsDefault;
  engineSettings.videoFullScreenDefault ||= parsedEngineSettings.videoFullScreenDefault;
  if (parsedEngineSettings.videoHeightDefault > 0) engineSettings.videoHeightDefault = parsedEngineSettings.videoHeightDefault;
  if (parsedEngineSettings.videoShaderDefault) engineSettings.videoShaderDefault = parsedEngineSettings.videoShaderDefault;
  if (parsedEngineSettings.videoWidthDefault > 0) engineSettings.videoWidthDefault = parsedEngineSettings.videoWidthDefault;
  if (parsedEngineSettings.viewportModeDefault >= 0) engineSettings.viewportModeDefault = parsedEngineSettings.viewportModeDefault;
  const parsedDefaults = parseVariableDefaults(source);
  if (parsedDefaults.mana) {
    variableDefaults.mana = parsedDefaults.mana;
  }
  for (const [soundKey, soundId] of parseSoundMappings(source)) {
    soundAliases.set(soundKey, soundId);
    const unitSound = splitUnitSoundKey(soundKey);
    if (unitSound) {
      const unitTypeId = soundKeyToUnitTypeId(unitSound.unitKey);
      if (unitTypeId) {
        mappedUnitSoundsByUnitId.set(unitTypeId, {
          ...(mappedUnitSoundsByUnitId.get(unitTypeId) ?? {}),
          [unitSound.event]: soundId
        });
      }
    }
  }
  for (const { soundKey, unitTypeId, tileset, event, soundId } of parseTilesetSoundMappings(source).values()) {
    if (!soundAliases.has(soundKey)) {
      soundAliases.set(soundKey, soundId);
    }
    mappedUnitSoundsByTileset.set(unitTypeId, {
      ...(mappedUnitSoundsByTileset.get(unitTypeId) ?? {}),
      [tileset]: {
        ...(mappedUnitSoundsByTileset.get(unitTypeId)?.[tileset] ?? {}),
        [event]: soundId
      }
    });
  }
}
for (const [scriptFile, source] of scriptSources) {
  const unitTypeFiles = parseUnitTypeFiles(source);
  for (const unit of parseUnitDefinitions(source, unitTypeFiles, variableDefaults)) {
    const existing = unitsById.get(unit.id);
    const merged = mergeUnitDefinition(existing, unit);
    unitsById.set(unit.id, {
      ...merged,
      source: unit.hitPoints > 0 || !existing?.source ? scriptFile : existing.source
    });
  }
  for (const animation of parseAnimationDefinitions(source, animationVariables)) {
    animationsById.set(animation.id, { ...animation, source: scriptFile });
  }
  for (const sound of parseSoundDefinitions(source)) {
    soundsById.set(sound.id, { ...sound, source: scriptFile });
  }
  for (const [soundId, range] of parseSoundRanges(source)) {
    const existing = soundsById.get(soundId);
    if (existing) {
      soundsById.set(soundId, { ...existing, range });
    }
  }
  for (const upgrade of parseUpgradeDefinitions(source)) {
    const existing = upgradesById.get(upgrade.id);
    const merged = mergeUpgradeDefinition(existing, upgrade);
    upgradesById.set(upgrade.id, {
      ...merged,
      source: upgradeCostTotal(upgrade.costs) > 0 || !existing?.source ? scriptFile : existing.source
    });
  }
  for (const missile of parseMissileDefinitions(source)) {
    missilesById.set(missile.id, { ...missile, source: scriptFile });
  }
  for (const construction of parseConstructionDefinitions(source)) {
    constructionsById.set(construction.id, { ...construction, source: scriptFile });
  }
  for (const stage of parseBurningBuildingStages(source)) {
    burningBuildingStagesByPercent.set(stage.percent, { ...stage, source: scriptFile });
  }
  for (const rule of parseAllowRules(source)) {
    allowRulesById.set(rule.id, { ...rule, source: scriptFile });
  }
  for (const rule of parseDependencyRules(source)) {
    dependencyRulesById.set(rule.id, { ...rule, source: scriptFile });
  }
  for (const popup of parsePopupDefinitions(source)) {
    popupsById.set(popup.id, { ...popup, source: scriptFile });
  }
  for (const [index, button] of parseButtonDefinitions(source).entries()) {
    buttons.push({ ...button, id: `${scriptFile}:${index}`, source: scriptFile });
  }
  for (const spell of parseSpellDefinitions(source)) {
    spellsById.set(spell.id, { ...spell, source: scriptFile });
  }
  for (const aiDefinition of parseAiDefinitions(source, scriptFile)) {
    aiDefinitionsByName.set(aiDefinition.name, aiDefinition);
  }
  for (const group of parseSoundGroups(source)) {
    soundGroups.push({ ...group, source: scriptFile });
  }
  for (const gameSound of parseGameSounds(source)) {
    gameSoundsByKey.set(`${gameSound.event}:${gameSound.race}`, { ...gameSound, source: scriptFile });
  }
}
for (const [scriptFile, source] of mapListScriptSources) {
  const unitTypeFiles = parseUnitTypeFiles(source);
  for (const unit of parseUnitDefinitions(source, unitTypeFiles, variableDefaults)) {
    const existing = unitsById.get(unit.id);
    const merged = mergeUnitDefinition(existing, unit);
    unitsById.set(unit.id, {
      ...merged,
      source: unit.hitPoints > 0 || !existing?.source ? scriptFile : existing.source
    });
  }
  for (const animation of parseAnimationDefinitions(source, animationVariables)) {
    animationsById.set(animation.id, { ...animation, source: scriptFile });
  }
  for (const spell of parseSpellDefinitions(source)) {
    spellsById.set(spell.id, { ...spell, source: scriptFile });
  }
}
for (const group of soundGroups) {
  const files = group.members.flatMap((member) => soundsById.get(member)?.files ?? []);
  const memberRanges = group.members
    .map((member) => soundsById.get(member)?.range)
    .filter((range) => typeof range === "number");
  if (files.length > 0) {
    soundsById.set(group.id, { id: group.id, files, source: group.source, range: memberRanges[0], members: group.members });
  }
}
const soundGroupsById = new Map(soundGroups.map((group) => [group.id, group]));
for (const [unitTypeId, mappedSounds] of mappedUnitSoundsByUnitId) {
  const unit = unitsById.get(unitTypeId);
  if (unit) {
    unit.sounds = { ...unit.sounds, ...mappedSounds };
  }
}
for (const [unitTypeId, mappedSoundsByTileset] of mappedUnitSoundsByTileset) {
  const unit = unitsById.get(unitTypeId);
  if (unit) {
    unit.soundsByTileset = { ...(unit.soundsByTileset ?? {}), ...mappedSoundsByTileset };
  }
}
for (const unit of unitsById.values()) {
  const resolvedSounds = {};
  for (const [event, soundId] of Object.entries(unit.sounds)) {
    resolvedSounds[event] = resolveSoundAlias(soundId, soundAliases);
  }
  if (!resolvedSounds.annoyed && resolvedSounds.selected) {
    const selectedGroup = soundGroupsById.get(resolvedSounds.selected);
    const annoyedSoundId = selectedGroup?.members[1];
    if (annoyedSoundId) {
      resolvedSounds.annoyed = resolveSoundAlias(annoyedSoundId, soundAliases);
    }
  }
  unit.sounds = resolvedSounds;
  if (unit.soundsByTileset) {
    const resolvedSoundsByTileset = {};
    for (const [tileset, sounds] of Object.entries(unit.soundsByTileset)) {
      resolvedSoundsByTileset[tileset] = {};
      for (const [event, soundId] of Object.entries(sounds)) {
        resolvedSoundsByTileset[tileset][event] = resolveSoundAlias(soundId, soundAliases);
      }
      if (!resolvedSoundsByTileset[tileset].annoyed && resolvedSoundsByTileset[tileset].selected) {
        const selectedGroup = soundGroupsById.get(resolvedSoundsByTileset[tileset].selected);
        const annoyedSoundId = selectedGroup?.members[1];
        if (annoyedSoundId) {
          resolvedSoundsByTileset[tileset].annoyed = resolveSoundAlias(annoyedSoundId, soundAliases);
        }
      }
    }
    unit.soundsByTileset = resolvedSoundsByTileset;
  }
}
applyUnitDatabaseHeroTraits(unitsById, unitDatabase);
const generatedDeadVisionUnits = addGeneratedDeadVisionUnits(unitsById, animationsById);
const units = [...unitsById.values()].sort((a, b) => a.id.localeCompare(b.id));
const animations = [...animationsById.values()].sort((a, b) => a.id.localeCompare(b.id));
const sounds = [...soundsById.values()].sort((a, b) => a.id.localeCompare(b.id));
const gameSounds = [...gameSoundsByKey.values()].sort((a, b) => a.event.localeCompare(b.event) || a.race.localeCompare(b.race));
const upgrades = [...upgradesById.values()].sort((a, b) => a.id.localeCompare(b.id));
const missiles = [...missilesById.values()].sort((a, b) => a.id.localeCompare(b.id));
const constructions = [...constructionsById.values()].sort((a, b) => a.id.localeCompare(b.id));
const burningBuildings = [...burningBuildingStagesByPercent.values()].sort((a, b) => a.percent - b.percent);
const allowRules = [...allowRulesById.values()].sort((a, b) => a.id.localeCompare(b.id));
const dependencies = [...dependencyRulesById.values()].sort((a, b) => a.id.localeCompare(b.id));
enrichPopupDefinitionsFromButtons(popupsById, buttons);
const popups = [...popupsById.values()].sort((a, b) => a.id.localeCompare(b.id));
const aiDefinitions = [...aiDefinitionsByName.values()].sort((a, b) => a.name.localeCompare(b.name));
for (const button of buttons) {
  const popup = button.popup ? popupsById.get(button.popup) : null;
  button.popupKind = popup?.kind ?? null;
  button.popupRace = popup?.race ?? null;
  button.popupHasHint = popup?.hasHint ?? false;
  button.popupHasDescription = popup?.hasDescription ?? false;
  button.popupShowsCosts = popup?.showsCosts ?? false;
  button.popupVariables = popup?.variables ?? [];
  button.popupActionHints = popup?.actionHints ?? [];
  button.popupConditionalHints = popup?.conditionalHints ?? {};
  button.popupExtraHints = popup?.extraHints ?? [];
}
buttons.sort((a, b) => a.source.localeCompare(b.source) || a.level - b.level || a.pos - b.pos || a.action.localeCompare(b.action) || (a.value ?? "").localeCompare(b.value ?? ""));
const spells = [...spellsById.values()].sort((a, b) => a.id.localeCompare(b.id));
const campaigns = await parseCampaignLists();

for (const file of new Set(Object.values(engineSettings.buttonStyles).flatMap((style) => [style.defaultFile, style.clickedFile]).filter(Boolean))) {
  await copyBrowserAsset("graphics", file);
}
for (const font of fontDefinitions) {
  await copyBrowserAsset("graphics", font.file);
}

const sortedMaps = maps.sort((a, b) => a.path.localeCompare(b.path));
const setupOutputDir = path.join(outDir, "maps", "setups");
await mkdir(setupOutputDir, { recursive: true });
for (const [index, map] of sortedMaps.entries()) {
  if (!map.setupPath) {
    continue;
  }
  const setupSource = await readMaybeGzip(path.join(dataRoot, map.setupPath));
  const campaign = await parseCampaignMetadata(map.setupPath);
  if (campaign.title) {
    map.title = campaign.title;
  }
  map.objectives = campaign.objectives;
  map.briefingText = campaign.briefingText;
  map.briefingVoiceFiles = campaign.briefingVoiceFiles;
  map.victoryRequirements = campaign.victoryRequirements;
  map.victoryRequirementGroups = campaign.victoryRequirementGroups;
  map.defeatRequirements = campaign.defeatRequirements;
  map.timedVictoryTriggers = campaign.timedVictoryTriggers;
  map.locationBuildRequirements = campaign.locationBuildRequirements;
  map.circleOfPowerRequirements = campaign.circleOfPowerRequirements;
  map.rescuedCircleRequirements = campaign.rescuedCircleRequirements;
  map.initialUnitHitPointRules = campaign.initialUnitHitPointRules;
  map.playerTypes = mergePlayerTypes(map.playerTypes, campaign.playerTypes);
  map.aiTypeOverrides = campaign.aiTypeOverrides;
  map.diplomacy = mergeDiplomacyRules(campaign.diplomacy, diplomacyRulesFromTeams(map.teams ?? []));
  map.sharedVision = mergeSharedVisionRules(campaign.sharedVision, sharedVisionRulesFromTeams(map.teams ?? []));
  map.allowOverrides = campaign.allowOverrides;
  map.allowedUnitTypes = campaign.allowedUnitTypes;
  map.allowedUpgradeTypes = campaign.allowedUpgradeTypes;
  const setup = parseMapSetup(map.setupPath, setupSource, map);
  const setupFile = `${String(index).padStart(3, "0")}-${path.basename(map.setupPath).replace(/[^a-z0-9._-]/gi, "_").replace(/\.gz$/i, "")}.json`;
  await writeFile(path.join(setupOutputDir, setupFile), `${JSON.stringify(setup)}\n`);
  map.setupJson = `maps/setups/${setupFile}`;
}

const manifest = {
  generatedAt: new Date().toISOString(),
  dataRoot,
  sourceHash: await sha256(path.join(dataRoot, "scripts/stratagus.lua")),
  counts: {
    files: files.length,
    maps: maps.length,
    scripts: scriptFiles.length,
    images: imageFiles.length,
    sounds: soundFiles.length,
    units: units.length,
    generatedDeadVisionUnits,
    animations: animations.length,
    soundDefinitions: sounds.length,
    gameSounds: gameSounds.length,
    upgrades: upgrades.length,
    missiles: missiles.length,
    constructions: constructions.length,
    burningBuildings: burningBuildings.length,
    tilesets: tilesets.length,
    allowRules: allowRules.length,
    dependencies: dependencies.length,
    popups: popups.length,
    buttons: buttons.length,
    spells: spells.length,
    aiDefinitions: aiDefinitions.length,
    unitDatabase: unitDatabase.length,
    titleTips: titleTips.length,
    cursors: cursorDefinitionsWithBlocked.length,
    fonts: fontDefinitions.length,
    fontColors: fontColorPalettes.length,
    musicCues: musicCues.length,
    resultScreens: resultScreens.length,
    resultRanks: resultRanks.length,
    panelContents: panelContents.length,
    decorations: decorations.length
  },
  titleScreens,
  titleTips,
  cursors: cursorDefinitionsWithBlocked,
  fonts: fontDefinitions,
  fontColors: fontColorPalettes,
  musicCues,
  resultScreens,
  resultRanks,
  panelContents,
  decorations,
  aiDefinitions,
  unitDatabase,
  maps: sortedMaps,
  campaigns,
  engineSettings,
  units,
  animations,
  sounds,
  gameSounds,
  upgrades,
  missiles,
  constructions,
  burningBuildings,
  tilesets,
  allowRules,
  dependencies,
  popups,
  buttons,
  spells,
  assetRoots: {
    graphics: imageFiles.filter((file) => file.startsWith("graphics/")).slice(0, 200),
    sounds: soundFiles.filter((file) => file.startsWith("sounds/")).slice(0, 200),
    music: soundFiles.filter((file) => file.startsWith("music/")).slice(0, 200)
  },
  scripts: scriptFiles
};

await mkdir(outDir, { recursive: true });
const defaultMap = sortedMaps.find((map) => map.path === defaultMapPath) ?? sortedMaps.find((map) => map.setupPath);
if (defaultMap?.setupJson) {
  manifest.defaultMapSetup = defaultMap.setupJson;
}
await writeFile(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Indexed ${manifest.counts.files} Wargus files`);
console.log(`Maps: ${manifest.counts.maps}, units: ${manifest.counts.units}, animations: ${manifest.counts.animations}, missiles: ${manifest.counts.missiles}, constructions: ${manifest.counts.constructions}, burning buildings: ${manifest.counts.burningBuildings}, allow rules: ${manifest.counts.allowRules}, dependencies: ${manifest.counts.dependencies}, popups: ${manifest.counts.popups}, buttons: ${manifest.counts.buttons}, spells: ${manifest.counts.spells}, scripts: ${manifest.counts.scripts}`);
console.log(`Wrote ${outFile}`);
