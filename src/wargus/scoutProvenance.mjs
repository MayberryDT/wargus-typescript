function nullableNonNegativeInteger(value) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : -1;
  return numeric >= 0 ? numeric : null;
}

export function normalizeScoutAssignmentProvenance(record) {
  return {
    assignmentTick: nullableNonNegativeInteger(record.assignmentTick),
    assignmentPlayer: nullableNonNegativeInteger(record.assignmentPlayer),
    assignmentTargetTileX: nullableNonNegativeInteger(record.assignmentTargetTileX),
    assignmentTargetTileY: nullableNonNegativeInteger(record.assignmentTargetTileY),
    assignmentTargetTileIndex: nullableNonNegativeInteger(record.assignmentTargetTileIndex),
    assignmentMapWidth: nullableNonNegativeInteger(record.assignmentMapWidth),
    assignmentMapHeight: nullableNonNegativeInteger(record.assignmentMapHeight),
    assignmentTileSize: nullableNonNegativeInteger(record.assignmentTileSize),
    ownerBufferValueAtAssignment: nullableNonNegativeInteger(record.ownerBufferValueAtAssignment),
    visibilityPlayerAtAssignment: nullableNonNegativeInteger(record.visibilityPlayerAtAssignment),
    visibilityBufferValueAtAssignment: nullableNonNegativeInteger(record.visibilityBufferValueAtAssignment),
    selectedFromOwnerUnexploredAtAssignment: record.selectedFromOwnerUnexploredAtAssignment === true
  };
}
