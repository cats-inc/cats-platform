import {
  matchRoute,
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
} from '../../../shared/http.js';
import { CODE_API_ARTIFACT_DECLARATIONS_PATTERN } from '../shared/apiPaths.js';
import { CodeArtifactDeclarationError } from '../shared/artifactDeclaration.js';
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

  if (!body.declaration || typeof body.declaration !== 'object') {
    sendJson(context.response, 400, {
      error: {
        code: 'invalid_artifact_declaration',
        message: 'Request body must include a declaration object.',
      },
    });
    return true;
  }

  try {
    const currentCore = await context.dependencies.coreStore.readCore();
    const materialization = materializeCodeArtifactDeclaration(
      currentCore,
      body.declaration,
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
      sendJson(context.response, 422, {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
      return true;
    }
    const message = error instanceof Error
      ? error.message
      : 'Artifact declaration failed.';
    sendJson(context.response, 422, {
      error: { code: 'artifact_declaration_failed', message },
    });
  }

  return true;
}
