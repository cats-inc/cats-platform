import type { AppShellPayload } from '../../api/workspaceContracts.js';
import { resolveDraftParticipantSelection } from '../draftParticipants.js';
import {
  resolveDraftStarterSuggestionContext,
  type NewChatMode,
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
import type { ModelSelectorValue } from './ModelSelector.js';
import {
  isComposerAckBusyForDraft,
  isComposerBusyForDraft,
} from '../../../../shared/composer.js';
import {
  buildAudienceParticipantFromCat,
  buildAudienceParticipantFromTemporaryParticipant,
} from '../audienceParticipantBuilder.js';

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

export function resolveChatNewChatDraftViewState(input: {
  payload: AppShellPayload;
  draftDefaultRecipientCatId: string | null;
  draftCatIds: string[];
  draftTemporaryParticipants: DraftTemporaryParticipant[];
  allowAddCat: boolean;
  entryMode: NewChatMode;
  parallelTargets?: ModelSelectorValue[] | undefined;
  starterSuggestions?: ReadonlyArray<DraftStarterSuggestion> | null;
  greeting?: string | null;
  greetingPool?: ReadonlyArray<string> | null;
  draftHighlightedCatId: string | null;
  draftCatModelOverrides: Map<string, ModelSelectorValue>;
  selectedModel?: ModelSelectorValue | undefined;
  busy: string;
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
    entryMode: input.entryMode,
    participantCount: draftParticipantCount,
    parallelTargetCount: input.parallelTargets?.length ?? 0,
  });
  const visibleDraftCatIds = draftParticipants.participantCatIds;
  const visibleStarterSuggestions = resolveVisibleDraftStarterSuggestions({
    mode: draftSuggestionContext.mode,
    defaultRecipientName: effectiveDefaultRecipientCat?.name ?? null,
    suggestions: input.starterSuggestions,
  });
  const resolvedGreeting = (() => {
    const explicitGreeting = input.greeting?.trim();
    if (explicitGreeting) {
      return explicitGreeting;
    }
    return pickDraftGreeting({ pool: input.greetingPool });
  })();
  const groupDraftSelectionLabel = draftParticipantCount === 1
    ? '1 participant selected so far. Add more or send when ready.'
    : draftParticipantCount > 1
      ? `${draftParticipantCount} participants selected for this shared chat.`
      : activeChatCats.length > 0 || assistantPresets.length > 0
        ? 'Choose Cats, reuse saved Assistants, or add temporary participants for this shared chat.'
        : 'Add temporary participants here, or create Cats and Assistants in Settings before starting a shared chat.';
  const highlightedCat = input.draftHighlightedCatId && input.draftCatIds.includes(input.draftHighlightedCatId)
    ? chatCats.find((cat) => cat.id === input.draftHighlightedCatId) ?? null
    : null;
  const activePanelModel: ModelSelectorValue | null =
    draftSuggestionContext.isDirectLaneContext && defaultRecipientCat
      ? {
          provider: defaultRecipientCat.defaultExecutionTarget.provider,
          model: defaultRecipientCat.defaultExecutionTarget.model,
          instance: defaultRecipientCat.defaultExecutionTarget.instance,
          modelSelection: defaultRecipientCat.defaultModelSelection ?? null,
        }
      : highlightedCat
        ? (input.draftCatModelOverrides.get(highlightedCat.id) ?? {
            provider: highlightedCat.defaultExecutionTarget.provider,
            model: highlightedCat.defaultExecutionTarget.model,
            instance: highlightedCat.defaultExecutionTarget.instance,
            modelSelection: highlightedCat.defaultModelSelection ?? null,
          })
        : input.selectedModel ?? null;
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
    activePanelModel,
    isAckPending,
    isSubmittingFirstTurn,
    draftComposerRecipients,
    groupComposerParticipants,
  };
}
