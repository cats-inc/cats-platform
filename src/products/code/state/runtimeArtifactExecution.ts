import type { RuntimeMessageSegment } from '../../../platform/runtime/client.js';
import type { CatsCoreState } from '../../../core/types.js';
import {
  CODE_ARTIFACT_DECLARATION_TOOL,
  CodeArtifactDeclarationError,
  type CodeArtifactDeclarationAnchors,
  type CodeArtifactProducer,
  type CodeArtifactToolResult,
} from '../shared/artifactDeclaration.js';
import { materializeCodeArtifactDeclaration } from './artifactMaterialization.js';
import {
  observeCodeArtifactRuntimeToolCall,
  shouldAttachCodeArtifactRuntimeTooling,
  type CodeArtifactRuntimeToolingChannel,
} from './runtimeArtifactTooling.js';

export interface CodeArtifactRuntimeDeclarationExecutionContext {
  producer: CodeArtifactProducer;
  anchors: CodeArtifactDeclarationAnchors;
}

export interface CodeArtifactRuntimeDeclarationExecutionItem {
  toolId: string | null;
  declarationId: string | null;
  result: CodeArtifactToolResult;
}

export interface CodeArtifactRuntimeDeclarationExecutionResult {
  core: CatsCoreState;
  declarations: CodeArtifactRuntimeDeclarationExecutionItem[];
}

export function executeCodeArtifactRuntimeDeclarations(input: {
  core: CatsCoreState;
  channel: CodeArtifactRuntimeToolingChannel;
  segments: readonly RuntimeMessageSegment[];
  context: CodeArtifactRuntimeDeclarationExecutionContext;
  now?: Date;
}): CodeArtifactRuntimeDeclarationExecutionResult {
  if (!shouldAttachCodeArtifactRuntimeTooling(input.channel)) {
    return { core: input.core, declarations: [] };
  }

  let core = input.core;
  const declarations: CodeArtifactRuntimeDeclarationExecutionItem[] = [];
  for (const segment of input.segments) {
    const observation = observeCodeArtifactRuntimeToolCall(segment);
    if (!observation) {
      continue;
    }
    if (observation.status === 'rejected') {
      declarations.push({
        toolId: observation.toolId,
        declarationId: observation.declarationId,
        result: {
          status: 'rejected',
          error: {
            code: observation.errorCode ?? 'artifact_metadata_invalid',
            message: observation.message ?? 'declare_artifact call was rejected.',
          },
        },
      });
      continue;
    }

    try {
      const declaration = CODE_ARTIFACT_DECLARATION_TOOL.createDeclaration(
        observation.input,
        input.context.producer,
        input.context.anchors,
      );
      const materialized = materializeCodeArtifactDeclaration(
        core,
        declaration,
        input.now,
      );
      core = materialized.core;
      declarations.push({
        toolId: observation.toolId,
        declarationId: observation.declarationId,
        result: materialized.toolResult,
      });
    } catch (error) {
      const declarationError = error instanceof CodeArtifactDeclarationError
        ? error
        : new CodeArtifactDeclarationError(
          'artifact_metadata_invalid',
          error instanceof Error ? error.message : String(error),
        );
      declarations.push({
        toolId: observation.toolId,
        declarationId: observation.declarationId,
        result: CODE_ARTIFACT_DECLARATION_TOOL.rejected(declarationError),
      });
    }
  }

  return { core, declarations };
}
