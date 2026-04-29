import type { CodeArtifactToolResult } from '../shared/artifactDeclaration.js';
import {
  RuntimeEnricherPriority,
} from '../../../platform/runtime/invocationEnrichment.js';
import {
  registerRuntimeAssistantFinalizationGate,
  type RuntimeAssistantFinalizationGate,
} from '../../../platform/runtime/assistantFinalization.js';
import {
  CODE_ARTIFACT_RUNTIME_ENRICHER_ID,
  shouldAttachCodeArtifactRuntimeTooling,
} from './runtimeArtifactTooling.js';

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

export function createCodeArtifactRuntimeFinalizationGate(): RuntimeAssistantFinalizationGate {
  return {
    id: CODE_ARTIFACT_RUNTIME_ENRICHER_ID,
    priority: RuntimeEnricherPriority.POST_PROCESS,
    shouldEvaluate(channel) {
      return shouldAttachCodeArtifactRuntimeTooling(channel);
    },
    evaluate(_channel, input) {
      const codeMetadata = asRecord(
        input.runtimeAssistantMetadata?.[CODE_ARTIFACT_RUNTIME_ENRICHER_ID],
      );
      const runtimeFinalization = asRecord(input.runtimeFinalization);
      const codeFinalization = asRecord(runtimeFinalization?.codeArtifactFinalization)
        ?? runtimeFinalization;
      const decision = CODE_ARTIFACT_FINALIZATION_GATE.evaluate({
        finalization: {
          assistantTurnId: input.assistantTurnId,
          bodyText: input.bodyText,
          artifactClaims: readFinalizationArtifactClaims(
            codeMetadata,
            codeFinalization,
          ),
        },
        acceptedDeclarations: readAcceptedDeclarationRefs(
          input.assistantTurnId,
          codeMetadata,
        ),
      });

      if (decision.status === 'rejected') {
        return {
          status: 'rejected',
          code: decision.code,
          message: decision.message,
          metadata: {
            codeArtifactFinalization: {
              status: 'rejected',
              unmatchedClaims: decision.unmatchedClaims,
            },
          },
        };
      }

      return decision.claims.length > 0
        ? {
            status: 'accepted',
            metadata: {
              codeArtifactFinalization: {
                status: 'accepted',
                artifactClaims: decision.claims,
              },
            },
          }
        : { status: 'accepted' };
    },
  };
}

const codeArtifactRuntimeFinalizationGate = createCodeArtifactRuntimeFinalizationGate();

export function registerCodeArtifactRuntimeFinalizationGate(): void {
  registerRuntimeAssistantFinalizationGate(codeArtifactRuntimeFinalizationGate);
}

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

function normalizeNullableString(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const value = input.trim();
  return value.length > 0 ? value : null;
}

function readFinalizationArtifactClaims(
  codeMetadata: Record<string, unknown> | null,
  runtimeFinalization: Record<string, unknown> | null = null,
): CodeAssistantArtifactClaim[] | undefined {
  const finalization =
    runtimeFinalization
    ?? asRecord(codeMetadata?.codeArtifactFinalization);
  const artifactClaims = finalization?.artifactClaims;
  if (!Array.isArray(artifactClaims)) {
    return undefined;
  }

  return artifactClaims.flatMap((claim) => {
    const record = asRecord(claim);
    const declarationId = normalizeNullableString(record?.declarationId);
    if (!declarationId) {
      return [];
    }
    return [{
      declarationId,
      label: normalizeNullableString(record?.label),
      title: normalizeNullableString(record?.title),
    }];
  });
}

function readAcceptedDeclarationRefs(
  assistantTurnId: string,
  codeMetadata: Record<string, unknown> | null,
): AcceptedCodeArtifactDeclarationRef[] {
  const toolResults = codeMetadata?.codeArtifactToolResults;
  if (!Array.isArray(toolResults)) {
    return [];
  }

  return toolResults.flatMap((entry) => {
    const record = asRecord(entry);
    const result = asRecord(record?.result);
    if (result?.status !== 'accepted') {
      return [];
    }
    const declarationId = normalizeNullableString(result.declarationId);
    if (!declarationId) {
      return [];
    }
    return [{
      assistantTurnId,
      declarationId,
      artifactId: normalizeNullableString(result.artifactId),
    }];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
