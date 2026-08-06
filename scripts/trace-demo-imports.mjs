#!/usr/bin/env node
/**
 * Dumb relative import tracer for the fixed demo entry.
 *
 * Starts at src/main.ts, follows relative import/export paths only
 * (append .ts, try /index.ts). Bare package imports are ignored.
 * Dependency-free: regex over import/export ... from "..." forms.
 *
 * Usage:
 *   node scripts/trace-demo-imports.mjs
 *   node scripts/trace-demo-imports.mjs | tee .artifacts/demo-cut/demo-import-trace.txt
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const ENTRY = "src/main.ts";
const SRC_ROOT = join(ROOT, "src");
const ARTIFACT_DIR = join(ROOT, ".artifacts", "demo-cut");
const JSON_OUT = join(ARTIFACT_DIR, "demo-import-trace.json");

/**
 * Dumb specifier extraction:
 * - `from "..."` / `from '...'` (covers import/export … from)
 * - side-effect `import "..."` (line-start, no from clause)
 * Deliberately ignores dynamic import() — classify those manually.
 */
const FROM_CLAUSE_RE = /\bfrom\s+["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+["']([^"']+)["']/gm;

function listAllSrcTs(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) listAllSrcTs(full, acc);
    else if (ent.isFile() && ent.name.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

function toPosix(p) {
  return p.split(sep).join("/");
}

function resolveRelativeImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;

  const baseDir = dirname(fromFile);
  const raw = resolve(baseDir, specifier);

  // Already has a non-.ts extension (e.g. .css, .mjs) — only as-is
  if (/\.[a-zA-Z0-9]+$/.test(specifier) && !specifier.endsWith(".ts")) {
    if (existsSync(raw)) return raw;
    return null;
  }

  const candidates = [raw, `${raw}.ts`, join(raw, "index.ts")];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function extractSpecifiers(sourceText) {
  const specs = [];
  let m;
  FROM_CLAUSE_RE.lastIndex = 0;
  while ((m = FROM_CLAUSE_RE.exec(sourceText)) !== null) specs.push(m[1]);
  SIDE_EFFECT_IMPORT_RE.lastIndex = 0;
  while ((m = SIDE_EFFECT_IMPORT_RE.exec(sourceText)) !== null) specs.push(m[1]);
  return specs;
}

function main() {
  const entryAbs = join(ROOT, ENTRY);
  if (!existsSync(entryAbs)) {
    console.error(`Entry not found: ${ENTRY}`);
    process.exit(1);
  }

  const reachable = new Set();
  const queue = [entryAbs];
  const skippedBare = new Set();
  const skippedNonTs = new Set();
  const unresolved = [];

  while (queue.length > 0) {
    const file = queue.shift();
    if (reachable.has(file)) continue;
    if (!file.endsWith(".ts")) {
      skippedNonTs.add(toPosix(relative(ROOT, file)));
      continue;
    }
    reachable.add(file);

    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      unresolved.push({ from: toPosix(relative(ROOT, file)), error: String(err) });
      continue;
    }

    for (const spec of extractSpecifiers(text)) {
      if (!spec.startsWith(".")) {
        skippedBare.add(spec);
        continue;
      }
      const resolved = resolveRelativeImport(file, spec);
      if (!resolved) {
        unresolved.push({
          from: toPosix(relative(ROOT, file)),
          specifier: spec,
        });
        continue;
      }
      if (!resolved.endsWith(".ts")) {
        skippedNonTs.add(toPosix(relative(ROOT, resolved)));
        continue;
      }
      if (!reachable.has(resolved)) queue.push(resolved);
    }
  }

  const allSrc = listAllSrcTs(SRC_ROOT).map((p) => toPosix(relative(ROOT, p))).sort();
  const reachableRel = [...reachable]
    .map((p) => toPosix(relative(ROOT, p)))
    .filter((p) => p.startsWith("src/"))
    .sort();
  const reachableSet = new Set(reachableRel);
  const unreachable = allSrc.filter((p) => !reachableSet.has(p));

  const payload = {
    entry: ENTRY,
    files: reachableRel,
    count: reachableRel.length,
    allSrcCount: allSrc.length,
    unreachable,
    unreachableCount: unreachable.length,
    skippedBare: [...skippedBare].sort(),
    skippedNonTs: [...skippedNonTs].sort(),
    unresolved,
  };

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(JSON_OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`entry: ${ENTRY}`);
  console.log(`reachable src/**/*.ts: ${payload.count} / ${payload.allSrcCount}`);
  console.log(`json: ${toPosix(relative(ROOT, JSON_OUT))}`);
  console.log("");
  console.log("=== reachable ===");
  for (const f of reachableRel) console.log(f);
  console.log("");
  console.log("=== skipped bare packages ===");
  for (const s of payload.skippedBare) console.log(s);
  console.log("");
  console.log("=== skipped non-ts / outside ts graph ===");
  for (const s of payload.skippedNonTs) console.log(s);
  if (unresolved.length) {
    console.log("");
    console.log("=== unresolved relative imports ===");
    for (const u of unresolved) console.log(JSON.stringify(u));
  }
  console.log("");
  console.log("=== unreachable src/**/*.ts (deletion candidates — do not delete yet) ===");
  for (const f of unreachable) console.log(f);
  if (unreachable.length === 0) console.log("(none)");
  console.log("");
  console.log(`unreachable count: ${unreachable.length}`);
}

main();
