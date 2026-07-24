export interface ScoutAssignmentProvenance {
  assignmentTick: number | null;
  assignmentPlayer: number | null;
  assignmentTargetTileX: number | null;
  assignmentTargetTileY: number | null;
  assignmentTargetTileIndex: number | null;
  assignmentMapWidth: number | null;
  assignmentMapHeight: number | null;
  assignmentTileSize: number | null;
  ownerBufferValueAtAssignment: number | null;
  visibilityPlayerAtAssignment: number | null;
  visibilityBufferValueAtAssignment: number | null;
  selectedFromOwnerUnexploredAtAssignment: boolean;
}

export function normalizeScoutAssignmentProvenance(record: Record<string, unknown>): ScoutAssignmentProvenance;
