/** Browser-safe result; archive assets and filesystem locations stay server-owned. */
export interface ConversationArchiveResult {
  channelId: string;
  archived: boolean;
  messageCount: number;
  archiveId: string | null;
  unchanged: boolean;
}
