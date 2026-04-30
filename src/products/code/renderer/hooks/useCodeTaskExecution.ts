import { useCallback, useRef, useState } from 'react';

import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import type { CodePlanState } from '../../state/planSteps.js';
import {
  type CodeDeliveryResult,
  createCodeTask,
  executeCodeTask,
  resumeCodeTask,
  fetchCodePlan,
  inspectRepoStatus,
  type CreateCodeTaskInput,
  type ExecuteCodeTaskInput,
} from '../api/codeTask.js';

export type CodeTaskPhase =
  | 'idle'
  | 'creating'
  | 'executing'
  | 'running'
  | 'completed'
  | 'failed';

export interface CodeTaskExecutionState {
  phase: CodeTaskPhase;
  taskId: string | null;
  sessionId: string | null;
  plan: CodePlanState | null;
  repoStatus: CodeDeliveryResult | null;
  error: string | null;
}

const INITIAL_STATE: CodeTaskExecutionState = {
  phase: 'idle',
  taskId: null,
  sessionId: null,
  plan: null,
  repoStatus: null,
  error: null,
};

export function useCodeTaskExecution() {
  const { t } = useI18n();
  const [state, setState] = useState<CodeTaskExecutionState>(INITIAL_STATE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPlanPolling = useCallback((taskId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const plan = await fetchCodePlan(taskId);
        setState((prev) => ({ ...prev, plan }));
      } catch {
        // Polling errors are non-fatal.
      }
    }, 5_000);
  }, [stopPolling]);

  const create = useCallback(async (input: CreateCodeTaskInput) => {
    setState((prev) => ({ ...prev, phase: 'creating', error: null }));
    try {
      const result = await createCodeTask(input);
      const taskId = result.task.taskId;
      if (!taskId) {
        throw new Error(t(messageKeys.codeBuilderErrorTaskCreateMissingId));
      }
      setState((prev) => ({
        ...prev,
        phase: 'idle',
        taskId,
      }));
      return taskId;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t(messageKeys.codeBuilderErrorTaskCreate);
      setState((prev) => ({ ...prev, phase: 'failed', error: message }));
      return null;
    }
  }, [t]);

  const execute = useCallback(async (taskId: string, input: ExecuteCodeTaskInput) => {
    setState((prev) => ({ ...prev, phase: 'executing', error: null }));
    try {
      const result = await executeCodeTask(taskId, input);
      setState((prev) => ({
        ...prev,
        phase: 'running',
        taskId,
        sessionId: result.sessionId,
      }));
      startPlanPolling(taskId);
      return result.sessionId;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t(messageKeys.codeBuilderErrorTaskExecution);
      setState((prev) => ({ ...prev, phase: 'failed', error: message }));
      return null;
    }
  }, [startPlanPolling, t]);

  const resume = useCallback(async (taskId: string) => {
    setState((prev) => ({ ...prev, phase: 'executing', error: null }));
    try {
      await resumeCodeTask(taskId);
      try {
        const plan = await fetchCodePlan(taskId);
        setState((prev) => ({ ...prev, phase: 'idle', taskId, plan }));
      } catch {
        setState((prev) => ({ ...prev, phase: 'idle', taskId }));
      }
      startPlanPolling(taskId);
      return taskId;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t(messageKeys.codeBuilderErrorTaskResume);
      setState((prev) => ({ ...prev, phase: 'failed', error: message }));
      return null;
    }
  }, [startPlanPolling, t]);

  const refreshRepoStatus = useCallback(async (workspacePath: string) => {
    try {
      const result = await inspectRepoStatus({ workspacePath });
      setState((prev) => ({ ...prev, repoStatus: result }));
    } catch {
      // Non-fatal — repo may not exist yet.
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setState(INITIAL_STATE);
  }, [stopPolling]);

  return {
    state,
    create,
    execute,
    resume,
    refreshRepoStatus,
    reset,
    stopPolling,
  };
}
