import { isDeepStrictEqual } from 'node:util';

import {
  appendCoreActivity,
  upsertCoreProject,
  upsertCoreWorkItem,
} from '../../../core/model/index.js';
import type { CoreStore } from '../../../core/store.js';
import type { CatsCoreState, CoreProjectRecord, CoreWorkItemRecord } from '../../../core/types.js';
import type { ToolResult } from '../../../platform/supervision/contracts.js';
import type { SupervisedToolExecutor } from '../../../platform/supervision/toolBoundary.js';
import {
  EXTERNAL_WORK_BINDING_METADATA_KEY,
  buildExternalWorkBinding,
  createExternalWorkBindingsMetadata,
  type ExternalWorkBinding,
} from '../shared/externalWorkBinding.js';
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  type WorkExternalLinkIssueInput,
  type WorkExternalLinkIssueResult,
  type WorkExternalUnlinkIssueInput,
  type WorkExternalUnlinkIssueResult,
  validateWorkExternalLinkIssueInput,
  validateWorkExternalUnlinkIssueInput,
} from '../shared/workToolSurface.js';

const WORK_EXTERNAL_BINDING_METADATA_KEY = 'workExternalBinding';
const WORK_EXTERNAL_BINDING_METADATA_VERSION = 1;

export interface WorkExternalBindingDelegateOptions {
  coreStore: CoreStore;
  now?: () => Date;
}

export interface WorkExternalBindingMutationContext {
  actorRef: string;
  actionId?: string;
  runId?: string;
}

export interface WorkExternalBindingDelegate {
  linkIssue(
    input: WorkExternalLinkIssueInput,
    context: WorkExternalBindingMutationContext,
  ): Promise<ToolResult<WorkExternalLinkIssueResult>>;
  unlinkIssue(
    input: WorkExternalUnlinkIssueInput,
    context: WorkExternalBindingMutationContext,
  ): Promise<ToolResult<WorkExternalUnlinkIssueResult>>;
}

export interface WorkExternalBindingToolExecutors {
  [WORK_EXTERNAL_LINK_ISSUE_TOOL]: SupervisedToolExecutor<
    WorkExternalLinkIssueInput,
    WorkExternalLinkIssueResult
  >;
  [WORK_EXTERNAL_UNLINK_ISSUE_TOOL]: SupervisedToolExecutor<
    WorkExternalUnlinkIssueInput,
    WorkExternalUnlinkIssueResult
  >;
}

export function createWorkExternalBindingDelegate(
  options: WorkExternalBindingDelegateOptions,
): WorkExternalBindingDelegate {
  const now = options.now ?? (() => new Date());

  return {
    async linkIssue(input, context) {
      return linkExternalIssue(options.coreStore, input, context, now);
    },
    async unlinkIssue(input, context) {
      return unlinkExternalIssue(options.coreStore, input, context, now);
    },
  };
}

export function createWorkExternalBindingToolExecutors(
  delegate: WorkExternalBindingDelegate,
): WorkExternalBindingToolExecutors {
  return {
    [WORK_EXTERNAL_LINK_ISSUE_TOOL]: (input, context) => delegate.linkIssue(input, context),
    [WORK_EXTERNAL_UNLINK_ISSUE_TOOL]: (input, context) => delegate.unlinkIssue(input, context),
  };
}

export async function linkExternalIssue(
  coreStore: CoreStore,
  input: WorkExternalLinkIssueInput,
  context: WorkExternalBindingMutationContext,
  now: () => Date = () => new Date(),
): Promise<ToolResult<WorkExternalLinkIssueResult>> {
  const validationErrors = validateWorkExternalLinkIssueInput(input);
  if (validationErrors.length > 0) {
    return rejected('Invalid work.external.link_issue input.', validationErrors);
  }

  const linkedAt = now();
  const localId = input.localId.trim();
  let binding: ExternalWorkBinding;
  try {
    binding = buildExternalWorkBinding({
      localKind: input.localKind,
      localId,
      provider: input.provider,
      externalType: input.externalType ?? 'issue',
      externalId: input.externalId,
      externalUrl: input.externalUrl,
      syncDirection: input.syncDirection,
      externalUpdatedAt: input.externalUpdatedAt,
      linkedAt: linkedAt.toISOString(),
      linkedByActorRef: context.actorRef,
    });
  } catch (error) {
    return rejected(
      error instanceof Error ? error.message : 'Invalid external Work binding.',
      undefined,
      'E_PRECHECK_FAILED',
    );
  }

  let linked = false;
  let bindingCount = 0;

  try {
    const persisted = await coreStore.updateCore((core) => {
      const target = resolveExternalBindingTarget(core, input.localKind, localId);
      const existingBindings = readExternalWorkBindings(target.record.metadata);
      const nextBindings = upsertExternalBinding(existingBindings, binding);
      bindingCount = nextBindings.length;
      if (isDeepStrictEqual(existingBindings, nextBindings)) {
        linked = false;
        return core;
      }

      linked = true;
      const metadata = writeExternalWorkBindingsMetadata(target.record.metadata, nextBindings);
      const nextCore = target.kind === 'work_item'
        ? upsertWorkItemExternalBinding(core, target.record, metadata, linkedAt).core
        : upsertProjectExternalBinding(core, target.record, metadata, linkedAt).core;

      return appendCoreActivity(
        nextCore,
        {
          kind: target.kind === 'work_item' ? 'work_item_updated' : 'note',
          actorId: context.actorRef,
          projectId: target.kind === 'project' ? target.record.id : target.record.projectId,
          workItemId: target.kind === 'work_item' ? target.record.id : null,
          conversationId: target.kind === 'project'
            ? target.record.primaryConversationId
            : target.record.conversationId,
          message: `Linked external ${binding.externalType}: ${binding.provider} ${binding.externalId}`,
          metadata: {
            [WORK_EXTERNAL_BINDING_METADATA_KEY]: {
              schemaVersion: WORK_EXTERNAL_BINDING_METADATA_VERSION,
              phase: 'external_tracker_binding',
              toolName: WORK_EXTERNAL_LINK_ISSUE_TOOL,
              actionId: context.actionId ?? null,
              runId: context.runId ?? null,
              note: input.note?.trim() || null,
              binding,
            },
          },
        },
        linkedAt,
      ).core;
    });

    if (bindingCount === 0) {
      const target = resolveExternalBindingTarget(persisted, input.localKind, localId);
      bindingCount = readExternalWorkBindings(target.record.metadata).length;
    }

    return {
      status: 'applied',
      result: {
        localKind: binding.localKind,
        localId: binding.localId,
        provider: binding.provider,
        externalType: binding.externalType,
        externalId: binding.externalId,
        externalUrl: binding.externalUrl ?? undefined,
        linked,
        bindingCount,
      },
    };
  } catch (error) {
    return rejected(
      error instanceof Error ? error.message : 'External issue link failed.',
      undefined,
      'E_PRECHECK_FAILED',
    );
  }
}

export async function unlinkExternalIssue(
  coreStore: CoreStore,
  input: WorkExternalUnlinkIssueInput,
  context: WorkExternalBindingMutationContext,
  now: () => Date = () => new Date(),
): Promise<ToolResult<WorkExternalUnlinkIssueResult>> {
  const validationErrors = validateWorkExternalUnlinkIssueInput(input);
  if (validationErrors.length > 0) {
    return rejected('Invalid work.external.unlink_issue input.', validationErrors);
  }

  const unlinkedAt = now();
  const localId = input.localId.trim();
  const externalType = input.externalType ?? 'issue';
  const externalId = input.externalId.trim();
  let unlinked = false;
  let bindingCount = 0;
  let removedBinding: ExternalWorkBinding | null = null;

  try {
    const persisted = await coreStore.updateCore((core) => {
      const target = resolveExternalBindingTarget(core, input.localKind, localId);
      const existingBindings = readExternalWorkBindings(target.record.metadata);
      const removeResult = removeExternalBinding(existingBindings, {
        localKind: input.localKind,
        localId,
        provider: input.provider,
        externalType,
        externalId,
      });
      bindingCount = removeResult.bindings.length;
      removedBinding = removeResult.removedBinding;
      if (!removedBinding) {
        unlinked = false;
        return core;
      }

      unlinked = true;
      const metadata = writeExternalWorkBindingsMetadata(
        target.record.metadata,
        removeResult.bindings,
      );
      const nextCore = target.kind === 'work_item'
        ? upsertWorkItemExternalBinding(core, target.record, metadata, unlinkedAt).core
        : upsertProjectExternalBinding(core, target.record, metadata, unlinkedAt).core;

      return appendCoreActivity(
        nextCore,
        {
          kind: target.kind === 'work_item' ? 'work_item_updated' : 'note',
          actorId: context.actorRef,
          projectId: target.kind === 'project' ? target.record.id : target.record.projectId,
          workItemId: target.kind === 'work_item' ? target.record.id : null,
          conversationId: target.kind === 'project'
            ? target.record.primaryConversationId
            : target.record.conversationId,
          message: `Unlinked external ${externalType}: ${input.provider} ${externalId}`,
          metadata: {
            [WORK_EXTERNAL_BINDING_METADATA_KEY]: {
              schemaVersion: WORK_EXTERNAL_BINDING_METADATA_VERSION,
              phase: 'external_tracker_binding',
              toolName: WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
              actionId: context.actionId ?? null,
              runId: context.runId ?? null,
              note: input.note?.trim() || null,
              binding: removedBinding,
            },
          },
        },
        unlinkedAt,
      ).core;
    });

    if (bindingCount === 0 && !unlinked) {
      const target = resolveExternalBindingTarget(persisted, input.localKind, localId);
      bindingCount = readExternalWorkBindings(target.record.metadata).length;
    }

    return {
      status: 'applied',
      result: {
        localKind: input.localKind,
        localId,
        provider: input.provider,
        externalType,
        externalId,
        unlinked,
        bindingCount,
      },
    };
  } catch (error) {
    return rejected(
      error instanceof Error ? error.message : 'External issue unlink failed.',
      undefined,
      'E_PRECHECK_FAILED',
    );
  }
}

function resolveExternalBindingTarget(
  core: CatsCoreState,
  localKind: WorkExternalLinkIssueInput['localKind'],
  localId: string,
): (
  | { kind: 'work_item'; record: CoreWorkItemRecord }
  | { kind: 'project'; record: CoreProjectRecord }
) {
  if (localKind === 'work_item') {
    const workItem = core.workItems.find((candidate) => candidate.id === localId) ?? null;
    if (workItem === null) {
      throw new WorkExternalBindingPrecheckError(`No Work Item found for id ${localId}.`);
    }
    if (workItem.status === 'archived') {
      throw new WorkExternalBindingPrecheckError(`Work Item ${localId} is archived.`);
    }
    return { kind: 'work_item', record: workItem };
  }

  const project = core.projects.find((candidate) => candidate.id === localId) ?? null;
  if (project === null) {
    throw new WorkExternalBindingPrecheckError(`No Project found for id ${localId}.`);
  }
  if (project.status === 'archived') {
    throw new WorkExternalBindingPrecheckError(`Project ${localId} is archived.`);
  }
  return { kind: 'project', record: project };
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

interface ExternalBindingIdentity {
  localKind: WorkExternalUnlinkIssueInput['localKind'];
  localId: string;
  provider: WorkExternalUnlinkIssueInput['provider'];
  externalType: NonNullable<WorkExternalUnlinkIssueInput['externalType']>;
  externalId: string;
}

function removeExternalBinding(
  existingBindings: ExternalWorkBinding[],
  identity: ExternalBindingIdentity,
): { bindings: ExternalWorkBinding[]; removedBinding: ExternalWorkBinding | null } {
  const existingIndex = existingBindings.findIndex((candidate) =>
    candidate.localKind === identity.localKind
    && candidate.localId === identity.localId
    && candidate.provider === identity.provider
    && candidate.externalType === identity.externalType
    && candidate.externalId === identity.externalId,
  );
  if (existingIndex < 0) {
    return { bindings: existingBindings, removedBinding: null };
  }

  return {
    bindings: existingBindings.filter((_candidate, index) => index !== existingIndex),
    removedBinding: existingBindings[existingIndex] ?? null,
  };
}

function writeExternalWorkBindingsMetadata(
  existingMetadata: Record<string, unknown>,
  bindings: ExternalWorkBinding[],
): Record<string, unknown> {
  const metadata = { ...existingMetadata };
  if (bindings.length === 0) {
    delete metadata[EXTERNAL_WORK_BINDING_METADATA_KEY];
    return metadata;
  }

  metadata[EXTERNAL_WORK_BINDING_METADATA_KEY] =
    createExternalWorkBindingsMetadata(bindings);
  return metadata;
}

function upsertWorkItemExternalBinding(
  core: CatsCoreState,
  workItem: CoreWorkItemRecord,
  metadata: Record<string, unknown>,
  linkedAt: Date,
): ReturnType<typeof upsertCoreWorkItem> {
  return upsertCoreWorkItem(
    core,
    {
      id: workItem.id,
      title: workItem.title,
      status: workItem.status,
      projectId: workItem.projectId,
      conversationId: workItem.conversationId,
      taskId: workItem.taskId,
      parentWorkItemId: workItem.parentWorkItemId,
      ownerActorId: workItem.ownerActorId,
      assignedActorIds: workItem.assignedActorIds,
      summary: workItem.summary,
      createdAt: workItem.createdAt,
      metadata,
    },
    linkedAt,
  );
}

function upsertProjectExternalBinding(
  core: CatsCoreState,
  project: CoreProjectRecord,
  metadata: Record<string, unknown>,
  linkedAt: Date,
): ReturnType<typeof upsertCoreProject> {
  return upsertCoreProject(
    core,
    {
      id: project.id,
      title: project.title,
      status: project.status,
      ownerActorId: project.ownerActorId,
      summary: project.summary,
      repoPath: project.repoPath,
      primaryConversationId: project.primaryConversationId,
      createdAt: project.createdAt,
      metadata,
    },
    linkedAt,
  );
}

class WorkExternalBindingPrecheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkExternalBindingPrecheckError';
  }
}

function rejected<T>(
  message: string,
  details?: unknown,
  code: 'E_SCHEMA_INVALID' | 'E_PRECHECK_FAILED' = 'E_SCHEMA_INVALID',
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

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
