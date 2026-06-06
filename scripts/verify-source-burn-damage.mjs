import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const indexSource = readFileSync("scripts/index-wargus-data.mjs", "utf8");
const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const saveSource = readFileSync("src/wargus/saveGame.ts", "utf8");
const packageSource = readFileSync("package.json", "utf8");
const errors = [];

function walkFiles(root) {
  const entries = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      entries.push(...walkFiles(path));
    } else if (/\.(lua|sms)$/.test(entry) || entry === "For the Motherland") {
      entries.push(path);
    }
  }
  return entries;
}

const sourceFiles = walkFiles("/home/tyler/Documents/Codex/2026-04-24/files-mentioned-by-the-user-setup/wargus/scripts");
const sourceBurnDefinitions = sourceFiles.reduce((count, file) => count + (readFileSync(file, "utf8").match(/BurnPercent\s*=/g)?.length ?? 0), 0);
const burnUnits = (manifest.units ?? []).filter((unit) => (unit.burnPercent ?? 0) > 0 && (unit.burnDamageRate ?? 0) > 0);
if (sourceBurnDefinitions !== burnUnits.length) {
  errors.push(`Expected indexed BurnPercent unit count to match source definitions (${sourceBurnDefinitions}), found ${burnUnits.length}.`);
}

for (const fragment of [
  "const burnPercent = Number(body.match(/BurnPercent",
  "const burnDamageRate = Number(body.match(/BurnDamageRate",
  "burnPercent,",
  "burnDamageRate,"
]) {
  if (!indexSource.includes(fragment)) {
    errors.push(`Indexer missing source burn fragment: ${fragment}`);
  }
}

if (!worldSource.includes("burnPercent: 0") || !worldSource.includes("burnDamageRate: 0")) {
  errors.push("World fallback units should preserve Stratagus engine default burn values of 0.");
}

if (!packageSource.includes('"verify:source-burn-damage"') || !packageSource.includes("npm run verify:source-burn-damage")) {
  errors.push("package.json should expose verify:source-burn-damage and include it in the full verify chain.");
}

for (const fragment of [
  "burnPercent: number",
  "burnDamageRate: number",
  "burnAccumulator: number",
  "burnPercent: Math.max(0, unit.burnPercent ?? 0)",
  "burnDamageRate: Math.max(0, unit.burnDamageRate ?? 0)",
  "burnAccumulator: 0"
]) {
  if (!worldSource.includes(fragment)) {
    errors.push(`World creation missing source burn fragment: ${fragment}`);
  }
}

for (const fragment of [
  "stepBurnDamage(world, unit, tickSeconds)",
  "function stepBurnDamage(world: WorldState, unit: WorldUnit, tickSeconds: number): void",
  "const hpPercent = Math.floor((100 * unit.hitPoints) / unit.maxHitPoints)",
  "if (hpPercent > unit.burnPercent)",
  "unit.burnAccumulator += tickSeconds",
  "applyDamage(world, unit, unit.burnDamageRate)",
  "unit.burnPercent = Math.max(0, definition.burnPercent ?? 0)",
  "unit.burnDamageRate = Math.max(0, definition.burnDamageRate ?? 0)"
]) {
  if (!ordersSource.includes(fragment)) {
    errors.push(`Runtime missing source burn fragment: ${fragment}`);
  }
}

for (const fragment of [
  "unit.burnPercent = Math.max(0, definition.burnPercent ?? 0)",
  "unit.burnDamageRate = Math.max(0, definition.burnDamageRate ?? 0)",
  "unit.burnAccumulator = Math.max(0, finiteNumberOr(unit.burnAccumulator, 0))"
]) {
  if (!saveSource.includes(fragment)) {
    errors.push(`Save/load missing source burn fragment: ${fragment}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Source burn damage verification failed (${errors.length} errors).`);
  process.exit(1);
}

console.log(`Source burn damage verified (${burnUnits.length} explicit burnable unit definitions, ${manifest.units?.length ?? 0} unit defaults preserved).`);
