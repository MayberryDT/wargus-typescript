import { readFileSync, existsSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const verify = pkg.scripts.verify;
const demo = pkg.scripts["verify:demo"];
if (!demo) throw new Error("package.json missing scripts.verify:demo");
if (verify !== "npm run verify:demo" && verify !== demo) {
  throw new Error(`scripts.verify must be demo gate; got: ${verify.slice(0, 120)}...`);
}
const required = [
  "verify:wargus-assets",
  "verify:playtest-telemetry",
  "verify:runtime-determinism",
  "verify:browser-runtime-smoke",
  "verify:browser-playable-session",
  "verify:browser-demo-session",
  "verify:browser-command-card-session",
  "verify:browser-combat-session",
  "verify:fixed-demo-polish",
  "verify:fixed-demo-random-ai",
  "verify:fixed-demo-unit-portrait",
  "tsc --noEmit"
];
for (const step of required) {
  if (!demo.includes(step)) throw new Error(`verify:demo missing step: ${step}`);
}
const forbidden = ["verify:crestfall", "verify:alterac-traitors", "verify:source-pathfinding"];
for (const step of forbidden) {
  if (demo.includes(step)) throw new Error(`verify:demo must not include full-port step: ${step}`);
}
for (const path of [
  "docs/ARCHIVE.md",
  "docs/DEMO-PRODUCT.md",
  "docs/DEMO-MAP.md",
  "archive/README.md",
  "archive/MANIFEST.md"
]) {
  if (!existsSync(path)) throw new Error(`missing ${path}`);
}
const agents = readFileSync("AGENTS.md", "utf8");
if (!agents.includes("docs/ARCHIVE.md") || !agents.includes("DEMO-PRODUCT")) {
  throw new Error("AGENTS.md must reference archive and demo product docs");
}
console.log("Demo gate contract OK");
