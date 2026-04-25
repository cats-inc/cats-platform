import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type SupervisedToolManifest,
  type ToolResult,
} from './contracts.js';
import type {
  SupervisedToolExecutor,
  ToolBoundaryExecutionContext,
} from './toolBoundary.js';
import type { SupervisedToolRegistry } from './toolRegistry.js';

export interface WorkContextLookupInput {
  key: string;
}

export interface WorkContextLookupResult {
  key: string;
  found: boolean;
  value?: unknown;
}

export interface WorkLocalNoteApplyInput {
  noteId: string;
  body: string;
}

export interface WorkLocalNoteApplyResult {
  noteId: string;
  body: string;
}

export interface WorkApprovalGatedApplyInput {
  value: string;
  requestId?: string;
}

export interface WorkApprovalGatedApplyResult {
  requestId: string;
  value: string;
}

export type WorkApprovalState = 'pending' | 'approved' | 'denied';

export interface WorkApprovalRequest {
  requestId: string;
  runId: string;
  actionId: string;
  value: string;
  state: WorkApprovalState;
  appliedResult?: WorkApprovalGatedApplyResult;
}

export interface InMemoryWorkSupervisedToolState {
  context: Map<string, unknown>;
  notes: Map<string, WorkLocalNoteApplyResult>;
  approvalRequests: Map<string, WorkApprovalRequest>;
  approvalMutations: WorkApprovalGatedApplyResult[];
  cancelledRuns: Set<string>;
}

export interface WorkSupervisedTools {
  state: InMemoryWorkSupervisedToolState;
  manifests: SupervisedToolManifest[];
  executors: {
    'work.context.lookup': SupervisedToolExecutor<WorkContextLookupInput, WorkContextLookupResult>;
    'work.local_note.apply': SupervisedToolExecutor<
      WorkLocalNoteApplyInput,
      WorkLocalNoteApplyResult
    >;
    'work.approval_gated.apply': SupervisedToolExecutor<
      WorkApprovalGatedApplyInput,
      WorkApprovalGatedApplyResult
    >;
  };
  register(registry: SupervisedToolRegistry): void;
  approve(requestId: string): void;
  deny(requestId: string): void;
  cancelRun(runId: string): void;
}

export function createInMemoryWorkSupervisedTools(input: {
  context?: Record<string, unknown>;
} = {}): WorkSupervisedTools {
  const state: InMemoryWorkSupervisedToolState = {
    context: new Map(Object.entries(input.context ?? {})),
    notes: new Map(),
    approvalRequests: new Map(),
    approvalMutations: [],
    cancelledRuns: new Set(),
  };
  const manifests = createWorkSupervisedToolManifests();

  return {
    state,
    manifests,
    executors: {
      'work.context.lookup': createContextLookupExecutor(state),
      'work.local_note.apply': createLocalNoteApplyExecutor(state),
      'work.approval_gated.apply': createApprovalGatedApplyExecutor(state),
    },
    register(registry) {
      for (const manifest of manifests) {
        registry.register(manifest);
      }
    },
    approve(requestId) {
      updateApprovalState(state, requestId, 'approved');
    },
    deny(requestId) {
      updateApprovalState(state, requestId, 'denied');
    },
    cancelRun(runId) {
      state.cancelledRuns.add(runId);
    },
  };
}

export function createWorkSupervisedToolManifests(): SupervisedToolManifest[] {
  return [
    createManifest({
      name: 'work.context.lookup',
      description: 'Read Work context projection data.',
      sideEffect: 'none',
      preflight: 'available',
      approval: 'never',
      failureCodes: [],
    }),
    createManifest({
      name: 'work.local_note.apply',
      description: 'Apply a local draft note for a Work run.',
      sideEffect: 'local_state',
      preflight: 'required',
      approval: 'policy',
      failureCodes: ['E_PRECHECK_FAILED'],
    }),
    createManifest({
      name: 'work.approval_gated.apply',
      description: 'Apply a mutation only after operator approval.',
      sideEffect: 'external_visible',
      preflight: 'required',
      approval: 'always',
      failureCodes: ['E_APPROVAL_DENIED', 'E_RUN_CANCELLED', 'E_PRECHECK_FAILED'],
    }),
  ];
}

function createContextLookupExecutor(
  state: InMemoryWorkSupervisedToolState,
): SupervisedToolExecutor<WorkContextLookupInput, WorkContextLookupResult> {
  return (input) => {
    const found = state.context.has(input.key);

    return {
      status: 'applied',
      result: {
        key: input.key,
        found,
        value: found ? state.context.get(input.key) : undefined,
      },
    };
  };
}

function createLocalNoteApplyExecutor(
  state: InMemoryWorkSupervisedToolState,
): SupervisedToolExecutor<WorkLocalNoteApplyInput, WorkLocalNoteApplyResult> {
  return (input) => {
    const note = {
      noteId: input.noteId,
      body: input.body,
    };
    state.notes.set(input.noteId, note);

    return {
      status: 'applied',
      result: note,
    };
  };
}

function createApprovalGatedApplyExecutor(
  state: InMemoryWorkSupervisedToolState,
): SupervisedToolExecutor<WorkApprovalGatedApplyInput, WorkApprovalGatedApplyResult> {
  return (input, context) => {
    if (state.cancelledRuns.has(context.runId)) {
      return rejected('E_RUN_CANCELLED', `Run is cancelled: ${context.runId}`);
    }

    const requestId = input.requestId ?? defaultApprovalRequestId(context);
    const existing = state.approvalRequests.get(requestId);

    if (existing === undefined) {
      state.approvalRequests.set(requestId, {
        requestId,
        runId: context.runId,
        actionId: context.actionId,
        value: input.value,
        state: 'pending',
      });

      return {
        status: 'pending_approval',
        requestId,
        summary: `Apply approval-gated Work change ${requestId}.`,
      };
    }

    if (existing.state === 'denied') {
      return rejected('E_APPROVAL_DENIED', `Approval request was denied: ${requestId}`);
    }
    if (existing.state === 'pending') {
      return {
        status: 'pending_approval',
        requestId,
        summary: `Approval request is still pending: ${requestId}.`,
      };
    }

    if (existing.appliedResult !== undefined) {
      return {
        status: 'applied',
        result: existing.appliedResult,
      };
    }

    const result = {
      requestId,
      value: existing.value,
    };
    existing.appliedResult = result;
    state.approvalMutations.push(result);

    return {
      status: 'applied',
      result,
    };
  };
}

function createManifest(input: Pick<
  SupervisedToolManifest,
  'name' | 'description' | 'sideEffect' | 'preflight' | 'approval' | 'failureCodes'
>): SupervisedToolManifest {
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name: input.name,
    manifestVersion: '1.0',
    description: input.description,
    sideEffect: input.sideEffect,
    preflight: input.preflight,
    blocking: 'blocking',
    cancellation: 'cooperative',
    approval: input.approval,
    evidence: 'summary',
    failureCodes: input.failureCodes,
    inputSchema: {
      id: `${input.name}.input`,
      version: '1.0',
      format: 'json_schema',
    },
    outputSchema: {
      id: `${input.name}.output`,
      version: '1.0',
      format: 'json_schema',
    },
  };
}

function updateApprovalState(
  state: InMemoryWorkSupervisedToolState,
  requestId: string,
  approvalState: WorkApprovalState,
): void {
  const request = state.approvalRequests.get(requestId);

  if (request === undefined) {
    throw new Error(`Unknown approval request: ${requestId}`);
  }

  request.state = approvalState;
}

function defaultApprovalRequestId(context: ToolBoundaryExecutionContext): string {
  return `${context.runId}:${context.actionId}:approval`;
}

function rejected<T>(
  code: 'E_APPROVAL_DENIED' | 'E_RUN_CANCELLED',
  message: string,
): ToolResult<T> {
  return {
    status: 'rejected',
    error: {
      code,
      message,
    },
  };
}
