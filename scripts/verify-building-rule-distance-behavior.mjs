import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexerSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const readmeSource = readFileSync("README.md", "utf8");

const rules = (manifest.units ?? []).flatMap((unit) => (unit.buildingRules ?? []).map((rule) => ({ unitId: unit.id, ...rule })));
const distanceRules = rules.filter((rule) => rule.kind === "distance");
const nearRules = distanceRules.filter((rule) => rule.distanceType === "<");
const exactRules = distanceRules.filter((rule) => rule.distanceType === "=");
const farRules = distanceRules.filter((rule) => rule.distanceType === ">");
const ontopRules = rules.filter((rule) => rule.kind === "ontop");
const errors = [];

if (distanceRules.length === 0) {
  errors.push("Wargus manifest has no BuildingRules distance entries.");
}
if (nearRules.length === 0) {
  errors.push("Wargus manifest has no BuildingRules '<' distance entries to guard.");
}
if (farRules.length === 0) {
  errors.push("Wargus manifest has no BuildingRules '>' distance entries to guard.");
}
if (ontopRules.length === 0) {
  errors.push("Wargus manifest has no BuildingRules ontop entries.");
}

const requiredIndexerFragments = [
  "function parseBuildingRules(body)",
  "kind: \"distance\"",
  "kind: \"ontop\"",
  "distanceType: match[2]"
];
for (const fragment of requiredIndexerFragments) {
  if (!indexerSource.includes(fragment)) {
    errors.push(`Indexer missing BuildingRules fragment: ${fragment}`);
  }
}

const requiredRuntimeFragments = [
  "function satisfiesBuildingRules",
  "function satisfiesDistanceRule",
  "function satisfiesOntopRule",
  "if (rule.distanceType === \"<\" && gap < minDistance)",
  "if (rule.distanceType === \"=\" && gap === minDistance)",
  "if (rule.distanceType === \"<\" || rule.distanceType === \"=\")",
  "return false;",
  "if (rule.distanceType === \">\" && gap <= minDistance)"
];
for (const fragment of requiredRuntimeFragments) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Simulation missing BuildingRules distance fragment: ${fragment}`);
  }
}

if (ordersSource.includes("if (rule.distanceType === \"<\" && gap >= minDistance)")) {
  errors.push("Simulation still rejects a '<' BuildingRules placement on the first far reference unit instead of accepting any near match.");
}
if (ordersSource.includes("if (rule.distanceType === \"=\" && gap !== minDistance)")) {
  errors.push("Simulation still rejects an '=' BuildingRules placement on the first non-exact reference unit instead of accepting any exact match.");
}

if (!readmeSource.includes("BuildingRules") || !readmeSource.includes("source-declared spacing")) {
  errors.push("README does not document source BuildingRules placement behavior.");
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`BuildingRules distance verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`BuildingRules distance behavior verified (${distanceRules.length} distance rules: ${farRules.length} far, ${nearRules.length} near, ${exactRules.length} exact; ${ontopRules.length} ontop).`);
