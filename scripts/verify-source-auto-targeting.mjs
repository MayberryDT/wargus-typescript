import { readFileSync } from "node:fs";

const stratagusRoot = "/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/stratagus-src";
const unitFindSource = readFileSync(`${stratagusRoot}/src/unit/unit_find.cpp`, "utf8");
const unitSource = readFileSync(`${stratagusRoot}/src/unit/unit.cpp`, "utf8");
const settingsSource = readFileSync(`${stratagusRoot}/src/include/settings.h`, "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function expectIncludes(source, fragment, message) {
  expect(source.includes(fragment), message);
}

expectIncludes(settingsSource, "unsigned SimplifiedAutoTargeting:1", "Stratagus settings should still expose SimplifiedAutoTargeting.");
expectIncludes(unitFindSource, "GameSettings.SimplifiedAutoTargeting ? INT_MIN : INT_MAX", "Stratagus finder should still use opposite extrema for simplified targeting.");
expectIncludes(unitFindSource, "GameSettings.SimplifiedAutoTargeting ? TargetPriorityCalculate", "Stratagus simplified targeting should still call TargetPriorityCalculate.");
expectIncludes(unitFindSource, "GameSettings.SimplifiedAutoTargeting ? (cost > best_cost) : (cost < best_cost)", "Stratagus simplified targeting should still choose the highest priority.");
expectIncludes(unitSource, "return -TargetPriorityCalculate(unit, dest)", "Stratagus ThreatCalculate should still invert simplified priority into classic cost form.");
expectIncludes(unitSource, "AT_ATTACKED_BY_FACTOR", "Stratagus simplified priority should still include attacked-by weighting.");
expectIncludes(unitSource, "AT_THREAT_FACTOR", "Stratagus simplified priority should still include threat weighting.");
expectIncludes(unitSource, "AT_PRIORITY_OFFSET", "Stratagus simplified priority should still include source unit priority bits.");
expectIncludes(unitSource, "AT_DISTANCE_OFFSET", "Stratagus simplified priority should still include path-distance bits.");

const comparatorSource = ordersSource.match(/function compareAutoTargetCandidates[\s\S]*?function isInAutoAcquireAttackRange/)?.[0] ?? "";
expectIncludes(comparatorSource, "world.engineSettings.simplifiedAutoTargetingDefault === false", "Browser comparator should branch on SimplifiedAutoTargeting.");
expectIncludes(comparatorSource, "return distanceOrder", "Browser classic targeting should keep distance/cost ordering.");
expectIncludes(comparatorSource, "sourceSimplifiedAutoTargetPriority(attacker, right) - sourceSimplifiedAutoTargetPriority(attacker, left)", "Browser simplified targeting should sort highest source priority first.");
expectIncludes(comparatorSource, "function sourceSimplifiedAutoTargetPriority", "Browser should keep a separate source-shaped simplified priority helper.");
expectIncludes(comparatorSource, "0x40000000", "Browser simplified targeting should model AT_ATTACKED_BY_FACTOR.");
expectIncludes(comparatorSource, "0x20000000", "Browser simplified targeting should model AT_THREAT_FACTOR.");
expectIncludes(comparatorSource, "<< 15", "Browser simplified targeting should model AT_PRIORITY_OFFSET.");
expectIncludes(comparatorSource, "<< 7", "Browser simplified targeting should model AT_DISTANCE_OFFSET.");
expectIncludes(comparatorSource, "sourceUnitHasGoal(target, attacker.id)", "Browser simplified targeting should reward targets attacking the unit.");
expect(!comparatorSource.includes("return targetPriorityFor(attacker, left) - targetPriorityFor(attacker, right) || distanceOrder"), "Browser simplified targeting should not use the old lowest-cost priority order.");
expect(JSON.stringify(packageJson.scripts).includes("verify:source-auto-targeting"), "package.json verify scripts missing verify:source-auto-targeting.");

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source auto-targeting verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log("Source auto-targeting verified (classic distance ordering and simplified highest-priority ordering).");
