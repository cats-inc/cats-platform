import type { ChatCat } from '../../api/workspaceContracts.js';
import type {
  DraftTemporaryParticipant,
  DraftTemporaryParticipantUpdate,
} from '../draftChatUtils.js';
import type { AudienceTargetEditor } from './AudienceChip.js';
import type { ExecutionTargetValue } from './ExecutionTarget.js';
import type { DraftComposerStackParticipant } from './newConversationDraftSupport.js';

const PARALLEL_LANE_KEY = /^parallel:(\d+)$/u;

export interface DraftTargetEditorContext {
  cats: ChatCat[];
  selectedExecutionTarget?: ExecutionTargetValue;
  onExecutionTargetChange?: (value: ExecutionTargetValue) => void;
  parallelTargets?: ExecutionTargetValue[];
  onParallelTargetChange?: (index: number, value: ExecutionTargetValue) => void;
  draftCatExecutionTargetOverrides: ReadonlyMap<string, ExecutionTargetValue>;
  onDraftCatExecutionTargetOverride: (catId: string, value: ExecutionTargetValue) => void;
  draftTemporaryParticipants: DraftTemporaryParticipant[];
  onUpdateDraftTemporaryParticipant: (participantId: string, input: DraftTemporaryParticipantUpdate) => void;
  openCatPage: (catId: string) => void;
}

/**
 * The draft chip edits what the new conversation will use. A parallel lane
 * edits that lane's own target. A cat's pick stays a draft override, shared
 * by every lane the cat joins and applied to the conversations once they
 * exist; the cat's own default model only changes in its settings.
 */
export function resolveDraftTargetEditor(
  participant: DraftComposerStackParticipant,
  context: DraftTargetEditorContext,
): AudienceTargetEditor | null {
  if (participant.key === 'implicit:execution_target') {
    return context.selectedExecutionTarget && context.onExecutionTargetChange
      ? { target: context.selectedExecutionTarget, onChange: context.onExecutionTargetChange }
      : null;
  }
  const lane = PARALLEL_LANE_KEY.exec(participant.key);
  if (lane) {
    const index = Number(lane[1]);
    const target = context.parallelTargets?.[index];
    const onParallelTargetChange = context.onParallelTargetChange;
    return target && onParallelTargetChange
      ? { target, onChange: (value) => onParallelTargetChange(index, value) }
      : null;
  }
  if (participant.catId) {
    const cat = context.cats.find((candidate) => candidate.id === participant.catId);
    if (!cat) {
      return null;
    }
    const catId = cat.id;
    return {
      target: context.draftCatExecutionTargetOverrides.get(catId) ?? {
        provider: cat.defaultExecutionTarget.provider,
        model: cat.defaultExecutionTarget.model,
        instance: cat.defaultExecutionTarget.instance,
        modelSelection: cat.defaultModelSelection ?? null,
      },
      onChange: (value) => context.onDraftCatExecutionTargetOverride(catId, value),
      onOpenSettings: () => context.openCatPage(catId),
    };
  }
  const temporary = participant.participantId
    ? context.draftTemporaryParticipants.find((candidate) => candidate.participantId === participant.participantId)
    : null;
  if (!temporary) {
    return null;
  }
  return {
    target: {
      provider: temporary.provider,
      instance: temporary.instance ?? null,
      model: temporary.model ?? null,
      modelSelection: temporary.modelSelection ?? null,
    },
    onChange: (value) => context.onUpdateDraftTemporaryParticipant(temporary.participantId, {
      provider: value.provider,
      instance: value.instance,
      model: value.model,
      modelSelection: value.modelSelection,
    }),
  };
}
