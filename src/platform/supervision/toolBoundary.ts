import type {
  SupervisedToolManifest,
  ToolResult,
  ToolResultStatus,
} from './contracts.js';
import type {
  SupervisedToolRegistry,
  ToolSurfaceGrant,
} from './toolRegistry.js';

export interface ToolBoundaryEvidenceEvent {
  eventId: string;
  actionId: string;
  runId: string;
  toolName: string;
  status: ToolResultStatus;
  occurredAt: string;
  rejectionCode?: string;
  summary?: string;
}

export interface ToolBoundaryEvidenceSink {
  append(event: ToolBoundaryEvidenceEvent): void;
  read(): ToolBoundaryEvidenceEvent[];
}

export interface ToolBoundaryExecutionContext {
  actionId: string;
  runId: string;
  actorRef: string;
  manifest: SupervisedToolManifest;
}

export type SupervisedToolExecutor<TInput, TOutput> = (
  input: TInput,
  context: ToolBoundaryExecutionContext,
) => ToolResult<TOutput> | Promise<ToolResult<TOutput>>;

export interface SupervisedToolInvocation<TInput, TOutput> {
  toolName: string;
  input: TInput;
  actionId: string;
  runId: string;
  actorRef: string;
  grant: ToolSurfaceGrant;
  execute: SupervisedToolExecutor<TInput, TOutput>;
}

export interface ToolBoundary {
  invoke<TInput, TOutput>(
    invocation: SupervisedToolInvocation<TInput, TOutput>,
  ): Promise<ToolResult<TOutput>>;
}

export interface ToolBoundaryOptions {
  registry: SupervisedToolRegistry;
  evidenceSink: ToolBoundaryEvidenceSink;
  now?: () => string;
}

export function createInMemoryToolEvidenceSink(): ToolBoundaryEvidenceSink {
  const events: ToolBoundaryEvidenceEvent[] = [];

  return {
    append(event) {
      events.push(event);
    },
    read() {
      return [...events];
    },
  };
}

export function createToolBoundary(options: ToolBoundaryOptions): ToolBoundary {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async invoke<TInput, TOutput>(invocation: SupervisedToolInvocation<TInput, TOutput>) {
      const authorization = options.registry.authorize(invocation.toolName, invocation.grant);

      if (authorization.status !== 'applied') {
        appendBoundaryEvidence(options.evidenceSink, now, invocation, authorization);
        return authorization;
      }

      const manifest = authorization.result;

      try {
        const result = await invocation.execute(invocation.input, {
          actionId: invocation.actionId,
          runId: invocation.runId,
          actorRef: invocation.actorRef,
          manifest,
        });
        appendBoundaryEvidence(options.evidenceSink, now, invocation, result);
        return result;
      } catch (error) {
        const result: ToolResult<TOutput> = {
          status: 'rejected',
          error: {
            code: 'E_PRECHECK_FAILED',
            message: formatToolExecutionError(error),
          },
        };
        appendBoundaryEvidence(options.evidenceSink, now, invocation, result);
        return result;
      }
    },
  };
}

function appendBoundaryEvidence<TInput, TOutput>(
  evidenceSink: ToolBoundaryEvidenceSink,
  now: () => string,
  invocation: SupervisedToolInvocation<TInput, TOutput>,
  result: ToolResult<TOutput>,
): void {
  const occurredAt = now();

  evidenceSink.append({
    eventId: `${invocation.runId}:${invocation.actionId}:${invocation.toolName}:${occurredAt}`,
    actionId: invocation.actionId,
    runId: invocation.runId,
    toolName: invocation.toolName,
    status: result.status,
    occurredAt,
    rejectionCode: result.status === 'rejected' ? result.error.code : undefined,
    summary: result.status === 'pending_approval' ? result.summary : undefined,
  });
}

function formatToolExecutionError(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'Supervised tool execution failed';
}
