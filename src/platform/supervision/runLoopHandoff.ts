import type {
  RunPrimaryState,
  ToolResultStatus,
} from './contracts.js';
import type { SupervisionRejectionCode } from './errors.js';

export const RUN_LOOP_HANDOFF_TARGET_VALUES = [
  'provider_agent_seam',
  'weak_worker_tool_boundary',
] as const;

export type RunLoopHandoffTarget = (typeof RUN_LOOP_HANDOFF_TARGET_VALUES)[number];

export const RUN_LOOP_OBSERVATION_SOURCE_VALUES = [
  'provider_response',
  'tool_result',
  'weak_worker_result',
] as const;

export type RunLoopObservationSource = (typeof RUN_LOOP_OBSERVATION_SOURCE_VALUES)[number];

export interface RunLoopObservationRef {
  refId: string;
  source: RunLoopObservationSource;
  evidenceRef?: string;
  summaryRef?: string;
  resultStatus?: ToolResultStatus;
  errorCode?: SupervisionRejectionCode;
}

export interface RunLoopObservationRecord extends RunLoopObservationRef {
  observationId: string;
  actionId: string;
  observedAt: string;
}

export interface RunLoopOutcomeRecord {
  outcomeId: string;
  actionId: string;
  kind: 'runtime_message';
  status: ToolResultStatus;
  sessionId: string;
  tokensUsed?: number;
  recordedAt: string;
  handoff: RunLoopDecisionHandoff;
}

export interface ProviderAgentRunLoopRecord {
  observations: RunLoopObservationRecord[];
  outcomes: RunLoopOutcomeRecord[];
  latestHandoff: RunLoopDecisionHandoff | null;
}

export interface DecideRunLoopHandoffInput {
  runId: string;
  actionId: string;
  primaryState: RunPrimaryState;
  nextTarget?: RunLoopHandoffTarget;
  observationRef?: RunLoopObservationRef;
  weakWorkerToolName?: string;
}

export type RunLoopDecisionHandoff =
  | {
      kind: 'provider_agent_seam';
      runId: string;
      actionId: string;
      observationRef: RunLoopObservationRef;
    }
  | {
      kind: 'weak_worker_tool_boundary';
      runId: string;
      actionId: string;
      observationRef: RunLoopObservationRef;
      toolName: string;
    }
  | {
      kind: 'terminal';
      runId: string;
      actionId: string;
      primaryState: Extract<RunPrimaryState, 'completed' | 'failed' | 'cancelled'>;
    };

export function decideRunLoopHandoff(
  input: DecideRunLoopHandoffInput,
): RunLoopDecisionHandoff {
  validateRequiredString('runId', input.runId);
  validateRequiredString('actionId', input.actionId);

  if (isTerminalPrimaryState(input.primaryState)) {
    return {
      kind: 'terminal',
      runId: input.runId,
      actionId: input.actionId,
      primaryState: input.primaryState,
    };
  }

  if (input.nextTarget === undefined) {
    throw new Error('nextTarget is required for non-terminal run-loop handoff.');
  }
  if (input.observationRef === undefined) {
    throw new Error('observationRef is required for non-terminal run-loop handoff.');
  }

  validateObservationRef(input.observationRef);

  if (input.nextTarget === 'weak_worker_tool_boundary') {
    const toolName = input.weakWorkerToolName ?? '';
    validateRequiredString('weakWorkerToolName', toolName);

    return {
      kind: 'weak_worker_tool_boundary',
      runId: input.runId,
      actionId: input.actionId,
      observationRef: input.observationRef,
      toolName,
    };
  }

  return {
    kind: 'provider_agent_seam',
    runId: input.runId,
    actionId: input.actionId,
    observationRef: input.observationRef,
  };
}

function validateObservationRef(value: RunLoopObservationRef): void {
  const rawContentKeys = Object.keys(value).filter((key) =>
    /(?:raw|transcript|message|prompt|body|content|responseText)/i.test(key),
  );
  if (rawContentKeys.length > 0) {
    throw new Error(
      `run-loop observationRef must be metadata-only; forbidden keys: ${
        rawContentKeys.join(', ')
      }`,
    );
  }

  validateRequiredString('observationRef.refId', value.refId);
  if (!RUN_LOOP_OBSERVATION_SOURCE_VALUES.includes(value.source)) {
    throw new Error(`Unsupported run-loop observation source: ${value.source}`);
  }
  if (value.evidenceRef !== undefined) {
    validateRequiredString('observationRef.evidenceRef', value.evidenceRef);
  }
  if (value.summaryRef !== undefined) {
    validateRequiredString('observationRef.summaryRef', value.summaryRef);
  }
}

function validateRequiredString(field: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}

function isTerminalPrimaryState(
  state: RunPrimaryState,
): state is Extract<RunPrimaryState, 'completed' | 'failed' | 'cancelled'> {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}
