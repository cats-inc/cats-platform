import type {
  CodeArtifactDeclarationAnchors,
  CodeArtifactDisposition,
  CodeArtifactProducer,
  CodeArtifactToolInput,
  CodeArtifactToolResult,
} from '../shared/artifactDeclaration.js';
import type { CodeArtifactDetailProjection } from './projection.js';

export * from '../../shared/api/workspaceContracts.js';

export interface CodeArtifactDeclarationSubmitRequest {
  declaration: CodeArtifactToolInput;
  producer: CodeArtifactProducer;
  anchors?: CodeArtifactDeclarationAnchors;
}

export interface CodeArtifactDeclarationSubmitResponse {
  artifact: CodeArtifactDetailProjection;
  created: boolean;
  disposition: CodeArtifactDisposition;
  toolResult: CodeArtifactToolResult;
}
