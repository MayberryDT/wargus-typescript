# Path coverage inventory (Wave 5 Task B1)
Generated from HEAD worktree on perf/wave5-closeout.
Total sites: 81

## step-repath (15)

- L5923 `function stepPatrolOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = sourceAttackTargetPath(world, unit, target);`
- L6117 `function stepAttackGroundOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = findPath(world, unit, unit.order.targetX, unit.order.targe`
- L6185 `function stepFollowOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = sourceAttackTargetPath(world, unit, attackTarget);`
- L6247 `function stepDefendOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = sourceAttackTargetPath(world, unit, attackTarget);`
- L9330 `function stepBuildOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = sourceUnitInteractionPath(world, unit, building, sourceT`
- L9403 `function stepBuildOilPlatformOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = sourceUnitInteractionPath(world, unit, oilPatch, sourceT`
- L9450 `function stepRepairOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = sourceUnitInteractionPath(world, unit, target, sourceRep`
- L9618 `function stepUnloadTransportAtOrder(world: WorldState, transport: WorldUnit, tickSeconds: number): v` — `transport.order.path = findPath(world, transport, transport.order.targetX, t`
- L9623 `function stepUnloadTransportAtOrder(world: WorldState, transport: WorldUnit, tickSeconds: number): v` — `transport.order.path = findPath(world, transport, transport.order.targetX, t`
- L10479 `function stepHarvestOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);`
- L10563 `function stepHarvestOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);`
- L10582 `function stepHarvestOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `unit.order.path = findPath(world, unit, latestDropoffPoint.x, latestDropoffP`
- L10624 `function stepHarvestOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `? sourceUnitInteractionPath(world, unit, target, sourceResourceSourceRange`
- L10625 `function stepHarvestOrder(world: WorldState, unit: WorldUnit, tickSeconds: number): void {` — `: findPath(world, unit, targetX, targetY);`
- L10903 `function stepRandomMovement(world: WorldState, unit: WorldUnit): void {` — `const path = findPath(world, unit, targetX, targetY);`

## issue (7)

- L1382 `export function issueAttackGroundOrder(world: WorldState, unitId: string, x: number, y: number): boo` — `const path = inRange ? [] : findPath(world, unit, clampedX, clampedY);`
- L1483 `export function issuePatrolOrder(world: WorldState, unitId: string, x: number, y: number): boolean {` — `const path = findPath(world, unit, clampedX, clampedY);`
- L2525 `function issueReturnGoodsToDropoffOrder(world: WorldState, unitId: string, dropoffId: string): boole` — `const path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);`
- L3946 `export function issueUnloadTransportAtOrder(world: WorldState, transportId: string, x: number, y: nu` — `const path = findPath(world, transport, dropZonePoint.x, dropZonePoint.y);`
- L5050 `export function issueBuildOilPlatformOrder(world: WorldState, builderId: string, oilPatchId: string,` — `const path = sourceUnitInteractionPath(world, builder, oilPatch, sourceTouch`
- L9977 `function issueRallyOrderToTrainedUnit(world: WorldState, producer: WorldUnit, trainedUnit: WorldUnit` — `const path = sourceAttackTargetPath(world, trainedUnit, enemy);`
- L9992 `function issueRallyOrderToTrainedUnit(world: WorldState, producer: WorldUnit, trainedUnit: WorldUnit` — `const path = findPath(world, trainedUnit, producer.rallyPoint.x, producer.rall`

## ai-select (4)

- L9278 `function findAiPressurePointForUnit(world: WorldState, playerId: number, unit: WorldUnit): { x: numb` — `return candidates.find((point) => unit.kind === "fly" || findPath(world, unit,`
- L9800 `function findSourceAiScoutExplorationPath(` — `const path = findPath(world, unit, target.x, target.y);`
- L9825 `function findSourceAiFocusedExplorationPath(` — `const path = findPath(world, unit, target.x, target.y);`
- L19912 `export function runPlan014AiDepotMiningFixture(sourceWorld: WorldState): Record<string, unknown> {` — `const path = findPath(world, worker, dropoffPoint.x, dropoffPoint.y);`

## helper (22)

- L1055 `function planMoveOrder(world: WorldState, unit: WorldUnit, x: number, y: number): PlannedMoveOrder |` — `const result = findPathResult(world, unit, clampedX, clampedY);`
- L6035 `function findPatrolPathWithinSourceRange(world: WorldState, unit: WorldUnit, targetX: number, target` — `const path = findPath(world, unit, point.x, point.y);`
- L6040 `function findPatrolPathWithinSourceRange(world: WorldState, unit: WorldUnit, targetX: number, target` — `return findPath(world, unit, targetX, targetY);`
- L6295 `function findFollowPathWithinSourceRange(world: WorldState, unit: WorldUnit, target: WorldUnit, rang` — `const path = findPath(world, unit, point.x, point.y);`
- L6300 `function findFollowPathWithinSourceRange(world: WorldState, unit: WorldUnit, target: WorldUnit, rang` — `return findPath(world, unit, target.x, target.y);`
- L9858 `function findExplorationPath(world: WorldState, unit: WorldUnit): { target: { x: number; y: number }` — `const path = findPath(world, unit, target.x, target.y);`
- L9867 `function findExplorationPathWithinSourceRange(world: WorldState, unit: WorldUnit, targetX: number, t` — `const directPath = findPath(world, unit, targetX, targetY);`
- L9883 `function findExplorationPathWithinSourceRange(world: WorldState, unit: WorldUnit, targetX: number, t` — `const path = findPath(world, unit, x * world.tileSize + world.tileSize /`
- L11460 `function sourceUnitInteractionCandidatePath(world: WorldState, unit: WorldUnit, target: WorldUnit, r` — `const path = findPath(world, unit, candidate.x, candidate.y);`
- L11468 `function sourceUnitInteractionPath(world: WorldState, unit: WorldUnit, target: WorldUnit, rangePixel` — `function sourceUnitInteractionPath(world: WorldState, unit: WorldUnit, target: W`
- L11499 `function sourceAttackTargetPathResult(world: WorldState, unit: WorldUnit, target: WorldUnit): Attack` — `const result = findPathResult(world, unit, candidate.x, candidate.y);`
- L11512 `function sourceAttackTargetPath(world: WorldState, unit: WorldUnit, target: WorldUnit): Array<{ x: n` — `function sourceAttackTargetPath(world: WorldState, unit: WorldUnit, target: Worl`
- L11537 `function sourceOrderTargetPath(world: WorldState, unit: WorldUnit): Array<{ x: number; y: number }> ` — `return target ? sourceUnitInteractionPath(world, unit, target, sourceTouchRa`
- L11541 `function sourceOrderTargetPath(world: WorldState, unit: WorldUnit): Array<{ x: number; y: number }> ` — `return target ? sourceUnitInteractionPath(world, unit, target, sourceTouchRa`
- L11545 `function sourceOrderTargetPath(world: WorldState, unit: WorldUnit): Array<{ x: number; y: number }> ` — `return target ? sourceUnitInteractionPath(world, unit, target, sourceRepairR`
- L11549 `function sourceOrderTargetPath(world: WorldState, unit: WorldUnit): Array<{ x: number; y: number }> ` — `return target ? sourceUnitInteractionPath(world, unit, target, sourceResourc`
- L11553 `function sourceOrderTargetPath(world: WorldState, unit: WorldUnit): Array<{ x: number; y: number }> ` — `return target ? sourceAttackTargetPath(world, unit, target) : [];`
- L11564 `function sourceOrderTargetPath(world: WorldState, unit: WorldUnit): Array<{ x: number; y: number }> ` — `const destination = findPathResult(world, unit, unit.order.targetX, unit.ord`
- L11567 `function sourceOrderTargetPath(world: WorldState, unit: WorldUnit): Array<{ x: number; y: number }> ` — `return findPath(world, unit, unit.order.targetX, unit.order.targetY);`
- L11635 `function findNearestKnownReachableGoldMineAroundDepot(` — `|| sourceUnitInteractionPath(world, unit, candidate, sourceResourceSourceR`
- L12914 `function findBetterAttackPositionPath(world: WorldState, unit: WorldUnit, targetX: number, targetY: ` — `const path = findPath(world, unit, point.x, point.y);`
- L12940 `function findSpellCastPathWithinSourceRange(world: WorldState, caster: WorldUnit, targetX: number, t` — `const path = findPath(world, caster, point.x, point.y);`

## can-check (18)

- L1433 `export function canIssueAttackGroundAt(world: WorldState, unit: WorldUnit, x: number, y: number): bo` — `return isGroundTargetInRange(world, unit, clampedX, clampedY) || findPath(worl`
- L1448 `export function canIssueQueueAttackTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): bo` — `return isInAttackRange(pathingUnit, target, world) || sourceAttackTargetPath(w`
- L1531 `export function canIssuePatrolAt(world: WorldState, unit: WorldUnit, x: number, y: number): boolean ` — `return findPath(world, unit, clampedX, clampedY).length > 0;`
- L2092 `export function canIssueRepairTarget(world: WorldState, worker: WorldUnit, target: WorldUnit): boole` — `&& (isInRepairRange(worker, target, world) || sourceUnitInteractionPath(worl`
- L2101 `export function canIssueQueueRepairTarget(world: WorldState, worker: WorldUnit, target: WorldUnit): ` — `return isInRepairRange(pathingWorker, target, world) || sourceUnitInteractionP`
- L2139 `export function canIssueLoadIntoTransportTarget(world: WorldState, unit: WorldUnit, transport: World` — `&& (canLoadIntoTransport(transport, unit) || findPath(world, unit, transport`
- L2148 `export function canIssueQueueLoadIntoTransportTarget(world: WorldState, unit: WorldUnit, transport: ` — `return canLoadIntoTransport(transport, pathingUnit) || findPath(world, pathing`
- L2221 `export function canIssueFollowTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): boolean` — `&& (isInFollowRange(unit, target) || findPath(world, unit, target.x, target.`
- L2230 `export function canIssueQueueFollowTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): bo` — `return isInFollowRange(pathingUnit, target) || findPath(world, pathingUnit, ta`
- L2325 `export function canIssueQueueHarvestTarget(world: WorldState, unit: WorldUnit, target: WorldUnit): b` — `return isInResourceSourceRange(world, pathingUnit, target) || sourceUnitIntera`
- L2377 `export function canIssueQueueHarvestWoodAt(world: WorldState, unit: WorldUnit, tileX: number, tileY:` — `|| findPath(world, pathingUnit, target.x, target.y).length > 0;`
- L2391 `export function canIssueQueueReturnGoodsOrder(world: WorldState, unit: WorldUnit, targetId: string |` — `return findPath(world, pathingUnit, dropoffPoint.x, dropoffPoint.y).length > 0`
- L2514 `export function canIssueReturnGoodsOrder(world: WorldState, unit: WorldUnit): boolean {` — `const path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);`
- L3979 `export function canIssueUnloadTransportAt(world: WorldState, transport: WorldUnit, x: number, y: num` — `return findPath(world, transport, dropZonePoint.x, dropZonePoint.y).length > 0`
- L3995 `export function canIssueQueueUnloadTransportAt(world: WorldState, transport: WorldUnit, x: number, y` — `return findPath(world, pathingTransport, dropZonePoint.x, dropZonePoint.y).len`
- L5152 `export function canIssueBuildOilPlatformAt(world: WorldState, builder: WorldUnit, oilPatch: WorldUni` — `&& (isInTouchRange(builder, oilPatch, world) || sourceUnitInteractionPath(wo`
- L11321 `function canReachQueuedDestination(world: WorldState, unit: WorldUnit, x: number, y: number): boolea` — `return findPath(world, pathingUnit, x, y).length > 0;`
- L18652 `export function canPlaceReachableBuilding(world: WorldState, builder: WorldUnit, buildingDefinition:` — `return sourceUnitInteractionPath(world, builder, building, sourceTouchRange(`

## other (15)

- L5024 `function startBuildingFoundation(world: WorldState, builder: WorldUnit, player: WorldState["players"` — `const path = sourceUnitInteractionPath(world, builder, building, sourceTouchRa`
- L5073 `function startQueuedBuildOilPlatformOrder(world: WorldState, builder: WorldUnit, oilPatchId: string,` — `const path = sourceUnitInteractionPath(world, builder, oilPatch, sourceTouch`
- L5273 `function startOilPlatformConstruction(world: WorldState, builder: WorldUnit, oilPatch: WorldUnit, pl` — `const path = findPath(world, builder, platform.x, platform.y);`
- L10965 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = findPath(world, unit, followTarget.x, followTarget.y);`
- L11001 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = findPath(world, unit, transport.x, transport.y);`
- L11023 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = sourceUnitInteractionPath(world, unit, repairTarget, sourceRe`
- L11073 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = sourceUnitInteractionPath(world, unit, resourceTarget, source`
- L11106 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = findPath(world, unit, woodTarget.x, woodTarget.y);`
- L11139 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = findPath(world, unit, dropoffPoint.x, dropoffPoint.y);`
- L11168 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = inRange ? [] : sourceAttackTargetPath(world, unit, attackTarg`
- L11229 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = inRange ? [] : findPath(world, unit, target.x, target.y);`
- L11251 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = findPath(world, unit, dropZonePoint.x, dropZonePoint.y);`
- L11273 `function startNextQueuedMove(world: WorldState, unit: WorldUnit): void {` — `const path = findPath(world, unit, target.x, target.y);`
- L11740 `function isReachableWoodTileForUnit(world: WorldState, unit: WorldUnit, tileX: number, tileY: number` — `const path = findPath(world, unit, target.x, target.y);`
- L18685 `function inspectBuildSiteApproach(world: WorldState, builder: WorldUnit, buildingDefinition: WargusU` — `path: sourceUnitInteractionPath(world, builder, probe, sourceTouchRange(wo`

