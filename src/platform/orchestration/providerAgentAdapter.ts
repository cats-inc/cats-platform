import {
  resolveFullResponseText,
  type RuntimeClient,
  type RuntimeMessageResult,
  type RuntimeSendMessageInput,
  type RuntimeSessionCreateInput,
  type RuntimeSessionInfo,
} from '../runtime/client.js';
import {
  createSupervisedRuntimeSession,
  sendSupervisedRuntimeMessage,
  type RuntimeSupervisionContext,
} from '../supervision/runtimeBoundary.js';
import type { RuntimeSkillManifest } from '../runtime/client.js';
import type { ProviderAgentBoundedObservation, ProviderAgentDecision } from './providerAgentDecision.js';
import {
  PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
  validateProviderAgentBoundedObservation,
} from './providerAgentDecision.js';
import { applyProviderAgentPolicyGate } from './providerAgentPolicyGate.js';

export const PROVIDER_AGENT_ADAPTER_VERSION = 1;
export const PROVIDER_AGENT_DECISION_PROMPT_SCHEMA = 'cats.provider_agent.decision.v1' as const;

const DEFAULT_PROVIDER_AGENT_INSTRUCTIONS = [
  'Return exactly one JSON object matching the Cats provider-agent decision contract.',
  'Do not include markdown, prose, transcript text, or hidden chain-of-thought.',
  'Choose only tools present in observation.availableTools.',
  'For recovery, choose only observation.policy.allowedFallbacks.',
].join('\n');

export type ProviderAgentAdapterErrorCode =
  | 'INVALID_OBSERVATION'
  | 'INVALID_RUNTIME_RESPONSE'
  | 'INVALID_DECISION';

export interface ProviderAgentRuntimeTarget {
  provider: string;
  instance?: string | null;
  model?: string | null;
  cwd?: string | null;
  sessionId?: string | null;
  instructions?: string | null;
  skills?: RuntimeSkillManifest;
  createInput?: Omit<RuntimeSessionCreateInput, 'provider' | 'instance' | 'model' | 'cwd'>;
  sendInput?: RuntimeSendMessageInput;
}

export interface ProviderAgentAdapterInput {
  runtimeClient: RuntimeClient;
  target: ProviderAgentRuntimeTarget;
  observation: ProviderAgentBoundedObservation;
  supervision: RuntimeSupervisionContext;
}

export interface ProviderAgentAdapterResult {
  sessionId: string;
  createdSession: RuntimeSessionInfo | null;
  runtimeMessage: RuntimeMessageResult;
  decision: ProviderAgentDecision;
}

export class ProviderAgentAdapterError extends Error {
  constructor(
    readonly code: ProviderAgentAdapterErrorCode,
    message: string,
    readonly details?: string[],
  ) {
    super(details?.length ? `${message}: ${details.join('; ')}` : message);
    this.name = 'ProviderAgentAdapterError';
  }
}

export async function requestProviderAgentDecision(
  input: ProviderAgentAdapterInput,
): Promise<ProviderAgentAdapterResult> {
  const observationErrors = validateProviderAgentBoundedObservation(input.observation);
  if (observationErrors.length > 0) {
    throw new ProviderAgentAdapterError(
      'INVALID_OBSERVATION',
      'Provider-agent observation failed validation',
      observationErrors,
    );
  }

  const createdSession = input.target.sessionId
    ? null
    : await createProviderAgentSession(input);
  const sessionId = input.target.sessionId ?? createdSession?.id;
  if (!sessionId) {
    throw new ProviderAgentAdapterError(
      'INVALID_OBSERVATION',
      'Provider-agent target did not resolve a runtime session id',
    );
  }

  const runtimeMessage = await sendSupervisedRuntimeMessage({
    runtimeClient: input.runtimeClient,
    sessionId,
    content: buildProviderAgentDecisionPrompt(input.observation),
    input: {
      ...(input.target.sendInput ?? {}),
      instructions: input.target.instructions ?? DEFAULT_PROVIDER_AGENT_INSTRUCTIONS,
      context: {
        ...(input.target.sendInput?.context ?? {}),
        source: input.target.sendInput?.context?.source ?? 'automation',
        reason: input.target.sendInput?.context?.reason ?? 'provider-agent-decision',
        metadata: {
          ...(input.target.sendInput?.context?.metadata ?? {}),
          providerAgentAdapterVersion: PROVIDER_AGENT_ADAPTER_VERSION,
          providerAgentPromptSchema: PROVIDER_AGENT_DECISION_PROMPT_SCHEMA,
          providerAgentContractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
          observationId: input.observation.observationId,
          runId: input.observation.runId,
        },
      },
    },
    supervision: deriveRuntimeSupervision(input.supervision, 'decision'),
  });
  const decision = parseProviderAgentDecision(runtimeMessage);
  const policyGateResult = applyProviderAgentPolicyGate({
    observation: input.observation,
    decision,
  });
  if (policyGateResult.status === 'rejected') {
    const details = policyGateResult.error.details as { errors?: string[] } | undefined;
    throw new ProviderAgentAdapterError(
      'INVALID_DECISION',
      policyGateResult.error.message,
      details?.errors,
    );
  }
  if (policyGateResult.status === 'pending_approval') {
    throw new ProviderAgentAdapterError(
      'INVALID_DECISION',
      'Provider-agent policy gate unexpectedly returned pending approval',
      [policyGateResult.summary],
    );
  }

  return {
    sessionId,
    createdSession,
    runtimeMessage,
    decision: policyGateResult.result,
  };
}

export function buildProviderAgentDecisionPrompt(
  observation: ProviderAgentBoundedObservation,
): string {
  return JSON.stringify({
    schema: PROVIDER_AGENT_DECISION_PROMPT_SCHEMA,
    contractVersion: PROVIDER_AGENT_DECISION_CONTRACT_VERSION,
    observation,
  });
}

function createProviderAgentSession(
  input: ProviderAgentAdapterInput,
): Promise<RuntimeSessionInfo> {
  const sessionInput = {
    ...(input.target.createInput ?? {}),
    provider: input.target.provider,
    instance: input.target.instance ?? undefined,
    model: input.target.model ?? undefined,
    cwd: input.target.cwd ?? undefined,
    instructions: input.target.instructions ?? DEFAULT_PROVIDER_AGENT_INSTRUCTIONS,
    skills: input.target.skills ?? input.target.createInput?.skills,
    context: {
      ...(input.target.createInput?.context ?? {}),
      source: input.target.createInput?.context?.source ?? 'automation',
      reason: input.target.createInput?.context?.reason ?? 'provider-agent-decision-session',
      metadata: {
        ...(input.target.createInput?.context?.metadata ?? {}),
        providerAgentAdapterVersion: PROVIDER_AGENT_ADAPTER_VERSION,
        providerAgentPromptSchema: PROVIDER_AGENT_DECISION_PROMPT_SCHEMA,
        observationId: input.observation.observationId,
        runId: input.observation.runId,
      },
    },
  } as RuntimeSessionCreateInput;

  return createSupervisedRuntimeSession({
    runtimeClient: input.runtimeClient,
    input: sessionInput,
    supervision: deriveRuntimeSupervision(input.supervision, 'session'),
  });
}

function deriveRuntimeSupervision(
  supervision: RuntimeSupervisionContext,
  phase: 'session' | 'decision',
): RuntimeSupervisionContext {
  return {
    ...supervision,
    actionId: `${supervision.actionId}:${phase}`,
    reason: `${supervision.reason}:${phase}`,
  };
}

function parseProviderAgentDecision(runtimeMessage: RuntimeMessageResult): ProviderAgentDecision {
  const responseText = resolveFullResponseText(runtimeMessage.segments).trim();
  if (!responseText) {
    throw new ProviderAgentAdapterError(
      'INVALID_RUNTIME_RESPONSE',
      'Provider-agent runtime response was empty',
    );
  }

  const parsed = parseDecisionJson(responseText);
  if (!isRecord(parsed) || typeof parsed.kind !== 'string') {
    throw new ProviderAgentAdapterError(
      'INVALID_RUNTIME_RESPONSE',
      'Provider-agent runtime response did not contain a decision object',
    );
  }

  return parsed as unknown as ProviderAgentDecision;
}

function parseDecisionJson(responseText: string): unknown {
  const candidates = [
    responseText,
    extractJsonFence(responseText),
    extractOuterJsonObject(responseText),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next structured candidate.
    }
  }

  throw new ProviderAgentAdapterError(
    'INVALID_RUNTIME_RESPONSE',
    'Provider-agent runtime response was not valid JSON',
  );
}

function extractJsonFence(responseText: string): string | null {
  const match = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(responseText);
  return match?.[1]?.trim() ?? null;
}

function extractOuterJsonObject(responseText: string): string | null {
  const start = responseText.indexOf('{');
  const end = responseText.lastIndexOf('}');
  return start >= 0 && end > start ? responseText.slice(start, end + 1) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
