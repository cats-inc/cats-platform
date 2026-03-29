import type { ChatState, ChatChannelView } from '../../api/contracts.js';
import {
  classifyContinuityTopology,
  resolveContinuityRule,
  shouldFlushMemory,
} from './rules.js';

export interface SessionResetOptions {
  flushMemory?: boolean;
  reason?: 'user_initiated' | 'idle_timeout' | 'topic_change';
}

export interface SessionOperationResult {
  success: boolean;
  channelId: string;
  catId: string;
  action: 'reset' | 'sleep' | 'resume' | 'compact';
  memoryFlushed: boolean;
}

function findChannelAndCat(
  state: ChatState,
  channelId: string,
  catId: string,
): { channel: ChatChannelView; catIndex: number } | null {
  const channel = state.channels.find((ch) => ch.id === channelId) as ChatChannelView | undefined;
  if (!channel) return null;
  const catIndex = channel.catAssignments?.findIndex((a) => a.catId === catId) ?? -1;
  return { channel, catIndex };
}

export function resetSession(
  state: ChatState,
  channelId: string,
  catId: string,
  options: SessionResetOptions = {},
): SessionOperationResult {
  const found = findChannelAndCat(state, channelId, catId);
  if (!found) {
    return { success: false, channelId, catId, action: 'reset', memoryFlushed: false };
  }

  const topology = classifyContinuityTopology(found.channel);
  const rule = resolveContinuityRule(topology);
  const shouldFlush = options.flushMemory ?? shouldFlushMemory(rule, 'reset');

  // Clear the cat's execution lease to mark session ended
  if (found.catIndex >= 0 && found.channel.catAssignments) {
    const assignment = found.channel.catAssignments[found.catIndex];
    if (assignment?.execution?.lease) {
      assignment.execution.lease = {
        ...assignment.execution.lease,
        status: 'not_started',
        sessionId: null,
        startedAt: null,
      };
    }
  }

  return {
    success: true,
    channelId,
    catId,
    action: 'reset',
    memoryFlushed: shouldFlush,
  };
}

export function sleepSession(
  state: ChatState,
  channelId: string,
  catId: string,
): SessionOperationResult {
  const found = findChannelAndCat(state, channelId, catId);
  if (!found) {
    return { success: false, channelId, catId, action: 'sleep', memoryFlushed: false };
  }

  const topology = classifyContinuityTopology(found.channel);
  const rule = resolveContinuityRule(topology);

  if (!rule.allowSleep) {
    return { success: false, channelId, catId, action: 'sleep', memoryFlushed: false };
  }

  const shouldFlush = shouldFlushMemory(rule, 'reset');

  // Mark the session as sleeping by closing the lease but keeping the reference
  if (found.catIndex >= 0 && found.channel.catAssignments) {
    const assignment = found.channel.catAssignments[found.catIndex];
    if (assignment?.execution?.lease) {
      assignment.execution.lease = {
        ...assignment.execution.lease,
        status: 'closed',
      };
    }
  }

  return {
    success: true,
    channelId,
    catId,
    action: 'sleep',
    memoryFlushed: shouldFlush,
  };
}

export function resumeSession(
  state: ChatState,
  channelId: string,
  catId: string,
): SessionOperationResult {
  const found = findChannelAndCat(state, channelId, catId);
  if (!found) {
    return { success: false, channelId, catId, action: 'resume', memoryFlushed: false };
  }

  const topology = classifyContinuityTopology(found.channel);
  const rule = resolveContinuityRule(topology);

  if (!rule.allowResume) {
    return { success: false, channelId, catId, action: 'resume', memoryFlushed: false };
  }

  // Mark the session as initializing to trigger a re-wake
  if (found.catIndex >= 0 && found.channel.catAssignments) {
    const assignment = found.channel.catAssignments[found.catIndex];
    if (assignment?.execution?.lease) {
      assignment.execution.lease = {
        ...assignment.execution.lease,
        status: 'initializing',
      };
    }
  }

  return {
    success: true,
    channelId,
    catId,
    action: 'resume',
    memoryFlushed: false,
  };
}

export function compactSession(
  state: ChatState,
  channelId: string,
  catId: string,
): SessionOperationResult {
  const found = findChannelAndCat(state, channelId, catId);
  if (!found) {
    return { success: false, channelId, catId, action: 'compact', memoryFlushed: false };
  }

  const topology = classifyContinuityTopology(found.channel);
  const rule = resolveContinuityRule(topology);
  const shouldFlush = shouldFlushMemory(rule, 'compaction');

  return {
    success: true,
    channelId,
    catId,
    action: 'compact',
    memoryFlushed: shouldFlush,
  };
}
