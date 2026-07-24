import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-plan014-ai-manager-"));

try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"),
    "--ignoreConfig",
    "src/simulation/orders.ts",
    "src/wargus/demoScenario.ts",
    "--outDir", output,
    "--target", "ES2022",
    "--module", "CommonJS",
    "--moduleResolution", "Node",
    "--skipLibCheck",
    "--esModuleInterop",
    "--resolveJsonModule",
    "--verbatimModuleSyntax", "false",
    "--ignoreDeprecations", "6.0",
    "--noEmitOnError", "true"
  ], { cwd: root, encoding: "utf8" });
  if (compiler.status !== 0) {
    throw new Error(`Fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);
  }

  const require = createRequire(import.meta.url);
  const manifest = JSON.parse(readFileSync(resolve(root, "public/wargus/manifest.json"), "utf8"));
  const map = manifest.maps.find((candidate) => candidate.path === "maps/ladder/Garden of war BNE.pud.smp.gz");
  if (!map?.setupJson) throw new Error("Garden of War setup is missing from the manifest.");
  const setup = JSON.parse(readFileSync(resolve(root, "public/wargus", map.setupJson), "utf8"));
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "?smoke=1&demoSeed=ai-staged-pressure" } });

  const demo = require(join(output, "wargus/demoScenario.js"));
  const worldModule = require(join(output, "simulation/world.js"));
  const orders = require(join(output, "simulation/orders.js"));
  const demoSetup = demo.applyFixedBrowserDemoSetup(map, setup);
  const world = worldModule.createInitialWorld(
    map,
    manifest.units,
    demoSetup,
    manifest.upgrades,
    manifest.missiles,
    manifest.spells,
    manifest.allowRules,
    manifest.dependencies,
    manifest.buttons,
    manifest.engineSettings,
    manifest.aiDefinitions,
    manifest.unitDatabase,
    manifest.tilesets,
    manifest.animations
  );
  demo.applyFixedBrowserDemoWorldPresentation(map, world);

  const result = orders.runPlan014AiConstructionManagerFixture(world);
  const failures = [];
  if (!result?.ok) failures.push(`fixture result: ${JSON.stringify(result)}`);
  if (result?.oneHall?.openingWorkerCount !== 1
    || result?.oneHall?.beforeOrder !== "harvest:to-resource"
    || result?.oneHall?.afterOrder !== "build:to-site"
    || result?.oneHall?.pendingTownCenters !== 1
    || result?.oneHall?.afterRepeatPendingTownCenters !== 1
    || result?.oneHall?.resourcesChangedBeforeArrival !== false) {
    failures.push(`one-Hall live manager path: ${JSON.stringify(result?.oneHall)}`);
  }
  if (result?.secondBarracks?.completedBefore !== 1
    || result?.secondBarracks?.travellingWorkerRetasked !== true
    || result?.secondBarracks?.completedAndPendingAfter !== 2
    || result?.secondBarracks?.afterRepeatCompletedAndPending !== 2) {
    failures.push(`second-Barracks live manager path: ${JSON.stringify(result?.secondBarracks)}`);
  }
  if (result?.competingCosts?.individuallyAffordable !== true
    || result?.competingCosts?.pendingTypes?.length !== 1
    || result?.competingCosts?.pendingTypes?.[0] !== result?.competingCosts?.townCenterTypeId
    || result?.competingCosts?.resourcesChangedBeforeArrival !== false
    || result?.competingCosts?.foundationReached !== true
    || result?.competingCosts?.foundationCancelled !== false
    || result?.competingCosts?.arrivalDeductionMatches !== true) {
    failures.push(`competing unpaid costs: ${JSON.stringify(result?.competingCosts)}`);
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  console.log(`Plan 014 live AI construction manager verified (one Hall, travelling-worker second Barracks, competing unpaid costs; ${result.competingCosts.arrivalTicks} arrival ticks).`);
} finally {
  rmSync(output, { recursive: true, force: true });
}
