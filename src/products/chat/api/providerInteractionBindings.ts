import type { ChatStore } from '../state/store.js';
import { resolveChannelParticipantAssignments, resolveParticipantLeaseAttachment } from '../shared/channelParticipants.js';
import { buildChatConversationId } from '../../../shared/chatCoreIds.js';
import { ProviderControlError, type ProviderBindingAccess } from '../../../platform/runtime/providerInteractionControl.js';
import type { CoreStore } from '../../../core/store.js';
import { canControlProviderRun, providerRunSession } from '../../../platform/runtime/providerInteractionAdmission.js';

export async function currentProviderBindings(store: ChatStore, conversationId: string, coreStore: CoreStore = store): Promise<ProviderBindingAccess[]> {
  const state = await store.read();
  const core = await coreStore.readCore();
  const owner = core.ownerProfile.actorId;
  const conversation = core.conversations.find(c => c.id === conversationId);
  const channel = state.channels.find(c => buildChatConversationId(c.id) === conversationId || c.id === conversation?.sourceChannelId);
  if (!channel || channel.status === 'archived' || channel.ownerActorId !== owner || conversation?.status === 'archived') {
    throw new ProviderControlError(404, 'provider_conversation_unavailable');
  }
  const turn = channel.roomRouting?.workflow?.activeTurn;
  const rows: ProviderBindingAccess[] = [];
  for (const p of resolveChannelParticipantAssignments(channel).filter(p => p.status === 'active')) {
    const lease = resolveParticipantLeaseAttachment(channel, p.participantId);
    if (!lease?.sessionId) continue;
    const target = turn?.targetStatuses.find(t => t.participant.participantId === p.participantId && t.sessionId === lease.sessionId
      && !['completed', 'failed', 'cancelled', 'skipped'].includes(t.status));
    rows.push({ binding: { conversationId, sessionId: lease.sessionId, participantId: p.participantId,
      laneId: target?.laneId ?? lease.laneId, turnId: turn?.id ?? null, runId: null, label: p.name },
      canRespond: !!target && !turn?.completedAt && !['completed', 'failed', 'cancelled'].includes(turn?.status ?? '') });
  }
  const runs = core.runs.filter(r => r.conversationId === conversationId && providerRunSession(r));
  const liveRuns = runs.filter(r => canControlProviderRun(core, r));
  const terminalRuns = runs.filter(r => !canControlProviderRun(core, r)).slice(-Math.max(0, Math.min(4, 32 - rows.length - liveRuns.length)));
  for (const run of [...liveRuns, ...(rows.length + liveRuns.length >= 32 ? [] : terminalRuns)]) {
    const sessionId = providerRunSession(run);
    if (!sessionId || rows.some(row => row.binding.sessionId === sessionId)) continue;
    rows.push({ binding: { conversationId, sessionId, participantId: run.orchestratorActorId,
      laneId: null, turnId: null, runId: run.id, label: run.title }, canRespond: canControlProviderRun(core, run) });
  }
  return rows;
}
