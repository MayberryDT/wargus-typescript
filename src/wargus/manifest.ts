import type { WargusManifest, WargusMap, WargusUnit } from "./types";
import { isExploreOnReadyValue } from "./sourceActions";
import { FIXED_BROWSER_DEMO_MAP_PATH } from "./demoScenario";

export async function loadWargusManifest(): Promise<WargusManifest> {
  const response = await fetch("/wargus/manifest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Missing Wargus manifest. Run `npm run index:wargus` first.");
  }
  const manifest = await response.json() as WargusManifest;
  normalizeSiegeUnits(manifest.units);
  normalizeCustomMapUnits(manifest.units);
  return manifest;
}

export function chooseInitialMap(manifest: Pick<WargusManifest, "maps">): WargusMap {
  return manifest.maps.find((map) => map.path === FIXED_BROWSER_DEMO_MAP_PATH && map.setupJson)
    ?? manifest.maps.find((map) => map.setupJson && map.width === 64 && map.height === 64 && map.players >= 2)
    ?? manifest.maps.find((map) => map.setupJson && map.players >= 2)
    ?? manifest.maps[0]
    ?? { path: "synthetic", setupPath: null, title: "Synthetic Test Range", players: 2, width: 64, height: 64, tileset: 1 };
}

export function mapsForPicker(manifest: Pick<WargusManifest, "maps" | "campaigns">): WargusMap[] {
  const byPath = new Map(manifest.maps.map((map) => [map.path, map]));
  const ordered: WargusMap[] = [];
  for (const campaign of manifest.campaigns ?? []) {
    for (const mission of campaign.missions) {
      const map = byPath.get(mission.mapPath);
      if (map?.setupJson) {
        ordered.push(map);
      }
    }
  }
  const campaignPaths = new Set(ordered.map((map) => map.path));
  ordered.push(...manifest.maps.filter((map) => map.setupJson && !campaignPaths.has(map.path)));
  return ordered;
}

export function filteredMapPickerMatches(maps: WargusMap[], queryText: string): WargusMap[] {
  const query = queryText.trim().toLowerCase();
  if (!query) {
    return maps;
  }
  const numeric = Number(query);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= maps.length) {
    return [maps[numeric - 1]].filter((map): map is WargusMap => Boolean(map));
  }
  return maps.filter((map) => `${map.title} ${map.path}`.toLowerCase().includes(query));
}

export function campaignMissionKey(map: WargusMap): string | null {
  return map.campaignTitle && map.campaignMissionIndex ? `${map.campaignTitle}:${map.campaignMissionIndex}` : null;
}

export function nextCampaignMapFor(map: WargusMap, manifest: Pick<WargusManifest, "campaigns" | "maps">): WargusMap | null {
  if (!map.campaignTitle || !map.campaignMissionIndex) {
    return null;
  }
  const campaign = manifest.campaigns?.find((candidate) => candidate.title === map.campaignTitle);
  const nextMission = campaign?.missions.find((mission) => mission.index === (map.campaignMissionIndex ?? 0) + 1);
  return nextMission ? manifest.maps.find((candidate) => candidate.path === nextMission.mapPath && candidate.setupJson) ?? null : null;
}

export function choosePreloadedUnitSprites(units: WargusUnit[]): WargusUnit[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const preferredIds = new Set<string>();
  for (const unit of units) {
    if (shouldPreloadSourceUnitSprite(unit)) {
      preferredIds.add(unit.id);
    }
  }
  for (const id of LEGACY_PRELOADED_UNIT_IDS) {
    preferredIds.add(id);
  }
  return Array.from(preferredIds)
    .map((id) => byId.get(id))
    .filter((unit): unit is WargusUnit => Boolean(unit?.image));
}

export function shouldPreloadSourceUnitSprite(unit: WargusUnit): boolean {
  if (!unit.image) {
    return false;
  }
  if (unit.gatherResources?.length || unit.canHarvest || unit.mainFacility || unit.supply > 0 || unit.givesResource) {
    return true;
  }
  if ((unit.storesResources ?? []).length > 0 || (unit.improveProduction && Object.keys(unit.improveProduction).length > 0)) {
    return true;
  }
  if (unit.canAttack || isCasterDefinition(unit) || isDemolitionDefinition(unit) || isScoutAirDefinition(unit)) {
    return true;
  }
  if (unit.seaUnit && (isNavalCombatOrUtilityDefinition(unit) || unit.gatherResources?.includes("oil"))) {
    return true;
  }
  if ((unit.maxOnBoard ?? 0) > 0 || (unit.canTransport ?? []).length > 0) {
    return true;
  }
  if (unit.building && ((unit.costs ?? []).length > 0 || unit.constructionTypeId || unit.canCastSpells?.length)) {
    return true;
  }
  return isExploreOnReadyValue(unit.onReady);
}

const LEGACY_PRELOADED_UNIT_IDS = [
  "unit-peasant",
  "unit-footman",
  "unit-archer",
  "unit-knight",
  "unit-peon",
  "unit-grunt",
  "unit-axethrower",
  "unit-ogre",
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
  "unit-human-blacksmith",
  "unit-orc-blacksmith",
  "unit-elven-lumber-mill",
  "unit-troll-lumber-mill",
  "unit-stables",
  "unit-ogre-mound",
  "unit-human-watch-tower",
  "unit-orc-watch-tower",
  "unit-human-guard-tower",
  "unit-orc-guard-tower",
  "unit-human-cannon-tower",
  "unit-orc-cannon-tower",
  "unit-human-shipyard",
  "unit-orc-shipyard",
  "unit-human-oil-platform",
  "unit-orc-oil-platform",
  "unit-oil-patch",
  "unit-human-oil-tanker",
  "unit-orc-oil-tanker",
  "unit-human-destroyer",
  "unit-orc-destroyer",
  "unit-battleship",
  "unit-ogre-juggernaught",
  "unit-human-submarine",
  "unit-orc-submarine",
  "unit-human-transport",
  "unit-orc-transport",
  "unit-mage-tower",
  "unit-temple-of-the-damned",
  "unit-mage",
  "unit-death-knight",
  "unit-church",
  "unit-altar-of-storms",
  "unit-paladin",
  "unit-ogre-mage",
  "unit-gryphon-aviary",
  "unit-dragon-roost",
  "unit-gryphon-rider",
  "unit-dragon",
  "unit-inventor",
  "unit-alchemist",
  "unit-dwarves",
  "unit-goblin-sappers",
  "unit-critter",
  "unit-eye-of-vision",
  "unit-ballista",
  "unit-catapult",
  "unit-balloon",
  "unit-zeppelin",
  "unit-archer",
  "unit-ranger",
  "unit-axethrower",
  "unit-berserker"
];

function isCasterDefinition(definition: WargusUnit): boolean {
  return Boolean(definition.manaEnabled) && (definition.canCastSpells?.length ?? 0) > 0;
}

function isDemolitionDefinition(definition: WargusUnit): boolean {
  return Boolean(definition.volatile) || (definition.clicksToExplode ?? 0) > 0;
}

function isScoutAirDefinition(definition: WargusUnit): boolean {
  return Boolean(definition.airUnit) && !definition.canAttack && (definition.sightRange ?? 0) >= 6;
}

function isNavalCombatOrUtilityDefinition(definition: WargusUnit): boolean {
  return isNavalRoleDefinition(definition, "tanker")
    || isNavalRoleDefinition(definition, "destroyer")
    || isNavalRoleDefinition(definition, "warship")
    || isNavalRoleDefinition(definition, "transport")
    || isNavalRoleDefinition(definition, "submarine");
}

function isNavalRoleDefinition(definition: WargusUnit, role: "tanker" | "destroyer" | "warship" | "transport" | "submarine"): boolean {
  if (!definition.seaUnit) {
    return false;
  }
  if (role === "tanker") {
    return definition.gatherResources?.includes("oil") ?? false;
  }
  if (role === "transport") {
    return (definition.maxOnBoard ?? 0) > 0 || (definition.canTransport?.length ?? 0) > 0;
  }
  if (role === "submarine") {
    return Boolean(definition.permanentCloak);
  }
  if (!definition.canAttack) {
    return false;
  }
  const damage = definition.basicDamage + definition.piercingDamage;
  if (role === "warship") {
    return damage >= 40 || definition.maxAttackRange >= 6;
  }
  return damage > 0;
}

function normalizeSiegeUnits(units: WargusUnit[]): void {
  patchUnit(units, "unit-ballista", {
    name: "Ballista",
    image: "human/units/dwarven_demolition_squad.png",
    icon: "icon-ballista",
    animation: "animations-ballista",
    type: "land",
    hitPoints: 110,
    armor: 0,
    basicDamage: 0,
    piercingDamage: 80,
    minAttackRange: 2,
    maxAttackRange: 8,
    sightRange: 9,
    supply: 0,
    demand: 1,
    canAttack: true,
    canTargetLand: true,
    canTargetSea: true,
    canTargetAir: false,
    detectCloak: false,
    tileSize: [1, 1],
    costs: ["time", "250", "gold", "900", "wood", "300"],
    sounds: {
      selected: "catapult-ballista movement",
      acknowledge: "catapult-ballista movement",
      ready: "catapult-ballista movement",
      attack: "catapult-ballista attack",
      dead: "explosion"
    }
  });
  patchUnit(units, "unit-ballista-super", {
    name: "Ballista",
    image: "human/units/dwarven_demolition_squad.png",
    icon: "icon-ballista",
    animation: "animations-ballista",
    type: "land",
    hitPoints: 110,
    armor: 0,
    basicDamage: 0,
    piercingDamage: 96,
    minAttackRange: 4,
    maxAttackRange: 10,
    sightRange: 10,
    supply: 0,
    demand: 1,
    canAttack: true,
    canTargetLand: true,
    canTargetSea: true,
    canTargetAir: true,
    detectCloak: false,
    tileSize: [1, 1],
    costs: ["time", "250", "gold", "900", "wood", "300"],
    sounds: {
      selected: "catapult-ballista movement",
      acknowledge: "catapult-ballista movement",
      ready: "catapult-ballista movement",
      attack: "catapult-ballista attack",
      dead: "explosion"
    }
  });
  patchUnit(units, "unit-catapult", {
    name: "Catapult",
    image: "orc/units/goblin_sappers.png",
    icon: "icon-catapult",
    animation: "animations-catapult",
    type: "land",
    hitPoints: 110,
    armor: 0,
    basicDamage: 0,
    piercingDamage: 80,
    minAttackRange: 2,
    maxAttackRange: 8,
    sightRange: 9,
    supply: 0,
    demand: 1,
    canAttack: true,
    canTargetLand: true,
    canTargetSea: true,
    canTargetAir: false,
    detectCloak: false,
    tileSize: [1, 1],
    costs: ["time", "250", "gold", "900", "wood", "300"],
    sounds: {
      selected: "catapult-ballista movement",
      acknowledge: "catapult-ballista movement",
      ready: "catapult-ballista movement",
      attack: "catapult-ballista attack",
      dead: "explosion"
    }
  });
  patchUnit(units, "unit-catapult-super", {
    name: "Catapult",
    image: "orc/units/goblin_sappers.png",
    icon: "icon-catapult",
    animation: "animations-catapult",
    type: "land",
    hitPoints: 110,
    armor: 0,
    basicDamage: 0,
    piercingDamage: 96,
    minAttackRange: 4,
    maxAttackRange: 10,
    sightRange: 10,
    supply: 0,
    demand: 1,
    canAttack: true,
    canTargetLand: true,
    canTargetSea: true,
    canTargetAir: true,
    detectCloak: false,
    tileSize: [1, 1],
    costs: ["time", "250", "gold", "900", "wood", "300"],
    sounds: {
      selected: "catapult-ballista movement",
      acknowledge: "catapult-ballista movement",
      ready: "catapult-ballista movement",
      attack: "catapult-ballista attack",
      dead: "explosion"
    }
  });
  patchUnit(units, "unit-skeleton", {
    name: "Skeleton",
    image: "orc/units/death_knight.png",
    icon: "icon-death-knight",
    animation: "animations-death-knight",
    type: "land",
    hitPoints: 40,
    armor: 0,
    basicDamage: 2,
    piercingDamage: 6,
    maxAttackRange: 1,
    sightRange: 3,
    supply: 0,
    demand: 0,
    canAttack: true,
    canTargetLand: true,
    canTargetSea: false,
    canTargetAir: false,
    detectCloak: false,
    tileSize: [1, 1],
    costs: ["time", "0", "gold", "0", "wood", "0"],
    sounds: {}
  });
  patchUnit(units, "unit-eye-of-kilrogg", {
    name: "Eye of Kilrogg",
    image: "orc/units/goblin_zeppelin.png",
    icon: "icon-eye-of-kilrogg",
    animation: null,
    type: "fly",
    hitPoints: 20,
    armor: 0,
    basicDamage: 0,
    piercingDamage: 0,
    maxAttackRange: 0,
    sightRange: 9,
    supply: 0,
    demand: 0,
    canAttack: false,
    canTargetLand: false,
    canTargetSea: false,
    canTargetAir: false,
    detectCloak: true,
    tileSize: [1, 1],
    costs: ["time", "0", "gold", "0", "wood", "0"],
    sounds: {}
  });
  patchUnit(units, "unit-eye-of-vision", {
    name: "Eye of Vision",
    image: "orc/units/goblin_zeppelin.png",
    icon: "icon-eye-of-kilrogg",
    animation: null,
    type: "fly",
    hitPoints: 20,
    armor: 0,
    basicDamage: 0,
    piercingDamage: 0,
    maxAttackRange: 0,
    sightRange: 9,
    supply: 0,
    demand: 0,
    canAttack: false,
    canTargetLand: false,
    canTargetSea: false,
    canTargetAir: false,
    detectCloak: true,
    tileSize: [1, 1],
    costs: ["time", "0", "gold", "0", "wood", "0"],
    sounds: {}
  });
}

function normalizeCustomMapUnits(units: WargusUnit[]): void {
  patchUnit(units, "unit-circle-of-power", {
    name: "Circle of Power",
    image: "neutral/buildings/circle_of_power.png",
    icon: "icon-circle-of-power",
    animation: "animations-building",
    type: "land",
    hitPoints: 500,
    armor: 20,
    basicDamage: 0,
    piercingDamage: 0,
    maxAttackRange: 0,
    supply: 0,
    demand: 0,
    canAttack: false,
    canTargetLand: false,
    canTargetSea: false,
    canTargetAir: false,
    detectCloak: false,
    tileSize: [2, 2],
    costs: [],
    sounds: {}
  });
  patchUnit(units, "unit-pile-circle", {
    name: "Circle of Power",
    image: "neutral/buildings/circle_of_power.png",
    icon: "icon-circle-of-power",
    animation: "animations-building",
    type: "land",
    hitPoints: 500,
    armor: 20,
    basicDamage: 0,
    piercingDamage: 0,
    maxAttackRange: 0,
    supply: 0,
    demand: 0,
    canAttack: false,
    canTargetLand: false,
    canTargetSea: false,
    canTargetAir: false,
    detectCloak: false,
    tileSize: [3, 3],
    costs: [],
    sounds: {}
  });
  patchUnit(units, "unit-yeoman", {
    name: "Yeoman",
    image: "human/units/elven_archer.png",
    icon: "icon-ranger",
    animation: "animations-ranger",
    type: "land",
    hitPoints: 50,
    armor: 0,
    basicDamage: 3,
    piercingDamage: 8,
    maxAttackRange: 4,
    supply: 0,
    demand: 1,
    canAttack: true,
    canTargetLand: true,
    canTargetSea: true,
    canTargetAir: true,
    detectCloak: false,
    tileSize: [1, 1],
    costs: ["time", "70", "gold", "500", "wood", "50"],
    sounds: {}
  });
  patchUnit(units, "unit-nomad", {
    name: "Nomad",
    image: "orc/units/troll_axethrower.png",
    icon: "icon-berserker",
    animation: "animations-berserker",
    type: "land",
    hitPoints: 50,
    armor: 0,
    basicDamage: 3,
    piercingDamage: 8,
    maxAttackRange: 4,
    supply: 0,
    demand: 1,
    canAttack: true,
    canTargetLand: true,
    canTargetSea: true,
    canTargetAir: true,
    detectCloak: false,
    tileSize: [1, 1],
    costs: ["time", "70", "gold", "500", "wood", "50"],
    sounds: {}
  });
  patchUnit(units, "unit-caanoo-wiseman", {
    name: "Wiseman",
    image: "human/units/mage.png",
    icon: "icon-mage",
    animation: "animations-mage",
    type: "land",
    hitPoints: 90,
    armor: 0,
    basicDamage: 0,
    piercingDamage: 12,
    maxAttackRange: 4,
    supply: 0,
    demand: 1,
    canAttack: true,
    canTargetLand: true,
    canTargetSea: true,
    canTargetAir: true,
    detectCloak: false,
    tileSize: [1, 1],
    costs: ["time", "120", "gold", "800", "wood", "0"],
    sounds: {}
  });
  patchUnit(units, "unit-caanoo-wiseskeleton", {
    name: "Wise Skeleton",
    image: "orc/units/death_knight.png",
    icon: "icon-death-knight",
    animation: "animations-death-knight",
    type: "land",
    hitPoints: 90,
    armor: 0,
    basicDamage: 4,
    piercingDamage: 10,
    maxAttackRange: 1,
    supply: 0,
    demand: 1,
    canAttack: true,
    canTargetLand: true,
    canTargetSea: false,
    canTargetAir: false,
    detectCloak: false,
    tileSize: [1, 1],
    costs: ["time", "120", "gold", "800", "wood", "0"],
    sounds: {}
  });
}

function patchUnit(units: WargusUnit[], unitId: string, patch: Omit<WargusUnit, "id" | "source">): void {
  const unit = units.find((candidate) => candidate.id === unitId);
  if (!unit) {
    units.push({ id: unitId, source: "browser-normalizer", ...patch });
    return;
  }
  if (unit.source === "browser-normalizer") {
    Object.assign(unit, patch);
  }
}
