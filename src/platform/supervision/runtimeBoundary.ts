import type {
  RuntimeClient,
  RuntimeMessageResult,
  RuntimeSendMessageInput,
  RuntimeSessionCreateInput,
  RuntimeSessionInfo,
  RuntimeSessionInvocationContext,
} from '../runtime/client.js';
import {
  createInMemoryToolEvidenceSink,
  createToolBoundary,
  type ToolBoundaryEvidenceSink,
} from './toolBoundary.js';
import {
  createSupervisedToolRegistry,
} from './toolRegistry.js';
import type {
  BudgetEnvelope,
  SupervisedToolManifest,
  SupervisionPolicySnapshot,
  ToolResult,
} from './contracts.js';
import { DEFAULT_SUPERVISION_SCHEMA_VERSION } from './contracts.js';

export const RUNTIME_SESSION_CREATE_TOOL = 'cats.runtime.session.create' as const;
export const RUNTIME_MESSAGE_SEND_TOOL = 'cats.runtime.message.send' as const;
export const RUNTIME_SUPERVISION_BOUNDARY = 'cats-supervision-runtime-boundary' as const;

export interface RuntimeSupervisionContext {
  product: 'cats-chat' | 'cats-code' | string;
  surface: string;
  runId: string;
  actionId: string;
  actorRef: string;
  reason: string;
  policySnapshot?: SupervisionPolicySnapshot;
  evidenceSink?: ToolBoundaryEvidenceSink;
  budget?: BudgetEnvelope;
}

export interface SupervisedRuntimeSessionCreateInput {
  runtimeClient: RuntimeClient;
  input: RuntimeSessionCreateInput;
  supervision: RuntimeSupervisionContext;
}

export interface SupervisedRuntimeMessageSendInput {
  runtimeClient: RuntimeClient;
  sessionId: string;
  content: string;
  input?: RuntimeSendMessageInput;
  supervision: RuntimeSupervisionContext;
}

export class RuntimeSupervisionRejectedError extends Error {
  constructor(
    readonly toolName: string,
    readonly rejectionCode: string,
    message: string,
  ) {
    super(`${toolName} rejected: ${rejectionCode} ${message}`);
    this.name = 'RuntimeSupervisionRejectedError';
  }
}

interface RuntimeMessageSendToolInput {
  sessionId: string;
  content: string;
  input?: RuntimeSendMessageInput;
}

export function createRuntimeSupervisionManifests(): SupervisedToolManifest[] {
  return [
    {
      schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
      name: RUNTIME_SESSION_CREATE_TOOL,
      manifestVersion: '1.0',
      description: 'Create a cats-runtime session under supervision.',
      sideEffect: 'expensive',
      preflight: 'available',
      blocking: 'blocking',
      cancellation: 'not_supported',
      approval: 'policy',
      evidence: 'summary',
      failureCodes: ['E_TOOL_SCOPE_DENIED', 'E_PRECHECK_FAILED', 'E_BUDGET_EXCEEDED'],
      inputSchema: {
        id: `${RUNTIME_SESSION_CREATE_TOOL}.input`,
        version: '1.0',
        format: 'json_schema',
      },
      outputSchema: {
        id: `${RUNTIME_SESSION_CREATE_TOOL}.output`,
        version: '1.0',
        format: 'json_schema',
      },
    },
    {
      schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
      name: RUNTIME_MESSAGE_SEND_TOOL,
      manifestVersion: '1.0',
      description: 'Send a message to cats-runtime under supervision.',
      sideEffect: 'expensive',
      preflight: 'available',
      blocking: 'blocking',
      cancellation: 'best_effort',
      approval: 'policy',
      evidence: 'summary',
      failureCodes: ['E_TOOL_SCOPE_DENIED', 'E_PRECHECK_FAILED', 'E_BUDGET_EXCEEDED'],
      inputSchema: {
        id: `${RUNTIME_MESSAGE_SEND_TOOL}.input`,
        version: '1.0',
        format: 'json_schema',
      },
      outputSchema: {
        id: `${RUNTIME_MESSAGE_SEND_TOOL}.output`,
        version: '1.0',
        format: 'json_schema',
      },
    },
  ];
}

export async function createSupervisedRuntimeSession(
  input: SupervisedRuntimeSessionCreateInput,
): Promise<RuntimeSessionInfo> {
  const boundary = createRuntimeBoundary(input.supervision);
  const result = await boundary.invoke<RuntimeSessionCreateInput, RuntimeSessionInfo>({
    toolName: RUNTIME_SESSION_CREATE_TOOL,
    input: withRuntimeSupervisionContext(
      input.input,
      input.supervision,
      RUNTIME_SESSION_CREATE_TOOL,
    ),
    actionId: input.supervision.actionId,
    runId: input.supervision.runId,
    actorRef: input.supervision.actorRef,
    grant: {
      parentToolScope: 'broad_write',
      policyToolScope: 'broad_write',
    },
    policySnapshot: input.supervision.policySnapshot,
    execute: async (toolInput) => ({
      status: 'applied',
      result: await input.runtimeClient.createSession(toolInput),
    }),
  });

  return requireAppliedToolResult(result, RUNTIME_SESSION_CREATE_TOOL);
}

export async function sendSupervisedRuntimeMessage(
  input: SupervisedRuntimeMessageSendInput,
): Promise<RuntimeMessageResult> {
  const boundary = createRuntimeBoundary(input.supervision);
  const result = await boundary.invoke<RuntimeMessageSendToolInput, RuntimeMessageResult>({
    toolName: RUNTIME_MESSAGE_SEND_TOOL,
    input: {
      sessionId: input.sessionId,
      content: input.content,
      input: withRuntimeSupervisionContext(
        input.input ?? {},
        input.supervision,
        RUNTIME_MESSAGE_SEND_TOOL,
      ),
    },
    actionId: input.supervision.actionId,
    runId: input.supervision.runId,
    actorRef: input.supervision.actorRef,
    grant: {
      parentToolScope: 'broad_write',
      policyToolScope: 'broad_write',
    },
    policySnapshot: input.supervision.policySnapshot,
    execute: async (toolInput) => ({
      status: 'applied',
      result: await input.runtimeClient.sendMessage(
        toolInput.sessionId,
        toolInput.content,
        toolInput.input,
      ),
    }),
  });

  return requireAppliedToolResult(result, RUNTIME_MESSAGE_SEND_TOOL);
}

function createRuntimeBoundary(supervision: RuntimeSupervisionContext) {
  const registry = createSupervisedToolRegistry();
  for (const manifest of createRuntimeSupervisionManifests()) {
    registry.register(manifest);
  }

  return createToolBoundary({
    registry,
    evidenceSink: supervision.evidenceSink ?? createInMemoryToolEvidenceSink(),
  });
}

function withRuntimeSupervisionContext<TInput extends {
  context?: RuntimeSessionInvocationContext;
}>(
  input: TInput,
  supervision: RuntimeSupervisionContext,
  toolName: typeof RUNTIME_SESSION_CREATE_TOOL | typeof RUNTIME_MESSAGE_SEND_TOOL,
): TInput {
  const metadata = {
    ...(input.context?.metadata ?? {}),
    supervisionBoundary: RUNTIME_SUPERVISION_BOUNDARY,
    supervisionProduct: supervision.product,
    supervisionSurface: supervision.surface,
    supervisionRunId: supervision.runId,
    supervisionActionId: supervision.actionId,
    supervisionToolName: toolName,
    supervisionReason: supervision.reason,
  };

  return {
    ...input,
    context: {
      ...(input.context ?? {}),
      metadata,
    },
  };
}

function requireAppliedToolResult<TResult>(
  result: ToolResult<TResult>,
  toolName: string,
): TResult {
  if (result.status === 'applied') {
    return result.result;
  }
  if (result.status === 'rejected') {
    throw new RuntimeSupervisionRejectedError(
      toolName,
      result.error.code,
      result.error.message,
    );
  }

  throw new Error(`${toolName} returned pending approval unexpectedly.`);
}
