import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-performance-metrics-"));
try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"), "--ignoreConfig",
    "src/performance/runtimePerformance.ts", "src/performance/performanceProfiles.ts",
    "--outDir", output, "--target", "ES2022", "--module", "CommonJS",
    "--moduleResolution", "Node", "--skipLibCheck", "--esModuleInterop",
    "--resolveJsonModule", "--verbatimModuleSyntax", "false", "--ignoreDeprecations", "6.0", "--noEmitOnError", "true"
  ], { cwd: root, encoding: "utf8" });
  if (compiler.status !== 0) throw new Error(`Performance fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);
  const require = createRequire(import.meta.url);
  const metrics = require(join(output, "runtimePerformance.js"));
  const profiles = require(join(output, "performanceProfiles.js"));
  assert.deepEqual(metrics.summarizePerformanceSamples([]), { sampleCount: 0, meanMs: null, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null, effectiveFps: null, over16_7Ms: 0, over33_3Ms: 0, over50Ms: 0 });
  const singleton = metrics.summarizePerformanceSamples([12]);
  assert.deepEqual([singleton.p50Ms, singleton.p95Ms, singleton.p99Ms, singleton.maxMs], [12, 12, 12, 12]);
  const ordered = Array.from({ length: 100 }, (_, index) => index + 1);
  const orderedSummary = metrics.summarizePerformanceSamples(ordered);
  assert.equal(orderedSummary.p50Ms, 50); assert.equal(orderedSummary.p95Ms, 95); assert.equal(orderedSummary.p99Ms, 99);
  assert.deepEqual(metrics.summarizePerformanceSamples([...ordered].reverse()), orderedSummary);
  const thresholds = metrics.summarizePerformanceSamples([16.7, 16.7001, 33.3, 33.3001, 50, 50.0001]);
  assert.deepEqual([thresholds.over16_7Ms, thresholds.over33_3Ms, thresholds.over50Ms], [5, 3, 1]);
  const ring = new metrics.BoundedSampleBuffer(3);
  for (const value of [1, 2, 3, 4, 5]) ring.push(value);
  assert.deepEqual(ring.values(), [3, 4, 5]); ring.reset(); assert.deepEqual(ring.values(), []);
  const collector = new metrics.RuntimePerformanceCollector(3);
  assert.equal(collector.isCapturing(), false); collector.start("idle-25");
  const first = collector.beginInput(10); const second = collector.beginInput(12);
  collector.finishInput(first, 14); collector.finishInput(second, 18); collector.completeRenderPreparation(20);
  for (const value of [20, 40, 60, 80]) collector.recordFrame(value);
  collector.recordScheduler({ acceptedDeltaSeconds: 0.1, droppedDeltaSeconds: 0.2, processedSteps: 3, remainingBacklogSeconds: 0.25, turnMilliseconds: 7, maxStepMilliseconds: 3 });
  const captured = collector.snapshot();
  assert.equal(captured.profile, "idle-25"); assert.equal(captured.lifecycle, "capturing"); assert.deepEqual(captured.frameSamples, [40, 60, 80]);
  assert.deepEqual(captured.inputToCommandSamples, [4, 6]); assert.deepEqual(captured.inputToNextRenderSamples, [10, 8]);
  assert.equal(captured.scheduler.droppedDeltaSeconds, 0.2); assert.equal(captured.scheduler.maxBacklogSeconds, 0.25); assert.equal(captured.scheduler.turn.sampleCount, 1);
  const pending = new metrics.RuntimePerformanceCollector(2); pending.start("command-18");
  const missing = pending.beginInput(100); pending.finishInput(missing, 105);
  assert.equal(pending.snapshot().inputToNextRender.sampleCount, 0); pending.completeRenderPreparation(130); assert.equal(pending.snapshot().inputToNextRender.p50Ms, 30);
  for (let index = 0; index < 5; index += 1) { const token = pending.beginInput(200 + index); pending.finishInput(token, 201 + index); }
  pending.completeRenderPreparation(210); assert.equal(pending.snapshot().inputToNextRender.sampleCount, 2);
  pending.stop(); assert.equal(pending.isCapturing(), false); pending.reset(); assert.equal(pending.snapshot().frame.sampleCount, 0); assert.equal(pending.snapshot().profile, null);
  const firstProfiles = profiles.performanceProfileDefinitions();
  assert.deepEqual(firstProfiles, profiles.performanceProfileDefinitions());
  assert.deepEqual(firstProfiles.map((profile) => profile.id), ["idle-25", "army-100", "army-200", "command-18", "combat-100"]);
  assert.equal(profiles.getPerformanceProfile("command-18").mobileUnitCount, 18);
  assert.throws(() => profiles.getPerformanceProfile("unknown"), /Unknown performance profile/);
  console.log("Performance metrics verified (percentiles, thresholds, ring wrap, input pairing, scheduler summaries, deterministic profiles).");
} finally { rmSync(output, { recursive: true, force: true }); }
