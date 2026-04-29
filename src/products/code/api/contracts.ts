import type {
  CodeArtifactDeclaration,
  CodeArtifactDisposition,
  CodeArtifactToolResult,
} from '../shared/artifactDeclaration.js';
import type { CodeArtifactDetailProjection } from './projection.js';

export * from '../../shared/api/workspaceContracts.js';

export interface CodeArtifactDeclarationSubmitRequest {
  declaration: CodeArtifactDeclaration;
}

export interface CodeArtifactDeclarationSubmitResponse {
  artifact: CodeArtifactDetailProjection;
  created: boolean;
  disposition: CodeArtifactDisposition;
  toolResult: CodeArtifactToolResult;
}
