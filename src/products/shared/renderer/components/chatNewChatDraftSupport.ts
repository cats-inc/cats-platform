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
import { pickDraftGreeting, type DraftTemporaryParticipant } from '../draftChatUtils.js';
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

type ChatNewChatDraftTranslator = (
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
  t: ChatNewChatDraftTranslator;
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

export function resolveChatNewChatDraftViewState(input: {
  payload: AppShellPayload;
  draftDefaultRecipientCatId: string | null;
  draftCatIds: string[];
  draftTemporaryParticipants: DraftTemporaryParticipant[];
  allowAddCat: boolean;
  entryPreset: NewChatPreset;
  parallelTargets?: ExecutionTargetValue[] | undefined;
  greeting?: string | null;
  greetingPool?: ReadonlyArray<string> | null;
  draftHighlightedCatId: string | null;
  draftCatExecutionTargetOverrides: Map<string, ExecutionTargetValue>;
  selectedExecutionTarget?: ExecutionTargetValue | undefined;
  busy: WorkspaceBusyState;
  t: ChatNewChatDraftTranslator;
}) {
  const chatCats = input.payload.chat.cats.filter(isChatCat);
  const assistantPresets = input.payload.assistantPresets ?? [];
  const activeChatCats = chatCats.filter((cat) => cat.status === 'active');
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
    : input.draftTemporaryParticipants[0] ?? null;
  const draftParticipantCount =
    draftParticipants.participantCatIds.length + input.draftTemporaryParticipants.length;
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
  const groupDraftSelectionLabel = draftParticipantCount === 1
    ? input.t(messageKeys.chatNewChatDraftGroupDraftSelectionLabelSingle)
    : draftParticipantCount > 1
      ? input.t(messageKeys.chatNewChatDraftGroupDraftSelectionLabelCount, {
        count: draftParticipantCount,
      })
      : activeChatCats.length > 0 || assistantPresets.length > 0
        ? input.t(messageKeys.chatNewChatDraftGroupDraftSelectionLabelWithCatsOrAssistants)
        : input.t(messageKeys.chatNewChatDraftGroupDraftSelectionLabelWithSettings);
  const highlightedCat = input.draftHighlightedCatId && input.draftCatIds.includes(input.draftHighlightedCatId)
    ? chatCats.find((cat) => cat.id === input.draftHighlightedCatId) ?? null
    : null;
  const activePanelExecutionTarget: ExecutionTargetValue | null =
    draftSuggestionContext.isDirectLaneContext && defaultRecipientCat
      ? {
          provider: defaultRecipientCat.defaultExecutionTarget.provider,
          model: defaultRecipientCat.defaultExecutionTarget.model,
          instance: defaultRecipientCat.defaultExecutionTarget.instance,
          modelSelection: defaultRecipientCat.defaultModelSelection ?? null,
        }
      : highlightedCat
        ? (input.draftCatExecutionTargetOverrides.get(highlightedCat.id) ?? {
            provider: highlightedCat.defaultExecutionTarget.provider,
            model: highlightedCat.defaultExecutionTarget.model,
            instance: highlightedCat.defaultExecutionTarget.instance,
            modelSelection: highlightedCat.defaultModelSelection ?? null,
          })
        : input.selectedExecutionTarget ?? null;
  const isAckPending = isComposerAckBusyForDraft(input.busy);
  const isSubmittingFirstTurn = isComposerBusyForDraft(input.busy) || isAckPending;
  const draftComposerRecipients: RecipientChipTarget[] = (() => {
    if (effectiveDefaultRecipientCat) {
      return [buildRecipientFromCat(effectiveDefaultRecipientCat, input.payload.chat.bossCatId)];
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
    ...input.draftTemporaryParticipants.map((tp) => buildAudienceParticipantFromTemporaryParticipant(tp)),
  ];

  return {
    chatCats,
    assistantPresets,
    activeChatCats,
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
    groupDraftSelectionLabel,
    activePanelExecutionTarget,
    isAckPending,
    isSubmittingFirstTurn,
    draftComposerRecipients,
    groupComposerParticipants,
  };
}
