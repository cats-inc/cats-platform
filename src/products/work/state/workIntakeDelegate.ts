import { createHash } from 'node:crypto';

import {
  appendCoreActivity,
  upsertCoreWorkItem,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type { CoreWorkItemRecord } from '../../../core/types.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type {
  SupervisedToolExecutor,
} from '../../../platform/supervision/toolBoundary.js';
import {
  WORK_ITEM_CAPTURE_TOOL,
  WORK_ITEM_PROPOSE_SPLIT_TOOL,
  type WorkItemCaptureInput,
  type WorkItemCaptureResult,
  type WorkItemProposeSplitInput,
  type WorkItemProposeSplitResult,
  type WorkItemSourceRef,
  type WorkItemSplitCandidate,
  validateWorkItemCaptureInput,
  validateWorkItemProposeSplitInput,
} from '../shared/workToolSurface.js';

const WORK_INTAKE_METADATA_KEY = 'workIntake';
const WORK_INTAKE_METADATA_VERSION = 1;
const DEFAULT_MAX_SPLIT_ITEMS = 8;
const MAX_TITLE_LENGTH = 180;

export interface WorkIntakeDelegateOptions {
  coreStore: CoreStore;
  now?: () => Date;
}

export interface WorkIntakeCaptureContext {
  actorRef: string;
  actionId?: string;
  runId?: string;
}

export interface WorkIntakeDelegate {
  proposeSplit(input: WorkItemProposeSplitInput): ToolResult<WorkItemProposeSplitResult>;
  capture(
    input: WorkItemCaptureInput,
    context: WorkIntakeCaptureContext,
  ): Promise<ToolResult<WorkItemCaptureResult>>;
}

export interface WorkIntakeToolExecutors {
  [WORK_ITEM_PROPOSE_SPLIT_TOOL]: SupervisedToolExecutor<
    WorkItemProposeSplitInput,
    WorkItemProposeSplitResult
  >;
  [WORK_ITEM_CAPTURE_TOOL]: SupervisedToolExecutor<
    WorkItemCaptureInput,
    WorkItemCaptureResult
  >;
}

export function createWorkIntakeDelegate(
  options: WorkIntakeDelegateOptions,
): WorkIntakeDelegate {
  const now = options.now ?? (() => new Date());

  return {
    proposeSplit(input) {
      return proposeWorkItemSplit(input);
    },
    async capture(input, context) {
      const validationErrors = validateWorkItemCaptureInput(input);
      if (validationErrors.length > 0) {
        return rejected('E_SCHEMA_INVALID', 'Invalid work.item.capture input.', validationErrors);
      }

      const capturedAt = now();
      const sourceRef = normalizeSourceRef(input.source);
      const idempotencyKey = createWorkItemCaptureIdempotencyKey(input, context.actorRef);
      const workItemId = createWorkItemId(idempotencyKey);
      let created = false;
      let capturedWorkItem: CoreWorkItemRecord | null = null;

      try {
        const persisted = await options.coreStore.updateCore((core) => {
          const existing = core.workItems.find((workItem) => workItem.id === workItemId) ?? null;
          if (existing !== null) {
            capturedWorkItem = existing;
            created = false;
            return core;
          }

          const workItemWrite = upsertCoreWorkItem(
            core,
            {
              id: workItemId,
              title: input.title,
              status: input.status ?? 'draft',
              ownerActorId: core.ownerProfile.actorId,
              projectId: null,
              conversationId: sourceRef.conversationId ?? null,
              taskId: null,
              parentWorkItemId: null,
              summary: input.summary ?? null,
              assignedActorIds: [],
              metadata: {
                [WORK_INTAKE_METADATA_KEY]: buildWorkIntakeMetadata(
                  input,
                  sourceRef,
                  context,
                  idempotencyKey,
                  capturedAt,
                ),
              },
            },
            capturedAt,
          );
          const activityWrite = appendCoreActivity(
            workItemWrite.core,
            {
              kind: 'work_item_updated',
              actorId: context.actorRef,
              workItemId: workItemWrite.workItem.id,
              conversationId: sourceRef.conversationId ?? null,
              message: `Captured Work Item: ${workItemWrite.workItem.title}`,
              metadata: {
                [WORK_INTAKE_METADATA_KEY]: {
                  schemaVersion: WORK_INTAKE_METADATA_VERSION,
                  phase: 'intake',
                  toolName: WORK_ITEM_CAPTURE_TOOL,
                  idempotencyKey,
                  source: sourceRef,
                  actionId: context.actionId ?? null,
                  runId: context.runId ?? null,
                },
              },
            },
            capturedAt,
          );

          capturedWorkItem = workItemWrite.workItem;
          created = workItemWrite.created;
          return activityWrite.core;
        });

        capturedWorkItem =
          capturedWorkItem
          ?? persisted.workItems.find((workItem) => workItem.id === workItemId)
          ?? null;

        if (capturedWorkItem === null) {
          return rejected(
            'E_PRECHECK_FAILED',
            `Captured Work Item was not found after write: ${workItemId}`,
          );
        }

        return {
          status: 'applied',
          result: {
            workItemId: capturedWorkItem.id,
            status: capturedWorkItem.status === 'planned' ? 'planned' : 'draft',
            created,
            sourceRef,
          },
        };
      } catch (error) {
        return rejected(
          'E_PRECHECK_FAILED',
          error instanceof Error ? error.message : 'Work item capture failed.',
        );
      }
    },
  };
}

export function createWorkIntakeToolExecutors(
  delegate: WorkIntakeDelegate,
): WorkIntakeToolExecutors {
  return {
    [WORK_ITEM_PROPOSE_SPLIT_TOOL]: (input) => delegate.proposeSplit(input),
    [WORK_ITEM_CAPTURE_TOOL]: (input, context) => delegate.capture(input, context),
  };
}

export function proposeWorkItemSplit(
  input: WorkItemProposeSplitInput,
): ToolResult<WorkItemProposeSplitResult> {
  const validationErrors = validateWorkItemProposeSplitInput(input);
  if (validationErrors.length > 0) {
    return rejected('E_SCHEMA_INVALID', 'Invalid work.item.propose_split input.', validationErrors);
  }

  const sourceRef = normalizeSourceRef(input.source);
  const items = splitSourceText(sourceRef.sourceText ?? '').slice(
    0,
    input.maxItems ?? DEFAULT_MAX_SPLIT_ITEMS,
  );
  const candidates = items.map<WorkItemSplitCandidate>((item, index) => ({
    tempId: `candidate-${stableHash([
      WORK_ITEM_PROPOSE_SPLIT_TOOL,
      sourceIdentity(sourceRef),
      index.toString(),
      item,
    ].join('\n')).slice(0, 12)}`,
    title: truncateTitle(item),
    summary: item.length > MAX_TITLE_LENGTH ? item : undefined,
    kind: input.defaultKind ?? 'todo',
    priority: input.defaultPriority,
    confidence: items.length > 1 ? 0.65 : 0.5,
    sourceExcerpt: item,
    openQuestions: [],
  }));

  return {
    status: 'applied',
    result: {
      candidates,
      sourceRef,
    },
  };
}

export function createWorkItemCaptureIdempotencyKey(
  input: WorkItemCaptureInput,
  actorRef: string,
): string {
  const sourceRef = normalizeSourceRef(input.source);
  return [
    WORK_ITEM_CAPTURE_TOOL,
    actorRef.trim(),
    sourceIdentity(sourceRef),
    input.title.trim().toLowerCase(),
    input.summary?.trim().toLowerCase() ?? '',
  ].join('\n');
}

function createWorkItemId(idempotencyKey: string): string {
  return `work-item-intake-${stableHash(idempotencyKey).slice(0, 20)}`;
}

function buildWorkIntakeMetadata(
  input: WorkItemCaptureInput,
  sourceRef: WorkItemSourceRef,
  context: WorkIntakeCaptureContext,
  idempotencyKey: string,
  capturedAt: Date,
): Record<string, unknown> {
  return {
    schemaVersion: WORK_INTAKE_METADATA_VERSION,
    phase: 'intake',
    toolName: WORK_ITEM_CAPTURE_TOOL,
    idempotencyKey,
    source: sourceRef,
    producingActorRef: context.actorRef,
    actionId: context.actionId ?? null,
    runId: context.runId ?? null,
    capturedAt: capturedAt.toISOString(),
    kind: input.kind ?? 'todo',
    priority: input.priority ?? null,
    suggestedProjectTitle: input.suggestedProjectTitle ?? null,
    openQuestions: input.openQuestions ?? [],
  };
}

function normalizeSourceRef(source: WorkItemSourceRef): WorkItemSourceRef {
  return {
    surface: source.surface,
    conversationId: normalizeOptionalString(source.conversationId),
    channelId: normalizeOptionalString(source.channelId),
    transportBindingId: normalizeOptionalString(source.transportBindingId),
    sourceMessageId: normalizeOptionalString(source.sourceMessageId),
    sourceText: normalizeOptionalString(source.sourceText),
  };
}

function sourceIdentity(source: WorkItemSourceRef): string {
  return [
    source.surface,
    source.conversationId ?? '',
    source.channelId ?? '',
    source.transportBindingId ?? '',
    source.sourceMessageId ?? '',
    stableHash(source.sourceText ?? ''),
  ].join(':');
}

function splitSourceText(sourceText: string): string[] {
  const normalized = sourceText
    .split(/\r?\n|;/u)
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/u, '').trim())
    .filter((line) => line.length > 0);

  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  const trimmed = sourceText.trim();
  return trimmed.length > 0 ? [trimmed] : [];
}

function truncateTitle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_TITLE_LENGTH) {
    return trimmed;
  }

  return trimmed.slice(0, MAX_TITLE_LENGTH - 1).trimEnd();
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function rejected<T>(
  code: 'E_SCHEMA_INVALID' | 'E_PRECHECK_FAILED',
  message: string,
  details?: unknown,
): ToolResult<T> {
  return {
    status: 'rejected',
    error: {
      code,
      message,
      details,
    },
  };
}
