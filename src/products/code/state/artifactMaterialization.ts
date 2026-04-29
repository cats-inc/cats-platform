import { createHash } from 'node:crypto';

import { appendCoreActivity } from '../../../core/model/executionRecords.js';
import { upsertCoreArtifact } from '../../../core/model/planningRecords.js';
import type {
  CoreActivityRecord,
  CatsCoreState,
  CoreArtifactRecord,
  CoreArtifactKind,
  CoreArtifactStatus,
  CoreRecordMetadata,
} from '../../../core/types.js';
import {
  CODE_ARTIFACT_DECLARATION_SCHEMA_VERSION,
  CODE_ARTIFACT_DECLARATION_TOOL,
  CodeArtifactDeclarationError,
  resolveCodeArtifactLabelMapping,
  type CodeArtifactDeclaration,
  type CodeArtifactDeclarationAnchors,
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
  activity: CoreActivityRecord | null;
  activityCreated: boolean;
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

interface ResolvedIdempotency {
  key: string;
  scope: ResolvedScope;
  artifactId: string;
  existing: CoreArtifactRecord | null;
  recoveredFromFrozenScope: boolean;
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

  const mapping = resolveCodeArtifactLabelMapping(declaration.artifact.label);
  const producerIdentity = resolveProducerIdentity(declaration.producer);
  validateAnchors(core, declaration);
  const scope = resolveMaterializationScope(declaration);
  const idempotencyKey = buildCodeArtifactIdempotencyKey({
    producer: declaration.producer.kind,
    producerIdentity,
    scope,
    declarationId: declaration.declarationId,
  });
  const idempotency = resolveArtifactIdempotency(core, {
    currentKey: idempotencyKey,
    currentScope: scope,
    producerKind: declaration.producer.kind,
    producerIdentity: producerIdentity.encoded,
    producerRuntimeSessionId: readNonEmptyString(declaration.producer.runtimeSessionId),
    declarationId: declaration.declarationId,
  });
  const effectiveDeclaration: CodeArtifactDeclaration = {
    ...declaration,
    anchors: mergeDeclarationAnchors(declaration.anchors, idempotency.existing),
  };
  validateAnchors(core, effectiveDeclaration);
  const disposition = resolveMaterializationDisposition(declaration);
  const status = resolveMaterializationStatus(declaration, disposition, mapping.defaultStatus);
  const location = normalizeMaterializedLocation(
    declaration.location,
    effectiveDeclaration.anchors?.workspacePath,
  );
  const materialChangeSignature = buildMaterialChangeSignature({
    declaration: effectiveDeclaration,
    kind: effectiveDeclaration.artifact.coreKind ?? mapping.coreKind,
    status,
    disposition,
    location,
  });
  const existing = idempotency.existing;
  const existingSignature = readMaterialChangeSignature(existing);
  const shouldRecordActivity = existingSignature !== materialChangeSignature;
  const metadata = buildCoreArtifactMetadata({
    declaration: effectiveDeclaration,
    disposition,
    producerIdentity,
    scope: idempotency.scope,
    idempotencyKey: idempotency.key,
    recoveredFromFrozenScope: idempotency.recoveredFromFrozenScope,
    retryScope: idempotency.recoveredFromFrozenScope ? scope : null,
    location,
    materialChangeSignature,
  });
  const result = upsertCoreArtifact(core, {
    id: idempotency.artifactId,
    title: effectiveDeclaration.artifact.title,
    kind: effectiveDeclaration.artifact.coreKind ?? mapping.coreKind,
    status,
    projectId: effectiveDeclaration.anchors?.projectId ?? null,
    workItemId: effectiveDeclaration.anchors?.workItemId ?? null,
    conversationId: effectiveDeclaration.anchors?.conversationId ?? null,
    taskId: effectiveDeclaration.anchors?.taskId ?? null,
    runId: effectiveDeclaration.anchors?.runId ?? null,
    path: location.path,
    mimeType: declaration.artifact.mimeType ?? null,
    sizeBytes: declaration.artifact.sizeBytes ?? null,
    summary: declaration.artifact.summary ?? null,
    metadata,
  }, now);
  const activityResult = shouldRecordActivity
    ? appendCoreActivity(result.core, {
        id: `activity-${hashStableIdempotencyKey(`${result.artifact.id}:${materialChangeSignature}`)}`,
        kind: 'artifact_recorded',
        actorId: resolveActivityActorId(declaration.producer),
        projectId: result.artifact.projectId,
        workItemId: result.artifact.workItemId,
        conversationId: result.artifact.conversationId,
        taskId: result.artifact.taskId,
        runId: result.artifact.runId,
        artifactId: result.artifact.id,
        message: `Recorded Code artifact: ${result.artifact.title}.`,
        metadata: {
          codeArtifactDeclaration: {
            declarationId: declaration.declarationId,
            producerLabel: declaration.artifact.label,
            disposition,
            materialChangeSignature,
          },
        },
      }, now)
    : null;
  const nextCore = activityResult?.core ?? result.core;

  return {
    core: nextCore,
    artifact: result.artifact,
    activity: activityResult?.activity ?? null,
    activityCreated: activityResult?.created ?? false,
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
    case 'agent': {
      normalizeRequiredString(
        producer.runtimeSessionId,
        'artifact_required_field_empty',
        'Agent artifact declarations require a resolved runtime session id.',
      );
      if (readNonEmptyString(producer.toolName)) {
        throw new CodeArtifactDeclarationError(
          'artifact_producer_tool_not_allowed',
          'agent artifact declarations must not supply a tool name.',
          { producerKind: producer.kind },
        );
      }
      const actorId = normalizeRequiredString(
        producer.actorId,
        'artifact_agent_actor_required',
        'agent artifact declarations require a resolved actor id.',
      );
      return {
        kind: producer.kind,
        value: actorId,
        encoded: `actor:${actorId}`,
      };
    }
    case 'user': {
      if (readNonEmptyString(producer.toolName)) {
        throw new CodeArtifactDeclarationError(
          'artifact_producer_tool_not_allowed',
          `${producer.kind} artifact declarations must not supply a tool name.`,
          { producerKind: producer.kind },
        );
      }
      const actorId = normalizeRequiredString(
        producer.actorId,
        'artifact_user_actor_required',
        `${producer.kind} artifact declarations require a resolved actor id.`,
      );
      return {
        kind: producer.kind,
        value: actorId,
        encoded: `actor:${actorId}`,
      };
    }
    case 'tool': {
      if (readNonEmptyString(producer.actorId)) {
        throw new CodeArtifactDeclarationError(
          'artifact_producer_actor_not_allowed',
          'Tool artifact declarations must not supply an actor id.',
        );
      }
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
      if (readNonEmptyString(producer.actorId)) {
        throw new CodeArtifactDeclarationError(
          'artifact_producer_actor_not_allowed',
          'System artifact declarations must not supply an actor id.',
        );
      }
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

function resolveArtifactIdempotency(
  core: CatsCoreState,
  input: {
    currentKey: string;
    currentScope: ResolvedScope;
    producerKind: CodeArtifactProducer['kind'];
    producerIdentity: string;
    producerRuntimeSessionId: string | null;
    declarationId: string;
  },
): ResolvedIdempotency {
  const currentArtifactId = `artifact-${hashStableIdempotencyKey(input.currentKey)}`;
  const currentExisting =
    core.artifacts.find((artifact) => artifact.id === currentArtifactId) ?? null;
  if (currentExisting) {
    return {
      key: input.currentKey,
      scope: input.currentScope,
      artifactId: currentArtifactId,
      existing: currentExisting,
      recoveredFromFrozenScope: false,
    };
  }

  const compatibleArtifacts = core.artifacts.filter((artifact) => {
    const idempotency = readArtifactIdempotency(artifact);
    return idempotency?.producerKind === input.producerKind
      && idempotency.producerIdentity === input.producerIdentity
      && isCompatibleFrozenRuntimeSession(idempotency, input)
      && idempotency.declarationId === input.declarationId;
  });

  if (compatibleArtifacts.length > 1) {
    throw new CodeArtifactDeclarationError(
      'artifact_idempotency_ambiguous',
      'Artifact declaration retry matched multiple frozen idempotency scopes.',
      {
        candidates: compatibleArtifacts.map((artifact) => {
          const idempotency = readArtifactIdempotency(artifact);
          return {
            artifactId: artifact.id,
            title: artifact.title,
            status: artifact.status,
            scopeKind: idempotency?.scopeKind ?? null,
            scopeId: idempotency?.scopeId ?? null,
          };
        }),
      },
    );
  }

  const frozenArtifact = compatibleArtifacts[0] ?? null;
  const frozenIdempotency = readArtifactIdempotency(frozenArtifact);
  if (frozenArtifact && frozenIdempotency) {
    return {
      key: frozenIdempotency.key,
      scope: {
        kind: frozenIdempotency.scopeKind,
        id: frozenIdempotency.scopeId,
      },
      artifactId: frozenArtifact.id,
      existing: frozenArtifact,
      recoveredFromFrozenScope: true,
    };
  }

  return {
    key: input.currentKey,
    scope: input.currentScope,
    artifactId: currentArtifactId,
    existing: null,
    recoveredFromFrozenScope: false,
  };
}

function isCompatibleFrozenRuntimeSession(
  idempotency: NonNullable<ReturnType<typeof readArtifactIdempotency>>,
  input: {
    producerKind: CodeArtifactProducer['kind'];
    producerRuntimeSessionId: string | null;
  },
): boolean {
  if (input.producerKind === 'agent') {
    return idempotency.producerRuntimeSessionId === input.producerRuntimeSessionId;
  }
  return true;
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
  recoveredFromFrozenScope: boolean;
  retryScope: ResolvedScope | null;
  materialChangeSignature: string;
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
      materialChangeSignature: input.materialChangeSignature,
      idempotency: {
        key: input.idempotencyKey,
        producerKind: input.declaration.producer.kind,
        producerIdentity: input.producerIdentity.encoded,
        producerRuntimeSessionId: readNonEmptyString(
          input.declaration.producer.runtimeSessionId,
        ),
        scopeKind: input.scope.kind,
        scopeId: input.scope.id,
        declarationId: input.declaration.declarationId,
        recoveredFromFrozenScope: input.recoveredFromFrozenScope,
        retryScope: input.retryScope
          ? {
              scopeKind: input.retryScope.kind,
              scopeId: input.retryScope.id,
            }
          : null,
      },
    },
  };
}

function buildMaterialChangeSignature(input: {
  declaration: CodeArtifactDeclaration;
  kind: CoreArtifactKind;
  status: Extract<CoreArtifactStatus, 'draft' | 'ready'>;
  disposition: CodeArtifactDisposition;
  location: { path: string | null; metadataLocation: CodeArtifactLocationNormalized | null };
}): string {
  const anchors = input.declaration.anchors ?? {};
  return hashStableIdempotencyKey(stableJsonStringify({
    title: input.declaration.artifact.title,
    kind: input.kind,
    status: input.status,
    projectId: anchors.projectId ?? null,
    workItemId: anchors.workItemId ?? null,
    conversationId: anchors.conversationId ?? null,
    taskId: anchors.taskId ?? null,
    runId: anchors.runId ?? null,
    path: input.location.path,
    mimeType: input.declaration.artifact.mimeType ?? null,
    sizeBytes: input.declaration.artifact.sizeBytes ?? null,
    summary: input.declaration.artifact.summary ?? null,
    producerLabel: input.declaration.artifact.label,
    disposition: input.disposition,
    location: input.location.metadataLocation,
    candidate: input.disposition === 'candidate',
    producerDetails: removeVolatileProducerDetails(
      readProducerDetails(input.declaration.metadata),
    ),
  }));
}

function readMaterialChangeSignature(artifact: CoreArtifactRecord | null): string | null {
  const declaration = asRecord(artifact?.metadata.codeArtifactDeclaration);
  const signature = declaration?.materialChangeSignature;
  return typeof signature === 'string' && signature.trim() ? signature : null;
}

function readArtifactIdempotency(artifact: CoreArtifactRecord | null): {
  key: string;
  producerKind: CodeArtifactProducer['kind'];
  producerIdentity: string;
  producerRuntimeSessionId: string | null;
  scopeKind: CodeArtifactMaterializationScopeKind;
  scopeId: string;
  declarationId: string;
} | null {
  const declaration = asRecord(artifact?.metadata.codeArtifactDeclaration);
  const idempotency = asRecord(declaration?.idempotency);
  const key = readNonEmptyString(idempotency?.key);
  const producerKind = readNonEmptyString(idempotency?.producerKind);
  const producerIdentity = readNonEmptyString(idempotency?.producerIdentity);
  const producerRuntimeSessionId = readNonEmptyString(idempotency?.producerRuntimeSessionId);
  const scopeKind = readNonEmptyString(idempotency?.scopeKind);
  const scopeId = readNonEmptyString(idempotency?.scopeId);
  const declarationId = readNonEmptyString(idempotency?.declarationId);
  if (
    !key
    || !isCodeArtifactProducerKind(producerKind)
    || !producerIdentity
    || !isCodeArtifactMaterializationScopeKind(scopeKind)
    || !scopeId
    || !declarationId
  ) {
    return null;
  }

  return {
    key,
    producerKind,
    producerIdentity,
    producerRuntimeSessionId,
    scopeKind,
    scopeId,
    declarationId,
  };
}

function mergeDeclarationAnchors(
  anchors: CodeArtifactDeclarationAnchors | undefined,
  existing: CoreArtifactRecord | null,
): CodeArtifactDeclarationAnchors {
  const existingAnchors = readExistingDeclarationAnchors(existing);
  assertNoAnchorConflicts(anchors, existingAnchors, existing);
  return {
    conversationId:
      readNonEmptyString(anchors?.conversationId)
      ?? existingAnchors.conversationId
      ?? null,
    taskId: readNonEmptyString(anchors?.taskId) ?? existingAnchors.taskId ?? null,
    runId: readNonEmptyString(anchors?.runId) ?? existingAnchors.runId ?? null,
    projectId: readNonEmptyString(anchors?.projectId) ?? existingAnchors.projectId ?? null,
    workItemId:
      readNonEmptyString(anchors?.workItemId)
      ?? existingAnchors.workItemId
      ?? null,
    workspacePath:
      readNonEmptyString(anchors?.workspacePath)
      ?? existingAnchors.workspacePath
      ?? null,
  };
}

function assertNoAnchorConflicts(
  anchors: CodeArtifactDeclarationAnchors | undefined,
  existingAnchors: CodeArtifactDeclarationAnchors,
  existing: CoreArtifactRecord | null,
): void {
  if (!existing) {
    return;
  }

  for (const field of [
    'conversationId',
    'taskId',
    'runId',
    'projectId',
    'workItemId',
    'workspacePath',
  ] as const) {
    const incoming = readNonEmptyString(anchors?.[field]);
    const frozen = readNonEmptyString(existingAnchors[field]);
    if (!incoming || !frozen) {
      continue;
    }
    // Core ids are case-sensitive; callers must preserve id casing. Workspace
    // paths are the only anchor field normalized through filesystem rules.
    const matches = field === 'workspacePath'
      ? normalizeWorkspaceKey(incoming) === normalizeWorkspaceKey(frozen)
      : incoming === frozen;
    if (!matches) {
      throw new CodeArtifactDeclarationError(
        'artifact_anchor_conflict',
        'Artifact declaration retry conflicts with the frozen artifact anchor.',
        {
          artifactId: existing.id,
          field,
          incoming,
          frozen,
        },
      );
    }
  }
}

function readExistingDeclarationAnchors(
  existing: CoreArtifactRecord | null,
): CodeArtifactDeclarationAnchors {
  const declaration = asRecord(existing?.metadata.codeArtifactDeclaration);
  const metadataAnchors = asRecord(declaration?.anchors);
  return {
    conversationId: existing?.conversationId ?? readNonEmptyString(metadataAnchors?.conversationId),
    taskId: existing?.taskId ?? readNonEmptyString(metadataAnchors?.taskId),
    runId: existing?.runId ?? readNonEmptyString(metadataAnchors?.runId),
    projectId: existing?.projectId ?? readNonEmptyString(metadataAnchors?.projectId),
    workItemId: existing?.workItemId ?? readNonEmptyString(metadataAnchors?.workItemId),
    workspacePath: readNonEmptyString(metadataAnchors?.workspacePath),
  };
}

function resolveActivityActorId(producer: CodeArtifactProducer): string | null {
  return producer.kind === 'agent' || producer.kind === 'user'
    ? producer.actorId?.trim() || null
    : null;
}

function readProducerDetails(metadata: CoreRecordMetadata | undefined): unknown {
  return metadata?.producerDetails ?? null;
}

function removeVolatileProducerDetails(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => removeVolatileProducerDetails(item));
  }
  const record = asRecord(value);
  if (!record) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (isVolatileProducerDetailKey(key)) {
      continue;
    }
    normalized[key] = removeVolatileProducerDetails(child);
  }
  return normalized;
}

function isVolatileProducerDetailKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.endsWith('at')
    || normalized.includes('timestamp')
    || normalized === 'retrycount'
    || normalized === 'attemptcount'
    || normalized === 'observedat'
    || normalized === 'receivedat'
    || normalized === 'updatedat'
    || normalized === 'createdat';
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  const record = asRecord(value);
  if (!record) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJsonValue(child)]),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function isCodeArtifactProducerKind(
  value: string | null,
): value is CodeArtifactProducer['kind'] {
  return value === 'agent'
    || value === 'tool'
    || value === 'system'
    || value === 'user';
}

function isCodeArtifactMaterializationScopeKind(
  value: string | null,
): value is CodeArtifactMaterializationScopeKind {
  return value === 'run'
    || value === 'runtime'
    || value === 'conversation'
    || value === 'workspace';
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
