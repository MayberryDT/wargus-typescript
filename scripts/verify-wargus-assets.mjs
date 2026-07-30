import assert from "node:assert/strict";
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

  const diagnostics = [];
  const intendedPaths = [
    { name: "renderWorld", placement: "direct" },
    { name: "renderSourceViewportPaneWorlds", placement: "source-pane-loop" }
  ];
  for (const intended of intendedPaths) {
    const declaration = sourceFile.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === intended.name);
    if (!declaration?.body) {
      diagnostics.push(`Prepared render snapshot wiring is missing intended function ${intended.name}.`);
      continue;
    }
    const preparedDeclarations = matchingPreparedDeclarations(declaration.body);
    if (preparedDeclarations.length !== 1) {
      diagnostics.push(`${intended.name} must contain exactly one prepared snapshot declaration; found ${preparedDeclarations.length}.`);
      continue;
    }
    if (!preparedPlacementMatches(preparedDeclarations[0], declaration, intended.placement)) {
      diagnostics.push(`${intended.name} prepared snapshot declaration is outside its intended render path.`);
    }
    const drawCalls = preparedDrawCallUsage(preparedDeclarations[0], intended.name);
    if (!["drawUnits", "drawCorpses.below40", "drawCorpses.atLeast40", "drawProjectiles.below40", "drawProjectiles.atLeast40", "drawSpellEffects.below40", "drawSpellEffects.atLeast40"].every((call) => drawCalls.has(call))) {
      diagnostics.push(`${intended.name} must feed the exact prepared snapshot into every intended draw call.`);
    }
  }

  const allPreparedDeclarations = matchingPreparedDeclarations(sourceFile);
  if (allPreparedDeclarations.length !== 2) {
    diagnostics.push(`Prepared render snapshot wiring must contain exactly two intended declarations; found ${allPreparedDeclarations.length}.`);
  }

  const visitLegacy = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "getAnimatedFrameNumber") {
      const argumentsText = node.arguments.map(canonicalExpression);
      if (sameArray(argumentsText, ["unit", "manifest", "world", "atlas.numDirections"])
        || sameArray(argumentsText, ["unit", "world", "atlas.numDirections"])) {
        diagnostics.push(`Removed immediate-render call is still present: getAnimatedFrameNumber(${argumentsText.join(", ")})`);
      }
    }
    ts.forEachChild(node, visitLegacy);
  };
  visitLegacy(sourceFile);
  return diagnostics;
}

function matchingPreparedDeclarations(root) {
  const matches = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === "prepared"
      && isConstDeclaration(node)
      && isExactCall(node.initializer, "prepareWorldRenderSnapshot", ["world", "manifest", "viewport"])) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}

function preparedPlacementMatches(declaration, functionDeclaration, placement) {
  const statement = declaration.parent?.parent;
  if (!ts.isVariableStatement(statement)) return false;
  if (placement === "direct") return statement.parent === functionDeclaration.body;
  return ts.isBlock(statement.parent) && ts.isForStatement(statement.parent.parent);
}

function preparedDrawCallUsage(declaration, functionName) {
  const drawCalls = new Set();
  const declarationStatement = declaration.parent?.parent;
  const declarationBlock = ts.isVariableStatement(declarationStatement) && ts.isBlock(declarationStatement.parent) ? declarationStatement.parent : null;
  if (!declarationBlock) return drawCalls;
  const activePath = functionName === "renderWorld";
  const expectedLayer = activePath ? "unitLayer" : "renderer.unitLayer";
  const expectedControlGroups = activePath ? "controlGroups" : "args.controlGroups??{}";
  const expectedOrdersVisible = activePath ? "sourceShowOrdersVisible" : "args.sourceShowOrdersVisible===true";
  const visit = (node) => {
    if (isInDirectExpressionStatement(node, declarationBlock)
      && ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const args = node.arguments.map(canonicalExpression);
      if (name === "drawUnits" && args.length === 10
        && args[0] === expectedLayer && args[1] === "world" && args[2] === "manifest"
        && args[3] === "selectedUnitIds" && args[4] === expectedControlGroups
        && args[5] === expectedOrdersVisible && args[6] === "unitAtlases"
        && args[7] === "missileAtlases" && args[8] === "statusDecorationAtlas" && args[9] === "prepared") {
        drawCalls.add("drawUnits");
      }
      for (const stratum of ["below40", "atLeast40"]) {
        if (name === "drawCorpses" && sameArray(args, [expectedLayer, "world", "unitAtlases", `prepared.corpses.${stratum}`, "prepared.animationById"])) {
          drawCalls.add(`drawCorpses.${stratum}`);
        }
        if (name === "drawProjectiles" && sameArray(args, [expectedLayer, "world", "missileAtlases", `prepared.projectiles.${stratum}`])) {
          drawCalls.add(`drawProjectiles.${stratum}`);
        }
        if (name === "drawSpellEffects" && sameArray(args, [expectedLayer, "world", "missileAtlases", `prepared.spellEffects.${stratum}`])) {
          drawCalls.add(`drawSpellEffects.${stratum}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const statement of declarationBlock.statements) {
    if (statement.pos > declarationStatement.pos) visit(statement);
  }
  return drawCalls;
}

function isInDirectExpressionStatement(node, block) {
  let current = node;
  while (current && !ts.isExpressionStatement(current) && current !== block) current = current.parent;
  return ts.isExpressionStatement(current) && current.parent === block;
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
  const validSource = `
function renderWorld() {
  const prepared = prepareWorldRenderSnapshot(world, manifest, viewport);
  drawCorpses(unitLayer, world, unitAtlases, prepared.corpses.below40, prepared.animationById);
  drawProjectiles(unitLayer, world, missileAtlases, prepared.projectiles.below40);
  drawSpellEffects(unitLayer, world, missileAtlases, prepared.spellEffects.below40);
  drawUnits(unitLayer, world, manifest, selectedUnitIds, controlGroups, sourceShowOrdersVisible, unitAtlases, missileAtlases, statusDecorationAtlas, prepared);
  drawCorpses(unitLayer, world, unitAtlases, prepared.corpses.atLeast40, prepared.animationById);
  drawProjectiles(unitLayer, world, missileAtlases, prepared.projectiles.atLeast40);
  drawSpellEffects(unitLayer, world, missileAtlases, prepared.spellEffects.atLeast40);
}
function renderSourceViewportPaneWorlds() {
  for (;;) {
    const prepared = prepareWorldRenderSnapshot(world, manifest, viewport);
    drawCorpses(renderer.unitLayer, world, unitAtlases, prepared.corpses.below40, prepared.animationById);
    drawProjectiles(renderer.unitLayer, world, missileAtlases, prepared.projectiles.below40);
    drawSpellEffects(renderer.unitLayer, world, missileAtlases, prepared.spellEffects.below40);
    drawUnits(renderer.unitLayer, world, manifest, selectedUnitIds, args.controlGroups ?? {}, args.sourceShowOrdersVisible === true, unitAtlases, missileAtlases, statusDecorationAtlas, prepared);
    drawCorpses(renderer.unitLayer, world, unitAtlases, prepared.corpses.atLeast40, prepared.animationById);
    drawProjectiles(renderer.unitLayer, world, missileAtlases, prepared.projectiles.atLeast40);
    drawSpellEffects(renderer.unitLayer, world, missileAtlases, prepared.spellEffects.atLeast40);
    break;
  }
}`;
  const valid = renderSourceGateErrors(validSource, "valid-prepared.ts");
  assert.equal(valid.length, 0, `Valid intended-path fixture failed structurally: ${valid.join(" | ")}`);

  const commented = renderSourceGateErrors(`/* ${validSource} */`, "commented-prepared.ts");
  assert.ok(commented.some((error) => error.includes("missing intended function")), `Commented fixture did not fail structurally: ${commented.join(" | ")}`);

  const helperOnly = renderSourceGateErrors(`function helperOne(){ const prepared = prepareWorldRenderSnapshot(world, manifest, viewport); } function helperTwo(){ const prepared = prepareWorldRenderSnapshot(world, manifest, viewport); }`, "helper-only.ts");
  assert.ok(helperOnly.some((error) => error.includes("missing intended function")), `Helper-only declarations satisfied the intended-path gate: ${helperOnly.join(" | ")}`);

  const misplaced = renderSourceGateErrors(validSource.replace("const prepared = prepareWorldRenderSnapshot(world, manifest, viewport);", "if (enabled) { const prepared = prepareWorldRenderSnapshot(world, manifest, viewport); void prepared.corpses; void prepared.projectiles; void prepared.spellEffects; void prepared.animationById; drawUnits(prepared); }"), "misplaced-prepared.ts");
  assert.ok(misplaced.some((error) => error.includes("outside its intended render path")), `Misplaced active declaration satisfied the gate: ${misplaced.join(" | ")}`);

  const unused = renderSourceGateErrors(validSource.replace("drawUnits(unitLayer, world, manifest, selectedUnitIds, controlGroups, sourceShowOrdersVisible, unitAtlases, missileAtlases, statusDecorationAtlas, prepared);", "drawUnits(world);"), "unused-prepared.ts");
  assert.ok(unused.some((error) => error.includes("must feed the exact prepared snapshot")), `Unused active declaration satisfied the gate: ${unused.join(" | ")}`);

  const missingUpperStratum = renderSourceGateErrors(validSource.replace("drawCorpses(unitLayer, world, unitAtlases, prepared.corpses.atLeast40, prepared.animationById);", "drawCorpses(unitLayer, world, unitAtlases, prepared.corpses.below40, prepared.animationById);"), "missing-upper-stratum.ts");
  assert.ok(missingUpperStratum.some((error) => error.includes("must feed the exact prepared snapshot")), `Missing upper-stratum draw call satisfied the gate: ${missingUpperStratum.join(" | ")}`);

  const wrongAnimationPosition = renderSourceGateErrors(validSource.replace("drawCorpses(unitLayer, world, unitAtlases, prepared.corpses.below40, prepared.animationById);", "drawCorpses(unitLayer, prepared.animationById, world, unitAtlases, prepared.corpses.below40);"), "wrong-animation-position.ts");
  assert.ok(wrongAnimationPosition.some((error) => error.includes("must feed the exact prepared snapshot")), `Wrongly positioned animation index satisfied the gate: ${wrongAnimationPosition.join(" | ")}`);

  const wrongControlInputs = renderSourceGateErrors(validSource.replace("drawUnits(unitLayer, world, manifest, selectedUnitIds, controlGroups, sourceShowOrdersVisible, unitAtlases, missileAtlases, statusDecorationAtlas, prepared);", "drawUnits(unitLayer, world, manifest, selectedUnitIds, args.controlGroups ?? {}, args.sourceShowOrdersVisible === true, unitAtlases, missileAtlases, statusDecorationAtlas, prepared);"), "wrong-control-inputs.ts");
  assert.ok(wrongControlInputs.some((error) => error.includes("must feed the exact prepared snapshot")), `Wrong path-specific drawUnits inputs satisfied the gate: ${wrongControlInputs.join(" | ")}`);

  const noOpReads = renderSourceGateErrors(validSource
    .replace("drawCorpses(unitLayer, world, unitAtlases, prepared.corpses.below40, prepared.animationById);", "void prepared.corpses; void prepared.animationById;")
    .replace("drawProjectiles(unitLayer, world, missileAtlases, prepared.projectiles.below40);", "void prepared.projectiles;")
    .replace("drawSpellEffects(unitLayer, world, missileAtlases, prepared.spellEffects.below40);", "void prepared.spellEffects;"), "no-op-reads.ts");
  assert.ok(noOpReads.some((error) => error.includes("must feed the exact prepared snapshot")), `No-op prepared reads satisfied draw-call consumption: ${noOpReads.join(" | ")}`);

  const shadowBypass = renderSourceGateErrors(`
function renderWorld() {
  const prepared = prepareWorldRenderSnapshot(world, manifest, viewport);
  { const prepared = otherValue; drawCorpses(layer, prepared.corpses.below40, prepared.animationById); drawProjectiles(layer, prepared.projectiles.below40); drawSpellEffects(layer, prepared.spellEffects.below40); drawUnits(prepared); }
}
function renderSourceViewportPaneWorlds() {
  for (;;) {
    const prepared = prepareWorldRenderSnapshot(world, manifest, viewport);
    { const prepared = otherValue; drawCorpses(layer, prepared.corpses.below40, prepared.animationById); drawProjectiles(layer, prepared.projectiles.below40); drawSpellEffects(layer, prepared.spellEffects.below40); drawUnits(prepared); }
    break;
  }
}`, "shadow-bypass.ts");
  assert.ok(shadowBypass.filter((error) => error.includes("must feed the exact prepared snapshot")).length === 2, `Nested shadow declarations satisfied intended snapshot use: ${shadowBypass.join(" | ")}`);

  const multilineLegacy = renderSourceGateErrors(`${validSource}\ngetAnimatedFrameNumber(\n unit,\n manifest,\n world,\n atlas.numDirections\n);`, "multiline-legacy.ts");
  assert.ok(multilineLegacy.some((error) => error.includes("Removed immediate-render call")), `Multiline legacy call did not fail structurally: ${multilineLegacy.join(" | ")}`);
  console.log("Render source structural gate self-tests passed (intended paths and draw-call uses required; helper-only, misplaced, unused, missing-upper, wrong-position, wrong-controls, no-op, shadowed, commented, and legacy fixtures rejected).");
}
