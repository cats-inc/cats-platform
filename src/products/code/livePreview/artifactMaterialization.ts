import { createHash } from 'node:crypto';

import { upsertCoreArtifact } from '../../../core/model/planningRecords.js';
import type {
  CatsCoreState,
  CoreActivityRecord,
  CoreArtifactRecord,
  CoreRecordMetadata,
} from '../../../core/types.js';
import {
  appendArtifactCanvasIntentActivity,
} from '../../shared/artifactCanvas/activity.js';
import {
  canvasSurfaceRouteRegistry,
  composeArtifactCanvasNavigateIntent,
  type ArtifactCanvasError,
  type ArtifactCanvasNavigateIntent,
  type ArtifactCanvasPresentationInput,
  type CanvasSurfaceRef,
} from '../../shared/artifactCanvas/contracts.js';
import {
  DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  type ArtifactCanvasPolicyConfig,
  type ArtifactCanvasSupervisorPreviewLease,
  type ArtifactCanvasSupervisorPreviewLeaseStore,
} from '../../shared/artifactCanvas/iframePolicy.js';
import { buildArtifactCanvasProjection } from '../../shared/artifactCanvas/projection.js';
import {
  type ArtifactCanvasRenderIntentDeliveryResult,
  type ArtifactCanvasRenderIntentHub,
  createArtifactCanvasIntentId,
  getDefaultArtifactCanvasRenderIntentHub,
} from '../../shared/artifactCanvas/renderIntent.js';
import { CODE_LIVE_PREVIEW_PRODUCER_IDENTITY, type LivePreviewLease } from './contracts.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';

export const CODE_LIVE_PREVIEW_ARTIFACT_METADATA_SCHEMA_VERSION = '1.0' as const;
export {
  CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
  CODE_LIVE_PREVIEW_PRODUCER_TOOL_NAME,
} from './contracts.js';

export type LivePreviewArtifactMaterializationSkippedReason =
  | 'lease_expired'
  | 'lease_not_ready'
  | 'lease_origin_invalid'
  | 'lease_origin_not_loopback'
  | 'task_anchor_unresolved'
  | 'conversation_anchor_unresolved'
  | 'entry_path_invalid'
  | 'workspace_anchor_unresolved'
  | 'unsupported_surface';

export type LivePreviewArtifactMaterializationResult =
  | {
      status: 'materialized';
      core: CatsCoreState;
      artifact: CoreArtifactRecord;
      created: boolean;
      lease: LivePreviewLease;
    }
  | {
      status: 'skipped';
      reason: LivePreviewArtifactMaterializationSkippedReason;
      core: CatsCoreState;
      lease: LivePreviewLease;
    };

export interface LivePreviewArtifactMaterializationOptions {
  title?: string | null;
  summary?: string | null;
  /** Page to open on the lease origin, e.g. `/calculator.html`; defaults to `/`. */
  entryPath?: string | null;
  now?: Date;
}

export type LivePreviewArtifactCanvasShowResult =
  | {
      status: 'shown';
      core: CatsCoreState;
      artifact: CoreArtifactRecord;
      activity: CoreActivityRecord;
      delivery: ArtifactCanvasRenderIntentDeliveryResult;
      intent: ArtifactCanvasNavigateIntent;
      lease: LivePreviewLease;
    }
  | {
      status: 'skipped';
      reason: LivePreviewArtifactMaterializationSkippedReason;
      core: CatsCoreState;
      lease: LivePreviewLease;
    }
  | {
      status: 'rejected';
      reason: 'artifact_canvas_projection_error';
      core: CatsCoreState;
      error: ArtifactCanvasError;
      lease: LivePreviewLease;
    };

export interface LivePreviewArtifactCanvasShowOptions
  extends LivePreviewArtifactMaterializationOptions {
  actorId?: string | null;
  intentIdFactory?: () => string;
  policyConfig?: ArtifactCanvasPolicyConfig;
  presentationRequested?: ArtifactCanvasPresentationInput;
  renderIntentHub?: ArtifactCanvasRenderIntentHub;
  supervisorPreviewLeaseStore?: ArtifactCanvasSupervisorPreviewLeaseStore | null;
  targetSessionId?: string | null;
}

interface ResolvedLivePreviewArtifactAnchors {
  conversationId: string | null;
  projectId: string | null;
  taskId: string | null;
  workItemId: string | null;
  workspacePath: string;
}

export function materializeLivePreviewArtifact(
  core: CatsCoreState,
  lease: LivePreviewLease,
  options: LivePreviewArtifactMaterializationOptions = {},
): LivePreviewArtifactMaterializationResult {
  const validation = validateLivePreviewLeaseForMaterialization(
    core,
    lease,
    options.now ?? new Date(),
  );
  if (validation) {
    return { status: 'skipped', reason: validation, core, lease };
  }

  const entryPath = options.entryPath?.trim() || '/';
  if (!isSafeEntryPath(entryPath)) {
    return { status: 'skipped', reason: 'entry_path_invalid', core, lease };
  }
  const previewUrl = entryPath === '/' ? lease.origin : new URL(entryPath, lease.origin).toString();
  const anchors = resolveLivePreviewArtifactAnchors(core, lease);
  const artifactId = buildLivePreviewArtifactId(lease, entryPath);
  const declarationId = `live-preview:${lease.previewId}`;
  const metadata = buildLivePreviewArtifactMetadata({
    lease,
    declarationId,
    anchors,
    previewUrl,
    materialChangeSignature: buildMaterialChangeSignature(lease, anchors, entryPath),
  });
  const result = upsertCoreArtifact(core, {
    id: artifactId,
    title: options.title?.trim() || `Live Preview (${lease.commandProfileId})`,
    kind: 'preview',
    status: 'ready',
    projectId: anchors.projectId,
    workItemId: anchors.workItemId,
    conversationId: anchors.conversationId,
    taskId: anchors.taskId,
    path: previewUrl,
    summary: options.summary?.trim() || `Supervised preview at ${previewUrl}.`,
    metadata,
  }, options.now ?? new Date());

  return {
    status: 'materialized',
    core: result.core,
    artifact: result.artifact,
    created: result.created,
    lease: {
      ...lease,
      artifactId: result.artifact.id,
    },
  };
}

export function materializeLivePreviewArtifactAndShowInCanvas(
  core: CatsCoreState,
  lease: LivePreviewLease,
  options: LivePreviewArtifactCanvasShowOptions = {},
): LivePreviewArtifactCanvasShowResult {
  const now = options.now ?? new Date();
  const materialized = materializeLivePreviewArtifact(core, lease, {
    title: options.title,
    summary: options.summary,
    entryPath: options.entryPath,
    now,
  });
  if (materialized.status === 'skipped') {
    return materialized;
  }

  const presentationRequested = options.presentationRequested ?? 'auto';
  const projection = buildArtifactCanvasProjection({
    core: materialized.core,
    surface: materialized.lease.surface,
    artifactId: materialized.artifact.id,
    presentationRequested,
    policyConfig: options.policyConfig ?? DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
    supervisorPreviewLeaseStore: createMaterializedLeaseStore(
      materialized.lease,
      options.supervisorPreviewLeaseStore,
      now,
    ),
    now,
  });
  if (projection.status === 'error') {
    return {
      status: 'rejected',
      reason: 'artifact_canvas_projection_error',
      core,
      error: projection.error,
      lease,
    };
  }

  const targetUrl = canvasSurfaceRouteRegistry.canvasUrl(
    materialized.lease.surface,
    materialized.artifact.id,
    presentationRequested,
  );
  const activity = appendArtifactCanvasIntentActivity({
    core: materialized.core,
    kind: 'artifact_canvas_show_intent',
    surface: materialized.lease.surface,
    actorId: options.actorId ?? null,
    artifactId: materialized.artifact.id,
    targetUrl,
    policyVersion: projection.projection.policyVersion,
    presentationRequested,
    presentationResolved: projection.projection.presentationResolved,
    iframeSandboxProfile: projection.projection.iframeSandboxProfile,
    metadata: {
      codeLivePreview: {
        previewId: materialized.lease.previewId,
        artifactId: materialized.artifact.id,
      },
    },
    now,
  });
  const intent = composeArtifactCanvasNavigateIntent({
    intentId: options.intentIdFactory?.() ?? createArtifactCanvasIntentId(),
    activityId: activity.activity.id,
    surface: materialized.lease.surface,
    artifactId: materialized.artifact.id,
    presentationRequested,
    policyVersion: projection.projection.policyVersion,
    triggeredAt: now.toISOString(),
  });
  const hub = options.renderIntentHub ?? getDefaultArtifactCanvasRenderIntentHub();
  const delivery = hub.publish({
    intent,
    targetSessionId: options.targetSessionId,
    now,
  });

  return {
    status: 'shown',
    core: activity.core,
    artifact: materialized.artifact,
    activity: activity.activity,
    delivery,
    intent,
    lease: materialized.lease,
  };
}

function resolveLivePreviewArtifactAnchors(
  core: CatsCoreState,
  lease: LivePreviewLease,
): ResolvedLivePreviewArtifactAnchors {
  const task = lease.surface.kind === 'code_task'
    ? core.tasks.find((candidate) => candidate.id === lease.surface.surfaceId) ?? null
    : null;
  const workItem = task
    ? core.workItems.find((candidate) => candidate.taskId === task.id) ?? null
    : null;
  return {
    conversationId: lease.surface.kind === 'code_conversation'
      ? buildChatConversationId(lease.surface.surfaceId)
      : task?.conversationId ?? null,
    projectId: workItem?.projectId ?? null,
    taskId: task?.id ?? (lease.surface.kind === 'code_task' ? lease.surface.surfaceId : null),
    workItemId: workItem?.id ?? null,
    workspacePath: lease.workspaceRef.rootPath,
  };
}

function validateLivePreviewLeaseForMaterialization(
  core: CatsCoreState,
  lease: LivePreviewLease,
  now: Date,
): LivePreviewArtifactMaterializationSkippedReason | null {
  if (lease.status !== 'ready') {
    return 'lease_not_ready';
  }
  if (
    lease.surface.kind !== 'code_task'
    && lease.surface.kind !== 'code_codespace'
    && lease.surface.kind !== 'code_conversation'
  ) {
    return 'unsupported_surface';
  }
  const expiresAt = Date.parse(lease.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    return 'lease_expired';
  }
  const originValidation = validateLoopbackPreviewLeaseOrigin(lease);
  if (originValidation) {
    return originValidation;
  }
  if (
    lease.surface.kind === 'code_task'
    && !core.tasks.some((candidate) => candidate.id === lease.surface.surfaceId)
  ) {
    return 'task_anchor_unresolved';
  }
  if (
    lease.surface.kind === 'code_conversation'
    && !core.conversations.some(
      (candidate) => candidate.id === buildChatConversationId(lease.surface.surfaceId),
    )
  ) {
    return 'conversation_anchor_unresolved';
  }
  if (lease.surface.kind === 'code_codespace') {
    const expectedCodespaceId = createCodespaceId(lease.workspaceRef.rootPath);
    if (lease.surface.surfaceId !== expectedCodespaceId) {
      return 'workspace_anchor_unresolved';
    }
  }
  return null;
}

function validateLoopbackPreviewLeaseOrigin(
  lease: LivePreviewLease,
): Extract<
  LivePreviewArtifactMaterializationSkippedReason,
  'lease_origin_invalid' | 'lease_origin_not_loopback'
> | null {
  let parsed: URL;
  try {
    parsed = new URL(lease.origin);
  } catch {
    return 'lease_origin_invalid';
  }
  if (
    parsed.protocol !== 'http:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.pathname !== '/'
    || parsed.search !== ''
    || parsed.hash !== ''
  ) {
    return 'lease_origin_invalid';
  }
  const originHost = normalizeHostToken(parsed.hostname);
  const leaseHost = normalizeHostToken(lease.host);
  const parsedPort = parsed.port ? Number(parsed.port) : 80;
  if (
    (originHost !== '127.0.0.1' && originHost !== '::1')
    || (leaseHost !== '127.0.0.1' && leaseHost !== '::1')
    || originHost !== leaseHost
    || parsedPort !== lease.port
  ) {
    return 'lease_origin_not_loopback';
  }
  return null;
}

function buildLivePreviewArtifactMetadata(input: {
  lease: LivePreviewLease;
  declarationId: string;
  anchors: ResolvedLivePreviewArtifactAnchors;
  previewUrl: string;
  materialChangeSignature: string;
}): CoreRecordMetadata {
  const idempotencyKey = hashStableJson({
    declarationId: input.declarationId,
    previewId: input.lease.previewId,
    producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
    scope: resolveLivePreviewArtifactScope(input.anchors),
  });
  return {
    codeArtifactDeclaration: {
      schemaVersion: '1.0',
      declarationId: input.declarationId,
      producerKind: 'tool',
      producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
      producerLabel: 'preview_url',
      disposition: 'record',
      candidate: false,
      location: { kind: 'url', value: input.previewUrl },
      anchors: {
        conversationId: input.anchors.conversationId,
        taskId: input.anchors.taskId,
        projectId: input.anchors.projectId,
        workItemId: input.anchors.workItemId,
        workspacePath: input.anchors.workspacePath,
      },
      materialChangeSignature: input.materialChangeSignature,
      idempotency: {
        key: idempotencyKey,
        producerKind: 'tool',
        producerIdentity: CODE_LIVE_PREVIEW_PRODUCER_IDENTITY,
        producerRuntimeSessionId: null,
        ...resolveLivePreviewArtifactScope(input.anchors),
        declarationId: input.declarationId,
        recoveredFromFrozenScope: false,
        retryScope: null,
      },
    },
    codeLivePreview: {
      schemaVersion: CODE_LIVE_PREVIEW_ARTIFACT_METADATA_SCHEMA_VERSION,
      previewId: input.lease.previewId,
      commandProfileId: input.lease.commandProfileId,
      workspace: {
        id: input.lease.workspaceRef.id,
        rootPath: input.lease.workspaceRef.rootPath,
      },
      sourceSurface: cloneCanvasSurface(input.lease.surface),
      // Lets a stopped or lost lease restart with the same profile and directory (CAP-13).
      ...(input.lease.artifactDirectory ? { artifactDirectory: input.lease.artifactDirectory } : {}),
    },
  };
}

function createMaterializedLeaseStore(
  lease: LivePreviewLease,
  fallback?: ArtifactCanvasSupervisorPreviewLeaseStore | null,
  now: Date = new Date(),
): ArtifactCanvasSupervisorPreviewLeaseStore {
  return {
    getLease(previewId: string) {
      const fallbackLease = fallback?.getLease(previewId) ?? null;
      if (previewId !== lease.previewId) {
        return fallbackLease;
      }
      if (fallbackLease && shouldPreferSupervisorLease(fallbackLease, lease, now)) {
        return fallbackLease;
      }
      return lease;
    },
  };
}

function shouldPreferSupervisorLease(
  supervisorLease: ArtifactCanvasSupervisorPreviewLease,
  materializedLease: LivePreviewLease,
  now: Date,
): boolean {
  if (supervisorLease.status !== 'ready') {
    return true;
  }
  const supervisorExpiresAt = Date.parse(supervisorLease.expiresAt);
  if (!Number.isFinite(supervisorExpiresAt) || supervisorExpiresAt <= now.getTime()) {
    return true;
  }
  if (!isSameLivePreviewAuthority(supervisorLease, materializedLease)) {
    return true;
  }
  return supervisorLease.artifactId !== null
    && supervisorLease.artifactId !== materializedLease.artifactId;
}

function isSameLivePreviewAuthority(
  left: ArtifactCanvasSupervisorPreviewLease,
  right: LivePreviewLease,
): boolean {
  return left.previewId === right.previewId
    && normalizeLivePreviewOrigin(left.origin) === normalizeLivePreviewOrigin(right.origin)
    && left.surface.kind === right.surface.kind
    && left.surface.surfaceId === right.surface.surfaceId
    && left.workspaceRef.id === right.workspaceRef.id
    && normalizePathToken(left.workspaceRef.rootPath)
      === normalizePathToken(right.workspaceRef.rootPath);
}

function normalizeLivePreviewOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function resolveLivePreviewArtifactScope(
  anchors: ResolvedLivePreviewArtifactAnchors,
): { scopeKind: 'conversation' | 'workspace'; scopeId: string } {
  return anchors.conversationId
    ? { scopeKind: 'conversation', scopeId: anchors.conversationId }
    : { scopeKind: 'workspace', scopeId: normalizePathToken(anchors.workspacePath) };
}

function buildLivePreviewArtifactId(lease: LivePreviewLease, entryPath: string): string {
  return `artifact-live-preview-${hashStableJson({
    previewId: lease.previewId,
    sourceSurface: lease.surface,
    workspace: {
      id: lease.workspaceRef.id,
      rootPath: normalizePathToken(lease.workspaceRef.rootPath),
    },
    // One lease can serve several pages; the root keeps the historical id.
    ...(entryPath === '/' ? {} : { entryPath }),
  })}`;
}

function buildMaterialChangeSignature(
  lease: LivePreviewLease,
  anchors: ResolvedLivePreviewArtifactAnchors,
  entryPath: string,
): string {
  return hashStableJson({
    previewId: lease.previewId,
    commandProfileId: lease.commandProfileId,
    origin: lease.origin,
    sourceSurface: lease.surface,
    workspace: lease.workspaceRef,
    anchors,
    ...(entryPath === '/' ? {} : { entryPath }),
  });
}

function isSafeEntryPath(entryPath: string): boolean {
  if (!entryPath.startsWith('/') || entryPath.startsWith('//') || /[?#\\]/u.test(entryPath)) {
    return false;
  }
  return entryPath.split('/').every((segment) => segment !== '..' && segment !== '.');
}

function cloneCanvasSurface(surface: CanvasSurfaceRef): CanvasSurfaceRef {
  return {
    kind: surface.kind,
    surfaceId: surface.surfaceId,
  };
}

/**
 * Deterministic id for a Code codespace surface, derived from the
 * workspace's root path. Exported so tests and other callers compose
 * the same hash rule rather than re-implementing it (drift between a
 * test copy and this implementation would silently leave both green
 * while behaviour diverges).
 */
export function createCodespaceId(workspacePath: string): string {
  return `codespace-${hashToken(normalizePathToken(workspacePath))}`;
}

function normalizePathToken(value: string): string {
  return value.trim().replace(/\\/g, '/');
}

function normalizeHostToken(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function hashStableJson(value: unknown): string {
  return hashToken(stableJsonStringify(value));
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(',')}}`;
}
