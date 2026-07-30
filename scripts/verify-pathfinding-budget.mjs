import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "wargus-pathfinding-budget-"));
try {
  const compiler = spawnSync(process.execPath, [
    resolve(root, "node_modules/typescript/bin/tsc"), "--ignoreConfig",
    "src/simulation/pathfinding.ts", "--outDir", output, "--target", "ES2022",
    "--module", "CommonJS", "--moduleResolution", "Node", "--skipLibCheck",
    "--esModuleInterop", "--verbatimModuleSyntax", "false", "--ignoreDeprecations", "6.0", "--noEmitOnError", "true"
  ], { cwd: root, encoding: "utf8" });
  assert.equal(compiler.status, 0, `Pathfinding fixture compile failed:\n${compiler.stdout}${compiler.stderr}`);
  const pathfinding = createRequire(import.meta.url)(join(output, "simulation/pathfinding.js"));
  const unit = { id: "budget-unit", x: 48, y: 48, tileWidth: 1, tileHeight: 1, kind: "land", hitPoints: 30, nonSolid: false, speed: 10, order: null, hiddenInConstructionId: null };
  const world = { map: { width: 64, height: 64 }, tileSize: 32, tiles: Array(64 * 64).fill(0), tilesetTerrain: null, units: [unit] };
  const targetX = 62 * 32 + 16;
  const targetY = 62 * 32 + 16;
  const expected = pathfinding.findPathResult(world, unit, targetX, targetY);
  const search = pathfinding.createResumablePathSearch(world, unit, targetX, targetY);
  const first = pathfinding.advanceResumablePathSearch(search, 16);
  assert.equal(first.done, false, "A 16-expansion quantum must yield before a long search completes.");
  assert.ok(first.expansions <= 16, "One quantum must never exceed its expansion budget.");
  let current = first;
  let totalExpansions = first.expansions;
  while (!current.done) {
    current = pathfinding.advanceResumablePathSearch(search, 16);
    assert.ok(current.expansions <= 16);
    totalExpansions += current.expansions;
    assert.ok(totalExpansions <= 64 * 64 * 4, "Resumable search must converge.");
  }
  assert.deepEqual(current.result, expected, "Resumed route and status must match the synchronous oracle exactly.");
  console.log(`Pathfinding budget verified (${totalExpansions} expansion attempts).`);
} finally {
  rmSync(output, { recursive: true, force: true });
}
