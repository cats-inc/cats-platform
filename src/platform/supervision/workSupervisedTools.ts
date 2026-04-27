import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type BudgetEnvelope,
  type SchemaRef,
  type SupervisedToolManifest,
  type ToolResult,
} from './contracts.js';
import type { SupervisionRejectionCode } from './errors.js';
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

export interface WorkSopClassifyTextBatchInput {
  items: Array<{
    id: string;
    text: string;
  }>;
  labels: string[];
}

export interface WorkSopClassifyTextBatchResult {
  classifications: Array<{
    id: string;
    label: string;
    confidence: number;
  }>;
}

export interface WorkSopAskWeakInput {
  question: string;
  expectedOutputSchemaRef: SchemaRef;
  allowedToolNames: string[];
  budget: BudgetEnvelope & {
    hardStop: true;
  };
}

export interface WorkSopAskWeakResult {
  schemaRef: SchemaRef;
  answer: {
    summary: string;
  };
  allowedToolNames: [];
  suggestedToolNames: [];
  confidence: number;
  escalation: {
    required: boolean;
    reason: string | null;
  };
}

export interface WorkSopWorkerProfile {
  toolName: 'work.sop.classify_text_batch' | 'work.sop.ask_weak';
  toolScope: 'none';
  budget: {
    maxDurationMs: number;
    maxTokens: number;
    hardStop: true;
  };
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
    'work.sop.classify_text_batch': SupervisedToolExecutor<
      WorkSopClassifyTextBatchInput,
      WorkSopClassifyTextBatchResult
    >;
    'work.sop.ask_weak': SupervisedToolExecutor<
      WorkSopAskWeakInput,
      WorkSopAskWeakResult
    >;
  };
  sopWorkerProfile: WorkSopWorkerProfile;
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
      'work.sop.classify_text_batch': createSopClassifyTextBatchExecutor(),
      'work.sop.ask_weak': createSopAskWeakExecutor(),
    },
    sopWorkerProfile: {
      toolName: 'work.sop.classify_text_batch',
      toolScope: 'none',
      budget: {
        maxDurationMs: 1000,
        maxTokens: 1024,
        hardStop: true,
      },
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
    createManifest({
      name: 'work.sop.classify_text_batch',
      description: 'Classify a small text batch using a strict SOP worker.',
      sideEffect: 'none',
      preflight: 'required',
      approval: 'never',
      failureCodes: ['E_SCHEMA_INVALID'],
      maxBudgetHint: {
        maxDurationMs: 1000,
        maxTokens: 1024,
        hardStop: true,
      },
    }),
    createManifest({
      name: 'work.sop.ask_weak',
      description: 'Ask a weak worker through a strict SOP shell with schema-required output.',
      sideEffect: 'none',
      preflight: 'required',
      approval: 'never',
      failureCodes: ['E_SCHEMA_INVALID', 'E_TOOL_SCOPE_DENIED', 'E_BUDGET_EXCEEDED'],
      maxBudgetHint: {
        maxDurationMs: 5000,
        maxTokens: 2048,
        hardStop: true,
      },
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

function createSopClassifyTextBatchExecutor(): SupervisedToolExecutor<
  WorkSopClassifyTextBatchInput,
  WorkSopClassifyTextBatchResult
> {
  return (input) => {
    if (!isClassifyTextBatchInput(input)) {
      return {
        status: 'rejected',
        error: {
          code: 'E_SCHEMA_INVALID',
          message: 'Invalid work.sop.classify_text_batch input schema.',
        },
      };
    }

    const result: WorkSopClassifyTextBatchResult = {
      classifications: input.items.map((item) => ({
        id: item.id,
        label: classifyText(item.text, input.labels),
        confidence: 0.6,
      })),
    };

    if (!isClassifyTextBatchResult(result)) {
      return {
        status: 'rejected',
        error: {
          code: 'E_SCHEMA_INVALID',
          message: 'Invalid work.sop.classify_text_batch output schema.',
        },
      };
    }

    return {
      status: 'applied',
      result,
    };
  };
}

function createSopAskWeakExecutor(): SupervisedToolExecutor<
  WorkSopAskWeakInput,
  WorkSopAskWeakResult
> {
  return (input) => {
    if (!isSopAskWeakInput(input)) {
      return rejected('E_SCHEMA_INVALID', 'Invalid work.sop.ask_weak input schema.');
    }
    if (!isSopAskWeakBudgetWithinFirstSlice(input.budget)) {
      return rejected('E_BUDGET_EXCEEDED', 'work.sop.ask_weak budget exceeds first-slice limits.');
    }
    if (input.allowedToolNames.length > 0) {
      return rejected(
        'E_TOOL_SCOPE_DENIED',
        'work.sop.ask_weak first slice forces allowedToolNames to an empty list.',
      );
    }

    const result: WorkSopAskWeakResult = {
      schemaRef: input.expectedOutputSchemaRef,
      answer: {
        summary: input.question,
      },
      allowedToolNames: [],
      suggestedToolNames: [],
      confidence: 0.5,
      escalation: {
        required: false,
        reason: null,
      },
    };

    if (!isSopAskWeakResult(result, input.expectedOutputSchemaRef)) {
      return rejected('E_SCHEMA_INVALID', 'Invalid work.sop.ask_weak output schema.');
    }

    return {
      status: 'applied',
      result,
    };
  };
}

function createManifest(input: Pick<
  SupervisedToolManifest,
  'name' | 'description' | 'sideEffect' | 'preflight' | 'approval' | 'failureCodes'
> & Pick<Partial<SupervisedToolManifest>, 'maxBudgetHint'>): SupervisedToolManifest {
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
    maxBudgetHint: input.maxBudgetHint,
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

function isClassifyTextBatchInput(input: unknown): input is WorkSopClassifyTextBatchInput {
  if (!isRecord(input) || !Array.isArray(input.items) || !Array.isArray(input.labels)) {
    return false;
  }
  if (input.labels.length === 0 || !input.labels.every((label) => typeof label === 'string')) {
    return false;
  }

  return input.items.every((item) =>
    isRecord(item) &&
    typeof item.id === 'string' &&
    item.id.trim() !== '' &&
    typeof item.text === 'string',
  );
}

function isClassifyTextBatchResult(input: unknown): input is WorkSopClassifyTextBatchResult {
  return isRecord(input) &&
    Array.isArray(input.classifications) &&
    input.classifications.every((classification) =>
      isRecord(classification) &&
      typeof classification.id === 'string' &&
      typeof classification.label === 'string' &&
      typeof classification.confidence === 'number' &&
      classification.confidence >= 0 &&
      classification.confidence <= 1,
    );
}

function isSopAskWeakInput(input: unknown): input is WorkSopAskWeakInput {
  if (!isRecord(input)) {
    return false;
  }
  if (
    typeof input.question !== 'string' ||
    input.question.trim() === '' ||
    input.question.length > 2000
  ) {
    return false;
  }
  if (!isSchemaRef(input.expectedOutputSchemaRef)) {
    return false;
  }
  if (!Array.isArray(input.allowedToolNames) ||
    !input.allowedToolNames.every((toolName) => typeof toolName === 'string')) {
    return false;
  }
  if (!isRecord(input.budget) || input.budget.hardStop !== true) {
    return false;
  }

  return true;
}

function isSopAskWeakBudgetWithinFirstSlice(input: WorkSopAskWeakInput['budget']): boolean {
  const maxDurationMs = typeof input.maxDurationMs === 'number' ? input.maxDurationMs : 0;
  const maxTokens = typeof input.maxTokens === 'number' ? input.maxTokens : 0;
  return maxDurationMs > 0 &&
    maxDurationMs <= 5000 &&
    maxTokens > 0 &&
    maxTokens <= 2048;
}

function isSopAskWeakResult(
  input: unknown,
  expectedOutputSchemaRef: SchemaRef,
): input is WorkSopAskWeakResult {
  return isRecord(input) &&
    isSameSchemaRef(input.schemaRef, expectedOutputSchemaRef) &&
    isRecord(input.answer) &&
    typeof input.answer.summary === 'string' &&
    Array.isArray(input.allowedToolNames) &&
    input.allowedToolNames.length === 0 &&
    Array.isArray(input.suggestedToolNames) &&
    input.suggestedToolNames.length === 0 &&
    typeof input.confidence === 'number' &&
    input.confidence >= 0 &&
    input.confidence <= 1 &&
    isRecord(input.escalation) &&
    typeof input.escalation.required === 'boolean' &&
    (input.escalation.reason === null || typeof input.escalation.reason === 'string');
}

function isSchemaRef(input: unknown): input is SchemaRef {
  return isRecord(input) &&
    typeof input.id === 'string' &&
    input.id.trim() !== '' &&
    typeof input.version === 'string' &&
    input.version.trim() !== '' &&
    input.format === 'json_schema' &&
    (input.uri === undefined || typeof input.uri === 'string');
}

function isSameSchemaRef(left: unknown, right: SchemaRef): left is SchemaRef {
  return isSchemaRef(left) &&
    left.id === right.id &&
    left.version === right.version &&
    left.format === right.format &&
    (left.uri ?? null) === (right.uri ?? null);
}

function classifyText(text: string, labels: string[]): string {
  const normalizedText = text.toLowerCase();
  const matchingLabel = labels.find((label) => normalizedText.includes(label.toLowerCase()));

  return matchingLabel ?? labels[0] ?? 'unknown';
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

function rejected<T>(
  code: SupervisionRejectionCode,
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
