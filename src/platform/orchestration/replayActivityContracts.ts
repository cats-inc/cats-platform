import type {
  CoreTaskRecord,
} from '../../core/types.js';
import type { OrchestratorDispatchReplayTrigger } from './dispatchReplay.js';

export type OrchestratorReplayActivityPhase =
  | 'pending_dispatch_stored'
  | 'replay_started'
  | 'replay_dispatched'
  | 'replay_blocked'
  | 'replay_failed'
  | 'startup_recovered';

export type OrchestratorReplayActivitySource =
  | 'orchestrator-replay'
  | 'orchestrator-startup-recovery'
  | 'workflow-continuation-replay';

export const ORCHESTRATOR_REPLAY_ACTIVITY_SOURCES = [
  'orchestrator-replay',
  'orchestrator-startup-recovery',
  'workflow-continuation-replay',
] as const satisfies readonly OrchestratorReplayActivitySource[];

export const ORCHESTRATOR_REPLAY_ACTIVITY_TRIGGERS = [
  'dispatch',
  'approve',
  'reroute',
  'retry',
] as const satisfies readonly OrchestratorDispatchReplayTrigger[];

export const ORCHESTRATOR_REPLAY_ACTIVITY_PHASES = [
  'pending_dispatch_stored',
  'replay_started',
  'replay_dispatched',
  'replay_blocked',
  'replay_failed',
  'startup_recovered',
] as const satisfies readonly OrchestratorReplayActivityPhase[];

export interface OrchestratorReplayActivityInput {
  task: Pick<CoreTaskRecord, 'id' | 'title' | 'conversationId'>;
  actorId?: string | null;
  runId?: string | null;
  source?: OrchestratorReplayActivitySource;
  phase: OrchestratorReplayActivityPhase;
  trigger?: OrchestratorDispatchReplayTrigger | null;
  resumeReason?: 'target_recovered' | null;
  blockedReason?: string | null;
  error?: string | null;
  resultCount?: number | null;
  pendingDispatchRecovered?: boolean;
  dispatchReplayRecovered?: boolean;
}
