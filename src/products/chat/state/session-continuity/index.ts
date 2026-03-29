export {
  classifyContinuityTopology,
  resolveContinuityRule,
  shouldFlushMemory,
  type ContinuityTopology,
  type ContinuityRule,
  type ContinuityResetBehavior,
  type ContinuityCompactionPolicy,
  type ContinuityMemoryFlushPhase,
} from './rules.js';

export {
  compactSession,
  resetSession,
  resumeSession,
  sleepSession,
  type SessionOperationResult,
  type SessionResetOptions,
} from './operations.js';
