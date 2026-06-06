import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const knownRuleIds = new Set([
  ...(manifest.units ?? []).map((unit) => unit.id),
  ...(manifest.upgrades ?? []).map((upgrade) => upgrade.id)
]);
const errors = [];
let references = 0;

for (const rule of manifest.allowRules ?? []) {
  references += 1;
  if (!knownRuleIds.has(rule.id)) {
    errors.push(`allow rule references unknown id ${rule.id}`);
  }
}

for (const rule of manifest.dependencies ?? []) {
  references += 1;
  if (!knownRuleIds.has(rule.id)) {
    errors.push(`dependency rule target references unknown id ${rule.id}`);
  }
  for (const alternative of rule.alternatives ?? []) {
    for (const id of alternative) {
      references += 1;
      if (!knownRuleIds.has(id)) {
        errors.push(`dependency rule ${rule.id} references unknown prerequisite ${id}`);
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source rule reference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Source rule references verified (${references} allow/dependency ids checked).`);
