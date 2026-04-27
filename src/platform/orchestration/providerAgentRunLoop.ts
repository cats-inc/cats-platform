import type {
  RuntimeClient,
  RuntimeMessageResult,
  RuntimeSendMessageInput,
  RuntimeSessionCreateInput,
  RuntimeSessionInfo,
} from '../runtime/client.js';
import {
  createSupervisedRuntimeSession,
  decideRunLoopHandoff,
  sendSupervisedRuntimeMessage,
  type BudgetEnvelope,
  type ProviderAgentRunLoopRecord,
  type RunLoopDecisionHandoff,
  type RunLoopObservationRecord,
  type RunLoopOutcomeRecord,
  type ToolBoundaryEvidenceSink,
} from '../supervision/index.js';

export interface StartProviderAgentRunLoopInput {
  runtimeClient: RuntimeClient;
  product: string;
  surface: string;
  runId: string;
  actorRef: string;
  budget?: BudgetEnvelope;
  evidenceSink?: ToolBoundaryEvidenceSink;
  sessionActionId: string;
  sessionReason: string;
  sessionInput: RuntimeSessionCreateInput;
  messageActionId: string;
  messageReason: string;
  messageContent: string;
  messageInput?: RuntimeSendMessageInput | ((session: RuntimeSessionInfo) => RuntimeSendMessageInput);
  recordedAt: string;
}

export interface ProviderAgentRunLoopStartResult {
  session: RuntimeSessionInfo;
  message: RuntimeMessageResult;
  handoff: RunLoopDecisionHandoff;
  observation: RunLoopObservationRecord;
  outcome: RunLoopOutcomeRecord;
  record: ProviderAgentRunLoopRecord;
}

export async function startProviderAgentRunLoop(
  input: StartProviderAgentRunLoopInput,
): Promise<ProviderAgentRunLoopStartResult> {
  const session = await createSupervisedRuntimeSession({
    runtimeClient: input.runtimeClient,
    input: input.sessionInput,
    supervision: {
      product: input.product,
      surface: input.surface,
      runId: input.runId,
      actionId: input.sessionActionId,
      actorRef: input.actorRef,
      reason: input.sessionReason,
      evidenceSink: input.evidenceSink,
      budget: input.budget,
    },
  });
  const messageInput = typeof input.messageInput === 'function'
    ? input.messageInput(session)
    : input.messageInput;
  const message = await sendSupervisedRuntimeMessage({
    runtimeClient: input.runtimeClient,
    sessionId: session.id,
    content: input.messageContent,
    input: messageInput,
    supervision: {
      product: input.product,
      surface: input.surface,
      runId: input.runId,
      actionId: input.messageActionId,
      actorRef: input.actorRef,
      reason: input.messageReason,
      evidenceSink: input.evidenceSink,
      budget: input.budget,
    },
  });

  const observationRef = {
    refId: `${input.messageActionId}:provider-response`,
    source: 'provider_response' as const,
    resultStatus: 'applied' as const,
  };
  const handoff = decideRunLoopHandoff({
    runId: input.runId,
    actionId: input.messageActionId,
    primaryState: 'running',
    nextTarget: 'provider_agent_seam',
    observationRef,
  });
  const observation: RunLoopObservationRecord = {
    observationId: `${input.messageActionId}:observation`,
    actionId: input.messageActionId,
    observedAt: input.recordedAt,
    ...observationRef,
  };
  const outcome: RunLoopOutcomeRecord = {
    outcomeId: `${input.messageActionId}:outcome`,
    actionId: input.messageActionId,
    kind: 'runtime_message',
    status: 'applied',
    sessionId: session.id,
    ...(message.tokensUsed === undefined ? {} : { tokensUsed: message.tokensUsed }),
    recordedAt: input.recordedAt,
    handoff,
  };
  const record: ProviderAgentRunLoopRecord = {
    observations: [observation],
    outcomes: [outcome],
    latestHandoff: handoff,
  };

  return {
    session,
    message,
    handoff,
    observation,
    outcome,
    record,
  };
}
