import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { resolveDraftParticipantSelection } from '../draftParticipants.js';
import {
  resolveDraftStarterSuggestionContext,
  type NewChatPreset,
} from '../draftStarterSuggestionContext.js';
import {
  resolveVisibleDraftStarterSuggestions,
  type DraftStarterSuggestion,
} from '../draftStarterSuggestions.js';
import {
  pickDraftGreeting,
  resolveDraftRosterTemporaryParticipants,
  type DraftTemporaryParticipant,
} from '../draftChatUtils.js';
import { isChatCat } from '../workspaceChatUtils.js';
import {
  buildNamedRecipient,
  buildRecipientFromCat,
  type RecipientChipTarget,
} from './ComposerRecipientChip.js';
import type { ExecutionTargetValue } from './ExecutionTarget.js';
import {
  isComposerAckBusyForDraft,
  isComposerBusyForDraft,
} from '../../../../shared/composer.js';
import type { WorkspaceBusyState } from '../../../../shared/workspaceBusy.js';
import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import { resolveGuideCatAssistGreeting } from '../../../../shared/guideCatAssistPresentation.js';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromTemporaryParticipant,
} from '../audienceParticipantBuilder.js';

type NewConversationDraftTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

export interface DraftComposerStackParticipant {
  key: string;
  name: string;
  executionLabel: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  isCat: boolean;
  catId: string | null;
  participantId: string | null;
}

// Draft helper chips are gated on two rules the renderer treats as non-negotiable:
//   1. Direct lane is a private chat; no prompt source may ever insert chips.
//      The guide cat / boss cat will never insert content into a 1:1 DM and
//      cannot author messages on the user's behalf, so DM has no assist
//      content at all. Suppression is gated on `isDirectLaneContext`, not on
//      a "direct" mode value — direct lane is a separate surface, not a
//      sub-mode of +New chat.
//   2. Non-direct surfaces only surface chips sourced from a runtime-refreshed bundle
//      (provenance.originMode === 'runtime'); deterministic baselines stay silent so the
//      composer does not advertise generic guidance the user has not opted into.
// The payload bundle is therefore the single source of visible chips. Earlier revisions
// exposed an `input.starterSuggestions` seam as a caller override, but that bypassed the
// runtime-origin contract and no production caller used it; keep chip sourcing centralized
// here rather than re-introducing that seam.
function resolvePayloadDraftAssist(input: {
  payload: AppShellPayload;
  isDirectLaneContext: boolean;
  t: NewConversationDraftTranslator;
}) {
  const assist = input.payload.chat.newChatAssist ?? null;
  if (!assist) {
    return {
      greeting: null,
      starterSuggestions: undefined as DraftStarterSuggestion[] | undefined,
    };
  }

  const isRuntimeOriginForVisibleSurface =
    !input.isDirectLaneContext && assist.bundle.provenance.originMode === 'runtime';

  return {
    greeting: resolveGuideCatAssistGreeting(assist, input.t),
    starterSuggestions: isRuntimeOriginForVisibleSurface
      ? assist.bundle.content.entryChips.map((chip) => ({
          id: chip.id,
          prompt: chip.prompt,
        }))
      : undefined,
  };
}

export function resolveNewConversationDraftViewState(input: {
  payload: AppShellPayload;
  draftDefaultRecipientCatId: string | null;
  draftCatIds: string[];
  draftTemporaryParticipants: DraftTemporaryParticipant[];
  allowAddCat: boolean;
  entryPreset: NewChatPreset;
  parallelTargets?: ExecutionTargetValue[] | undefined;
  greeting?: string | null;
  greetingPool?: ReadonlyArray<string> | null;
  selectedExecutionTarget?: ExecutionTargetValue | undefined;
  busy: WorkspaceBusyState;
  t: NewConversationDraftTranslator;
}) {
  const chatCats = input.payload.chat.cats.filter(isChatCat);
  const assistantPresets = input.payload.assistantPresets ?? [];
  const activeChatCats = chatCats.filter((cat) => cat.status === 'active');
  // A draft without a cat starts with its default participant (SPEC-125
  // FR-23); parallel lanes keep their own models instead.
  const draftTemporaryParticipants = resolveDraftRosterTemporaryParticipants({
    temporaryParticipants: input.draftTemporaryParticipants,
    defaultTarget: input.selectedExecutionTarget,
    seedsDefault: !input.draftDefaultRecipientCatId
      && input.draftCatIds.length === 0
      && (input.parallelTargets?.length ?? 0) < 2,
  });
  const draftParticipants = resolveDraftParticipantSelection({
    draftDefaultRecipientCatId: input.draftDefaultRecipientCatId,
    draftCatIds: input.draftCatIds,
  });
  const defaultRecipientCat = input.draftDefaultRecipientCatId
    ? chatCats.find(
      (cat) => cat.id === input.draftDefaultRecipientCatId && cat.status === 'active',
    ) ?? null
    : null;
  const hasTelegramBinding = Boolean(
    defaultRecipientCat && input.payload.chat.botBindings.some((binding) =>
      binding.platform === 'telegram'
      && binding.status === 'active'
      && binding.catId === defaultRecipientCat.id),
  );
  const draftDefaultRecipientCat = !defaultRecipientCat && input.draftCatIds.length > 0
    ? chatCats.find((cat) =>
      cat.id === draftParticipants.effectiveDefaultRecipientCatId && cat.status === 'active',
    ) ?? null
    : null;
  const effectiveDefaultRecipientCat = defaultRecipientCat ?? draftDefaultRecipientCat;
  const effectiveDefaultRecipientTemporaryParticipant = effectiveDefaultRecipientCat
    ? null
    : draftTemporaryParticipants[0] ?? null;
  const draftParticipantCount =
    draftParticipants.participantCatIds.length + draftTemporaryParticipants.length;
  const maxGroupParticipants =
    input.payload.chat.capabilities.maxChatParticipants ?? Number.POSITIVE_INFINITY;
  const hasReachedGroupParticipantLimit = draftParticipantCount >= maxGroupParticipants;
  const draftSuggestionContext = resolveDraftStarterSuggestionContext({
    allowAddCat: input.allowAddCat,
    draftDefaultRecipientCatId: input.draftDefaultRecipientCatId,
    hasDefaultRecipientCat: Boolean(effectiveDefaultRecipientCat),
    entryPreset: input.entryPreset,
    participantCount: draftParticipantCount,
    parallelTargetCount: input.parallelTargets?.length ?? 0,
  });
  const payloadDraftAssist = resolvePayloadDraftAssist({
    payload: input.payload,
    isDirectLaneContext: draftSuggestionContext.isDirectLaneContext,
    t: input.t,
  });
  const visibleDraftCatIds = draftParticipants.participantCatIds;
  // Direct lane is private chat: no chips from any source. Other surfaces only
  // surface runtime-origin payload chips (resolvePayloadDraftAssist already
  // enforces this).
  const starterSuggestionInput = draftSuggestionContext.isDirectLaneContext
    ? []
    : (payloadDraftAssist.starterSuggestions ?? []);
  const visibleStarterSuggestions = resolveVisibleDraftStarterSuggestions({
    suggestions: starterSuggestionInput,
  });
  const resolvedGreeting = (() => {
    const explicitGreeting = input.greeting?.trim();
    if (explicitGreeting) {
      return explicitGreeting;
    }
    const payloadGreeting = payloadDraftAssist.greeting?.trim();
    if (payloadGreeting) {
      return payloadGreeting;
    }
    return pickDraftGreeting({ pool: input.greetingPool, t: input.t });
  })();
  const isAckPending = isComposerAckBusyForDraft(input.busy);
  const isSubmittingFirstTurn = isComposerBusyForDraft(input.busy) || isAckPending;
  const draftComposerRecipients: RecipientChipTarget[] = (() => {
    if (effectiveDefaultRecipientCat) {
      return [buildRecipientFromCat(effectiveDefaultRecipientCat)];
    }
    if (effectiveDefaultRecipientTemporaryParticipant) {
      return [
        buildNamedRecipient({
          participantId: effectiveDefaultRecipientTemporaryParticipant.participantId,
          name: effectiveDefaultRecipientTemporaryParticipant.name,
          provider: effectiveDefaultRecipientTemporaryParticipant.provider,
          instance: effectiveDefaultRecipientTemporaryParticipant.instance ?? null,
          model: effectiveDefaultRecipientTemporaryParticipant.model ?? null,
        }),
      ];
    }
    return [];
  })();
  const groupComposerParticipants: DraftComposerStackParticipant[] = [
    ...visibleDraftCatIds
      .map((catId) => chatCats.find((candidate) => candidate.id === catId))
      .filter((cat): cat is NonNullable<typeof cat> => cat != null && cat.name.length > 0)
      .map((cat) => buildAudienceParticipantFromCat(cat)),
    ...draftTemporaryParticipants.map((tp) => buildAudienceParticipantFromTemporaryParticipant(tp)),
  ];

  return {
    chatCats,
    assistantPresets,
    activeChatCats,
    draftTemporaryParticipants,
    draftParticipants,
    defaultRecipientCat,
    hasTelegramBinding,
    effectiveDefaultRecipientCat,
    effectiveDefaultRecipientTemporaryParticipant,
    draftParticipantCount,
    maxGroupParticipants,
    hasReachedGroupParticipantLimit,
    draftSuggestionContext,
    visibleDraftCatIds,
    visibleStarterSuggestions,
    resolvedGreeting,
    isAckPending,
    isSubmittingFirstTurn,
    draftComposerRecipients,
    groupComposerParticipants,
  };
}
