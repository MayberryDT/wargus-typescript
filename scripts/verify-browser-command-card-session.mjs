import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 5211;
const DEBUG_PORT = 9235;
const URL = `http://127.0.0.1:${PORT}/?smoke=1`;
const MAP_PATH = "maps/ladder/Garden of war BNE.pud.smp.gz";
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const manifest = JSON.parse(readFileSync("public/wargus/manifest.json", "utf8"));
const EXPECTED_GENERIC_DISABLED_HARVEST_TYPES = new Set([
  "unit-town-hall",
  "unit-keep",
  "unit-castle",
  "unit-great-hall",
  "unit-stronghold",
  "unit-fortress",
  "unit-human-shipyard",
  "unit-orc-shipyard",
  "unit-human-oil-tanker",
  "unit-orc-oil-tanker"
]);
const EXPECTED_EMPTY_RETURN_GOODS_TYPES = new Set([
  "unit-human-oil-tanker",
  "unit-orc-oil-tanker",
  "unit-peasant",
  "unit-peon"
]);
const EXPECTED_EMPTY_UNLOAD_TYPES = new Set([
  "unit-human-transport",
  "unit-orc-transport"
]);
const EXPECTED_GENERIC_DISABLED_TRAIN_TYPES_BY_UNIT = new Map([
  ["unit-archer", new Set(["unit-human-barracks"])],
  ["unit-axethrower", new Set(["unit-orc-barracks"])]
]);
const SOURCE_TRAIN_PREREQUISITE_FIXTURES = [
  { producerTypeId: "unit-human-barracks", unitTypeId: "unit-archer", keyCode: "KeyA" },
  { producerTypeId: "unit-orc-barracks", unitTypeId: "unit-axethrower", keyCode: "KeyA" }
];
const SOURCE_RESEARCH_TYPES_BY_UPGRADE = buildSourceResearchTypesByUpgrade(manifest);
const chromeProfile = mkdtempSync(path.join(tmpdir(), "wargus-command-card-chrome-"));
const server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"], {
  detached: true,
  stdio: ["pipe", "ignore", "ignore"]
});
let chrome = null;
let client = null;

try {
  await waitForHttp(URL, 20_000);
  chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--user-data-dir=${chromeProfile}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    "about:blank"
  ], { detached: true, stdio: "ignore" });
  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 10_000);
  const target = await waitForPageTarget(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 10_000);
  client = await connectDevTools(target.webSocketDebuggerUrl);
  const pageErrors = [];
  client.on("Runtime.exceptionThrown", (params) => {
    pageErrors.push(params.exceptionDetails?.text ?? params.exceptionDetails?.exception?.description ?? "unknown page exception");
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: URL });
  await client.waitFor("Page.loadEventFired", 20_000);
  await waitForExpression(client, "Boolean(window.__WARGUS_TS_SMOKE_STATE__?.worldLoaded)", 20_000);
  await waitForExpression(client, [
    "typeof window.__WARGUS_TS_LOAD_MAP__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_FIRST_UNIT_TYPE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_FIXTURE_UNIT_TYPE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_MIXED_FIXTURE_UNIT_TYPES__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_SOURCE_PENDING_ACTION_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_SOURCE_HARVEST_RALLY_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_SOURCE_UPGRADE_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_CARRYING_WORKER_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_LOADED_TRANSPORT_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_OIL_TANKER_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_OIL_TANKER_BUILD_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_SOURCE_TRAIN_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_SOURCE_CANCEL_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_SOURCE_SPELL_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_SELECT_SOURCE_RESEARCH_FIXTURE__ === \"function\"",
    "typeof window.__WARGUS_TS_EXPECTED_SOURCE_COMMANDS__ === \"function\"",
    "typeof window.__WARGUS_TS_EXECUTE_HUD_COMMAND__ === \"function\"",
    "typeof window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__ === \"function\"",
    "typeof window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__ === \"function\""
  ].join(" && "), 20_000);

  const loaded = await evalValue(client, `window.__WARGUS_TS_LOAD_MAP__(${JSON.stringify(MAP_PATH)})`);
  if (loaded !== true) {
    throw new Error(`Unable to load fixed demo map ${MAP_PATH}: ${JSON.stringify(loaded)}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === true", 10_000);
  await dispatchKey(client, "Enter", "Enter", 13);
  await delay(500);
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.titleScreenOpen === false && window.__WARGUS_TS_SMOKE_STATE__?.briefingOpen === false", 10_000);

  const peasant = await selectUnitType("unit-peasant");
  expectCommands(peasant.commandCard, [
    "move",
    "stop",
    "attack-move",
    "repair",
    "harvest",
    "return-goods",
    "build-basic-page"
  ], "peasant root card");
  expectCommand(peasant.commandCard, "return-goods", { disabled: true, sourceAction: "return-goods" }, "empty-handed peasant return-goods");
  await verifySourceReturnGoodsCommand();
  expectNoCommand(peasant.commandCard, "follow", "source-backed peasant root card");
  expectCommand(peasant.commandCard, "build-basic-page", { disabled: false, sourceAction: "button", sourceValue: "1" }, "peasant build page");
  await verifySourceAutoRepairToggle();
  if (hasCommand(peasant.commandCard, "build-advanced-page")) {
    throw new Error(`Peasant should not show advanced build page before source Allowed predicate is met: ${summarize(peasant.commandCard)}`);
  }

  const basicPage = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('build-basic-page')");
  expectCommands(basicPage.commandCard, [
    "source-build:unit-farm",
    "source-build:unit-human-barracks",
    "source-build:unit-town-hall",
    "build-page-cancel"
  ], "peasant basic build page");
  const buildDebug = await evalValue(client, "window.__WARGUS_TS_DEBUG_SELECTED_BUILD__()");
  if (!buildDebug.some((entry) => entry.buildingTypeId === "unit-farm" && entry.canStart === true)) {
    throw new Error(`Peasant build debug rejected Farm: debug=${JSON.stringify(buildDebug)}, card=${summarize(basicPage.commandCard)}, smoke=${JSON.stringify(await readSmokeState(client))}`);
  }
  expectCommand(basicPage.commandCard, "source-build:unit-farm", { disabled: false, sourceAction: "build", sourceValue: "unit-farm" }, "farm build button");
  await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('build-page-cancel')");

  const barracks = await selectUnitType("unit-human-barracks");
  expectCommands(barracks.commandCard, [
    "source-train:unit-footman",
    "source-train:unit-archer",
    "move",
    "stop",
    "attack-move"
  ], "barracks command card");
  expectCommand(barracks.commandCard, "move", { disabled: false, sourceAction: "move" }, "barracks set-move rally");
  const beforeQueue = barracks.firstSelectedProductionQueueLength ?? 0;
  const trained = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('source-train:unit-footman')");
  await delay(250);
  const afterTrain = await readSmokeState(client);
  if ((afterTrain.firstSelectedProductionQueueLength ?? 0) <= beforeQueue) {
    throw new Error(`Barracks train command did not queue a unit: before=${beforeQueue}, after=${JSON.stringify(afterTrain)}`);
  }
  if (!trained.commandCard.some((command) => command.id === "cancel-queue")) {
    throw new Error(`Training barracks should expose source cancel command after queuing: ${summarize(trained.commandCard)}`);
  }
  await verifySourceCancelCommands();

  const rallyStart = await selectUnitType("unit-human-barracks");
  const movePending = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('move')");
  if (movePending.pendingWorldCommandKind !== "move") {
    throw new Error(`Barracks SET MOVE should enter a pending rally command, got ${JSON.stringify(movePending)}`);
  }
  const rallyPoint = {
    x: Math.min((rallyStart.firstSelectedWorldPoint?.x ?? 0) + 160, (rallyStart.mapWidth ?? 128) * 32 - 64),
    y: rallyStart.firstSelectedWorldPoint?.y ?? 0
  };
  const rallyIssued = await evalValue(client, `window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__(${Math.round(rallyPoint.x)}, ${Math.round(rallyPoint.y)})`);
  if (!rallyIssued.issued) {
    throw new Error(`Barracks SET MOVE pending command did not issue: ${JSON.stringify(rallyIssued)}`);
  }
  const rallyState = await readSmokeState(client);
  if (!rallyState.firstSelectedRallyPoint || Math.abs(rallyState.firstSelectedRallyPoint.x - Math.round(rallyPoint.x)) > 1 || Math.abs(rallyState.firstSelectedRallyPoint.y - Math.round(rallyPoint.y)) > 1) {
    throw new Error(`Barracks rally point was not recorded: expected=${JSON.stringify(rallyPoint)}, smoke=${JSON.stringify(rallyState)}`);
  }

  const footman = await selectUnitType("unit-footman");
  expectCommands(footman.commandCard, ["move", "stop", "attack-move", "patrol", "hold-position"], "footman command card");
  expectCommand(footman.commandCard, "hold-position", { sourceAction: "stand-ground", sourcePos: 5 }, "footman stand-ground command");
  const attackPending = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('attack-move')");
  if (attackPending.pendingWorldCommandKind !== "attack-move") {
    throw new Error(`Footman attack command should enter attack-move targeting, got ${JSON.stringify(attackPending)}`);
  }
  await verifyMixedSourceGroupCommandCard();

  const townHall = await selectUnitType("unit-town-hall");
  expectCommands(townHall.commandCard, ["source-train:unit-peasant", "harvest", "move", "stop", "attack-move"], "town hall command card");
  const townHallTrainDebug = await evalValue(client, "window.__WARGUS_TS_DEBUG_SELECTED_TRAIN__?.() ?? []");
  const townHallPeasantTrain = townHall.commandCard.find((command) => command.id === "source-train:unit-peasant");
  if (!townHallPeasantTrain || townHallPeasantTrain.disabled !== false || townHallPeasantTrain.sourceAction !== "train-unit" || townHallPeasantTrain.sourceValue !== "unit-peasant") {
    throw new Error(`town hall train peasant expected enabled source train, got ${JSON.stringify(townHallPeasantTrain)}; debug=${JSON.stringify(townHallTrainDebug)}; smoke=${JSON.stringify(await readSmokeState(client))}; card=${summarize(townHall.commandCard)}`);
  }
  await verifyWorkerTrainBlockedDuringSourceUpgrade();

  const matrix = [
    ["unit-mage", ["move", "stop", "attack-move", "source-spell:spell-fireball"]],
    ["unit-paladin", ["move", "stop", "attack-move", "patrol", "hold-position"]],
    ["unit-dwarves", ["move", "stop", "attack-move", "patrol", "hold-position"]],
    ["unit-human-transport", ["move", "stop", "unload-transport"]],
    ["unit-human-oil-tanker", ["move", "stop", "harvest"]],
    ["unit-mage-tower", ["source-research:upgrade-slow", "source-research:upgrade-flame-shield", "move", "stop", "attack-move"]],
    ["unit-human-shipyard", ["harvest", "move", "stop", "attack-move"]],
    ["unit-elven-lumber-mill", ["source-research:upgrade-arrow1", "source-research:upgrade-ranger-scouting"]],
    ["unit-inventor", ["move", "stop", "attack-move"]],
    ["unit-gryphon-aviary", ["move", "stop", "attack-move"]]
  ];
  for (const [typeId, expectedIds] of matrix) {
    const fixture = await selectFixtureUnitType(typeId);
    expectCommands(fixture.commandCard, expectedIds, `${typeId} fixture command card`);
    expectValidSourceActions(fixture.commandCard, `${typeId} fixture command card`);
  }
  await verifySourceUnloadTransportCommand();
  await verifySourceOilTankerEconomyCommands();
  await verifySourceTrainPrerequisiteCommands();
  await verifySourceScoutPatrolCommands();
  await verifySourcePendingActionCommands();
  await verifySourceHarvestRallyCommands();
  await verifySourceResearchCommands();
  await verifySourceAutoCastToggle();
  await verifySourceSpellCommands();
  const sourceParity = await verifyAllFixtureSourceCommands();
  console.log(`Source command-card parity checked ${sourceParity.checkedTypes} types / ${sourceParity.expectedCommands} expected commands.`);
  const sourceExecution = await verifyAllFixtureSourceCommandExecution();
  console.log(`Source command click execution checked ${sourceExecution.executed} commands (${sourceExecution.skippedDisabled} disabled skipped).`);
  console.log(formatSkipSummary("Source command disabled click skips", sourceExecution.disabledSkips));
  const disabledClickClassification = assertExpectedDisabledSkips("Source command disabled click skips", sourceExecution.disabledSkips);
  console.log(formatDisabledSkipClassification("Source command disabled click skips classified", disabledClickClassification));
  const sourceHotkeys = await verifyAllFixtureSourceCommandHotkeys();
  console.log(formatSkipSummary("Source command disabled hotkey skips", sourceHotkeys.disabledSkips));
  const disabledHotkeyClassification = assertExpectedDisabledSkips("Source command disabled hotkey skips", sourceHotkeys.disabledSkips);
  console.log(formatDisabledSkipClassification("Source command disabled hotkey skips classified", disabledHotkeyClassification));
  console.log(formatSkipSummary("Source command no-key hotkey skips", sourceHotkeys.noKeySkips));
  console.log(formatSkipSummary("Source command duplicate hotkey skips", sourceHotkeys.duplicateSkips));

  if (pageErrors.length > 0) {
    throw new Error(`Browser page exceptions: ${pageErrors.join("; ")}`);
  }
  console.log(`Browser command cards verified (${MAP_PATH}, peasant=${peasant.commandCard.length}, barracks=${barracks.commandCard.length}, footman=${footman.commandCard.length}, townHall=${townHall.commandCard.length}, fixtures=${matrix.length}, sourceParity=${sourceParity.checkedTypes}/${sourceParity.expectedCommands}, sourceExecution=${sourceExecution.executed}/${sourceExecution.skippedDisabled}, sourceHotkeys=${sourceHotkeys.executed}/${sourceHotkeys.skippedDisabled}/${sourceHotkeys.skippedNoKey}/${sourceHotkeys.skippedAmbiguous}/${sourceHotkeys.skippedDuplicate}).`);
} finally {
  client?.close();
  await stopProcess(chrome);
  await stopProcess(server);
  rmSync(chromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

async function selectUnitType(typeId) {
  const selected = await evalValue(client, `window.__WARGUS_TS_SELECT_FIRST_UNIT_TYPE__(${JSON.stringify(typeId)})`);
  if (selected !== true) {
    throw new Error(`Unable to select local ${typeId}: ${JSON.stringify(await readSmokeState(client))}`);
  }
  await waitForExpression(client, `window.__WARGUS_TS_SMOKE_STATE__?.selectedUnitIds?.length === 1 && window.__WARGUS_TS_SMOKE_STATE__?.commandCard?.length > 0`, 5_000);
  return await readSmokeState(client);
}

async function selectFixtureUnitType(typeId) {
  const result = await evalValue(client, `window.__WARGUS_TS_SELECT_FIXTURE_UNIT_TYPE__(${JSON.stringify(typeId)})`);
  if (!result?.ok) {
    throw new Error(`Unable to select fixture ${typeId}: ${JSON.stringify(result ?? await readSmokeState(client))}`);
  }
  await waitForExpression(client, "window.__WARGUS_TS_SMOKE_STATE__?.selectedUnitIds?.length === 1", 5_000);
  return await readSmokeState(client);
}

async function verifyAllFixtureSourceCommands() {
  let checkedTypes = 0;
  let expectedCommands = 0;
  const failures = [];
  const unitTypeIds = sourceCommandFixtureUnitTypeIds();
  for (const typeId of unitTypeIds) {
    const root = await selectFixtureUnitType(typeId);
    const rootExpected = await expectedSourceCommands();
    checkedTypes += 1;
    expectedCommands += rootExpected.length;
    collectMissingSourceCommands(root.commandCard, rootExpected, `${typeId} root`, failures);
    collectUnexpectedSourceCardCommands(root.commandCard, rootExpected, `${typeId} root`, failures);
    expectValidSourceActions(root.commandCard, `${typeId} root`);

    for (const [pageCommand, pageNumber] of [["build-basic-page", 1], ["build-advanced-page", 2]]) {
      if (!hasCommand(root.commandCard, pageCommand)) {
        continue;
      }
      const page = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(pageCommand)})`);
      const pageExpected = await expectedSourceCommands(pageNumber);
      expectedCommands += pageExpected.length;
      collectMissingSourceCommands(page.commandCard, pageExpected, `${typeId} ${pageCommand}`, failures);
      collectUnexpectedSourceCardCommands(page.commandCard, pageExpected, `${typeId} ${pageCommand}`, failures);
      expectValidSourceActions(page.commandCard, `${typeId} ${pageCommand}`);
      await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('build-page-cancel')");
    }
  }
  if (failures.length > 0) {
    throw new Error(`Source-derived command-card parity failed (${failures.length} mismatches):\n${failures.slice(0, 60).join("\n")}`);
  }
  return { checkedTypes, expectedCommands };
}

async function verifyWorkerTrainBlockedDuringSourceUpgrade() {
  const fixture = await evalValue(client, "window.__WARGUS_TS_SELECT_SOURCE_UPGRADE_FIXTURE__()");
  if (!fixture?.ok) {
    throw new Error(`Unable to create source upgrade fixture: ${JSON.stringify(fixture)}`);
  }
  const workerTrain = fixture.commandCard.find((command) => command.id === "source-train:unit-peasant" && !command.disabled);
  const sourceUpgrade = fixture.commandCard.find((command) => command.id === "source-upgrade:unit-keep" && !command.disabled);
  if (!workerTrain || !sourceUpgrade) {
    throw new Error(`Source upgrade fixture should expose enabled worker train and keep upgrade commands: card=${summarize(fixture.commandCard)}`);
  }
  const beforeQueueLength = fixture.firstSelectedProductionQueueLength ?? 0;
  const upgradeResult = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(sourceUpgrade.id)})`);
  const afterUpgrade = await readSmokeState(client);
  if (upgradeResult.feedback !== "acknowledge" || (afterUpgrade.firstSelectedProductionQueueLength ?? 0) <= beforeQueueLength) {
    throw new Error(`source upgrade fixture ${sourceUpgrade.id} should start a source upgrade before checking worker train gating: result=${JSON.stringify(upgradeResult)}, smoke=${JSON.stringify(afterUpgrade)}`);
  }
  const postUpgradeWorker = afterUpgrade.commandCard.find((command) => command.id === workerTrain.id);
  if (postUpgradeWorker && postUpgradeWorker.disabled !== true) {
    throw new Error(`source upgrade fixture ${workerTrain.id} should be disabled while source upgrade-to is active: card=${summarize(afterUpgrade.commandCard)}`);
  }
  const trainAttempt = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(workerTrain.id)})`);
  const afterTrainAttempt = await readSmokeState(client);
  if (trainAttempt.feedback !== "error" || (afterTrainAttempt.firstSelectedProductionQueueLength ?? 0) !== (afterUpgrade.firstSelectedProductionQueueLength ?? 0)) {
    throw new Error(`source upgrade fixture ${workerTrain.id} should not execute during source upgrade-to action: result=${JSON.stringify(trainAttempt)}, before=${JSON.stringify(queueSummary(afterUpgrade))}, after=${JSON.stringify(queueSummary(afterTrainAttempt))}`);
  }
}

async function verifyMixedSourceGroupCommandCard() {
  const mixed = await evalValue(client, `window.__WARGUS_TS_SELECT_MIXED_FIXTURE_UNIT_TYPES__(${JSON.stringify(["unit-peasant", "unit-footman"])})`);
  if (!mixed?.ok) {
    throw new Error(`Unable to create mixed source group fixture: ${JSON.stringify(mixed)}`);
  }
  expectCommands(mixed.commandCard, ["move", "stop", "attack-move", "patrol", "hold-position"], "mixed peasant/footman source group card");
  expectCommand(mixed.commandCard, "patrol", { sourceAction: "patrol", sourcePos: 4 }, "mixed peasant/footman patrol group command");
  expectCommand(mixed.commandCard, "hold-position", { sourceAction: "stand-ground", sourcePos: 5 }, "mixed peasant/footman stand-ground group command");
  for (const id of ["repair", "harvest", "return-goods", "build-basic-page", "build-advanced-page", "attack-ground"]) {
    expectNoCommand(mixed.commandCard, id, "mixed peasant/footman source group card");
  }
  const expected = await expectedSourceCommands();
  const failures = [];
  collectMissingSourceCommands(mixed.commandCard, expected, "mixed peasant/footman source group card", failures);
  collectUnexpectedSourceCardCommands(mixed.commandCard, expected, "mixed peasant/footman source group card", failures);
  if (failures.length > 0) {
    throw new Error(`Mixed source group command-card parity failed:\n${failures.join("\n")}`);
  }
}

async function verifySourceCancelCommands() {
  await verifySourceCancelCommand("train", "cancel-train-unit", (label, before, after, result) => {
    if (result.feedback !== "acknowledge" || (before.firstSelectedProductionQueueLength ?? 0) <= 0 || (after.firstSelectedProductionQueueLength ?? 0) !== 0) {
      throw new Error(`${label} should cancel active production: result=${JSON.stringify(result)}, before=${JSON.stringify(queueSummary(before))}, after=${JSON.stringify(queueSummary(after))}`);
    }
  });
  await verifySourceCancelCommand("research", "cancel-upgrade", (label, before, after, result) => {
    if (result.feedback !== "acknowledge" || (before.firstSelectedActiveResearchCount ?? 0) <= 0 || (after.firstSelectedActiveResearchCount ?? 0) !== 0) {
      throw new Error(`${label} should cancel active research/upgrade: result=${JSON.stringify(result)}, before=${before.firstSelectedActiveResearchCount}, after=${after.firstSelectedActiveResearchCount}`);
    }
  });
  await verifySourceCancelCommand("construction", "cancel-build", (label, before, after, result) => {
    if (result.feedback !== "acknowledge" || after.unitCount !== before.unitCount - 1 || after.commandCard.length !== 0) {
      throw new Error(`${label} should remove the under-construction building: result=${JSON.stringify(result)}, beforeUnits=${before.unitCount}, afterUnits=${after.unitCount}, afterCard=${summarize(after.commandCard)}`);
    }
  });
  console.log("Source cancel command fixtures checked 3 commands (3 hotkeys).");
}

async function verifySourceCancelCommand(kind, expectedAction, validate) {
  const clickFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_CANCEL_FIXTURE__(${JSON.stringify(kind)})`);
  if (!clickFixture?.ok) {
    throw new Error(`Unable to create ${kind} source cancel fixture: ${JSON.stringify(clickFixture)}`);
  }
  const beforeClick = await readSmokeState(client);
  expectCancelQueueReady(`${kind} cancel click fixture`, beforeClick, expectedAction);
  const clicked = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('cancel-queue')");
  const afterClick = await readSmokeState(client);
  validate(`${kind} clicked cancel`, beforeClick, afterClick, clicked);

  const hotkeyFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_CANCEL_FIXTURE__(${JSON.stringify(kind)})`);
  if (!hotkeyFixture?.ok) {
    throw new Error(`Unable to recreate ${kind} source cancel fixture for hotkey: ${JSON.stringify(hotkeyFixture)}`);
  }
  const beforeHotkey = await readSmokeState(client);
  expectCancelQueueReady(`${kind} cancel hotkey fixture`, beforeHotkey, expectedAction);
  const hotkeyed = await evalValue(client, "window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__('Escape')");
  const afterHotkey = await readSmokeState(client);
  validate(`${kind} Escape hotkey cancel`, beforeHotkey, afterHotkey, hotkeyed);
}

function expectCancelQueueReady(label, smoke, expectedAction) {
  const command = smoke.commandCard.find((candidate) => candidate.id === "cancel-queue");
  if (!command || command.disabled || command.sourceAction !== expectedAction || command.key?.toUpperCase() !== "ESC") {
    throw new Error(`${label} should expose enabled source ${expectedAction} cancel button: card=${summarize(smoke.commandCard)}, smoke=${JSON.stringify(smoke)}`);
  }
}

async function verifySourceAutoRepairToggle() {
  const before = await readSmokeState(client);
  const repairCommand = before.commandCard.find((command) => command.id === "repair" && !command.disabled);
  if (!repairCommand) {
    throw new Error(`Peasant should expose an enabled source repair command for CTRL auto-repair: card=${summarize(before.commandCard)}`);
  }
  const enabled = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('repair', { ctrlKey: true })");
  const afterEnabled = await readSmokeState(client);
  if (enabled.feedback !== "acknowledge" || afterEnabled.firstSelectedAutoRepair !== true || enabled.pendingWorldCommandKind !== null) {
    throw new Error(`CTRL-repair should enable auto-repair without entering repair targeting: result=${JSON.stringify(enabled)}, smoke=${JSON.stringify(afterEnabled)}`);
  }
  const disabled = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('repair', { ctrlKey: true })");
  const afterDisabled = await readSmokeState(client);
  if (disabled.feedback !== "acknowledge" || afterDisabled.firstSelectedAutoRepair !== false || disabled.pendingWorldCommandKind !== null) {
    throw new Error(`Second CTRL-repair should disable auto-repair without entering repair targeting: result=${JSON.stringify(disabled)}, smoke=${JSON.stringify(afterDisabled)}`);
  }
}

async function verifySourceReturnGoodsCommand() {
  const carrying = await evalValue(client, "window.__WARGUS_TS_SELECT_CARRYING_WORKER_FIXTURE__()");
  if (!carrying?.ok) {
    throw new Error(`Unable to create carried-worker return-goods fixture: ${JSON.stringify(carrying)}`);
  }
  const before = await readSmokeState(client);
  const command = before.commandCard.find((candidate) => candidate.id === "return-goods");
  if (!command || command.disabled || command.sourceAction !== "return-goods") {
    throw new Error(`Carried peasant should expose an enabled source return-goods command: card=${summarize(before.commandCard)}, smoke=${JSON.stringify(before)}`);
  }
  if ((before.firstSelectedResourcesHeld ?? 0) <= 0 || before.firstSelectedCarriedResource !== "gold") {
    throw new Error(`Carried peasant fixture should begin with gold cargo: smoke=${JSON.stringify(before)}`);
  }
  const clicked = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('return-goods')");
  const afterClick = await readSmokeState(client);
  expectReturnGoodsIssued("clicked return-goods", clicked, before, afterClick, "gold");

  const hotkeyFixture = await evalValue(client, "window.__WARGUS_TS_SELECT_CARRYING_WORKER_FIXTURE__()");
  if (!hotkeyFixture?.ok) {
    throw new Error(`Unable to recreate carried-worker return-goods fixture for hotkey: ${JSON.stringify(hotkeyFixture)}`);
  }
  const beforeHotkey = await readSmokeState(client);
  const hotkeyed = await evalValue(client, "window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__('KeyG')");
  const afterHotkey = await readSmokeState(client);
  expectReturnGoodsIssued("G hotkey return-goods", hotkeyed, beforeHotkey, afterHotkey, "gold");
}

function expectReturnGoodsIssued(label, result, before, after, resource) {
  const beforeCargo = before.firstSelectedResourcesHeld ?? 0;
  const resourceBefore = before.visibilityPlayerResources?.[resource] ?? 0;
  const resourceAfter = after.visibilityPlayerResources?.[resource] ?? 0;
  const returningToDropoff = (
    after.firstSelectedOrderKind === "harvest"
    && after.firstSelectedOrderTarget
    && (after.firstSelectedResourcesHeld ?? 0) > 0
    && after.firstSelectedCarriedResource === resource
    && after.firstSelectedOrderResource === resource
  );
  const deliveredAtDropoff = (
    beforeCargo > 0
    && (after.firstSelectedResourcesHeld ?? 0) === 0
    && after.firstSelectedCarriedResource === null
    && resourceAfter >= resourceBefore + beforeCargo
  );
  if (result.feedback !== "acknowledge" || (!returningToDropoff && !deliveredAtDropoff)) {
    throw new Error(`${label} should return carried cargo to a dropoff: result=${JSON.stringify(result)}, before=${JSON.stringify(before)}, after=${JSON.stringify(after)}`);
  }
}

async function verifySourceUnloadTransportCommand() {
  for (const typeId of ["unit-human-transport", "unit-orc-transport"]) {
    const loaded = await evalValue(client, `window.__WARGUS_TS_SELECT_LOADED_TRANSPORT_FIXTURE__(${JSON.stringify(typeId)})`);
    if (!loaded?.ok) {
      throw new Error(`Unable to create loaded ${typeId} fixture: ${JSON.stringify(loaded)}`);
    }
    const before = await readSmokeState(client);
    expectLoadedTransportUnloadReady(`${typeId} loaded transport`, before);
    const clicked = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('unload-transport')");
    const afterClick = await readSmokeState(client);
    expectUnloadTransportPending(`${typeId} clicked unload`, clicked, afterClick);

    const hotkeyFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_LOADED_TRANSPORT_FIXTURE__(${JSON.stringify(typeId)})`);
    if (!hotkeyFixture?.ok) {
      throw new Error(`Unable to recreate loaded ${typeId} fixture for hotkey: ${JSON.stringify(hotkeyFixture)}`);
    }
    const beforeHotkey = await readSmokeState(client);
    expectLoadedTransportUnloadReady(`${typeId} loaded transport hotkey`, beforeHotkey);
    const hotkeyed = await evalValue(client, "window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__('KeyU')");
    const afterHotkey = await readSmokeState(client);
    expectUnloadTransportPending(`${typeId} U hotkey unload`, hotkeyed, afterHotkey);
  }
}

function expectLoadedTransportUnloadReady(label, smoke) {
  const command = smoke.commandCard.find((candidate) => candidate.id === "unload-transport");
  if (!command || command.disabled || command.sourceAction !== "unload") {
    throw new Error(`${label} should expose an enabled source unload command: card=${summarize(smoke.commandCard)}, smoke=${JSON.stringify(smoke)}`);
  }
  if ((smoke.firstSelectedCargoCapacity ?? 0) <= 0 || (smoke.firstSelectedCargoCount ?? 0) <= 0) {
    throw new Error(`${label} should begin with transport cargo: smoke=${JSON.stringify(smoke)}`);
  }
}

function expectUnloadTransportPending(label, result, smoke) {
  if (
    result.feedback !== "click"
    || result.pendingWorldCommandKind !== "unload-transport"
    || smoke.pendingWorldCommandKind !== "unload-transport"
    || (smoke.firstSelectedCargoCount ?? 0) <= 0
  ) {
    throw new Error(`${label} should enter unload targeting with cargo still aboard: result=${JSON.stringify(result)}, smoke=${JSON.stringify(smoke)}`);
  }
}

async function verifySourceOilTankerEconomyCommands() {
  for (const typeId of ["unit-human-oil-tanker", "unit-orc-oil-tanker"]) {
    const buildFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_OIL_TANKER_BUILD_FIXTURE__(${JSON.stringify(typeId)})`);
    if (!buildFixture?.ok) {
      throw new Error(`Unable to create ${typeId} build fixture: ${JSON.stringify(buildFixture)}`);
    }
    const beforeBuild = await readSmokeState(client);
    expectOilTankerBuildReady(`${typeId} build fixture`, beforeBuild, buildFixture.platformTypeId);
    const clickedBuild = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(`source-build:${buildFixture.platformTypeId}`)})`);
    const afterClickBuild = await readSmokeState(client);
    await expectOilPlatformBuildPendingThenIssued(`${typeId} clicked build oil platform`, buildFixture.target, clickedBuild, afterClickBuild);

    const hotkeyBuildFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_OIL_TANKER_BUILD_FIXTURE__(${JSON.stringify(typeId)})`);
    if (!hotkeyBuildFixture?.ok) {
      throw new Error(`Unable to recreate ${typeId} build fixture for hotkey: ${JSON.stringify(hotkeyBuildFixture)}`);
    }
    const beforeHotkeyBuild = await readSmokeState(client);
    expectOilTankerBuildReady(`${typeId} build hotkey fixture`, beforeHotkeyBuild, hotkeyBuildFixture.platformTypeId);
    const hotkeyBuild = await evalValue(client, "window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__('KeyB')");
    const afterHotkeyBuild = await readSmokeState(client);
    await expectOilPlatformBuildPendingThenIssued(`${typeId} B hotkey build oil platform`, hotkeyBuildFixture.target, hotkeyBuild, afterHotkeyBuild);

    const oldHotkeyFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_OIL_TANKER_BUILD_FIXTURE__(${JSON.stringify(typeId)})`);
    if (!oldHotkeyFixture?.ok) {
      throw new Error(`Unable to recreate ${typeId} build fixture for legacy hotkey: ${JSON.stringify(oldHotkeyFixture)}`);
    }
    const legacyHotkey = await evalValue(client, "window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__('KeyU')");
    if (legacyHotkey.handled === true || legacyHotkey.pendingWorldCommandKind === "build-oil-platform") {
      throw new Error(`${typeId} hidden U hotkey should not build oil platforms when the source card uses B: result=${JSON.stringify(legacyHotkey)}, smoke=${JSON.stringify(await readSmokeState(client))}`);
    }

    const harvestFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_OIL_TANKER_FIXTURE__(${JSON.stringify(typeId)}, false)`);
    if (!harvestFixture?.ok) {
      throw new Error(`Unable to create ${typeId} harvest fixture: ${JSON.stringify(harvestFixture)}`);
    }
    const beforeHarvest = await readSmokeState(client);
    expectOilTankerHarvestReady(`${typeId} harvest fixture`, beforeHarvest);
    const clickedHarvest = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('harvest')");
    const afterClickHarvest = await readSmokeState(client);
    await expectOilHarvestPendingThenIssued(`${typeId} clicked harvest`, harvestFixture.target, beforeHarvest, clickedHarvest, afterClickHarvest);

    const hotkeyHarvestFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_OIL_TANKER_FIXTURE__(${JSON.stringify(typeId)}, false)`);
    if (!hotkeyHarvestFixture?.ok) {
      throw new Error(`Unable to recreate ${typeId} harvest fixture for hotkey: ${JSON.stringify(hotkeyHarvestFixture)}`);
    }
    const beforeHotkeyHarvest = await readSmokeState(client);
    expectOilTankerHarvestReady(`${typeId} harvest hotkey fixture`, beforeHotkeyHarvest);
    const hotkeyHarvest = await evalValue(client, "window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__('KeyH')");
    const afterHotkeyHarvest = await readSmokeState(client);
    await expectOilHarvestPendingThenIssued(`${typeId} H hotkey harvest`, hotkeyHarvestFixture.target, beforeHotkeyHarvest, hotkeyHarvest, afterHotkeyHarvest);

    const returnFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_OIL_TANKER_FIXTURE__(${JSON.stringify(typeId)}, true)`);
    if (!returnFixture?.ok) {
      throw new Error(`Unable to create ${typeId} return-goods fixture: ${JSON.stringify(returnFixture)}`);
    }
    const beforeReturn = await readSmokeState(client);
    expectOilTankerReturnReady(`${typeId} return fixture`, beforeReturn);
    const clickedReturn = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('return-goods')");
    const afterClickReturn = await readSmokeState(client);
    expectReturnGoodsIssued(`${typeId} clicked oil return-goods`, clickedReturn, beforeReturn, afterClickReturn, "oil");

    const hotkeyReturnFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_OIL_TANKER_FIXTURE__(${JSON.stringify(typeId)}, true)`);
    if (!hotkeyReturnFixture?.ok) {
      throw new Error(`Unable to recreate ${typeId} return-goods fixture for hotkey: ${JSON.stringify(hotkeyReturnFixture)}`);
    }
    const beforeHotkeyReturn = await readSmokeState(client);
    expectOilTankerReturnReady(`${typeId} return hotkey fixture`, beforeHotkeyReturn);
    const hotkeyReturn = await evalValue(client, "window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__('KeyG')");
    const afterHotkeyReturn = await readSmokeState(client);
    expectReturnGoodsIssued(`${typeId} G hotkey oil return-goods`, hotkeyReturn, beforeHotkeyReturn, afterHotkeyReturn, "oil");
  }
}

function expectOilTankerBuildReady(label, smoke, platformTypeId) {
  const command = smoke.commandCard.find((candidate) => candidate.id === `source-build:${platformTypeId}`);
  if (!command || command.disabled || command.sourceAction !== "build" || command.sourceValue !== platformTypeId || command.key?.toUpperCase() !== "B") {
    throw new Error(`${label} should expose enabled source BUILD OIL PLATFORM on B: card=${summarize(smoke.commandCard)}, smoke=${JSON.stringify(smoke)}`);
  }
  if (hasCommand(smoke.commandCard, "build-oil-platform")) {
    throw new Error(`${label} should not expose stock build-oil-platform fallback beside source build button: card=${summarize(smoke.commandCard)}`);
  }
}

async function expectOilPlatformBuildPendingThenIssued(label, target, result, afterPending) {
  if (result.feedback !== "click" || result.pendingWorldCommandKind !== "build-oil-platform" || afterPending.pendingWorldCommandKind !== "build-oil-platform") {
    throw new Error(`${label} should enter source oil-platform targeting: result=${JSON.stringify(result)}, smoke=${JSON.stringify(afterPending)}`);
  }
  if (!target) {
    throw new Error(`${label} should expose an oil patch target before issuing: smoke=${JSON.stringify(afterPending)}`);
  }
  const issued = await evalValue(client, `window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__(${Math.round(target.x)}, ${Math.round(target.y)})`);
  const afterIssue = await readSmokeState(client);
  if (issued.issued !== true || !["build-oil-platform", "build"].includes(afterIssue.firstSelectedOrderKind)) {
    throw new Error(`${label} should issue a tanker build-oil-platform order: result=${JSON.stringify(issued)}, smoke=${JSON.stringify(afterIssue)}`);
  }
}

function expectOilTankerHarvestReady(label, smoke) {
  const harvest = smoke.commandCard.find((candidate) => candidate.id === "harvest");
  const returnGoods = smoke.commandCard.find((candidate) => candidate.id === "return-goods");
  if (!harvest || harvest.disabled || harvest.sourceAction !== "harvest") {
    throw new Error(`${label} should expose enabled oil harvest: card=${summarize(smoke.commandCard)}, smoke=${JSON.stringify(smoke)}`);
  }
  if (!returnGoods || returnGoods.disabled !== true || returnGoods.sourceAction !== "return-goods") {
    throw new Error(`${label} should keep empty tanker return-goods disabled: card=${summarize(smoke.commandCard)}, smoke=${JSON.stringify(smoke)}`);
  }
}

function expectOilTankerReturnReady(label, smoke) {
  const returnGoods = smoke.commandCard.find((candidate) => candidate.id === "return-goods");
  if (!returnGoods || returnGoods.disabled || returnGoods.sourceAction !== "return-goods") {
    throw new Error(`${label} should expose enabled oil return-goods: card=${summarize(smoke.commandCard)}, smoke=${JSON.stringify(smoke)}`);
  }
  if ((smoke.firstSelectedResourcesHeld ?? 0) <= 0 || smoke.firstSelectedCarriedResource !== "oil") {
    throw new Error(`${label} should begin with oil cargo: smoke=${JSON.stringify(smoke)}`);
  }
}

async function expectOilHarvestPendingThenIssued(label, fixtureTarget, before, result, afterPending) {
  if (result.feedback !== "click" || result.pendingWorldCommandKind !== "harvest" || afterPending.pendingWorldCommandKind !== "harvest") {
    throw new Error(`${label} should enter oil harvest targeting: result=${JSON.stringify(result)}, smoke=${JSON.stringify(afterPending)}`);
  }
  const target = fixtureTarget ?? before.firstHarvestTargetWorldPoint ?? afterPending.firstHarvestTargetWorldPoint;
  if (!target) {
    throw new Error(`${label} should expose an oil platform target before issuing: before=${JSON.stringify(before)}, after=${JSON.stringify(afterPending)}`);
  }
  const issued = await evalValue(client, `window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__(${Math.round(target.x)}, ${Math.round(target.y)})`);
  const afterIssue = await readSmokeState(client);
  expectOilHarvestIssued(label, issued, afterIssue);
}

function expectOilHarvestIssued(label, result, smoke) {
  if (
    result.issued !== true
    || smoke.firstSelectedOrderKind !== "harvest"
    || smoke.firstSelectedOrderResource !== "oil"
    || !smoke.firstSelectedOrderTarget
  ) {
    throw new Error(`${label} should send tanker to harvest oil: result=${JSON.stringify(result)}, smoke=${JSON.stringify(smoke)}`);
  }
}

async function verifySourceTrainPrerequisiteCommands() {
  let checked = 0;
  let hotkeys = 0;
  const failures = [];
  for (const { producerTypeId, unitTypeId, keyCode } of SOURCE_TRAIN_PREREQUISITE_FIXTURES) {
    const expected = { id: `source-train:${unitTypeId}`, sourceAction: "train-unit", sourceValue: unitTypeId };
    const fixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_TRAIN_FIXTURE__(${JSON.stringify(producerTypeId)}, ${JSON.stringify(unitTypeId)})`);
    if (!fixture?.ok) {
      failures.push(`${producerTypeId} ${unitTypeId} train fixture failed: ${JSON.stringify(fixture)}`);
      continue;
    }
    const before = await readSmokeState(client);
    const command = before.commandCard.find((candidate) => candidate.id === expected.id);
    if (!command || command.disabled || command.sourceAction !== "train-unit" || command.sourceValue !== unitTypeId) {
      failures.push(`${producerTypeId} should expose enabled source train ${unitTypeId}: card=${summarize(before.commandCard)}, smoke=${JSON.stringify(before)}`);
      continue;
    }
    const clicked = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(expected.id)})`);
    const afterClick = await readSmokeState(client);
    validateSourceCommandExecution(`${producerTypeId} targeted train ${unitTypeId}`, expected, before, clicked, afterClick, failures);
    checked += 1;

    const hotkeyFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_TRAIN_FIXTURE__(${JSON.stringify(producerTypeId)}, ${JSON.stringify(unitTypeId)})`);
    if (!hotkeyFixture?.ok) {
      failures.push(`${producerTypeId} ${unitTypeId} train hotkey fixture failed: ${JSON.stringify(hotkeyFixture)}`);
      continue;
    }
    const beforeHotkey = await readSmokeState(client);
    const hotkeyCommand = beforeHotkey.commandCard.find((candidate) => candidate.id === expected.id);
    if (!hotkeyCommand || hotkeyCommand.disabled || keyCodeForCommand(hotkeyCommand) !== keyCode || classifyHotkeyCommand(beforeHotkey.commandCard, hotkeyCommand) !== "ready") {
      failures.push(`${producerTypeId} should expose unambiguous ${keyCode} source train hotkey for ${unitTypeId}: card=${summarize(beforeHotkey.commandCard)}, smoke=${JSON.stringify(beforeHotkey)}`);
      continue;
    }
    const hotkeyed = await evalValue(client, `window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__(${JSON.stringify(keyCode)})`);
    const afterHotkey = await readSmokeState(client);
    validateSourceCommandExecution(`${producerTypeId} targeted train hotkey ${unitTypeId}`, expected, beforeHotkey, hotkeyed, afterHotkey, failures);
    hotkeys += 1;
  }
  if (failures.length > 0) {
    throw new Error(`Source prerequisite train command fixtures failed (${failures.length} failures):\n${failures.slice(0, 80).join("\n")}`);
  }
  console.log(`Source prerequisite train command fixtures checked ${checked} commands (${hotkeys} hotkeys).`);
}

async function verifySourceScoutPatrolCommands() {
  for (const typeId of ["unit-balloon", "unit-eye-of-vision", "unit-zeppelin"]) {
    const fixture = await selectFixtureUnitType(typeId);
    expectScoutPatrolReady(`${typeId} fixture`, fixture);
    const clicked = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('patrol')");
    const afterClick = await readSmokeState(client);
    expectPatrolPending(`${typeId} clicked patrol`, clicked, afterClick);

    const hotkeyFixture = await selectFixtureUnitType(typeId);
    expectScoutPatrolReady(`${typeId} hotkey fixture`, hotkeyFixture);
    const hotkeyed = await evalValue(client, "window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__('KeyP')");
    const afterHotkey = await readSmokeState(client);
    expectPatrolPending(`${typeId} P hotkey patrol`, hotkeyed, afterHotkey);
  }
}

function expectScoutPatrolReady(label, smoke) {
  const patrol = smoke.commandCard.find((candidate) => candidate.id === "patrol");
  if (!patrol || patrol.disabled || patrol.sourceAction !== "patrol") {
    throw new Error(`${label} should expose enabled source patrol: card=${summarize(smoke.commandCard)}, smoke=${JSON.stringify(smoke)}`);
  }
}

function expectPatrolPending(label, result, smoke) {
  if (result.feedback !== "click" || result.pendingWorldCommandKind !== "patrol" || smoke.pendingWorldCommandKind !== "patrol") {
    throw new Error(`${label} should enter patrol targeting: result=${JSON.stringify(result)}, smoke=${JSON.stringify(smoke)}`);
  }
}

async function verifySourcePendingActionCommands() {
  const fixtures = [
    { action: "move", key: "KeyM" },
    { action: "attack", key: "KeyA" },
    { action: "attack-ground", key: "KeyG" },
    { action: "patrol", key: "KeyP" },
    { action: "repair", key: "KeyR" },
    { action: "harvest", key: "KeyH" }
  ];
  const failures = [];
  let checked = 0;
  let hotkeys = 0;
  for (const fixture of fixtures) {
    const clickFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_PENDING_ACTION_FIXTURE__(${JSON.stringify(fixture.action)})`);
    if (!clickFixture?.ok) {
      failures.push(`${fixture.action} click fixture failed: ${JSON.stringify(clickFixture)}`);
      continue;
    }
    const beforeClick = await readSmokeState(client);
    const command = beforeClick.commandCard.find((candidate) => candidate.id === clickFixture.commandId);
    if (!command || command.disabled || command.sourceAction !== fixture.action) {
      failures.push(`${fixture.action} should expose enabled ${clickFixture.commandId}: card=${summarize(beforeClick.commandCard)}, smoke=${JSON.stringify(beforeClick)}`);
      continue;
    }
    const clicked = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(clickFixture.commandId)})`);
    const afterClick = await readSmokeState(client);
    await validateIssuedSourcePendingAction(`${fixture.action} clicked ${clickFixture.commandId}`, clickFixture, clicked, afterClick, failures);
    checked += 1;

    const hotkeyFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_PENDING_ACTION_FIXTURE__(${JSON.stringify(fixture.action)})`);
    if (!hotkeyFixture?.ok) {
      failures.push(`${fixture.action} hotkey fixture failed: ${JSON.stringify(hotkeyFixture)}`);
      continue;
    }
    const beforeHotkey = await readSmokeState(client);
    const hotkeyCommand = beforeHotkey.commandCard.find((candidate) => candidate.id === hotkeyFixture.commandId);
    if (classifyHotkeyCommand(beforeHotkey.commandCard, hotkeyCommand) !== "ready" || keyCodeForCommand(hotkeyCommand) !== fixture.key) {
      failures.push(`${fixture.action} should expose unambiguous ${fixture.key} hotkey: card=${summarize(beforeHotkey.commandCard)}, smoke=${JSON.stringify(beforeHotkey)}`);
      continue;
    }
    const hotkeyed = await evalValue(client, `window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__(${JSON.stringify(fixture.key)})`);
    const afterHotkey = await readSmokeState(client);
    await validateIssuedSourcePendingAction(`${fixture.action} hotkey ${fixture.key}`, hotkeyFixture, hotkeyed, afterHotkey, failures);
    hotkeys += 1;
  }
  if (failures.length > 0) {
    throw new Error(`Source pending action fixtures failed (${failures.length} failures):\n${failures.slice(0, 80).join("\n")}`);
  }
  console.log(`Source pending action fixtures checked ${checked} commands (${hotkeys} hotkeys).`);
}

async function validateIssuedSourcePendingAction(label, fixture, result, afterPending, failures) {
  if (!fixture.target || !fixture.commandId || !fixture.expectedOrderKind) {
    failures.push(`${label} fixture did not provide command, target, and expected order: ${JSON.stringify(fixture)}`);
    return;
  }
  if (result.feedback !== "click" || result.pendingWorldCommandKind !== afterPending.pendingWorldCommandKind || !afterPending.pendingWorldCommandKind) {
    failures.push(`${label} should enter pending targeting: result=${JSON.stringify(result)}, smoke=${JSON.stringify(afterPending)}`);
    return;
  }
  const issued = await evalValue(client, `window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__(${Math.round(fixture.target.x)}, ${Math.round(fixture.target.y)})`);
  const afterIssue = await readSmokeState(client);
  if (!issued.issued || issued.pendingWorldCommandKind !== null) {
    failures.push(`${label} should issue pending command and clear pending state: issued=${JSON.stringify(issued)}, after=${JSON.stringify(afterIssue)}`);
    return;
  }
  if (afterIssue.firstSelectedOrderKind !== fixture.expectedOrderKind) {
    failures.push(`${label} should create ${fixture.expectedOrderKind} order, got ${afterIssue.firstSelectedOrderKind}: after=${JSON.stringify(afterIssue)}`);
  }
}

async function verifySourceHarvestRallyCommands() {
  const producerTypeIds = [
    "unit-town-hall",
    "unit-keep",
    "unit-castle",
    "unit-great-hall",
    "unit-stronghold",
    "unit-fortress",
    "unit-human-shipyard",
    "unit-orc-shipyard"
  ];
  const failures = [];
  let checked = 0;
  let hotkeys = 0;
  for (const producerTypeId of producerTypeIds) {
    const fixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_HARVEST_RALLY_FIXTURE__(${JSON.stringify(producerTypeId)})`);
    if (!fixture?.ok) {
      failures.push(`${producerTypeId} harvest rally fixture failed: ${JSON.stringify(fixture)}`);
      continue;
    }
    const before = await readSmokeState(client);
    const command = before.commandCard.find((candidate) => candidate.id === "harvest");
    if (!command || command.disabled || command.sourceAction !== "harvest" || keyCodeForCommand(command) !== "KeyH") {
      failures.push(`${producerTypeId} should expose enabled source harvest rally command: card=${summarize(before.commandCard)}, smoke=${JSON.stringify(before)}`);
      continue;
    }
    const clicked = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('harvest')");
    const afterClick = await readSmokeState(client);
    await validateIssuedSourceHarvestRally(`${producerTypeId} clicked harvest rally`, fixture, clicked, afterClick, failures);
    checked += 1;

    const hotkeyFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_HARVEST_RALLY_FIXTURE__(${JSON.stringify(producerTypeId)})`);
    if (!hotkeyFixture?.ok) {
      failures.push(`${producerTypeId} harvest rally hotkey fixture failed: ${JSON.stringify(hotkeyFixture)}`);
      continue;
    }
    const beforeHotkey = await readSmokeState(client);
    const hotkeyCommand = beforeHotkey.commandCard.find((candidate) => candidate.id === "harvest");
    if (classifyHotkeyCommand(beforeHotkey.commandCard, hotkeyCommand) !== "ready" || keyCodeForCommand(hotkeyCommand) !== "KeyH") {
      failures.push(`${producerTypeId} should expose unambiguous H harvest rally hotkey: card=${summarize(beforeHotkey.commandCard)}, smoke=${JSON.stringify(beforeHotkey)}`);
      continue;
    }
    const hotkeyed = await evalValue(client, "window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__('KeyH')");
    const afterHotkey = await readSmokeState(client);
    await validateIssuedSourceHarvestRally(`${producerTypeId} hotkey H harvest rally`, hotkeyFixture, hotkeyed, afterHotkey, failures);
    hotkeys += 1;
  }
  if (failures.length > 0) {
    throw new Error(`Source harvest rally fixtures failed (${failures.length} failures):\n${failures.slice(0, 80).join("\n")}`);
  }
  console.log(`Source harvest rally fixtures checked ${checked} producers (${hotkeys} hotkeys).`);
}

async function validateIssuedSourceHarvestRally(label, fixture, result, afterPending, failures) {
  if (!fixture.target) {
    failures.push(`${label} fixture did not provide a rally target: ${JSON.stringify(fixture)}`);
    return;
  }
  if (result.feedback !== "click" || result.pendingWorldCommandKind !== "harvest" || afterPending.pendingWorldCommandKind !== "harvest") {
    failures.push(`${label} should enter harvest rally targeting: result=${JSON.stringify(result)}, smoke=${JSON.stringify(afterPending)}`);
    return;
  }
  const issued = await evalValue(client, `window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__(${Math.round(fixture.target.x)}, ${Math.round(fixture.target.y)})`);
  const afterIssue = await readSmokeState(client);
  if (!issued.issued || issued.pendingWorldCommandKind !== null) {
    failures.push(`${label} should issue harvest rally and clear pending state: issued=${JSON.stringify(issued)}, after=${JSON.stringify(afterIssue)}`);
    return;
  }
  if (!afterIssue.firstSelectedRallyPoint
    || Math.abs(afterIssue.firstSelectedRallyPoint.x - Math.round(fixture.target.x)) > 1
    || Math.abs(afterIssue.firstSelectedRallyPoint.y - Math.round(fixture.target.y)) > 1) {
    failures.push(`${label} should record producer harvest rally point: expected=${JSON.stringify(fixture.target)}, after=${JSON.stringify(afterIssue)}`);
  }
}

async function verifySourceResearchCommands() {
  let checked = 0;
  let hotkeys = 0;
  const failures = [];
  const seen = new Set();
  const researchFixtures = [];
  for (const button of (manifest.buttons ?? [])) {
    if (button.action !== "research" || !button.value) {
      continue;
    }
    for (const typeId of button.forUnit ?? []) {
      const key = `${typeId}|${button.value}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      researchFixtures.push({ typeId, upgradeId: button.value });
    }
  }
  researchFixtures.sort((left, right) => left.typeId.localeCompare(right.typeId) || left.upgradeId.localeCompare(right.upgradeId));

  for (const { typeId, upgradeId } of researchFixtures) {
    const fixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_RESEARCH_FIXTURE__(${JSON.stringify(typeId)}, ${JSON.stringify(upgradeId)})`);
    if (!fixture?.ok) {
      failures.push(`${typeId} ${upgradeId} fixture failed: ${JSON.stringify(fixture)}`);
      continue;
    }
    const before = await readSmokeState(client);
    const expected = { id: `source-research:${upgradeId}`, sourceAction: "research", sourceValue: upgradeId };
    const command = before.commandCard.find((candidate) => candidate.id === expected.id);
    if (!command || command.disabled || command.sourceAction !== "research" || command.sourceValue !== upgradeId) {
      failures.push(`${typeId} ${upgradeId} should expose enabled source research: card=${summarize(before.commandCard)}, smoke=${JSON.stringify(before)}`);
      continue;
    }
    const clicked = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(expected.id)})`);
    const afterClick = await readSmokeState(client);
    validateSourceCommandExecution(`${typeId} targeted research ${upgradeId}`, expected, before, clicked, afterClick, failures);
    checked += 1;

    const hotkeyFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_RESEARCH_FIXTURE__(${JSON.stringify(typeId)}, ${JSON.stringify(upgradeId)})`);
    if (!hotkeyFixture?.ok) {
      failures.push(`${typeId} ${upgradeId} hotkey fixture failed: ${JSON.stringify(hotkeyFixture)}`);
      continue;
    }
    const beforeHotkey = await readSmokeState(client);
    const hotkeyCommand = beforeHotkey.commandCard.find((candidate) => candidate.id === expected.id);
    if (classifyHotkeyCommand(beforeHotkey.commandCard, hotkeyCommand) !== "ready") {
      continue;
    }
    const hotkey = keyCodeForCommand(hotkeyCommand);
    const hotkeyed = await evalValue(client, `window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__(${JSON.stringify(hotkey)})`);
    const afterHotkey = await readSmokeState(client);
    validateSourceCommandExecution(`${typeId} targeted research hotkey ${upgradeId}`, expected, beforeHotkey, hotkeyed, afterHotkey, failures);
    hotkeys += 1;
  }
  if (failures.length > 0) {
    throw new Error(`Source research command fixtures failed (${failures.length} failures):\n${failures.slice(0, 80).join("\n")}`);
  }
  console.log(`Source research command fixtures checked ${checked} commands (${hotkeys} hotkeys).`);
}

async function verifySourceAutoCastToggle() {
  const mage = await selectFixtureUnitType("unit-mage");
  const spellCommand = mage.commandCard.find((command) => command.id === "source-spell:spell-fireball" && !command.disabled);
  if (!spellCommand) {
    throw new Error(`Mage should expose an enabled source fireball command for CTRL auto-cast: card=${summarize(mage.commandCard)}`);
  }
  const enabled = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('source-spell:spell-fireball', { ctrlKey: true })");
  const afterEnabled = await readSmokeState(client);
  if (enabled.feedback !== "acknowledge" || !afterEnabled.firstSelectedAutoCastSpells?.includes("spell-fireball") || enabled.pendingWorldCommandKind !== null) {
    throw new Error(`CTRL-fireball should enable auto-cast without entering spell targeting: result=${JSON.stringify(enabled)}, smoke=${JSON.stringify(afterEnabled)}`);
  }
  const disabled = await evalValue(client, "window.__WARGUS_TS_EXECUTE_HUD_COMMAND__('source-spell:spell-fireball', { ctrlKey: true })");
  const afterDisabled = await readSmokeState(client);
  if (disabled.feedback !== "acknowledge" || afterDisabled.firstSelectedAutoCastSpells?.includes("spell-fireball") || disabled.pendingWorldCommandKind !== null) {
    throw new Error(`Second CTRL-fireball should disable auto-cast without entering spell targeting: result=${JSON.stringify(disabled)}, smoke=${JSON.stringify(afterDisabled)}`);
  }
}

async function verifySourceSpellCommands() {
  let checked = 0;
  let hotkeys = 0;
  const failures = [];
  const seen = new Set();
  const spellFixtures = [];
  for (const button of (manifest.buttons ?? [])) {
    if (button.action !== "cast-spell" || !button.value) {
      continue;
    }
    for (const typeId of button.forUnit ?? []) {
      const key = `${typeId}|${button.value}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      spellFixtures.push({ typeId, spellId: button.value });
    }
  }
  spellFixtures.sort((left, right) => left.typeId.localeCompare(right.typeId) || left.spellId.localeCompare(right.spellId));

  for (const { typeId, spellId } of spellFixtures) {
    const fixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_SPELL_FIXTURE__(${JSON.stringify(typeId)}, ${JSON.stringify(spellId)})`);
    if (!fixture?.ok) {
      failures.push(`${typeId} ${spellId} spell fixture failed: ${JSON.stringify(fixture)}`);
      continue;
    }
    const before = await readSmokeState(client);
    const expected = { id: `source-spell:${spellId}`, sourceAction: "cast-spell", sourceValue: spellId };
    const command = before.commandCard.find((candidate) => candidate.id === expected.id);
    if (!command || command.disabled || command.sourceAction !== "cast-spell" || command.sourceValue !== spellId) {
      failures.push(`${typeId} ${spellId} should expose enabled source spell: card=${summarize(before.commandCard)}, smoke=${JSON.stringify(before)}`);
      continue;
    }
    const clicked = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(expected.id)})`);
    const afterClick = await readSmokeState(client);
    await validateSourceSpellExecution(`${typeId} clicked spell ${spellId}`, fixture, before, clicked, afterClick, failures);
    checked += 1;

    const hotkeyFixture = await evalValue(client, `window.__WARGUS_TS_SELECT_SOURCE_SPELL_FIXTURE__(${JSON.stringify(typeId)}, ${JSON.stringify(spellId)})`);
    if (!hotkeyFixture?.ok) {
      failures.push(`${typeId} ${spellId} spell hotkey fixture failed: ${JSON.stringify(hotkeyFixture)}`);
      continue;
    }
    const beforeHotkey = await readSmokeState(client);
    const hotkeyCommand = beforeHotkey.commandCard.find((candidate) => candidate.id === expected.id);
    if (classifyHotkeyCommand(beforeHotkey.commandCard, hotkeyCommand) !== "ready") {
      failures.push(`${typeId} ${spellId} should expose unambiguous source spell hotkey: card=${summarize(beforeHotkey.commandCard)}, smoke=${JSON.stringify(beforeHotkey)}`);
      continue;
    }
    const hotkey = keyCodeForCommand(hotkeyCommand);
    const hotkeyed = await evalValue(client, `window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__(${JSON.stringify(hotkey)})`);
    const afterHotkey = await readSmokeState(client);
    await validateSourceSpellExecution(`${typeId} hotkey spell ${spellId}`, hotkeyFixture, beforeHotkey, hotkeyed, afterHotkey, failures);
    hotkeys += 1;
  }
  if (failures.length > 0) {
    throw new Error(`Source spell command fixtures failed (${failures.length} failures):\n${failures.slice(0, 80).join("\n")}`);
  }
  console.log(`Source spell command fixtures checked ${checked} commands (${hotkeys} hotkeys).`);
}

async function validateSourceSpellExecution(label, fixture, before, result, after, failures) {
  if (fixture.instantCommand) {
    if (result.feedback !== "acknowledge" || result.handled !== true) {
      failures.push(`${label} should acknowledge instant spell ${fixture.instantCommand}: result=${JSON.stringify(result)}, smoke=${JSON.stringify(after)}`);
    }
    return;
  }
  if (!fixture.command || !fixture.target) {
    failures.push(`${label} fixture did not provide a targeted spell command and target: fixture=${JSON.stringify(fixture)}`);
    return;
  }
  if (result.feedback !== "click" || result.pendingWorldCommandKind !== "spell" || after.pendingWorldCommandKind !== "spell") {
    failures.push(`${label} should enter spell targeting: result=${JSON.stringify(result)}, smoke=${JSON.stringify(after)}`);
    return;
  }
  const issued = await evalValue(client, `window.__WARGUS_TS_ISSUE_PENDING_WORLD_COMMAND_AT__(${Math.round(fixture.target.x)}, ${Math.round(fixture.target.y)})`);
  const afterIssue = await readSmokeState(client);
  const beforeMana = before.firstSelectedMana ?? 0;
  const afterMana = afterIssue.firstSelectedMana ?? beforeMana;
  const progressed = (
    issued.issued === true
    && (
      afterIssue.spellEffectCount > before.spellEffectCount
      || afterMana < beforeMana
      || afterIssue.firstSelectedOrderKind === "spell-cast"
      || afterIssue.unitCount !== before.unitCount
    )
  );
  if (!progressed) {
    failures.push(`${label} should issue targeted spell at fixture target: issued=${JSON.stringify(issued)}, beforeMana=${beforeMana}, afterMana=${afterMana}, beforeEffects=${before.spellEffectCount}, after=${JSON.stringify(afterIssue)}`);
  }
}

async function verifyAllFixtureSourceCommandExecution() {
  let executed = 0;
  let skippedDisabled = 0;
  const disabledSkips = new Map();
  const failures = [];
  const unitTypeIds = sourceCommandFixtureUnitTypeIds();
  for (const typeId of unitTypeIds) {
    const root = await selectFixtureUnitType(typeId);
    const rootExpected = await expectedSourceCommands();
    for (const expected of rootExpected) {
      const command = root.commandCard.find((candidate) => candidate.id === expected.id);
      if (!command || command.disabled) {
        skippedDisabled += 1;
        recordSourceCommandSkip(disabledSkips, typeId, null, expected, command);
        continue;
      }
      const ok = await exerciseSourceCommand(typeId, null, expected, failures);
      if (ok) executed += 1;
    }

    for (const [pageCommand, pageNumber] of [["build-basic-page", 1], ["build-advanced-page", 2]]) {
      if (!hasCommand(root.commandCard, pageCommand)) {
        continue;
      }
      await selectFixtureUnitType(typeId);
      const page = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(pageCommand)})`);
      const pageExpected = await expectedSourceCommands(pageNumber);
      for (const expected of pageExpected) {
        const command = page.commandCard.find((candidate) => candidate.id === expected.id);
        if (!command || command.disabled) {
          skippedDisabled += 1;
          recordSourceCommandSkip(disabledSkips, typeId, pageCommand, expected, command);
          continue;
        }
        const ok = await exerciseSourceCommand(typeId, pageCommand, expected, failures);
        if (ok) executed += 1;
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Source command execution parity failed (${failures.length} failures):\n${failures.slice(0, 80).join("\n")}`);
  }
  return { executed, skippedDisabled, disabledSkips };
}

async function verifyAllFixtureSourceCommandHotkeys() {
  let executed = 0;
  let skippedDisabled = 0;
  let skippedNoKey = 0;
  let skippedAmbiguous = 0;
  let skippedDuplicate = 0;
  const disabledSkips = new Map();
  const noKeySkips = new Map();
  const ambiguousSkips = new Map();
  const duplicateSkips = new Map();
  const failures = [];
  const coveredHotkeys = new Set();
  const unitTypeIds = sourceCommandFixtureUnitTypeIds();
  for (const typeId of unitTypeIds) {
    const root = await selectFixtureUnitType(typeId);
    const rootExpected = await expectedSourceCommands();
    for (const expected of rootExpected) {
      const command = root.commandCard.find((candidate) => candidate.id === expected.id);
      const classification = classifyHotkeyCommand(root.commandCard, command);
      if (classification === "disabled") {
        skippedDisabled += 1;
        recordSourceCommandSkip(disabledSkips, typeId, null, expected, command);
        continue;
      }
      if (classification === "no-key") {
        skippedNoKey += 1;
        recordSourceCommandSkip(noKeySkips, typeId, null, expected, command);
        continue;
      }
      if (classification === "ambiguous") {
        skippedAmbiguous += 1;
        recordSourceCommandSkip(ambiguousSkips, typeId, null, expected, command);
        continue;
      }
      const coverageKey = sourceHotkeyCoverageKey(expected, command, null);
      if (coveredHotkeys.has(coverageKey)) {
        skippedDuplicate += 1;
        recordSourceCommandSkip(duplicateSkips, typeId, null, expected, command);
        continue;
      }
      const ok = await exerciseSourceCommandHotkey(typeId, null, expected, command, failures);
      if (ok) {
        coveredHotkeys.add(coverageKey);
        executed += 1;
      }
    }

    for (const [pageCommand, pageNumber] of [["build-basic-page", 1], ["build-advanced-page", 2]]) {
      if (!hasCommand(root.commandCard, pageCommand)) {
        continue;
      }
      await selectFixtureUnitType(typeId);
      const page = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(pageCommand)})`);
      const pageExpected = await expectedSourceCommands(pageNumber);
      for (const expected of pageExpected) {
        const command = page.commandCard.find((candidate) => candidate.id === expected.id);
        const classification = classifyHotkeyCommand(page.commandCard, command);
        if (classification === "disabled") {
          skippedDisabled += 1;
          recordSourceCommandSkip(disabledSkips, typeId, pageCommand, expected, command);
          continue;
        }
        if (classification === "no-key") {
          skippedNoKey += 1;
          recordSourceCommandSkip(noKeySkips, typeId, pageCommand, expected, command);
          continue;
        }
        if (classification === "ambiguous") {
          skippedAmbiguous += 1;
          recordSourceCommandSkip(ambiguousSkips, typeId, pageCommand, expected, command);
          continue;
        }
        const coverageKey = sourceHotkeyCoverageKey(expected, command, pageCommand);
        if (coveredHotkeys.has(coverageKey)) {
          skippedDuplicate += 1;
          recordSourceCommandSkip(duplicateSkips, typeId, pageCommand, expected, command);
          continue;
        }
        const ok = await exerciseSourceCommandHotkey(typeId, pageCommand, expected, command, failures);
        if (ok) {
          coveredHotkeys.add(coverageKey);
          executed += 1;
        }
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Source command hotkey parity failed (${failures.length} failures):\n${failures.slice(0, 80).join("\n")}`);
  }
  return { executed, skippedDisabled, skippedNoKey, skippedAmbiguous, skippedDuplicate, disabledSkips, noKeySkips, ambiguousSkips, duplicateSkips };
}

function recordSourceCommandSkip(skips, typeId, pageCommand, expected, command) {
  const key = [
    pageCommand ?? "root",
    expected.sourceAction ?? "",
    expected.sourceValue ?? "",
    expected.id ?? ""
  ].join("|");
  const entry = skips.get(key) ?? {
    count: 0,
    pageCommand: pageCommand ?? "root",
    action: expected.sourceAction ?? "",
    value: expected.sourceValue ?? "",
    id: expected.id ?? "",
    key: command?.key ?? expected.key ?? "",
    examples: [],
    typeIds: []
  };
  entry.count += 1;
  if (entry.examples.length < 4) {
    entry.examples.push(typeId);
  }
  if (!entry.typeIds.includes(typeId)) {
    entry.typeIds.push(typeId);
    entry.typeIds.sort();
  }
  skips.set(key, entry);
}

function assertExpectedDisabledSkips(label, skips) {
  const reasons = new Map();
  const unexpected = [];
  let total = 0;
  for (const entry of skips.values()) {
    total += entry.count;
    const reason = expectedDisabledSourceSkipReason(entry);
    if (!reason) {
      unexpected.push(formatDisabledSkipEntry(entry));
      continue;
    }
    reasons.set(reason, (reasons.get(reason) ?? 0) + entry.count);
  }
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unexpected disabled source commands:\n${unexpected.slice(0, 80).join("\n")}`);
  }
  return { total, entries: skips.size, reasons };
}

function expectedDisabledSourceSkipReason(entry) {
  if (entry.pageCommand !== "root") {
    return null;
  }
  if (entry.action === "harvest" && entry.id === "harvest" && onlyKnownTypes(entry, EXPECTED_GENERIC_DISABLED_HARVEST_TYPES)) {
    return "generic harvest buttons needing static-dropoff or oil fixture context";
  }
  if (entry.action === "return-goods" && entry.id === "return-goods" && onlyKnownTypes(entry, EXPECTED_EMPTY_RETURN_GOODS_TYPES)) {
    return "empty cargo return-goods fixtures covered by carrying fixtures";
  }
  if (entry.action === "unload" && entry.id === "unload-transport" && onlyKnownTypes(entry, EXPECTED_EMPTY_UNLOAD_TYPES)) {
    return "empty transport unload fixtures covered by loaded transport fixtures";
  }
  if (entry.action === "train-unit" && entry.value && entry.id === `source-train:${entry.value}`) {
    const producerTypes = EXPECTED_GENERIC_DISABLED_TRAIN_TYPES_BY_UNIT.get(entry.value);
    if (producerTypes && onlyKnownTypes(entry, producerTypes)) {
      return "generic train prerequisite fixtures covered by targeted train fixtures";
    }
  }
  if (entry.action === "research" && entry.value && entry.id === `source-research:${entry.value}`) {
    const researchTypes = SOURCE_RESEARCH_TYPES_BY_UPGRADE.get(entry.value);
    if (researchTypes && onlyKnownTypes(entry, researchTypes)) {
      return "generic prerequisite research fixtures covered by targeted research fixtures";
    }
  }
  return null;
}

function onlyKnownTypes(entry, knownTypes) {
  return entry.typeIds.length > 0 && entry.typeIds.every((typeId) => knownTypes.has(typeId));
}

function formatDisabledSkipEntry(entry) {
  const value = entry.value ? `:${entry.value}` : "";
  const key = entry.key ? ` key=${entry.key}` : "";
  return `${entry.count}x ${entry.pageCommand} ${entry.id}(${entry.action}${value}${key}) types=${entry.typeIds.join(", ") || entry.examples.join(", ")}`;
}

function formatDisabledSkipClassification(label, classification) {
  if (classification.total === 0) {
    return `${label}: none.`;
  }
  const reasons = [...classification.reasons.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([reason, count]) => `${count} ${reason}`)
    .join("; ");
  return `${label}: ${classification.total} commands / ${classification.entries} groups (${reasons}).`;
}

function formatSkipSummary(label, skips, limit = 12) {
  const entries = [...skips.values()].sort((left, right) => (
    right.count - left.count
    || left.pageCommand.localeCompare(right.pageCommand)
    || left.action.localeCompare(right.action)
    || left.id.localeCompare(right.id)
  ));
  if (entries.length === 0) {
    return `${label}: none.`;
  }
  const summary = entries.slice(0, limit).map((entry) => {
    const value = entry.value ? `:${entry.value}` : "";
    const key = entry.key ? ` key=${entry.key}` : "";
    return `${entry.count}x ${entry.pageCommand} ${entry.id}(${entry.action}${value}${key}) e.g. ${entry.examples.join(", ")}`;
  }).join("; ");
  return `${label}: ${summary}${entries.length > limit ? `; +${entries.length - limit} more` : ""}.`;
}

function buildSourceResearchTypesByUpgrade(sourceManifest) {
  const byUpgrade = new Map();
  for (const button of sourceManifest.buttons ?? []) {
    if (button.action !== "research" || !button.value) {
      continue;
    }
    const types = byUpgrade.get(button.value) ?? new Set();
    for (const typeId of button.forUnit ?? []) {
      types.add(typeId);
    }
    byUpgrade.set(button.value, types);
  }
  return byUpgrade;
}

function sourceHotkeyCoverageKey(expected, command, pageCommand) {
  return [
    pageCommand ?? "root",
    expected.sourceAction ?? "",
    expected.sourceValue ?? "",
    command.key ?? "",
    expected.id ?? ""
  ].join("|");
}

function classifyHotkeyCommand(card, command) {
  if (!command || command.disabled) {
    return "disabled";
  }
  if (!keyCodeForCommand(command)) {
    return "no-key";
  }
  const sameKeyCount = card.filter((candidate) => !candidate.disabled && candidate.key === command.key && keyCodeForCommand(candidate)).length;
  return sameKeyCount === 1 ? "ready" : "ambiguous";
}

async function exerciseSourceCommandHotkey(typeId, pageCommand, expected, command, failures) {
  await selectFixtureUnitType(typeId);
  if (pageCommand) {
    const pageResult = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(pageCommand)})`);
    if (pageResult.feedback !== "click") {
      failures.push(`${typeId} ${pageCommand} did not open a build page before hotkey ${expected.id}: ${JSON.stringify(pageResult)}`);
      return false;
    }
  }
  const before = await readSmokeState(client);
  const beforeCommand = before.commandCard.find((candidate) => candidate.id === expected.id);
  if (!beforeCommand || beforeCommand.disabled) {
    return false;
  }
  const code = keyCodeForCommand(beforeCommand);
  if (!code) {
    return false;
  }
  const result = await evalValue(client, `window.__WARGUS_TS_EXECUTE_SELECTION_HOTKEY__(${JSON.stringify(code)})`);
  const after = await readSmokeState(client);
  const context = `${typeId}${pageCommand ? ` ${pageCommand}` : " root"} hotkey ${beforeCommand.key} ${formatExpectedSourceCommand(expected)}`;
  validateSourceCommandExecution(context, expected, before, result, after, failures);
  return true;
}

function keyCodeForCommand(command) {
  if (typeof command?.key !== "string") {
    return null;
  }
  const key = command.key.toUpperCase();
  if (key === "ESC" || key === "ESCAPE") {
    return "Escape";
  }
  return /^[A-Z]$/.test(key) ? `Key${key}` : null;
}

async function exerciseSourceCommand(typeId, pageCommand, expected, failures) {
  await selectFixtureUnitType(typeId);
  if (pageCommand) {
    const pageResult = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(pageCommand)})`);
    if (pageResult.feedback !== "click") {
      failures.push(`${typeId} ${pageCommand} did not open a build page before ${expected.id}: ${JSON.stringify(pageResult)}`);
      return false;
    }
  }
  const before = await readSmokeState(client);
  const beforeCommand = before.commandCard.find((candidate) => candidate.id === expected.id);
  if (!beforeCommand) {
    failures.push(`${typeId} ${expected.id} disappeared before execution; card=${summarize(before.commandCard)}`);
    return false;
  }
  if (beforeCommand.disabled) {
    return false;
  }
  const result = await evalValue(client, `window.__WARGUS_TS_EXECUTE_HUD_COMMAND__(${JSON.stringify(expected.id)})`);
  const after = await readSmokeState(client);
  const context = `${typeId}${pageCommand ? ` ${pageCommand}` : " root"} ${formatExpectedSourceCommand(expected)}`;
  validateSourceCommandExecution(context, expected, before, result, after, failures);
  return true;
}

function validateSourceCommandExecution(context, expected, before, result, after, failures) {
  if (result.handled !== true) {
    failures.push(`${context} was not handled: result=${JSON.stringify(result)}, after=${JSON.stringify(after)}`);
    return;
  }
  if (result.feedback === "error") {
    failures.push(`${context} produced error feedback: result=${JSON.stringify(result)}, card=${summarize(after.commandCard)}`);
    return;
  }
  const action = expected.sourceAction;
  if (action === "button") {
    const expectedPage = expected.sourceValue === "1" ? 1 : expected.sourceValue === "2" ? 2 : 0;
    if (result.feedback !== "click" || result.commandPage !== expectedPage) {
      failures.push(`${context} should switch to command page ${expectedPage}, got ${JSON.stringify(result)}`);
    }
    return;
  }
  if (action === "build") {
    const expectedPendingKind = typeof expected.sourceValue === "string" && expected.sourceValue.includes("oil-platform") ? "build-oil-platform" : "build";
    if (result.feedback !== "click" || result.pendingWorldCommandKind !== expectedPendingKind || result.commandPage !== 0) {
      failures.push(`${context} should enter ${expectedPendingKind} placement, got ${JSON.stringify(result)}`);
    }
    return;
  }
  if (action === "train-unit" || action === "upgrade-to") {
    if (result.feedback !== "acknowledge" || (after.firstSelectedProductionQueueLength ?? 0) <= (before.firstSelectedProductionQueueLength ?? 0)) {
      failures.push(`${context} should queue production, before=${JSON.stringify(queueSummary(before))}, after=${JSON.stringify(queueSummary(after))}, result=${JSON.stringify(result)}`);
    }
    return;
  }
  if (action === "research") {
    if (result.feedback !== "acknowledge" || (after.firstSelectedActiveResearchCount ?? 0) <= (before.firstSelectedActiveResearchCount ?? 0)) {
      failures.push(`${context} should start research, before=${before.firstSelectedActiveResearchCount}, after=${after.firstSelectedActiveResearchCount}, result=${JSON.stringify(result)}`);
    }
    return;
  }
  if (action === "cast-spell") {
    if (result.feedback === "click" && result.pendingWorldCommandKind !== "spell") {
      failures.push(`${context} should enter spell targeting when clicked, got ${JSON.stringify(result)}`);
    }
    return;
  }
  const pendingByAction = {
    move: "move",
    attack: "attack-move",
    "attack-ground": "attack-ground",
    patrol: "patrol",
    repair: "repair",
    harvest: "harvest",
    unload: "unload-transport"
  };
  if (pendingByAction[action]) {
    if (result.feedback !== "click" || result.pendingWorldCommandKind !== pendingByAction[action]) {
      failures.push(`${context} should enter ${pendingByAction[action]} pending mode, got ${JSON.stringify(result)}`);
    }
    return;
  }
  if (["stop", "stand-ground", "explore", "return-goods"].includes(action)) {
    if (result.feedback !== "acknowledge") {
      failures.push(`${context} should acknowledge an instant command, got ${JSON.stringify(result)}`);
    }
  }
}

function queueSummary(state) {
  return {
    queue: state.firstSelectedProductionQueueLength,
    remaining: state.firstSelectedProductionQueueRemainingSeconds
  };
}

async function expectedSourceCommands(page) {
  return await evalValue(client, `window.__WARGUS_TS_EXPECTED_SOURCE_COMMANDS__(${page === undefined ? "" : JSON.stringify(page)})`);
}

function collectMissingSourceCommands(commands, expectedCommands, label, failures) {
  for (const expected of expectedCommands) {
    const actual = commands.find((command) => command.id === expected.id);
    if (!actual) {
      failures.push(`${label} missing ${formatExpectedSourceCommand(expected)}; card=${summarize(commands)}`);
      continue;
    }
    if (
      actual.sourceAction !== expected.sourceAction
      || (actual.sourceValue ?? null) !== (expected.sourceValue ?? null)
      || normalizeKey(actual.key) !== normalizeKey(expected.key)
      || (actual.icon ?? null) !== (expected.icon ?? null)
    ) {
      failures.push(`${label} ${expected.id} expected source ${formatExpectedSourceCommand(expected)}, got ${JSON.stringify(actual)}; card=${summarize(commands)}`);
    }
  }
}

function collectUnexpectedSourceCardCommands(commands, expectedCommands, label, failures) {
  if (expectedCommands.length === 0) {
    return;
  }
  const expectedIds = new Set(expectedCommands.map((command) => command.id));
  const unexpected = commands.filter((command) => !expectedIds.has(command.id));
  if (unexpected.length > 0) {
    failures.push(`${label} has unexpected non-source card commands ${unexpected.map((command) => command.id).join(", ")}; expected=${expectedCommands.map(formatExpectedSourceCommand).join(", ")}; card=${summarize(commands)}`);
  }
}

function formatExpectedSourceCommand(command) {
  const value = command.sourceValue === undefined || command.sourceValue === null ? "" : `:${command.sourceValue}`;
  const key = command.key ? ` key=${command.key}` : "";
  const icon = command.icon ? ` icon=${command.icon}` : "";
  return `${command.id}(${command.sourceAction}${value}@${command.sourceLevel ?? "-"}:${command.sourcePos ?? "-"}${key}${icon})`;
}

function normalizeKey(key) {
  return typeof key === "string" ? key.toUpperCase() : "";
}

function expectCommands(commands, ids, label) {
  for (const id of ids) {
    if (!hasCommand(commands, id)) {
      throw new Error(`${label} is missing ${id}; card=${summarize(commands)}`);
    }
  }
}

function expectCommand(commands, id, expected, label) {
  const command = commands.find((candidate) => candidate.id === id);
  if (!command) {
    throw new Error(`${label} is missing ${id}; card=${summarize(commands)}`);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (command[key] !== value) {
      throw new Error(`${label} ${id} expected ${key}=${JSON.stringify(value)}, got ${JSON.stringify(command)}; card=${summarize(commands)}`);
    }
  }
}

function expectNoCommand(commands, id, label) {
  if (hasCommand(commands, id)) {
    throw new Error(`${label} should not show ${id}; card=${summarize(commands)}`);
  }
}

function expectNoSourceAction(commands, id, label) {
  const command = commands.find((candidate) => candidate.id === id);
  if (!command) {
    throw new Error(`${label} is missing ${id}; card=${summarize(commands)}`);
  }
  if (command.sourceAction !== undefined && command.sourceAction !== null) {
    throw new Error(`${label} ${id} should be a fallback command, got ${JSON.stringify(command)}; card=${summarize(commands)}`);
  }
}

function sourceCommandFixtureUnitTypeIds() {
  const knownTypes = new Set((manifest.units ?? []).map((unit) => unit.id));
  const typeIds = new Set();
  for (const button of manifest.buttons ?? []) {
    for (const typeId of button.forUnit ?? []) {
      if (knownTypes.has(typeId)) {
        typeIds.add(typeId);
      }
    }
  }
  return [...typeIds].sort();
}

function expectValidSourceActions(commands, label) {
  const validActions = new Set(manifest.buttons.map((button) => button.action));
  for (const command of commands) {
    if (command.id === "follow") {
      if (command.sourceAction !== undefined && command.sourceAction !== null) {
        throw new Error(`${label} follow should remain a fallback command, got ${JSON.stringify(command)}; card=${summarize(commands)}`);
      }
      continue;
    }
    if (command.sourceAction !== undefined && command.sourceAction !== null && !validActions.has(command.sourceAction)) {
      throw new Error(`${label} has a command mapped to a nonexistent source action: ${JSON.stringify(command)}; card=${summarize(commands)}`);
    }
  }
}

function hasCommand(commands, id) {
  return commands.some((command) => command.id === id);
}

function summarize(commands) {
  return commands.map((command) => `${command.id}${command.disabled ? "[disabled]" : ""}@${command.sourceLevel ?? "-"}:${command.sourcePos ?? "-"}`).join(", ");
}

async function dispatchKey(client, code, key, windowsVirtualKeyCode) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}

async function evalValue(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? `Evaluation failed: ${expression}`);
  }
  return result.result?.value ?? null;
}

async function readSmokeState(client) {
  return await evalValue(client, "window.__WARGUS_TS_PUBLISH_SMOKE__?.(); window.__WARGUS_TS_SMOKE_STATE__");
}

async function waitForExpression(client, expression, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await client.send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.result?.value === true) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for browser expression: ${expression}; smoke=${JSON.stringify(await readSmokeState(client))}`);
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until ready.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function waitForPageTarget(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const targets = await fetchJson(url);
    const page = targets.find((candidate) => candidate.type === "page" && candidate.webSocketDebuggerUrl);
    if (page) {
      return page;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for a Chrome page target.");
}

async function connectDevTools(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result ?? {});
      return;
    }
    for (const handler of listeners.get(message.method) ?? []) {
      handler(message.params ?? {});
    }
  });
  return {
    on(method, handler) {
      listeners.set(method, [...(listeners.get(method) ?? []), handler]);
    },
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    waitFor(method, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
        const handler = (params) => {
          clearTimeout(timer);
          listeners.set(method, (listeners.get(method) ?? []).filter((candidate) => candidate !== handler));
          resolve(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), handler]);
      });
    },
    close() {
      socket.close();
    }
  };
}

async function stopProcess(child) {
  if (!child?.pid) {
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    return;
  }
  await delay(250);
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already stopped.
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
