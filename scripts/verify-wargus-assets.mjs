import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const SELF_TEST_FLAG = "--self-test-render-source-gate";

if (process.argv.includes(SELF_TEST_FLAG)) {
  runRenderSourceGateSelfTests();
  process.exit(0);
}

if (process.env.WARGUS_RENDER_SOURCE_PATH !== undefined) {
  throw new Error("WARGUS_RENDER_SOURCE_PATH is not supported; the production gate is pinned to src/view/renderWorld.ts.");
}

if (!existsSync("public/wargus/manifest.json")) {
  console.error("Missing Wargus asset pack: public/wargus/manifest.json was not found.");
  console.error("Production builds require the generated public/wargus asset pack so the browser game does not boot to a black screen.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));

const checks = [];

function addCheck(kind, owner, path) {
  if (path) {
    checks.push({ kind, owner, path });
  }
}

for (const unit of manifest.units) {
  if (unit.image) {
    addCheck("unit image", unit.id, `public/wargus/graphics/${unit.image}`);
  }
  for (const [tileset, image] of Object.entries(unit.seasonalImages ?? {})) {
    addCheck("unit seasonal image", `${unit.id}:${tileset}`, `public/wargus/graphics/${image}`);
  }
}

for (const missile of manifest.missiles) {
  if (missile.file) {
    addCheck("missile image", missile.id, `public/wargus/graphics/${missile.file}`);
  }
}

for (const construction of manifest.constructions ?? []) {
  if (construction.image) {
    addCheck("construction image", construction.id, `public/wargus/graphics/${construction.image}`);
  }
  for (const [tileset, image] of Object.entries(construction.seasonalImages ?? {})) {
    addCheck("construction seasonal image", `${construction.id}:${tileset}`, `public/wargus/graphics/${image}`);
  }
}

for (const sound of manifest.sounds) {
  for (const file of sound.files ?? []) {
    addCheck("sound file", sound.id, `public/wargus/sounds/${file}`);
  }
}

for (const file of manifest.assetRoots?.music ?? []) {
  addCheck("music file", file, `public/wargus/${file}`);
}

for (const style of Object.values(manifest.engineSettings?.buttonStyles ?? {})) {
  addCheck("button style default sheet", style.id, style.defaultFile ? `public/wargus/graphics/${style.defaultFile}` : null);
  addCheck("button style clicked sheet", style.id, style.clickedFile ? `public/wargus/graphics/${style.clickedFile}` : null);
}

for (const font of manifest.fonts ?? []) {
  addCheck("font sheet", font.id, `public/wargus/graphics/${font.file}`);
}

for (const tileset of ["summer", "winter", "wasteland", "swamp"]) {
  addCheck("tileset icons", tileset, `public/wargus/graphics/tilesets/${tileset}/icons.png`);
}

const missing = checks.filter((check) => !existsSync(check.path));
const errors = missing.map((check) => `${check.kind} ${check.owner}: missing ${check.path}`);

const worldSource = readFileSync("src/simulation/world.ts", "utf8");
const atlasSource = readFileSync("src/view/unitTextureAtlas.ts", "utf8");
const lazyAtlasSource = readFileSync("src/view/unitAtlasLazyLoad.ts", "utf8");
const ordersSource = readFileSync("src/simulation/orders.ts", "utf8");
const renderSourcePath = "src/view/renderWorld.ts";
const renderSource = readFileSync(renderSourcePath, "utf8");
for (const fragment of [
  "export function imageForTileset",
  "function sourceTilesetFamilyName",
  "replace(/^wargus\\//, \"\")",
  "image: imageForTileset(unit, tileset)",
  "textureDescriptorForUnitDefinition(unit, renderUnit, loadedWorld.map.setup?.tileset ?? null)",
  "textureDescriptorForConstruction(construction, loadedWorld.map.setup?.tileset ?? null)",
  "loadUnitTextureAtlasForDefinition(definition ?? unitDefinitionFromWorldUnit(unit), definitions, loadedWorld.map.setup?.tileset ?? null)",
  "unit.image = imageForTileset(definition, world.map.setup?.tileset ?? null)"
]) {
  const source = fragment.includes("textureDescriptor") ? atlasSource
    : fragment.includes("loadUnitTextureAtlasForDefinition") ? lazyAtlasSource
      : fragment.includes("unit.image =") ? ordersSource
        : worldSource;
  if (!source.includes(fragment)) {
    errors.push(`Seasonal image runtime support is missing fragment: ${fragment}`);
  }
}

for (const fragment of [
  "numDirections: Math.max(0, unit.numDirections",
  "spriteDirectionForFacing(unit.facing ?? 4, atlas.numDirections)",
  "if (numDirections <= 1)"
]) {
  const source = fragment.startsWith("numDirections:") ? atlasSource : renderSource;
  if (!source.includes(fragment)) {
    errors.push(`Unit NumDirections runtime support is missing fragment: ${fragment}`);
  }
}

errors.push(...renderSourceGateErrors(renderSource, renderSourcePath));

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  console.error(`Wargus asset reference errors: ${errors.length}`);
  process.exit(1);
}

console.log(`Wargus browser assets verified (${checks.length} files checked).`);

function renderSourceGateErrors(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const parseDiagnostics = sourceFile.parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    return parseDiagnostics.map((diagnostic) => `Render source parse error: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
  }
  let preparedFrameCallCount = 0;
  const legacyCalls = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === "prepared"
      && isConstDeclaration(node)
      && isExactCall(node.initializer, "prepareWorldRenderSnapshot", ["world", "manifest", "viewport"])) {
      preparedFrameCallCount += 1;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "getAnimatedFrameNumber") {
      const argumentsText = node.arguments.map(canonicalExpression);
      if (sameArray(argumentsText, ["unit", "manifest", "world", "atlas.numDirections"])
        || sameArray(argumentsText, ["unit", "world", "atlas.numDirections"])) {
        legacyCalls.push(`getAnimatedFrameNumber(${argumentsText.join(", ")})`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const diagnostics = [];
  if (preparedFrameCallCount !== 2) {
    diagnostics.push(`Prepared render snapshot wiring must contain exactly two active/source-pane const declarations; found ${preparedFrameCallCount}.`);
  }
  for (const legacyCall of legacyCalls) diagnostics.push(`Removed immediate-render call is still present: ${legacyCall}`);
  return diagnostics;
}

function isConstDeclaration(node) {
  return ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0;
}

function isExactCall(node, name, argumentsText) {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === name
    && sameArray(node.arguments.map(canonicalExpression), argumentsText);
}

function canonicalExpression(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return `${canonicalExpression(node.expression)}.${node.name.text}`;
  return node.getText().replace(/\s+/g, "");
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function runRenderSourceGateSelfTests() {
  const commentedSource = `// const prepared = prepareWorldRenderSnapshot(world, manifest, viewport);\n/* const prepared = prepareWorldRenderSnapshot(world, manifest, viewport); */`;
  const commented = renderSourceGateErrors(commentedSource, "commented-prepared.ts");
  if (!commented.some((error) => error.includes("found 0"))) throw new Error("Commented prepared-call fixture did not fail structurally: " + commented.join(" | "));
  const multilineLegacySource = `const prepared = prepareWorldRenderSnapshot(world, manifest, viewport);\n{\n const prepared = prepareWorldRenderSnapshot(world, manifest, viewport);\n getAnimatedFrameNumber(\n  unit,\n  manifest,\n  world,\n  atlas.numDirections\n );\n}`;
  const multilineLegacy = renderSourceGateErrors(multilineLegacySource, "multiline-legacy.ts");
  if (!multilineLegacy.some((error) => error.includes("Removed immediate-render call"))) throw new Error("Multiline legacy-call fixture did not fail structurally: " + multilineLegacy.join(" | "));
  const validSource = `const prepared = prepareWorldRenderSnapshot(\n world,\n manifest,\n viewport\n);\n{ const prepared = prepareWorldRenderSnapshot(world, manifest, viewport); }`;
  const valid = renderSourceGateErrors(validSource, "valid-prepared.ts");
  if (valid.length > 0) throw new Error("Valid prepared-call fixture failed structurally: " + valid.join(" | "));
  console.log("Render source structural gate self-tests passed (commented prepared calls rejected, multiline legacy call rejected, valid multiline prepared calls accepted)." );
}
