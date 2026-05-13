import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import {
  appendCoreActivity,
  upsertCoreWorkItem,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type { CoreWorkItemRecord } from '../../../core/types.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type { ExternalIssueImportDraft } from '../integrations/externalIssueImport.js';
import {
  EXTERNAL_WORK_BINDING_METADATA_KEY,
  buildExternalWorkBinding,
  createExternalWorkBindingsMetadata,
  type ExternalWorkBinding,
} from '../shared/externalWorkBinding.js';

export const WORK_EXTERNAL_ISSUE_IMPORT_METADATA_KEY = 'workExternalIssueImport';
const WORK_EXTERNAL_ISSUE_IMPORT_METADATA_VERSION = 1;

export interface WorkExternalIssueImportDelegateOptions {
  coreStore: CoreStore;
  now?: () => Date;
}

export interface WorkExternalIssueImportContext {
  actorRef: string;
  actionId?: string;
  runId?: string;
}

export interface WorkExternalIssueImportResult {
  workItemId: string;
  provider: ExternalIssueImportDraft['bindingDefaults']['provider'];
  externalType: ExternalIssueImportDraft['bindingDefaults']['externalType'];
  externalId: string;
  created: boolean;
  linked: boolean;
  bindingCount: number;
}

export interface WorkExternalIssueImportDelegate {
  importDraft(
    draft: ExternalIssueImportDraft,
    context: WorkExternalIssueImportContext,
  ): Promise<ToolResult<WorkExternalIssueImportResult>>;
}

export function createWorkExternalIssueImportDelegate(
  options: WorkExternalIssueImportDelegateOptions,
): WorkExternalIssueImportDelegate {
  const now = options.now ?? (() => new Date());

  return {
    importDraft(draft, context) {
      return importExternalIssueDraft(options.coreStore, draft, context, now);
    },
  };
}

export async function importExternalIssueDraft(
  coreStore: CoreStore,
  draft: ExternalIssueImportDraft,
  context: WorkExternalIssueImportContext,
  now: () => Date = () => new Date(),
): Promise<ToolResult<WorkExternalIssueImportResult>> {
  const importedAt = now();
  const idempotencyKey = createExternalIssueImportIdempotencyKey(draft);
  const workItemId = createExternalIssueImportWorkItemId(idempotencyKey);
  let created = false;
  let linked = false;
  let bindingCount = 0;
  let importedWorkItem: CoreWorkItemRecord | null = null;

  try {
    const persisted = await coreStore.updateCore((core) => {
      const existing = core.workItems.find((workItem) => workItem.id === workItemId) ?? null;
      if (existing !== null) {
        const existingBindings = readExternalWorkBindings(existing.metadata);
        const binding = buildImportBinding(
          draft,
          workItemId,
          context,
          importedAt,
          findExternalBinding(existingBindings, draft, workItemId),
        );
        const nextBindings = upsertExternalBinding(existingBindings, binding);
        bindingCount = nextBindings.length;
        importedWorkItem = existing;
        if (isDeepStrictEqual(existingBindings, nextBindings)) {
          created = false;
          linked = false;
          return core;
        }

        linked = true;
        const metadata = buildExternalIssueImportMetadata(
          existing.metadata,
          draft,
          nextBindings,
          context,
          idempotencyKey,
          importedAt,
        );
        const workItemWrite = upsertCoreWorkItem(
          core,
          {
            id: existing.id,
            title: existing.title,
            status: existing.status,
            projectId: existing.projectId,
            conversationId: existing.conversationId,
            taskId: existing.taskId,
            parentWorkItemId: existing.parentWorkItemId,
            ownerActorId: existing.ownerActorId,
            assignedActorIds: existing.assignedActorIds,
            summary: existing.summary,
            createdAt: existing.createdAt,
            metadata,
          },
          importedAt,
        );

        importedWorkItem = workItemWrite.workItem;
        return appendImportActivity(
          workItemWrite.core,
          workItemWrite.workItem,
          draft,
          context,
          idempotencyKey,
          importedAt,
          'Linked imported external issue',
        );
      }

      const binding = buildImportBinding(draft, workItemId, context, importedAt);
      const metadata = buildExternalIssueImportMetadata(
        {},
        draft,
        [binding],
        context,
        idempotencyKey,
        importedAt,
      );
      const workItemWrite = upsertCoreWorkItem(
        core,
        {
          id: workItemId,
          title: draft.title,
          status: draft.status,
          projectId: null,
          conversationId: null,
          taskId: null,
          parentWorkItemId: null,
          ownerActorId: core.ownerProfile.actorId,
          assignedActorIds: [],
          summary: draft.summary,
          metadata,
        },
        importedAt,
      );

      created = true;
      linked = true;
      bindingCount = 1;
      importedWorkItem = workItemWrite.workItem;
      return appendImportActivity(
        workItemWrite.core,
        workItemWrite.workItem,
        draft,
        context,
        idempotencyKey,
        importedAt,
        'Imported external issue',
      );
    });

    importedWorkItem =
      importedWorkItem
      ?? persisted.workItems.find((workItem) => workItem.id === workItemId)
      ?? null;
    if (bindingCount === 0 && importedWorkItem !== null) {
      bindingCount = readExternalWorkBindings(importedWorkItem.metadata).length;
    }
    if (importedWorkItem === null) {
      return rejected('Imported Work Item was not found after write.');
    }

    return {
      status: 'applied',
      result: {
        workItemId,
        provider: draft.bindingDefaults.provider,
        externalType: draft.bindingDefaults.externalType,
        externalId: draft.bindingDefaults.externalId,
        created,
        linked,
        bindingCount,
      },
    };
  } catch (error) {
    return rejected(
      error instanceof Error ? error.message : 'External issue import failed.',
    );
  }
}

function buildImportBinding(
  draft: ExternalIssueImportDraft,
  workItemId: string,
  context: WorkExternalIssueImportContext,
  importedAt: Date,
  existingBinding?: ExternalWorkBinding,
): ExternalWorkBinding {
  return buildExternalWorkBinding({
    localKind: 'work_item',
    localId: workItemId,
    provider: draft.bindingDefaults.provider,
    externalType: draft.bindingDefaults.externalType,
    externalId: draft.bindingDefaults.externalId,
    externalUrl: draft.bindingDefaults.externalUrl,
    syncDirection: draft.bindingDefaults.syncDirection,
    externalUpdatedAt: draft.bindingDefaults.externalUpdatedAt,
    linkedAt: existingBinding?.linkedAt ?? importedAt.toISOString(),
    linkedByActorRef: existingBinding?.linkedByActorRef ?? context.actorRef,
  });
}

function buildExternalIssueImportMetadata(
  existingMetadata: Record<string, unknown>,
  draft: ExternalIssueImportDraft,
  bindings: ExternalWorkBinding[],
  context: WorkExternalIssueImportContext,
  idempotencyKey: string,
  importedAt: Date,
): Record<string, unknown> {
  return {
    ...existingMetadata,
    ...draft.metadata,
    [EXTERNAL_WORK_BINDING_METADATA_KEY]: createExternalWorkBindingsMetadata(bindings),
    [WORK_EXTERNAL_ISSUE_IMPORT_METADATA_KEY]: {
      schemaVersion: WORK_EXTERNAL_ISSUE_IMPORT_METADATA_VERSION,
      phase: 'external_issue_import',
      idempotencyKey,
      importedAt: importedAt.toISOString(),
      importedByActorRef: context.actorRef,
      actionId: context.actionId ?? null,
      runId: context.runId ?? null,
      bindingDefaults: draft.bindingDefaults,
    },
  };
}

function appendImportActivity(
  core: Parameters<typeof appendCoreActivity>[0],
  workItem: CoreWorkItemRecord,
  draft: ExternalIssueImportDraft,
  context: WorkExternalIssueImportContext,
  idempotencyKey: string,
  importedAt: Date,
  verb: string,
): ReturnType<typeof appendCoreActivity>['core'] {
  return appendCoreActivity(
    core,
    {
      kind: 'work_item_updated',
      actorId: context.actorRef,
      workItemId: workItem.id,
      conversationId: workItem.conversationId,
      message: `${verb}: ${draft.bindingDefaults.provider} ${draft.bindingDefaults.externalId}`,
      metadata: {
        [WORK_EXTERNAL_ISSUE_IMPORT_METADATA_KEY]: {
          schemaVersion: WORK_EXTERNAL_ISSUE_IMPORT_METADATA_VERSION,
          phase: 'external_issue_import',
          idempotencyKey,
          actionId: context.actionId ?? null,
          runId: context.runId ?? null,
          provider: draft.bindingDefaults.provider,
          externalType: draft.bindingDefaults.externalType,
          externalId: draft.bindingDefaults.externalId,
          externalUrl: draft.bindingDefaults.externalUrl,
          externalUpdatedAt: draft.bindingDefaults.externalUpdatedAt,
          importedAt: importedAt.toISOString(),
        },
      },
    },
    importedAt,
  ).core;
}

function readExternalWorkBindings(metadata: unknown): ExternalWorkBinding[] {
  const container = isRecord(metadata) && isRecord(metadata[EXTERNAL_WORK_BINDING_METADATA_KEY])
    ? metadata[EXTERNAL_WORK_BINDING_METADATA_KEY]
    : null;
  const bindings = Array.isArray(container?.bindings) ? container.bindings : [];

  return bindings.flatMap((candidate) => {
    try {
      return buildExternalWorkBinding(candidate as ExternalWorkBinding);
    } catch {
      return [];
    }
  });
}

function upsertExternalBinding(
  existingBindings: ExternalWorkBinding[],
  binding: ExternalWorkBinding,
): ExternalWorkBinding[] {
  const existingIndex = existingBindings.findIndex((candidate) =>
    candidate.localKind === binding.localKind
    && candidate.localId === binding.localId
    && candidate.provider === binding.provider
    && candidate.externalType === binding.externalType
    && candidate.externalId === binding.externalId,
  );
  if (existingIndex < 0) {
    return [...existingBindings, binding];
  }
  if (isDeepStrictEqual(existingBindings[existingIndex], binding)) {
    return existingBindings;
  }

  return existingBindings.map((candidate, index) =>
    index === existingIndex ? binding : candidate,
  );
}

function findExternalBinding(
  existingBindings: ExternalWorkBinding[],
  draft: ExternalIssueImportDraft,
  workItemId: string,
): ExternalWorkBinding | undefined {
  return existingBindings.find((candidate) =>
    candidate.localKind === 'work_item'
    && candidate.localId === workItemId
    && candidate.provider === draft.bindingDefaults.provider
    && candidate.externalType === draft.bindingDefaults.externalType
    && candidate.externalId === draft.bindingDefaults.externalId,
  );
}

function createExternalIssueImportIdempotencyKey(draft: ExternalIssueImportDraft): string {
  return [
    'work.external.issue_import',
    draft.bindingDefaults.provider,
    draft.bindingDefaults.externalType,
    draft.bindingDefaults.externalId,
  ].join('\n');
}

function createExternalIssueImportWorkItemId(idempotencyKey: string): string {
  return `work-item-external-${stableHash(idempotencyKey).slice(0, 20)}`;
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function rejected<T>(message: string): ToolResult<T> {
  return {
    status: 'rejected',
    error: {
      code: 'E_PRECHECK_FAILED',
      message,
    },
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
