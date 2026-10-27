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

function resolvePayloadDraftAssist(input: {
  payload: AppShellPayload;
  isDirectLaneContext: boolean;
  assistSurface?: 'chat' | 'code' | 'work';
  greetingPick?: number;
  t: NewConversationDraftTranslator;
}) {
  const assist = input.assistSurface === 'work' ? input.payload.guideCatAssist?.workNewDraft
    : input.assistSurface === 'code' ? input.payload.guideCatAssist?.codeNewDraft : input.payload.chat.newChatAssist;
  return {
    greeting: resolveGuideCatAssistGreeting(assist, input.t, input.greetingPick),
    starterSuggestions: input.isDirectLaneContext ? [] : (assist?.bundle.content.entryChips ?? []).slice(0, 5).map(chip =>
      chip.action === 'prefill' ? { ...chip, label: chip.labelKey ? input.t(chip.labelKey as MessageKey) : chip.label,
        prompt: chip.promptKey ? input.t(chip.promptKey as MessageKey) : chip.prompt } : chip),
  };
}

export function resolveNewConversationDraftViewState(input: {
  payload: AppShellPayload;
  assistSurface?: 'chat' | 'code' | 'work';
  greetingPick?: number;
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
    assistSurface: input.assistSurface, greetingPick: input.greetingPick,
    t: input.t,
  });
  const visibleDraftCatIds = draftParticipants.participantCatIds;
  // Direct lanes never receive assist content.
  const starterSuggestionInput = draftSuggestionContext.isDirectLaneContext
    ? []
    : (payloadDraftAssist.starterSuggestions ?? []);
  const visibleStarterSuggestions = resolveVisibleDraftStarterSuggestions({
    suggestions: starterSuggestionInput,
  });
  const resolvedGreeting = (() => {
    const payloadGreeting = payloadDraftAssist.greeting?.trim();
    if (payloadGreeting) return payloadGreeting;
    const explicitGreeting = input.greeting?.trim();
    if (explicitGreeting) return explicitGreeting;
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
