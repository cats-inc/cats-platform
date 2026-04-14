import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  resolveObservedPreviewSurfaceTarget,
  type ProductPreviewSurfaceTarget,
} from '../../../../core/previewSurfaces.js';
import {
  normalizeCodeBuilderTaskId,
  resolveCodeBuilderExecutionTaskId,
} from '../../shared/builderExecution.js';
import {
  labelCodeWorkspaceKind,
  type CodeWorkspaceSummary,
} from '../../shared/workspaceSummary.js';
import { useCodeTaskExecution } from '../hooks/useCodeTaskExecution.js';
import { PlanPanel } from './PlanPanel.js';
import { BuildPreviewPanel, type ArtifactItem } from './BuildPreviewPanel.js';
import { CodeExecutionSummaryPanel } from './CodeExecutionSummaryPanel.js';
import { CodeWorkspaceSummaryPanel } from './CodeWorkspaceSummaryPanel.js';
import { DeliveryPanel } from './DeliveryPanel.js';
import {
  previewCommit as apiPreviewCommit,
  applyCommit as apiApplyCommit,
  previewPush as apiPreviewPush,
  applyPush as apiApplyPush,
  exportArtifacts as apiExportArtifacts,
  observeRuntimeSession,
  fetchCodeTaskDetail,
  resolveWorkspace,
} from '../api/codeTask.js';
import { resolveComposerWorkspacePath } from '../../../../core/workspacePaths.js';

type BuilderStep = 'workspace' | 'task' | 'running' | 'done';

interface CodeBuilderSelectedChannelContext {
  title: string;
  repoPath: string | null;
  chatCwd: string | null;
}

interface CodeBuilderViewProps {
  selectedChannelContext?: CodeBuilderSelectedChannelContext | null;
}

export function CodeBuilderView({ selectedChannelContext = null }: CodeBuilderViewProps) {
  const navigate = useNavigate();
  const { state, create, execute, resume, refreshRepoStatus, reset, stopPolling } = useCodeTaskExecution();

  const [step, setStep] = useState<BuilderStep>('workspace');
  const [workspacePath, setWorkspacePath] = useState('');
  const [resumeTaskId, setResumeTaskId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [provider, setProvider] = useState('claude');
  const [model, setModel] = useState('');
  const [feedback, setFeedback] = useState('');
  const [workspaceSummary, setWorkspaceSummary] = useState<CodeWorkspaceSummary | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [effectiveStrategy, setEffectiveStrategy] = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<string | null>(null);
  const [deliveryRequiresOwnerDecision, setDeliveryRequiresOwnerDecision] = useState(false);
  const [deliveryApprovalPending, setDeliveryApprovalPending] = useState(false);
  const [continuationBlockedReason, setContinuationBlockedReason] = useState<string | null>(null);
  const [continuationTargetNames, setContinuationTargetNames] = useState<string[]>([]);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [previewTarget, setPreviewTarget] = useState<ProductPreviewSurfaceTarget | null>(null);

  const fallbackConversationRepoPath = selectedChannelContext?.repoPath ?? null;
  const fallbackRoomWorkspacePath = fallbackConversationRepoPath
    ? null
    : resolveComposerWorkspacePath(null, selectedChannelContext?.chatCwd ?? null);
  const workspaceFallbackLabel = fallbackConversationRepoPath
    ? 'Leave this blank to use the selected chat repo.'
    : fallbackRoomWorkspacePath
      ? 'Leave this blank to use the selected room workspace.'
      : null;

  const resolveWorkspaceBinding = useCallback(async (): Promise<CodeWorkspaceSummary | null> => {
    try {
      const result = await resolveWorkspace({
        path: workspacePath.trim() || null,
        conversationRepoPath: fallbackConversationRepoPath,
        roomWorkspacePath: fallbackRoomWorkspacePath,
      });

      if (!result.workspace) {
        setFeedback(result.error || 'Failed to resolve the workspace.');
        return null;
      }

      setWorkspaceSummary(result.workspace);
      setWorkspacePath(result.workspace.workspacePath);
      return result.workspace;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to resolve the workspace.');
      return null;
    }
  }, [fallbackConversationRepoPath, fallbackRoomWorkspacePath, workspacePath]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    if (
      step === 'workspace'
      && workspaceSummary
      && workspacePath.trim()
      && workspacePath.trim() !== workspaceSummary.workspacePath
    ) {
      setWorkspaceSummary(null);
    }
  }, [step, workspacePath, workspaceSummary]);

  // Poll task detail to get artifacts + plan, and observe session status
  useEffect(() => {
    if ((step !== 'running' && step !== 'done') || !state.taskId) {
      return;
    }

    let cancelled = false;

    async function poll() {
      if (cancelled || !state.taskId) {
        return;
      }

      let linkedArtifacts: ArtifactItem[] = [];

      // Fetch task detail for artifacts
      try {
        const detail = await fetchCodeTaskDetail(state.taskId);
        if (cancelled) {
          return;
        }

        if (detail.linkedArtifacts.length > 0) {
          linkedArtifacts = detail.linkedArtifacts as ArtifactItem[];
          setArtifacts(linkedArtifacts);
        } else {
          setArtifacts([]);
        }
        setWorkspaceSummary(detail.workspace);
        setEffectiveStrategy(detail.effectiveStrategy);
        setTaskStatus(detail.taskStatus);
        setDeliveryMode(detail.runtimeDeliveryIntent?.mode ?? null);
        setDeliveryRequiresOwnerDecision(
          detail.runtimeDeliveryIntent?.requiresOwnerDecision ?? false,
        );
        setDeliveryApprovalPending(detail.runtimeDeliveryIntent?.approvalPending ?? false);
        setContinuationBlockedReason(detail.workflowContinuation?.blockedReason ?? null);
        setContinuationTargetNames(detail.workflowContinuation?.targetNames ?? []);
      } catch {
        // Non-fatal
      }

      // Observe runtime session to detect completion
      if (state.sessionId && step === 'running') {
        try {
          const observation = await observeRuntimeSession(state.sessionId);
          if (cancelled) {
            return;
          }
          setPreviewTarget(resolveObservedPreviewSurfaceTarget(observation, linkedArtifacts));
          setSessionStatus(
            typeof observation.session?.status === 'string' && observation.session.status.trim()
              ? observation.session.status
              : null,
          );
          if (observation.session?.status === 'closed') {
            setStep('done');
            refreshRepoStatus(workspacePath);
          }
        } catch {
          setSessionStatus(null);
          setPreviewTarget(resolveObservedPreviewSurfaceTarget(null, linkedArtifacts));
        }
      } else {
        setSessionStatus(null);
        setPreviewTarget(resolveObservedPreviewSurfaceTarget(null, linkedArtifacts));
      }
    }

    void poll();
    const interval = setInterval(poll, 6_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, state.taskId, state.sessionId, workspacePath, refreshRepoStatus]);

  const handleWorkspaceSubmit = useCallback(async () => {
    const resolvedWorkspace = await resolveWorkspaceBinding();
    if (!resolvedWorkspace) {
      return;
    }
    setFeedback('');
    setStep('task');
  }, [resolveWorkspaceBinding]);

  const handleCreateAndExecute = useCallback(async () => {
    if (!taskTitle.trim()) {
      setFeedback('Please enter a task title.');
      return;
    }
    const resolvedWorkspace = await resolveWorkspaceBinding();
    if (!resolvedWorkspace) {
      return;
    }
    setFeedback('');

    let taskId = resolveCodeBuilderExecutionTaskId(state.taskId, resumeTaskId);
    if (!taskId) {
      taskId = await create({
        title: taskTitle.trim(),
        summary: taskDescription.trim() || null,
        workspacePath: resolvedWorkspace.workspacePath,
        workspaceKind: resolvedWorkspace.workspaceKind,
        acceptanceCriteria: taskDescription.trim() || null,
      });
    }

    if (!taskId) {
      setFeedback(state.error || 'Failed to create task.');
      return;
    }

    const sessionId = await execute(taskId, {
      workspacePath: resolvedWorkspace.workspacePath,
      workspaceKind: resolvedWorkspace.workspaceKind,
      provider,
      model: model.trim() || null,
    });

    if (sessionId) {
      setTaskStatus('in_progress');
      setSessionStatus('running');
      setStep('running');
      refreshRepoStatus(resolvedWorkspace.workspacePath);
    } else {
      setFeedback(state.error || 'Failed to start execution.');
    }
  }, [
    taskTitle,
    taskDescription,
    workspacePath,
    provider,
    model,
    create,
    execute,
    resolveWorkspaceBinding,
    resumeTaskId,
    state.error,
    state.taskId,
    refreshRepoStatus,
  ]);

  const handleResumeTask = useCallback(async () => {
    const normalizedTaskId = normalizeCodeBuilderTaskId(resumeTaskId);
    if (!normalizedTaskId) {
      setFeedback('Please enter a task ID to resume.');
      return;
    }

    setFeedback('');
    const resumedTaskId = await resume(normalizedTaskId);
    if (!resumedTaskId) {
      setFeedback(state.error || 'Failed to resume task.');
      return;
    }

    let nextFeedback = `Task ${resumedTaskId} is ready to continue.`;
    try {
      const detail = await fetchCodeTaskDetail(resumedTaskId);
      if (detail.workspace) {
        setWorkspaceSummary(detail.workspace);
        setWorkspacePath(detail.workspace.workspacePath);
      } else {
        const resolvedWorkspace = await resolveWorkspaceBinding();
        if (!resolvedWorkspace) {
          nextFeedback =
            `Task ${resumedTaskId} is ready, but you still need to resolve a workspace `
            + 'before continuing.';
        }
      }
      if (detail.title) {
        setTaskTitle(detail.title);
      }
      setTaskDescription(detail.summary ?? '');
      setTaskStatus(detail.taskStatus);
      setEffectiveStrategy(detail.effectiveStrategy);
      setDeliveryMode(detail.runtimeDeliveryIntent?.mode ?? null);
      setDeliveryRequiresOwnerDecision(
        detail.runtimeDeliveryIntent?.requiresOwnerDecision ?? false,
      );
      setDeliveryApprovalPending(detail.runtimeDeliveryIntent?.approvalPending ?? false);
      setContinuationBlockedReason(detail.workflowContinuation?.blockedReason ?? null);
      setContinuationTargetNames(detail.workflowContinuation?.targetNames ?? []);
    } catch {
      // Non-fatal: keep the resumed task id and let the owner continue from the task step.
    }

    setStep('task');
    setFeedback(nextFeedback);
  }, [resumeTaskId, resume, resolveWorkspaceBinding, state.error]);

  const plan = state.plan;
  const repoStatus = state.repoStatus;
  const activeTaskId = resolveCodeBuilderExecutionTaskId(state.taskId, resumeTaskId);
  const usingExistingTask = activeTaskId !== null;

  const handlePreviewCommit = useCallback(async (message: string) => {
    return apiPreviewCommit({ workspacePath, message });
  }, [workspacePath]);

  const handleApplyCommit = useCallback(async (message: string) => {
    return apiApplyCommit({ workspacePath, message });
  }, [workspacePath]);

  const handlePreviewPush = useCallback(async () => {
    return apiPreviewPush({ workspacePath });
  }, [workspacePath]);

  const handleApplyPush = useCallback(async () => {
    return apiApplyPush({ workspacePath });
  }, [workspacePath]);

  const handleExportArtifacts = useCallback(async () => {
    return apiExportArtifacts({ workspacePath });
  }, [workspacePath]);

  const handleRefreshRepoStatus = useCallback(() => {
    refreshRepoStatus(workspacePath);
  }, [refreshRepoStatus, workspacePath]);

  const handleReset = useCallback(() => {
    reset();
    setStep('workspace');
    setTaskTitle('');
    setTaskDescription('');
    setWorkspacePath('');
    setResumeTaskId('');
    setFeedback('');
    setWorkspaceSummary(null);
    setTaskStatus(null);
    setEffectiveStrategy(null);
    setDeliveryMode(null);
    setDeliveryRequiresOwnerDecision(false);
    setDeliveryApprovalPending(false);
    setContinuationBlockedReason(null);
    setContinuationTargetNames([]);
    setSessionStatus(null);
    setArtifacts([]);
    setPreviewTarget(null);
  }, [reset]);

  return (
    <div className="codeBuilderView">
      <div className="codeBuilderHeader">
        <h1 className="codeBuilderTitle">Code Builder</h1>
        {step !== 'workspace' ? (
          <button
            type="button"
            className="operatorActionButton"
            onClick={handleReset}
          >
            New task
          </button>
        ) : null}
      </div>

      {feedback ? (
        <div className="codeBuilderFeedback">{feedback}</div>
      ) : null}

      {step !== 'workspace' && workspaceSummary ? (
        <CodeWorkspaceSummaryPanel
          summary={workspaceSummary}
          selectedChannelTitle={selectedChannelContext?.title ?? null}
        />
      ) : null}

      {step !== 'workspace' ? (
        <CodeExecutionSummaryPanel
          taskId={activeTaskId}
          taskStatus={taskStatus}
          effectiveStrategy={effectiveStrategy}
          deliveryMode={deliveryMode}
          deliveryRequiresOwnerDecision={deliveryRequiresOwnerDecision}
          deliveryApprovalPending={deliveryApprovalPending}
          continuationBlockedReason={continuationBlockedReason}
          continuationTargetNames={continuationTargetNames}
          sessionId={state.sessionId}
          sessionStatus={sessionStatus}
          provider={provider}
          model={model}
        />
      ) : null}

      {step === 'workspace' ? (
        <section className="operatorPanel">
          <div className="operatorPanelHeader">
            <div>
              <p className="operatorEyebrow">Step 1</p>
              <h2>Workspace</h2>
            </div>
          </div>
          <div className="codeBuilderForm">
            <label className="codeBuilderLabel">
              Project folder
              <input
                type="text"
                className="codeBuilderInput"
                placeholder="/path/to/project"
                value={workspacePath}
                onChange={(e) => setWorkspacePath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleWorkspaceSubmit();
                  }
                }}
              />
            </label>
            <label className="codeBuilderLabel">
              Existing task ID (optional)
              <input
                type="text"
                className="codeBuilderInput"
                placeholder="task-..."
                value={resumeTaskId}
                onChange={(e) => setResumeTaskId(e.target.value)}
              />
            </label>
            <p className="codeBuilderHelperText">
              Resume is for a draft, blocked, or failed Code task you want to continue.{' '}
              {workspaceFallbackLabel ?? 'Enter a local folder to bind this builder loop.'}
            </p>
            <div className="codeBuilderFormRow">
              <button
                type="button"
                className="operatorActionButton operatorActionButtonPrimary"
                onClick={() => { void handleWorkspaceSubmit(); }}
              >
                Continue
              </button>
              <button
                type="button"
                className="operatorActionButton"
                onClick={() => void handleResumeTask()}
                disabled={!normalizeCodeBuilderTaskId(resumeTaskId)}
              >
                Resume task
              </button>
            </div>
            {workspaceFallbackLabel && !workspacePath.trim() ? (
              <p className="codeBuilderHelperText">
                {selectedChannelContext?.title
                  ? `${workspaceFallbackLabel} Current chat: ${selectedChannelContext.title}.`
                  : workspaceFallbackLabel}
              </p>
            ) : null}
            {workspaceSummary ? (
              <article className="operatorCard codeWorkspaceInlineCard">
                <div className="operatorCardHeader">
                  <strong>{workspaceSummary.workspacePath}</strong>
                  <span className="operatorStatusBadge isMuted">
                    {labelCodeWorkspaceKind(workspaceSummary.workspaceKind)}
                  </span>
                </div>
                <p>This will be the active builder workspace for the next task step.</p>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 'task' ? (
        <section className="operatorPanel">
          <div className="operatorPanelHeader">
            <div>
              <p className="operatorEyebrow">Step 2</p>
              <h2>Define Task</h2>
            </div>
          </div>
          <div className="codeBuilderForm">
            {usingExistingTask ? (
              <div className="codeBuilderTaskNotice">
                <span className="operatorStatusBadge isMuted">Existing task</span>
                <span>{activeTaskId}</span>
              </div>
            ) : null}
            <label className="codeBuilderLabel">
              What do you want to build?
              <input
                type="text"
                className="codeBuilderInput"
                placeholder="e.g. Add user authentication"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                disabled={usingExistingTask}
              />
            </label>
            <label className="codeBuilderLabel">
              Details / acceptance criteria (optional)
              <textarea
                className="codeBuilderTextarea"
                placeholder="Describe what done looks like..."
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                rows={3}
                disabled={usingExistingTask}
              />
            </label>
            <div className="codeBuilderFormRow">
              <label className="codeBuilderLabel">
                Provider
                <input
                  type="text"
                  className="codeBuilderInput"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </label>
              <label className="codeBuilderLabel">
                Model (optional)
                <input
                  type="text"
                  className="codeBuilderInput"
                  placeholder="default"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </label>
            </div>
            <div className="codeBuilderFormRow">
              <button
                type="button"
                className="operatorActionButton"
                onClick={() => setStep('workspace')}
              >
                Back
              </button>
              <button
                type="button"
                className="operatorActionButton operatorActionButtonPrimary"
                onClick={handleCreateAndExecute}
                disabled={state.phase === 'creating' || state.phase === 'executing'}
              >
                {usingExistingTask
                  ? state.phase === 'executing'
                    ? 'Continuing...'
                    : 'Continue Build'
                  : state.phase === 'creating'
                    ? 'Creating...'
                    : state.phase === 'executing'
                      ? 'Starting...'
                      : 'Build'}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {(step === 'running' || step === 'done') ? (
        <div className="codeBuilderPanels">
          <div className="codeBuilderPanelMain">
            <PlanPanel plan={plan} />
          </div>
          <div className="codeBuilderPanelSide">
            <BuildPreviewPanel
              artifacts={artifacts}
              previewTarget={previewTarget}
              onOpenArtifact={(id) => {
                navigate(`/code/artifacts/${id}`);
              }}
            />
            <DeliveryPanel
              workspacePath={workspacePath}
              sessionId={state.sessionId}
              repoStatus={repoStatus}
              onRefreshRepoStatus={handleRefreshRepoStatus}
              onPreviewCommit={handlePreviewCommit}
              onApplyCommit={handleApplyCommit}
              onPreviewPush={handlePreviewPush}
              onApplyPush={handleApplyPush}
              onExportArtifacts={handleExportArtifacts}
            />
          </div>
        </div>
      ) : null}

      {step === 'done' ? (
        <div className="codeBuilderDoneBanner">
          Task completed. Review the results above and use delivery actions to commit or push.
        </div>
      ) : null}
    </div>
  );
}
