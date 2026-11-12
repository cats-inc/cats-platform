/** Browser-safe result; archive assets and filesystem locations stay server-owned. */
export interface ConversationArchiveResult {
  channelId: string;
  archived: boolean;
  messageCount: number;
  archiveId: string | null;
  unchanged: boolean;
}

export class ConversationArchivedError extends Error {
  readonly code = 'conversation_archived';
  constructor() { super('Restore this archived conversation before sending or changing its transcript.'); }
}

export function assertConversationWritable(channel: { status: string }): void {
  if (channel.status === 'archived') throw new ConversationArchivedError();
}
