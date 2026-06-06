import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const forbidden = [
  /\bMath\.random\s*\(/,
  /\bcrypto\.getRandomValues\s*\(/,
  /\bDate\.now\s*\(/
];

const violations = [];

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

for (const file of sourceFiles("src")) {
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (forbidden.some((pattern) => pattern.test(line))) {
      violations.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  console.error(`Runtime determinism violations: ${violations.length}`);
  process.exit(1);
}

console.log("Runtime determinism verified (no random wall-clock APIs in src/**/*.ts).");
