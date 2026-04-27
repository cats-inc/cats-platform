import type {
  CancellationContext,
  SupervisedToolManifest,
  SupervisionPolicySnapshot,
  SupervisionPolicySnapshotRef,
  ToolResult,
  ToolResultStatus,
} from './contracts.js';
import { createSupervisionPolicySnapshotRef } from './policySnapshots.js';
import type {
  SupervisedToolRegistry,
  ToolSurfaceDecision,
  ToolSurfaceGrant,
} from './toolRegistry.js';
import {
  evaluateToolSurface,
} from './toolRegistry.js';

export interface ToolBoundaryEvidenceEvent {
  eventId: string;
  actionId: string;
  runId: string;
  actorRef: string;
  toolName: string;
  status: ToolResultStatus;
  occurredAt: string;
  toolManifest?: {
    name: string;
    manifestVersion: string;
    sideEffect: SupervisedToolManifest['sideEffect'];
    approval: SupervisedToolManifest['approval'];
    evidence: SupervisedToolManifest['evidence'];
  };
  policySnapshotRef?: SupervisionPolicySnapshotRef;
  rejectionCode?: string;
  approvalRequestId?: string;
  cancellationContext?: CancellationContext;
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
  grant: ToolSurfaceGrant;
  effectiveToolScope: ToolSurfaceDecision['effectiveToolScope'];
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
  policySnapshot?: SupervisionPolicySnapshot;
  cancellationContext?: CancellationContext;
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
      const toolSurface = evaluateToolSurface(manifest, invocation.grant);

      try {
        const result = await invocation.execute(invocation.input, {
          actionId: invocation.actionId,
          runId: invocation.runId,
          actorRef: invocation.actorRef,
          manifest,
          grant: invocation.grant,
          effectiveToolScope: toolSurface.effectiveToolScope,
        });
        appendBoundaryEvidence(options.evidenceSink, now, invocation, result, manifest);
        return result;
      } catch (error) {
        const result: ToolResult<TOutput> = {
          status: 'rejected',
          error: {
            code: 'E_PRECHECK_FAILED',
            message: formatToolExecutionError(error),
          },
        };
        appendBoundaryEvidence(options.evidenceSink, now, invocation, result, manifest);
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
  manifest?: SupervisedToolManifest,
): void {
  const occurredAt = now();

  evidenceSink.append({
    eventId: `${invocation.runId}:${invocation.actionId}:${invocation.toolName}:${occurredAt}`,
    actionId: invocation.actionId,
    runId: invocation.runId,
    actorRef: invocation.actorRef,
    toolName: invocation.toolName,
    status: result.status,
    occurredAt,
    toolManifest: manifest === undefined
      ? undefined
      : {
          name: manifest.name,
          manifestVersion: manifest.manifestVersion,
          sideEffect: manifest.sideEffect,
          approval: manifest.approval,
          evidence: manifest.evidence,
        },
    policySnapshotRef: invocation.policySnapshot === undefined
      ? undefined
      : createSupervisionPolicySnapshotRef(invocation.policySnapshot),
    rejectionCode: result.status === 'rejected' ? result.error.code : undefined,
    approvalRequestId: result.status === 'pending_approval' ? result.requestId : undefined,
    cancellationContext: invocation.cancellationContext,
    summary: result.status === 'pending_approval' ? result.summary : undefined,
  });
}

function formatToolExecutionError(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'Supervised tool execution failed';
}
