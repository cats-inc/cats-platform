/** Read-only engine facts. Runtime run IDs remain separate from product turn/lane IDs. */
export interface ConversationExecutionBinding {
  sessionId: string;
  turnId: string;
  laneId: string;
  runId: string;
  targetStateId: string | null;
}

export interface ConversationExecutionAttempt {
  sessionId: string;
  current: boolean;
  attached: boolean;
  startedAt: string | null;
  bindings: ConversationExecutionBinding[];
  activeBindings: ConversationExecutionBinding[];
}

export interface ConversationExecutionParticipant {
  participantId: string;
  canonicalParticipantId: string;
  sourceKind: string;
  sourceRefId: string | null;
  name: string;
  coordinator: boolean;
  attempts: ConversationExecutionAttempt[];
}

export interface ConversationExecutionInspection {
  conversationId: string;
  channelId: string;
  origin: string;
  owned: boolean;
  rootPath: string | null;
  participants: ConversationExecutionParticipant[];
  /** Changes when attribution, cleanup or selection changes; not an execution identity. */
  bindingKey: string;
  truncated: boolean;
}

export interface ConversationExecutionInspector {
  read(conversationId: string): Promise<ConversationExecutionInspection | null>;
  subscribe?(listener: () => void): () => void;
}
