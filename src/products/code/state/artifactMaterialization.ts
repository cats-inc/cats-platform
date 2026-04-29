import { createHash } from 'node:crypto';

import { upsertCoreArtifact } from '../../../core/model/planningRecords.js';
import type {
  CatsCoreState,
  CoreArtifactRecord,
  CoreArtifactStatus,
  CoreRecordMetadata,
} from '../../../core/types.js';
import {
  CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION,
  CODE_ARTIFACT_DECLARATION_TOOL,
  CodeArtifactDeclarationError,
  resolveCodeArtifactLabelMapping,
  type CodeArtifactDeclaration,
  type CodeArtifactDeclarationErrorCode,
  type CodeArtifactDisposition,
  type CodeArtifactLocationNormalized,
  type CodeArtifactProducer,
  type CodeArtifactToolResult,
} from '../shared/artifactDeclaration.js';

export type CodeArtifactMaterializationScopeKind =
  | 'run'
  | 'runtime'
  | 'conversation'
  | 'workspace';

export interface CodeArtifactMaterializationResult {
  core: CatsCoreState;
  artifact: CoreArtifactRecord;
  created: boolean;
  disposition: CodeArtifactDisposition;
  toolResult: CodeArtifactToolResult;
}

interface ResolvedProducerIdentity {
  kind: CodeArtifactProducer['kind'];
  value: string;
  encoded: string;
}

interface ResolvedScope {
  kind: CodeArtifactMaterializationScopeKind;
  id: string;
}

export function materializeCodeArtifactDeclaration(
  core: CatsCoreState,
  declaration: CodeArtifactDeclaration,
  now: Date = new Date(),
): CodeArtifactMaterializationResult {
  if (declaration.requestedStatus === 'published') {
    throw new CodeArtifactDeclarationError(
      'artifact_publish_requires_action',
      'Ordinary artifact declarations cannot set published status.',
    );
  }

  validateAnchors(core, declaration);

  const mapping = resolveCodeArtifactLabelMapping(declaration.artifact.label);
  const producerIdentity = resolveProducerIdentity(declaration.producer);
  const scope = resolveMaterializationScope(declaration);
  const idempotencyKey = buildCodeArtifactIdempotencyKey({
    producer: declaration.producer.kind,
    producerIdentity,
    scope,
    declarationId: declaration.declarationId,
  });
  const disposition = resolveMaterializationDisposition(declaration);
  const status = resolveMaterializationStatus(declaration, disposition, mapping.defaultStatus);
  const location = normalizeMaterializedLocation(declaration.location, declaration.anchors?.workspacePath);
  const artifactId = `artifact-${hashStableIdempotencyKey(idempotencyKey)}`;
  const metadata = buildCoreArtifactMetadata({
    declaration,
    disposition,
    producerIdentity,
    scope,
    idempotencyKey,
    location,
  });
  const result = upsertCoreArtifact(core, {
    id: artifactId,
    title: declaration.artifact.title,
    kind: declaration.artifact.coreKind ?? mapping.coreKind,
    status,
    projectId: declaration.anchors?.projectId ?? null,
    workItemId: declaration.anchors?.workItemId ?? null,
    conversationId: declaration.anchors?.conversationId ?? null,
    taskId: declaration.anchors?.taskId ?? null,
    runId: declaration.anchors?.runId ?? null,
    path: location.path,
    mimeType: declaration.artifact.mimeType ?? null,
    sizeBytes: declaration.artifact.sizeBytes ?? null,
    summary: declaration.artifact.summary ?? null,
    metadata,
  }, now);

  return {
    core: result.core,
    artifact: result.artifact,
    created: result.created,
    disposition,
    toolResult: CODE_ARTIFACT_DECLARATION_TOOL.materializationAccepted({
      declarationId: declaration.declarationId,
      disposition,
      artifactId: result.artifact.id,
      artifactStatus: result.artifact.status as Extract<
        CoreArtifactStatus,
        'draft' | 'ready' | 'published'
      >,
    }),
  };
}

function resolveMaterializationDisposition(
  declaration: CodeArtifactDeclaration,
): CodeArtifactDisposition {
  const mapping = resolveCodeArtifactLabelMapping(declaration.artifact.label);
  if (declaration.producer.kind === 'system') {
    return 'candidate';
  }
  if (mapping.defaultDisposition === 'candidate') {
    return 'candidate';
  }
  return declaration.requestedDisposition === 'candidate'
    ? 'candidate'
    : mapping.defaultDisposition;
}

function resolveMaterializationStatus(
  declaration: CodeArtifactDeclaration,
  disposition: CodeArtifactDisposition,
  defaultStatus: Extract<CoreArtifactStatus, 'draft' | 'ready'>,
): Extract<CoreArtifactStatus, 'draft' | 'ready'> {
  if (disposition === 'candidate') {
    return 'draft';
  }
  if (defaultStatus === 'draft') {
    return 'draft';
  }
  return declaration.requestedStatus === 'draft' ? 'draft' : defaultStatus;
}

function resolveProducerIdentity(producer: CodeArtifactProducer): ResolvedProducerIdentity {
  switch (producer.kind) {
    case 'agent':
    case 'user': {
      const actorId = normalizeRequiredString(
        producer.actorId,
        producer.kind === 'agent'
          ? 'artifact_agent_actor_required'
          : 'artifact_user_actor_required',
        `${producer.kind} artifact declarations require a resolved actor id.`,
      );
      return {
        kind: producer.kind,
        value: actorId,
        encoded: `actor:${actorId}`,
      };
    }
    case 'tool': {
      const toolName = normalizeRequiredString(
        producer.toolName,
        'artifact_tool_not_allowed',
        'Tool artifact declarations require a resolved tool name.',
      );
      return {
        kind: 'tool',
        value: toolName,
        encoded: `tool:${toolName}`,
      };
    }
    case 'system': {
      const detectorName = producer.toolName?.trim() || 'code-bridge';
      if (detectorName !== 'code-bridge') {
        throw new CodeArtifactDeclarationError(
          'artifact_system_detector_not_allowed',
          'System artifact declarations require an allowlisted detector.',
          { detectorName },
        );
      }
      return {
        kind: 'system',
        value: detectorName,
        encoded: `system:${detectorName}`,
      };
    }
    default: {
      const exhaustive: never = producer.kind;
      return exhaustive;
    }
  }
}

function resolveMaterializationScope(declaration: CodeArtifactDeclaration): ResolvedScope {
  if (declaration.anchors?.runId) {
    return { kind: 'run', id: declaration.anchors.runId };
  }
  if (declaration.producer.runtimeSessionId) {
    return { kind: 'runtime', id: declaration.producer.runtimeSessionId };
  }
  if (declaration.anchors?.conversationId) {
    return { kind: 'conversation', id: declaration.anchors.conversationId };
  }
  if (declaration.anchors?.workspacePath) {
    return { kind: 'workspace', id: normalizeWorkspaceKey(declaration.anchors.workspacePath) };
  }
  throw new CodeArtifactDeclarationError(
    'artifact_anchor_required',
    'Artifact declarations require a run, runtime, conversation, or workspace anchor.',
  );
}

function buildCodeArtifactIdempotencyKey(input: {
  producer: CodeArtifactProducer['kind'];
  producerIdentity: ResolvedProducerIdentity;
  scope: ResolvedScope;
  declarationId: string;
}): string {
  return [
    'code-artifact-declaration:v1',
    `producer=${input.producer}:${input.producerIdentity.encoded}`,
    `scope=${input.scope.kind}:${input.scope.id}`,
    `declaration=${input.declarationId}`,
  ].join(':');
}

function hashStableIdempotencyKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 24);
}

function validateAnchors(core: CatsCoreState, declaration: CodeArtifactDeclaration): void {
  const anchors = declaration.anchors ?? {};
  if (anchors.conversationId && !core.conversations.some((record) => record.id === anchors.conversationId)) {
    throw new CodeArtifactDeclarationError(
      'artifact_anchor_required',
      'Artifact declaration conversation anchor does not exist.',
      { conversationId: anchors.conversationId },
    );
  }
  if (anchors.taskId && !core.tasks.some((record) => record.id === anchors.taskId)) {
    throw new CodeArtifactDeclarationError(
      'artifact_anchor_required',
      'Artifact declaration task anchor does not exist.',
      { taskId: anchors.taskId },
    );
  }
  if (anchors.runId && !core.runs.some((record) => record.id === anchors.runId)) {
    throw new CodeArtifactDeclarationError(
      'artifact_anchor_required',
      'Artifact declaration run anchor does not exist.',
      { runId: anchors.runId },
    );
  }
  if (anchors.projectId && !core.projects.some((record) => record.id === anchors.projectId)) {
    throw new CodeArtifactDeclarationError(
      'artifact_anchor_required',
      'Artifact declaration project anchor does not exist.',
      { projectId: anchors.projectId },
    );
  }
  if (anchors.workItemId && !core.workItems.some((record) => record.id === anchors.workItemId)) {
    throw new CodeArtifactDeclarationError(
      'artifact_anchor_required',
      'Artifact declaration work item anchor does not exist.',
      { workItemId: anchors.workItemId },
    );
  }
  if (anchors.runId && anchors.taskId) {
    const run = core.runs.find((record) => record.id === anchors.runId);
    if (run?.taskId && run.taskId !== anchors.taskId) {
      throw new CodeArtifactDeclarationError(
        'artifact_anchor_required',
        'Artifact declaration run and task anchors are incompatible.',
        { runId: anchors.runId, taskId: anchors.taskId },
      );
    }
  }
}

function normalizeMaterializedLocation(
  location: CodeArtifactLocationNormalized | undefined,
  workspacePath: string | null | undefined,
): { path: string | null; metadataLocation: CodeArtifactLocationNormalized | null } {
  if (!location || location.kind === 'none' || location.kind === 'inline_summary') {
    return { path: null, metadataLocation: location ?? null };
  }
  if (location.kind === 'local_path') {
    const value = normalizeRequiredString(
      location.value,
      'artifact_location_value_required',
      'local_path artifact declarations require a path value.',
    );
    return {
      path: resolveContainedLocalPath(value, workspacePath),
      metadataLocation: location,
    };
  }
  return {
    path: location.value ?? null,
    metadataLocation: location,
  };
}

function resolveContainedLocalPath(
  value: string,
  workspacePath: string | null | undefined,
): string {
  const workspace = workspacePath?.trim();
  if (!workspace) {
    throw new CodeArtifactDeclarationError(
      'artifact_anchor_required',
      'local_path artifact declarations require a workspace anchor.',
    );
  }

  const normalizedValue = normalizePathForComparison(value);
  if (normalizedValue === '..' || normalizedValue.startsWith('../')) {
    throw new CodeArtifactDeclarationError(
      'artifact_local_path_invalid',
      'local_path artifact declarations must stay inside the workspace.',
      { value },
    );
  }

  const normalizedWorkspace = normalizePathForComparison(workspace);
  if (isAbsolutePath(normalizedValue)) {
    const comparableValue = normalizePathCase(normalizedValue);
    const comparableWorkspace = normalizePathCase(normalizedWorkspace);
    if (
      comparableValue !== comparableWorkspace
      && !comparableValue.startsWith(`${comparableWorkspace}/`)
    ) {
      throw new CodeArtifactDeclarationError(
        'artifact_local_path_invalid',
        'local_path artifact declarations must stay inside the workspace.',
        { value, workspacePath: workspace },
      );
    }
    return normalizedValue;
  }

  return `${normalizedWorkspace}/${normalizedValue}`;
}

function normalizeWorkspaceKey(workspacePath: string): string {
  return normalizePathCase(normalizePathForComparison(workspacePath));
}

function normalizePathForComparison(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+$/u, '') || '/';
}

function normalizePathCase(value: string): string {
  return /^[a-zA-Z]:\//u.test(value) ? value.toLowerCase() : value;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[a-zA-Z]:\//u.test(value);
}

function buildCoreArtifactMetadata(input: {
  declaration: CodeArtifactDeclaration;
  disposition: CodeArtifactDisposition;
  producerIdentity: ResolvedProducerIdentity;
  scope: ResolvedScope;
  idempotencyKey: string;
  location: { metadataLocation: CodeArtifactLocationNormalized | null };
}): CoreRecordMetadata {
  return {
    ...(input.declaration.metadata ?? {}),
    codeArtifactDeclaration: {
      schemaVersion: CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION,
      declarationId: input.declaration.declarationId,
      producerKind: input.declaration.producer.kind,
      producerIdentity: input.producerIdentity.encoded,
      producerLabel: input.declaration.artifact.label,
      disposition: input.disposition,
      candidate: input.disposition === 'candidate',
      location: input.location.metadataLocation,
      anchors: input.declaration.anchors ?? {},
      idempotency: {
        key: input.idempotencyKey,
        producerKind: input.declaration.producer.kind,
        producerIdentity: input.producerIdentity.encoded,
        scopeKind: input.scope.kind,
        scopeId: input.scope.id,
        declarationId: input.declaration.declarationId,
      },
    },
  };
}

function normalizeRequiredString(
  input: string | null | undefined,
  code: CodeArtifactDeclarationErrorCode,
  message: string,
): string {
  const value = input?.trim();
  if (!value) {
    throw new CodeArtifactDeclarationError(code, message);
  }
  return value;
}
