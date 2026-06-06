import { existsSync, readFileSync } from "node:fs";

const source = readFileSync("src/wargus/manifest.ts", "utf8");
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const iconMap = JSON.parse(readFileSync("public/wargus/icon-map.json", "utf8"));
const soundIds = new Set((manifest.sounds ?? []).map((sound) => sound.id));

const checks = [];

for (const match of source.matchAll(/\bimage:\s*"([^"]+)"/g)) {
  checks.push({ kind: "normalizer image", id: match[1], ok: existsSync(`public/wargus/graphics/${match[1]}`) });
}

for (const match of source.matchAll(/\bicon:\s*"([^"]+)"/g)) {
  checks.push({ kind: "normalizer icon", id: match[1], ok: typeof iconMap[match[1]] === "number" });
}

for (const block of source.matchAll(/\bsounds:\s*\{([^}]*)\}/gms)) {
  for (const match of block[1].matchAll(/:\s*"([^"]+)"/g)) {
    checks.push({ kind: "normalizer sound", id: match[1], ok: soundIds.has(match[1]) });
  }
}

const missing = checks.filter((check) => !check.ok);

if (missing.length > 0) {
  for (const check of missing) {
    console.error(`${check.kind}: missing ${check.id}`);
  }
  console.error(`Runtime normalizer asset reference errors: ${missing.length}`);
  process.exit(1);
}

console.log(`Runtime normalizer asset references verified (${checks.length} references checked).`);
