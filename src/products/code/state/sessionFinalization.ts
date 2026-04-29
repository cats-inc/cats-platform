import type { CodeArtifactToolResult } from '../shared/artifactDeclaration.js';

export const CODE_ARTIFACT_CLAIM_WITHOUT_DECLARATION = 'artifact_claim_without_declaration' as const;

export interface CodeAssistantArtifactClaim {
  declarationId: string;
  label?: string | null;
  title?: string | null;
}

export interface CodeAssistantFinalization {
  assistantTurnId: string;
  bodyText: string;
  artifactClaims?: CodeAssistantArtifactClaim[];
}

export interface AcceptedCodeArtifactDeclarationRef {
  assistantTurnId: string;
  declarationId: string;
  artifactId?: string | null;
}

export type CodeAssistantFinalizationDecision =
  | {
      status: 'accepted';
      finalization: CodeAssistantFinalization;
      claims: CodeAssistantArtifactClaim[];
    }
  | {
      status: 'rejected';
      code: typeof CODE_ARTIFACT_CLAIM_WITHOUT_DECLARATION;
      message: string;
      unmatchedClaims: CodeAssistantArtifactClaim[];
    };

export class CodeArtifactFinalizationGate {
  evaluate(input: {
    finalization: CodeAssistantFinalization;
    acceptedDeclarations: readonly AcceptedCodeArtifactDeclarationRef[];
  }): CodeAssistantFinalizationDecision {
    const claims = normalizeArtifactClaims(input.finalization.artifactClaims);
    const acceptedIds = new Set(
      input.acceptedDeclarations
        .filter((declaration) =>
          declaration.assistantTurnId === input.finalization.assistantTurnId)
        .map((declaration) => declaration.declarationId),
    );
    const unmatchedClaims = claims.filter((claim) => !acceptedIds.has(claim.declarationId));

    if (unmatchedClaims.length > 0) {
      return {
        status: 'rejected',
        code: CODE_ARTIFACT_CLAIM_WITHOUT_DECLARATION,
        message:
          'Assistant finalization claims artifacts without same-turn accepted declarations.',
        unmatchedClaims,
      };
    }

    return {
      status: 'accepted',
      finalization: {
        ...input.finalization,
        artifactClaims: claims,
      },
      claims,
    };
  }
}

export const CODE_ARTIFACT_FINALIZATION_GATE = new CodeArtifactFinalizationGate();

export function acceptedDeclarationRefFromToolResult(input: {
  assistantTurnId: string;
  result: CodeArtifactToolResult;
}): AcceptedCodeArtifactDeclarationRef | null {
  if (input.result.status !== 'accepted') {
    return null;
  }

  return {
    assistantTurnId: input.assistantTurnId,
    declarationId: input.result.declarationId,
    artifactId: input.result.artifactId ?? null,
  };
}

function normalizeArtifactClaims(
  claims: CodeAssistantFinalization['artifactClaims'],
): CodeAssistantArtifactClaim[] {
  if (!claims) {
    return [];
  }

  return claims.map((claim) => ({
    declarationId: claim.declarationId.trim(),
    label: normalizeNullableString(claim.label),
    title: normalizeNullableString(claim.title),
  })).filter((claim) => claim.declarationId.length > 0);
}

function normalizeNullableString(input: string | null | undefined): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const value = input.trim();
  return value.length > 0 ? value : null;
}
