export function deriveSegmentTiming(startedAt, { segmentLimitMs, cleanupReserveMs, returnMarginMs }) {
  for (const [label, value] of Object.entries({ startedAt, segmentLimitMs, cleanupReserveMs, returnMarginMs })) {
    if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  }
  if (segmentLimitMs <= 0 || cleanupReserveMs <= 0 || returnMarginMs <= 0 || cleanupReserveMs + returnMarginMs >= segmentLimitMs) {
    throw new Error("segment timing must leave positive work, cleanup, and return budgets");
  }
  const externalDeadline = startedAt + segmentLimitMs;
  const completionDeadline = externalDeadline - returnMarginMs;
  return {
    startedAt,
    externalDeadline,
    completionDeadline,
    cleanupStartAt: completionDeadline - cleanupReserveMs
  };
}

export function pageWorkDeadline(pageStartedAt, pageLimitMs, timing) {
  if (!Number.isFinite(pageStartedAt) || !Number.isFinite(pageLimitMs) || pageLimitMs <= 0) {
    throw new Error("page timing must be finite and positive");
  }
  return Math.min(pageStartedAt + pageLimitMs, timing.cleanupStartAt);
}

export function boundedAwaitMs(deadline, now, maximumMs) {
  const remaining = deadline - now;
  if (!(remaining > 0)) throw new Error(`deadline exhausted by ${Math.max(0, -remaining)}ms`);
  if (!Number.isFinite(maximumMs) || maximumMs <= 0) throw new Error("maximum await must be finite and positive");
  return Math.max(1, Math.min(maximumMs, remaining));
}

export function validateScoutDestinationProvenance(scout, { expectedPlayer, observationTick }) {
  if (!scout || typeof scout !== "object") throw new Error("scout provenance is missing");
  if (scout.assignmentPlayer !== expectedPlayer) {
    throw new Error(`scout assignment player ${scout.assignmentPlayer} does not match AI player ${expectedPlayer}`);
  }
  if (!Number.isInteger(scout.assignmentTick) || scout.assignmentTick < 0 || scout.assignmentTick > observationTick) {
    throw new Error(`scout assignment tick ${scout.assignmentTick} is invalid at observation ${observationTick}`);
  }
  for (const field of ["assignmentTargetTileX", "assignmentTargetTileY", "assignmentTargetTileIndex", "assignmentMapWidth"]) {
    if (!Number.isInteger(scout[field]) || scout[field] < 0) throw new Error(`scout ${field} must be a non-negative integer`);
  }
  if (scout.assignmentMapWidth <= 0) throw new Error("scout assignment map width must be positive");
  const expectedIndex = scout.assignmentTargetTileY * scout.assignmentMapWidth + scout.assignmentTargetTileX;
  if (scout.assignmentTargetTileIndex !== expectedIndex) {
    throw new Error(`scout tile index ${scout.assignmentTargetTileIndex} does not match ${expectedIndex}`);
  }
  if (scout.ownerBufferValueAtAssignment !== 0 || scout.selectedFromOwnerUnexploredAtAssignment !== true) {
    throw new Error(`scout owner buffer byte must be 0 before selection, got ${scout.ownerBufferValueAtAssignment}`);
  }
  if (!Number.isInteger(scout.visibilityPlayerAtAssignment) || !Number.isInteger(scout.visibilityBufferValueAtAssignment)) {
    throw new Error("scout visibility-buffer comparison is missing");
  }
  if (!Number.isFinite(scout.targetX) || !Number.isFinite(scout.targetY)) throw new Error("scout target coordinates are missing");
  return { ...scout };
}

export function correlateNextPressureContact({ launches, acceptedContacts, candidateOrders, observationTick }) {
  const expectedSizes = [1, 4, 16];
  const seenUnitIds = new Set();
  for (let index = 0; index < launches.length; index += 1) {
    const launch = launches[index];
    if (index >= expectedSizes.length || launch.ordinal !== index + 1 || launch.unitIds?.length !== expectedSizes[index]) {
      throw new Error(`pressure launch ${index + 1} must contain literal size ${expectedSizes[index] ?? "none"}`);
    }
    for (const unitId of launch.unitIds) {
      if (seenUnitIds.has(unitId)) throw new Error(`reused launch unit id ${unitId}`);
      seenUnitIds.add(unitId);
    }
  }
  for (let index = 0; index < acceptedContacts.length; index += 1) {
    const contact = acceptedContacts[index];
    const launch = launches[index];
    if (!contact || !launch || contact.launchOrdinal !== index + 1 || !launch.unitIds.includes(contact.attackerId)) {
      throw new Error(`accepted pressure contact ${index + 1} is not correlated to its launch`);
    }
    if (contact.observedTick < launch.launchedTick || (index > 0 && contact.observedTick <= acceptedContacts[index - 1].observedTick)) {
      throw new Error(`accepted pressure contact ${index + 1} violates launch/contact ordering`);
    }
  }
  const launch = launches[acceptedContacts.length];
  if (!launch) return null;
  const previousContactTick = acceptedContacts.at(-1)?.observedTick ?? -1;
  if (observationTick < launch.launchedTick || observationTick <= previousContactTick) return null;
  const launchIds = new Set(launch.unitIds);
  const contact = [...candidateOrders]
    .filter((entry) => launchIds.has(entry.attackerId)
      && (entry.orderKind === "attack" || entry.orderKind === "attack-move")
      && typeof entry.targetId === "string"
      && entry.targetId.length > 0
      && entry.observedTick === observationTick)
    .sort((left, right) => left.attackerId.localeCompare(right.attackerId))[0];
  if (!contact) return null;
  return {
    launchOrdinal: launch.ordinal,
    launchSize: launch.unitIds.length,
    launchTick: launch.launchedTick,
    launchUnitIds: [...launch.unitIds],
    attackerId: contact.attackerId,
    targetId: contact.targetId,
    orderKind: contact.orderKind,
    observedTick: observationTick
  };
}

export function finalizeAttemptAudit({
  selectedPort,
  serverPid,
  browserPid,
  ownedServerPids,
  ownedBrowserPids,
  terminationAttempts,
  listenerClear,
  cleanupForced,
  cleanupReasons,
  cleanupErrors,
  cleanupStartedAtMs,
  cleanupFinishedAtMs,
  segmentStartedAtMs,
  segmentFinishedAtMs
}) {
  const pids = (values) => [...new Set((values ?? []).filter((value) => Number.isInteger(value) && value > 0))].sort((left, right) => left - right);
  const normalizedServerPids = pids([serverPid, ...(ownedServerPids ?? [])]);
  const normalizedBrowserPids = pids([browserPid, ...(ownedBrowserPids ?? [])]);
  const ownedPids = pids([...normalizedServerPids, ...normalizedBrowserPids]);
  const normalizedTerminationAttempts = (terminationAttempts ?? []).map((attempt) => ({
    reason: attempt.reason ?? null,
    requestedPids: pids(attempt.requestedPids),
    termSignaledPids: pids(attempt.termSignaledPids),
    killSignaledPids: pids(attempt.killSignaledPids),
    stoppedPids: pids(attempt.stoppedPids),
    remainingPids: pids(attempt.remainingPids)
  }));
  const stoppedPids = pids(normalizedTerminationAttempts.flatMap((attempt) => attempt.stoppedPids)).filter((pid) => ownedPids.includes(pid));
  const explicitlyRemaining = new Set(normalizedTerminationAttempts.flatMap((attempt) => attempt.remainingPids));
  const remainingPids = ownedPids.filter((pid) => explicitlyRemaining.has(pid) || !stoppedPids.includes(pid));
  const normalizedListenerClear = {
    port: listenerClear?.port ?? selectedPort,
    clear: listenerClear?.clear === true,
    checkedAtMs: Number.isFinite(listenerClear?.checkedAtMs) ? listenerClear.checkedAtMs : null,
    error: listenerClear?.error ?? null
  };
  const normalizedErrors = [...new Set((cleanupErrors ?? []).map(String))];
  if (normalizedListenerClear.port !== selectedPort) normalizedErrors.push(`listener proof port ${normalizedListenerClear.port} does not match ${selectedPort}`);
  const cleanupStatus = normalizedListenerClear.clear && remainingPids.length === 0 && normalizedErrors.length === 0 ? "complete" : "incomplete";
  return {
    selectedPort,
    serverPid: Number.isInteger(serverPid) && serverPid > 0 ? serverPid : null,
    browserPid: Number.isInteger(browserPid) && browserPid > 0 ? browserPid : null,
    ownedServerPids: normalizedServerPids,
    ownedBrowserPids: normalizedBrowserPids,
    ownedPids,
    stoppedPids,
    remainingPids,
    terminationAttempts: normalizedTerminationAttempts,
    listenerClear: normalizedListenerClear,
    cleanupForced: cleanupForced === true,
    cleanupReasons: [...new Set((cleanupReasons ?? []).map(String))],
    cleanupErrors: normalizedErrors,
    cleanupStatus,
    cleanupStartedAtMs,
    cleanupFinishedAtMs,
    segmentStartedAtMs,
    segmentFinishedAtMs,
    segmentWallMs: segmentFinishedAtMs - segmentStartedAtMs
  };
}
