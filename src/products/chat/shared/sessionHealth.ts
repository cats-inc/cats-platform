import type { ChatChannelView } from '../api/contracts.js';
import {
  classifyContinuityTopology,
  resolveContinuityRule,
  type ContinuityRule,
  type ContinuityTopology,
} from '../state/session-continuity/rules.js';

export interface SessionHealthSummary {
  channelId: string;
  topology: ContinuityTopology;
  activeSessions: number;
  sleepingSessions: number;
  erroredSessions: number;
  lastActivatedAt: string | null;
  idleTimeoutMs: number | null;
  memoryFlushOnReset: boolean;
  allowsSleep: boolean;
  allowsResume: boolean;
}

export function buildSessionHealthSummary(
  channel: ChatChannelView,
  now: Date = new Date(),
): SessionHealthSummary {
  const topology = classifyContinuityTopology(channel);
  const rule: ContinuityRule = resolveContinuityRule(topology);

  let activeSessions = 0;
  let sleepingSessions = 0;
  let erroredSessions = 0;

  const assignments = channel.catAssignments ?? [];
  for (const assignment of assignments) {
    const status = assignment.execution?.lease?.status ?? 'not_started';
    switch (status) {
      case 'ready':
        activeSessions++;
        break;
      case 'closed':
      case 'not_started':
      case 'removed':
        sleepingSessions++;
        break;
      case 'error':
        erroredSessions++;
        break;
      case 'initializing':
        activeSessions++;
        break;
    }
  }

  return {
    channelId: channel.id,
    topology,
    activeSessions,
    sleepingSessions,
    erroredSessions,
    lastActivatedAt: channel.lastActivatedAt,
    idleTimeoutMs: rule.idleTimeoutMs,
    memoryFlushOnReset: rule.memoryFlushPhase === 'pre_reset',
    allowsSleep: rule.allowSleep,
    allowsResume: rule.allowResume,
  };
}
