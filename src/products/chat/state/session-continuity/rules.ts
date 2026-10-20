import type { ChatChannelView, ChatChannelKind } from '../../api/contracts.js';

export type ContinuityTopology =
  | 'participant_chat'
  | 'direct_message'
  | 'telegram_direct_message';

export type ContinuityResetBehavior = 'manual' | 'on_idle_timeout' | 'on_topic_change';
export type ContinuityCompactionPolicy = 'none' | 'before_reset' | 'periodic';
export type ContinuityMemoryFlushPhase = 'pre_reset' | 'pre_compaction' | null;

export interface ContinuityRule {
  topology: ContinuityTopology;
  resetBehavior: ContinuityResetBehavior;
  idleTimeoutMs: number | null;
  compactionPolicy: ContinuityCompactionPolicy;
  memoryFlushPhase: ContinuityMemoryFlushPhase;
  allowSleep: boolean;
  allowResume: boolean;
}

/** Any conversation that is not a DM is a room of participants (SPEC-125 FR-2). */
export function classifyContinuityTopology(
  channel: Pick<ChatChannelView, 'channelKind' | 'topic'>,
): ContinuityTopology {
  const kind: ChatChannelKind | undefined = channel.channelKind;

  if (kind === 'direct_message') {
    const isTelegram = channel.topic?.toLowerCase().includes('telegram') ?? false;
    return isTelegram ? 'telegram_direct_message' : 'direct_message';
  }

  return 'participant_chat';
}

const THIRTY_MINUTES = 30 * 60 * 1000;
const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function resolveContinuityRule(topology: ContinuityTopology): ContinuityRule {
  switch (topology) {
    case 'participant_chat':
      return {
        topology,
        resetBehavior: 'manual',
        idleTimeoutMs: null,
        compactionPolicy: 'before_reset',
        memoryFlushPhase: 'pre_reset',
        allowSleep: false,
        allowResume: true,
      };

    case 'direct_message':
      return {
        topology,
        resetBehavior: 'on_idle_timeout',
        idleTimeoutMs: THIRTY_MINUTES,
        compactionPolicy: 'before_reset',
        memoryFlushPhase: 'pre_reset',
        allowSleep: true,
        allowResume: true,
      };

    case 'telegram_direct_message':
      return {
        topology,
        resetBehavior: 'on_idle_timeout',
        idleTimeoutMs: FIFTEEN_MINUTES,
        compactionPolicy: 'before_reset',
        memoryFlushPhase: 'pre_reset',
        allowSleep: true,
        allowResume: true,
      };
  }
}

export function shouldFlushMemory(rule: ContinuityRule, phase: 'reset' | 'compaction'): boolean {
  if (phase === 'reset') {
    return rule.memoryFlushPhase === 'pre_reset';
  }
  return rule.memoryFlushPhase === 'pre_compaction';
}
