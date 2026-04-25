import type {
  CancellationContext,
  CancellationEffectLanded,
  CancellationReasonCode,
  CancellationToolContext,
  RunPrimaryState,
  SupervisedToolCancellation,
  SupervisedToolManifest,
} from './contracts.js';

export interface BuildCancellationContextInput {
  manifest: Pick<SupervisedToolManifest, 'cancellation'>;
  requestedAt: string;
  requestedBy: string;
  runStateAtRequest: Exclude<RunPrimaryState, 'completed' | 'failed' | 'cancelled'>;
  reasonCode: CancellationReasonCode;
  reasonNote?: string;
  effectLanded?: CancellationEffectLanded;
}

export function mapManifestCancellationToToolContext(
  cancellation: SupervisedToolCancellation,
): CancellationToolContext {
  switch (cancellation) {
    case 'cooperative':
      return 'cooperative_requested';
    case 'best_effort':
      return 'best_effort_requested';
    case 'not_supported':
      return 'not_supported';
    default: {
      const exhaustive: never = cancellation;
      return exhaustive;
    }
  }
}

export function buildCancellationContext(
  input: BuildCancellationContextInput,
): CancellationContext {
  return {
    requestedAt: input.requestedAt,
    requestedBy: input.requestedBy,
    runStateAtRequest: input.runStateAtRequest,
    toolCancellation: mapManifestCancellationToToolContext(input.manifest.cancellation),
    effectLanded: input.effectLanded ?? 'not_applied',
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
  };
}
