export function buildRoomWorkflowRunId(channelId: string, turnId: string): string {
  return `run-room-routing-${channelId}-${turnId}`;
}
