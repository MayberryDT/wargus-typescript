import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-plan014-ai-scout-"));
try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"), "--ignoreConfig",
    "src/simulation/orders.ts", "src/wargus/demoScenario.ts", "src/wargus/saveGame.ts",
    "--outDir", output, "--target", "ES2022", "--module", "CommonJS", "--moduleResolution", "Node",
    "--skipLibCheck", "--esModuleInterop", "--resolveJsonModule", "--verbatimModuleSyntax", "false",
    "--ignoreDeprecations", "6.0", "--noEmitOnError", "true"
  ], { cwd: root, encoding: "utf8" });
  if (compiler.status !== 0) throw new Error(`Fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);
  copyFileSync(resolve(root, "src/wargus/scoutProvenance.mjs"), join(output, "wargus/scoutProvenance.mjs"));
  const require = createRequire(import.meta.url);
  const manifest = JSON.parse(readFileSync(resolve(root, "public/wargus/manifest.json"), "utf8"));
  const map = manifest.maps.find((candidate) => candidate.path === "maps/ladder/Garden of war BNE.pud.smp.gz");
  if (!map?.setupJson) throw new Error("Garden of War setup is missing from the manifest.");
  const setup = JSON.parse(readFileSync(resolve(root, "public/wargus", map.setupJson), "utf8"));
  Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "?smoke=1&demoSeed=ai-staged-pressure" } });
  const demo = require(join(output, "wargus/demoScenario.js"));
  const worldModule = require(join(output, "simulation/world.js"));
  const orders = require(join(output, "simulation/orders.js"));
  const saveGame = require(join(output, "wargus/saveGame.js"));
  const demoSetup = demo.applyFixedBrowserDemoSetup(map, setup);
  const world = worldModule.createInitialWorld(map, manifest.units, demoSetup, manifest.upgrades, manifest.missiles, manifest.spells, manifest.allowRules, manifest.dependencies, manifest.buttons, manifest.engineSettings, manifest.aiDefinitions, manifest.unitDatabase, manifest.tilesets, manifest.animations);
  demo.applyFixedBrowserDemoWorldPresentation(map, world);
  const result = orders.runPlan014AiScoutEligibilityFixture(world);
  const depotResult = orders.runPlan014AiDepotMiningFixture(world);
  const saved = saveGame.exportSavedGame(result.saveWorld, { x: 0, y: 0, zoom: 1 });
  const loaded = saveGame.loadSavedGameJson(manifest, saved);
  const loadedState = loaded?.world.aiStates.find((candidate) => candidate.enabled);
  const loadedEvidence = loadedState ? orders.sourceAiRuntimeEvidence(loaded.world, loadedState.player, loadedState) : null;
  const depotSaved = saveGame.exportSavedGame(depotResult.saveWorld, { x: 0, y: 0, zoom: 1 });
  const depotLoaded = saveGame.loadSavedGameJson(manifest, depotSaved);
  const depotLoadedScout = depotLoaded?.world.units.find((candidate) => candidate.id === depotResult.scoutId);
  const failures = [];
  if (!result?.ok) failures.push(`fixture result: ${JSON.stringify(result)}`);
  if (JSON.stringify(result?.selectedWorkerIds) !== JSON.stringify(["__plan014-p08-miner-00"]) || result?.miningWorkerIds?.length !== 5) failures.push(`six-miner fallback: ${JSON.stringify(result)}`);
  if (result?.forceSoldier?.orderKind !== null || JSON.stringify(result?.forceSoldier?.assignedUnitIds) !== JSON.stringify(["__plan014-p08-force-soldier"])) failures.push(`force preservation: ${JSON.stringify(result?.forceSoldier)}`);
  if (result?.scoutEvidence?.length !== 1 || !(result?.nextScoutTick > result?.tick)) failures.push(`provenance/throttle: ${JSON.stringify(result)}`);
  if (result?.provenanceExact !== true) failures.push(`exact owner-buffer provenance: ${JSON.stringify(result?.scoutEvidence)}`);
  if (!loadedEvidence || loadedEvidence.exploration.scoutDestinations.length !== 1 || loadedEvidence.exploration.nextScoutTick !== result.nextScoutTick || loadedEvidence.exploration.scoutDestinations[0]?.selectedFromOwnerUnexploredAtAssignment !== true) failures.push(`bounded scout save/load: ${JSON.stringify(loadedEvidence?.exploration)}`);
  if (result?.noDuplicate?.scoutCount !== 1 || result?.priority?.militaryScoutId !== "__plan014-idle-military" || result?.priority?.idleWorkerScoutId !== "__plan014-p08-miner-00" || result?.priority?.flyerPriority !== true || result?.completion?.clearedOrder !== true || result?.completion?.economyOrderKind !== "harvest" || result?.human?.exploreAccepted !== false || result?.human?.orderKind !== null) failures.push(`priority/completion/human contract: ${JSON.stringify(result)}`);
  if (!depotResult?.ok) failures.push(`depot-first fixture result: ${JSON.stringify(depotResult)}`);
  if (depotResult?.longHaul?.workerCount !== 5 || depotResult?.longHaul?.allPathing !== true || depotResult?.longHaul?.commuteFlagged !== true || depotResult?.longHaul?.cargoPreserved !== true) failures.push(`P29 long-haul/cargo contract: ${JSON.stringify(depotResult?.longHaul)}`);
  if (depotResult?.knowledge?.nearMineKnownBefore !== false || depotResult?.knowledge?.nearMineSelectedBeforeReveal !== false || depotResult?.knowledge?.nearMineKnownAfterReveal !== true) failures.push(`knowledge-respecting reveal: ${JSON.stringify(depotResult?.knowledge)}`);
  if (depotResult?.scout?.ownerUnexploredDepotRing !== true || depotResult?.scout?.provenanceExact !== true || depotResult?.scout?.count !== 1 || depotResult?.scout?.secondThinkCount !== 1) failures.push(`depot-ring scout: ${JSON.stringify(depotResult?.scout)}`);
  if (depotResult?.delivery?.creditedGold !== 100 || depotResult?.delivery?.resourcesHeld !== 0 || depotResult?.delivery?.targetId !== "__plan014-near-gold-mine" || depotResult?.delivery?.oldTargetId !== "__plan014-far-gold-mine") failures.push(`actual delivery retarget: ${JSON.stringify(depotResult?.delivery)}`);
  if (depotResult?.nonManager?.creditedGold !== 100 || depotResult?.nonManager?.targetId !== "__plan014-far-gold-mine") failures.push(`non-manager delivery unchanged: ${JSON.stringify(depotResult?.nonManager)}`);
  if (depotLoadedScout?.order?.kind !== "explore" || depotLoadedScout.order.assignmentPlayer !== depotResult.playerId || depotLoadedScout.order.ownerBufferValueAtAssignment !== 0 || depotLoadedScout.order.selectedFromOwnerUnexploredAtAssignment !== true) failures.push(`depot scout save/load determinism: ${JSON.stringify(depotLoadedScout?.order)}`);
  if (failures.length > 0) throw new Error(failures.join("\n"));
  console.log("Plan 014 ground-scout/depot mining verified (owner-ring discovery and depot-first post-delivery retarget preserve cargo and one-scout bounds).");
} finally {
  rmSync(output, { recursive: true, force: true });
}
