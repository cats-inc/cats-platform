import { join } from 'node:path';
import {
  assembleProductKnowledgeContext,
  loadProductKnowledge,
  type KnowledgeOperation,
} from '../../../platform/knowledge/productKnowledge.js';
import { resolveBundledPlatformConfigDir } from '../../../shared/platformPaths.js';
import { applyLocalKnowledge } from '../../../platform/knowledge/localKnowledge.js';
import { parseMessageLocale } from '../../../shared/i18n/index.js';
import type { ChatChannelView } from '../api/contracts.js';
import { activeAssignedParticipants } from '../shared/channelParticipants.js';
import { isDirectLaneChannel } from '../shared/channelTopology.js';

export const ORCHESTRATOR_KNOWLEDGE_FILE = 'orchestrator-knowledge.json';
export const ORCHESTRATOR_KNOWLEDGE_CAPABILITIES = ['orchestrator-context-v1'] as const;
// Existing product-owned mention routing, not a callable tool or membership mutation.
const CURRENT_ROOM_HANDOFF = { id: 'chat.current-room.handoff', version: '1.0' };

/**
 * A conversation's coordinator answers with this knowledge wherever the conversation was
 * created (ADR-149 D8, SPEC-141 FR-19). Code and Work keep their own product instructions; this
 * is added to them. Until D8 it went only to conversations created on Chat.
 */
export async function loadOrchestratorKnowledge(input: {
  channel: ChatChannelView;
  body: string;
  surface: 'chat-visible' | 'chat-decision';
  target: { provider: string | null; instance?: string | null; model: string | null; sessionId?: string | null };
  operations?: KnowledgeOperation[];
  policyDigest?: string;
  filePath?: string;
  platformDir?: string;
}) {
  const locale = parseMessageLocale(input.channel.responseLanguage)
    ?? parseMessageLocale(input.channel.language) ?? 'en';
  const goal = input.body.slice(0, 4_000);
  const topics: string[] = [];
  if (/collaborat|teammate|recruit|review|implement|delegate|handoff|同伴|合作|協作|分工|審查|實作|委派|交接|建立.*對話/iu.test(goal)) {
    topics.push('collaboration');
  }
  if (topics.includes('collaboration') || /@|ask .*cat|請.*貓|交棒/iu.test(goal)) topics.push('handoff');
  if (/fail|error|blocked|unavailable|stuck|retry|失敗|錯誤|卡住|無法|重試/iu.test(goal)) topics.push('recovery');
  // The teammates the coordinator can hand off to: everyone but itself.
  const participants = activeAssignedParticipants(input.channel)
    .filter((participant) => participant.participantId !== input.channel.coordinatorParticipantId);
  const operations = [...(input.operations ?? [])];
  if (input.surface === 'chat-visible' && !isDirectLaneChannel(input.channel) && participants.length > 0) {
    operations.push(CURRENT_ROOM_HANDOFF);
  }
  const bundled = await loadProductKnowledge({
    filePath: input.filePath ?? join(resolveBundledPlatformConfigDir(), ORCHESTRATOR_KNOWLEDGE_FILE),
    capabilities: ORCHESTRATOR_KNOWLEDGE_CAPABILITIES,
    locale,
  });
  const result = input.filePath ? bundled : await applyLocalKnowledge(bundled, 'orchestrator', { platformDir: input.platformDir });
  return assembleProductKnowledgeContext(result, {
    role: 'orchestrator', surface: input.surface, locale, goal: input.body, topics,
    operations,
    scope: {
      channelId: input.channel.id,
      originSurface: input.channel.originSurface,
      roomMode: input.channel.roomRouting?.mode ?? 'chat_channel',
      target: input.target,
      policyDigest: input.policyDigest ?? null,
      participants: participants.slice(0, 32).map((participant) => ({
        id: participant.participantId, name: participant.name.slice(0, 128),
        roles: participant.roles.slice(0, 8).map((role) => role.slice(0, 128)),
      })),
      participantsTruncated: participants.length > 32,
    },
  });
}
