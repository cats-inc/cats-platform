import type {
  ChatState,
  CreateTemporaryParticipantInput,
} from '../../api/contracts.js';
import { defaultCatProducts, hasPlatformSurface } from '../../../../shared/platformSurfaces.js';

export type DefaultParticipantSeed =
  | { kind: 'cat'; catId: string }
  | { kind: 'model'; participant: CreateTemporaryParticipantInput };

/**
 * The participant a non-DM conversation starts with when nobody else is named:
 * the remembered default cat while it can still chat, otherwise the remembered
 * provider/model as a temporary participant.
 */
export function resolveDefaultParticipantSeed(
  state: ChatState,
  options: { excludeCatId?: string | null } = {},
): DefaultParticipantSeed {
  const defaults = state.newChatDefaults;
  const cat = defaults.catId
    ? state.cats.find((candidate) => candidate.id === defaults.catId) ?? null
    : null;
  if (
    cat
    && cat.id !== options.excludeCatId
    && cat.status === 'active'
    && hasPlatformSurface(cat.products, 'chat', { fallback: defaultCatProducts() })
  ) {
    return { kind: 'cat', catId: cat.id };
  }

  return {
    kind: 'model',
    participant: {
      name: '',
      provider: defaults.provider,
      instance: defaults.instance ?? undefined,
      model: defaults.model ?? undefined,
      modelSelection: defaults.modelSelection ?? null,
    },
  };
}

export function participantOrderKey(assignment: {
  participantId: string;
  sourceKind: string;
  sourceRefId: string | null;
}): string {
  return assignment.sourceKind === 'cat'
    ? `cat:${assignment.sourceRefId ?? assignment.participantId}`
    : `temp:${assignment.participantId}`;
}

/** Puts participants in the requested key order; unlisted ones keep their order after. */
export function orderParticipantAssignments<T extends {
  participantId: string;
  sourceKind: string;
  sourceRefId: string | null;
}>(assignments: readonly T[], order: readonly string[] | undefined): T[] {
  if (!order || order.length === 0) {
    return [...assignments];
  }
  const byKey = new Map(assignments.map((assignment) => [participantOrderKey(assignment), assignment]));
  const ordered: T[] = [];
  for (const key of order) {
    const assignment = byKey.get(key.trim());
    if (assignment && !ordered.includes(assignment)) {
      ordered.push(assignment);
    }
  }
  for (const assignment of assignments) {
    if (!ordered.includes(assignment)) {
      ordered.push(assignment);
    }
  }
  return ordered;
}
