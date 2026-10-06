import type {
  ChatChannelView,
  UpdateChannelParticipantInput,
} from '../api/workspaceContracts.js';
import {
  activeAssignedParticipants,
  resolveParticipantCatId,
  type ResolvedChannelParticipant,
} from '../channelParticipants.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';

export interface DraftCatExecutionTarget {
  provider: string;
  instance: string | null;
  model: string | null;
  modelSelection: ProviderModelSelection | null;
}

/**
 * Creating a conversation seeds every cat from its own default model. The
 * draft's per-cat picks become that conversation's participant targets here,
 * before the first message is sent, so the cat's default is never touched.
 */
export async function applyDraftCatExecutionTargets<
  TChannel extends Pick<ChatChannelView, 'id' | 'assignedParticipants' | 'assignedCats'>,
>(
  channel: TChannel,
  overrides: ReadonlyMap<string, DraftCatExecutionTarget>,
  updateParticipant: (
    channelId: string,
    participantId: string,
    input: UpdateChannelParticipantInput,
    signal?: AbortSignal,
  ) => Promise<unknown>,
  signal?: AbortSignal,
): Promise<TChannel> {
  if (overrides.size === 0) {
    return channel;
  }
  const applied = new Map<string, DraftCatExecutionTarget>();
  for (const participant of activeAssignedParticipants(channel)) {
    const catId = resolveParticipantCatId(participant);
    const target = catId ? overrides.get(catId) : undefined;
    if (!target) {
      continue;
    }
    await updateParticipant(channel.id, participant.participantId, {
      provider: target.provider,
      instance: target.instance,
      model: target.model,
      modelSelection: target.modelSelection,
    }, signal);
    applied.set(participant.participantId, target);
  }
  if (applied.size === 0) {
    return channel;
  }
  // Show the applied picks right away instead of the seeded defaults.
  const withTarget = <T extends ResolvedChannelParticipant>(participant: T): T => {
    const target = applied.get(participant.participantId);
    return target
      ? {
          ...participant,
          execution: {
            ...participant.execution,
            target: {
              ...participant.execution.target,
              provider: target.provider,
              instance: target.instance,
              model: target.model,
            },
            modelSelection: target.modelSelection,
          },
        }
      : participant;
  };
  return {
    ...channel,
    assignedCats: channel.assignedCats.map(withTarget),
    ...(channel.assignedParticipants
      ? { assignedParticipants: channel.assignedParticipants.map(withTarget) }
      : {}),
  };
}
