export function buildRoomWorkflowRunId(channelId: string, turnId: string): string {
  return `run-room-routing-${channelId}-${turnId}`;
}

export function buildRoomWorkflowMissionId(
  channelId: string,
  turnId: string,
  targetStateId: string,
): string {
  return `mission-room-routing-${channelId}-${turnId}-${targetStateId}`;
}
