import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../shared/http.js';
import { CODE_API_ARTIFACT_DECLARATIONS_PATTERN } from '../shared/apiPaths.js';
import {
  CODE_ARTIFACT_DECLARATION_TOOL,
  CodeArtifactDeclarationError,
  type CodeArtifactDeclarationAnchors,
  type CodeArtifactProducer,
  type CodeArtifactProducerKind,
} from '../shared/artifactDeclaration.js';
import {
  materializeCodeArtifactDeclaration,
} from '../state/artifactMaterialization.js';
import type {
  CodeArtifactDeclarationSubmitRequest,
  CodeArtifactDeclarationSubmitResponse,
} from './contracts.js';
import type { CodeApiRouteContext } from './index.js';
import { buildCodeArtifactDetailProjection } from './projection.js';

export async function routeCodeArtifactDeclarationApi(
  context: CodeApiRouteContext,
): Promise<boolean> {
  const declarationMatch = matchRoute(
    context.url.pathname,
    CODE_API_ARTIFACT_DECLARATIONS_PATTERN,
  );
  if (!declarationMatch) {
    return false;
  }
  if (context.method !== 'POST') {
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  let body: CodeArtifactDeclarationSubmitRequest;
  try {
    body = await readJsonBody<CodeArtifactDeclarationSubmitRequest>(context.request);
  } catch {
    sendJson(context.response, 400, {
      error: { code: 'invalid_body', message: 'Request body must be valid JSON.' },
    });
    return true;
  }

  if (!isRecord(body) || !isRecord(body.declaration)) {
    sendJson(context.response, 400, {
      error: {
        code: 'invalid_artifact_declaration',
        message: 'Request body must include a declaration object.',
      },
    });
    return true;
  }

  let declarationInput;
  let producer: CodeArtifactProducer;
  let anchors: CodeArtifactDeclarationAnchors;
  try {
    declarationInput = CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput(body.declaration);
    producer = normalizeSubmitProducer(body.producer);
    anchors = normalizeSubmitAnchors(body.anchors);
  } catch (error) {
    if (error instanceof CodeArtifactDeclarationError) {
      sendCodeArtifactDeclarationError(context, 400, error);
      return true;
    }
    sendJson(context.response, 400, {
      error: {
        code: 'invalid_artifact_declaration',
        message: 'Request body must include a valid declaration payload.',
      },
    });
    return true;
  }

  try {
    const currentCore = await context.dependencies.coreStore.readCore();
    const declaration = CODE_ARTIFACT_DECLARATION_TOOL.createDeclaration(
      declarationInput,
      producer,
      anchors,
    );
    const materialization = materializeCodeArtifactDeclaration(
      currentCore,
      declaration,
      context.dependencies.now?.(),
    );
    const core = await context.dependencies.coreStore.writeCore(materialization.core);
    const artifact = core.artifacts.find((candidate) =>
      candidate.id === materialization.artifact.id) ?? materialization.artifact;
    const response: CodeArtifactDeclarationSubmitResponse = {
      artifact: buildCodeArtifactDetailProjection(core, artifact),
      created: materialization.created,
      disposition: materialization.disposition,
      toolResult: materialization.toolResult,
    };
    sendJson(context.response, response.created ? 201 : 200, response);
  } catch (error) {
    if (error instanceof CodeArtifactDeclarationError) {
      sendCodeArtifactDeclarationError(context, 422, error);
      return true;
    }
    logCodeArtifactDeclarationFailure(context, error);
    sendJson(context.response, 422, {
      error: {
        code: 'artifact_declaration_failed',
        message: 'Artifact declaration failed.',
      },
    });
  }

  return true;
}

function sendCodeArtifactDeclarationError(
  context: CodeApiRouteContext,
  status: 400 | 422,
  error: CodeArtifactDeclarationError,
): void {
  sendJson(context.response, status, {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  });
}

function normalizeSubmitProducer(input: unknown): CodeArtifactProducer {
  const producer = isRecord(input) ? input : null;
  const kind = normalizeOptionalString(producer?.kind);
  if (!isCodeArtifactProducerKind(kind)) {
    throw new CodeArtifactDeclarationError(
      'artifact_required_field_empty',
      'Request body producer.kind is required.',
      { field: 'producer.kind' },
    );
  }

  const runtimeSessionId = normalizeOptionalString(producer?.runtimeSessionId);
  if (kind === 'agent' && !runtimeSessionId) {
    throw new CodeArtifactDeclarationError(
      'artifact_required_field_empty',
      'Request body producer.runtimeSessionId is required for agent declarations.',
      { field: 'producer.runtimeSessionId', producerKind: kind },
    );
  }

  // This route accepts server-resolved producer metadata from product-owned
  // callers. It must not be exposed as a raw unauthenticated client endpoint.
  return {
    kind,
    actorId: normalizeOptionalString(producer?.actorId),
    toolName: normalizeOptionalString(producer?.toolName),
    runtimeSessionId,
  };
}

function logCodeArtifactDeclarationFailure(
  context: CodeApiRouteContext,
  error: unknown,
): void {
  context.dependencies.logger?.error('Code artifact declaration failed.', {
    path: context.url.pathname,
    method: context.method,
    error: serializeError(error),
  });
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: String(error) };
}

function normalizeSubmitAnchors(input: unknown): CodeArtifactDeclarationAnchors {
  if (input === undefined || input === null) {
    return {};
  }
  if (!isRecord(input)) {
    throw new CodeArtifactDeclarationError(
      'artifact_anchor_required',
      'Request body anchors must be an object when provided.',
    );
  }

  return {
    conversationId: normalizeOptionalString(input.conversationId),
    taskId: normalizeOptionalString(input.taskId),
    runId: normalizeOptionalString(input.runId),
    projectId: normalizeOptionalString(input.projectId),
    workItemId: normalizeOptionalString(input.workItemId),
    workspacePath: normalizeOptionalString(input.workspacePath),
  };
}

function normalizeOptionalString(input: unknown): string | null {
  return typeof input === 'string' && input.trim().length > 0
    ? input.trim()
    : null;
}

function isCodeArtifactProducerKind(
  value: string | null,
): value is CodeArtifactProducerKind {
  return value === 'agent'
    || value === 'tool'
    || value === 'system'
    || value === 'user';
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}
