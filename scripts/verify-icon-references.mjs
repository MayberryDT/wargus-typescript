import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const iconMap = JSON.parse(readFileSync("public/wargus/icon-map.json", "utf8"));
const checks = [];
const nonIconCommandLiterals = new Set(["toggle-icon-shift", "toggle-grayscale-icons"]);

function add(kind, owner, icon) {
  if (icon) {
    checks.push({ kind, owner, icon });
  }
}

for (const unit of manifest.units ?? []) {
  add("unit icon", unit.id, unit.icon);
}

for (const upgrade of manifest.upgrades ?? []) {
  add("upgrade icon", upgrade.id, upgrade.icon);
}

for (const button of manifest.buttons ?? []) {
  add("button icon", button.id, button.icon);
}

for (const spell of manifest.spells ?? []) {
  add("spell icon", spell.id, spell.icon);
}

for (const file of ["src/view/renderHud.ts", "src/wargus/manifest.ts"]) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/"([^"]*icon-[^"]*)"/g)) {
    if (nonIconCommandLiterals.has(match[1])) {
      continue;
    }
    add("runtime icon literal", file, match[1]);
  }
}

const missing = checks.filter((check) => typeof iconMap[check.icon] !== "number");

if (missing.length > 0) {
  for (const check of missing) {
    console.error(`${check.kind} ${check.owner}: missing ${check.icon}`);
  }
  console.error(`Icon reference errors: ${missing.length}`);
  process.exit(1);
}

console.log(`Icon references verified (${checks.length} references checked).`);
