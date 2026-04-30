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
import type { CodeWorkspaceSummary } from '../../shared/workspaceSummary.js';
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
import { buildCodeArtifactPath } from '../codePaths.js';
import { messageKeys } from '../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { labelCodeWorkspaceKindForLocale } from './codeWorkspaceLabels.js';

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
  const { t } = useI18n();

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
    ? t(messageKeys.codeBuilderWorkspaceFallbackChatRepo)
    : fallbackRoomWorkspacePath
      ? t(messageKeys.codeBuilderWorkspaceFallbackRoom)
      : null;

  const resolveWorkspaceBinding = useCallback(async (): Promise<CodeWorkspaceSummary | null> => {
    try {
      const result = await resolveWorkspace({
        path: workspacePath.trim() || null,
        conversationRepoPath: fallbackConversationRepoPath,
        roomWorkspacePath: fallbackRoomWorkspacePath,
      });

      if (!result.workspace) {
        setFeedback(result.error || t(messageKeys.codeBuilderErrorCodespaceResolve));
        return null;
      }

      setWorkspaceSummary(result.workspace);
      setWorkspacePath(result.workspace.workspacePath);
      return result.workspace;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.codeBuilderErrorCodespaceResolve));
      return null;
    }
  }, [fallbackConversationRepoPath, fallbackRoomWorkspacePath, t, workspacePath]);

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
      setFeedback(t(messageKeys.codeBuilderErrorTaskTitle));
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
      setFeedback(state.error || t(messageKeys.codeBuilderErrorTaskCreate));
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
      setFeedback(state.error || t(messageKeys.codeBuilderErrorTaskExecution));
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
    t,
    refreshRepoStatus,
  ]);

  const handleResumeTask = useCallback(async () => {
    const normalizedTaskId = normalizeCodeBuilderTaskId(resumeTaskId);
    if (!normalizedTaskId) {
      setFeedback(t(messageKeys.codeBuilderErrorTaskResumeInput));
      return;
    }

    setFeedback('');
    const resumedTaskId = await resume(normalizedTaskId);
    if (!resumedTaskId) {
      setFeedback(state.error || t(messageKeys.codeBuilderErrorTaskResume));
      return;
    }

    let nextFeedback = t(messageKeys.codeBuilderFeedbackResumeTask, { taskId: resumedTaskId });
    try {
      const detail = await fetchCodeTaskDetail(resumedTaskId);
      if (detail.workspace) {
        setWorkspaceSummary(detail.workspace);
        setWorkspacePath(detail.workspace.workspacePath);
      } else {
        const resolvedWorkspace = await resolveWorkspaceBinding();
        if (!resolvedWorkspace) {
          nextFeedback = t(messageKeys.codeBuilderFeedbackResumeNoWorkspace, {
            taskId: resumedTaskId,
          });
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
  }, [resumeTaskId, resume, resolveWorkspaceBinding, state.error, t]);

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
        <h1 className="codeBuilderTitle">{t(messageKeys.codeBuilderTitle)}</h1>
        {step !== 'workspace' ? (
          <button
            type="button"
            className="operatorActionButton"
            onClick={handleReset}
          >
            {t(messageKeys.codeBuilderNewTaskButton)}
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
              <p className="operatorEyebrow">
                {t(messageKeys.codeBuilderStepLabel, { step: 1 })}
              </p>
              <h2>{t(messageKeys.codeBuilderCodespaceHeader)}</h2>
            </div>
          </div>
          <div className="codeBuilderForm">
            <label className="codeBuilderLabel">
              {t(messageKeys.codeBuilderHeaderProjectFolder)}
              <input
                type="text"
                className="codeBuilderInput"
                placeholder={t(messageKeys.codeBuilderWorkspacePathPlaceholder)}
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
              {t(messageKeys.codeBuilderResumeLabel)}
              <input
                type="text"
                className="codeBuilderInput"
                placeholder={t(messageKeys.codeBuilderWorkspaceSampleTaskId)}
                value={resumeTaskId}
                onChange={(e) => setResumeTaskId(e.target.value)}
              />
            </label>
            <p className="codeBuilderHelperText">
              {t(messageKeys.codeBuilderWorkspaceResumeHelp)}{' '}
              {workspaceFallbackLabel ?? t(messageKeys.codeBuilderWorkspaceFallbackBoundFallback)}
            </p>
            <div className="codeBuilderFormRow">
              <button
                type="button"
                className="operatorActionButton operatorActionButtonPrimary"
                onClick={() => { void handleWorkspaceSubmit(); }}
              >
                {t(messageKeys.codeBuilderContinue)}
              </button>
              <button
                type="button"
                className="operatorActionButton"
                onClick={() => void handleResumeTask()}
                disabled={!normalizeCodeBuilderTaskId(resumeTaskId)}
              >
                {t(messageKeys.codeBuilderResumePrompt)}
              </button>
            </div>
            {workspaceFallbackLabel && !workspacePath.trim() ? (
              <p className="codeBuilderHelperText">
                {selectedChannelContext?.title
                  ? t(messageKeys.codeBuilderSuccessTaskReadyWithCurrentChat, {
                    workspaceFallback: workspaceFallbackLabel,
                    title: selectedChannelContext.title,
                  })
                  : workspaceFallbackLabel}
                </p>
            ) : null}
            {workspaceSummary ? (
              <article className="operatorCard codeWorkspaceInlineCard">
                <div className="operatorCardHeader">
                  <strong>{workspaceSummary.workspacePath}</strong>
                  <span className="operatorStatusBadge isMuted">
                    {labelCodeWorkspaceKindForLocale(workspaceSummary.workspaceKind, t)}
                  </span>
                </div>
                <p>{t(messageKeys.codeBuilderWorkspaceActiveNotice)}</p>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 'task' ? (
        <section className="operatorPanel">
          <div className="operatorPanelHeader">
            <div>
              <p className="operatorEyebrow">
                {t(messageKeys.codeBuilderStepLabel, { step: 2 })}
              </p>
              <h2>{t(messageKeys.codeBuilderDefineTaskHeader)}</h2>
            </div>
          </div>
          <div className="codeBuilderForm">
            {usingExistingTask ? (
              <div className="codeBuilderTaskNotice">
                <span className="operatorStatusBadge isMuted">
                  {t(messageKeys.codeBuilderExistingTask)}
                </span>
                <span>{activeTaskId}</span>
              </div>
            ) : null}
            <label className="codeBuilderLabel">
              {t(messageKeys.codeBuilderTaskQuestion)}
              <input
                type="text"
                className="codeBuilderInput"
                placeholder={t(messageKeys.codeBuilderTaskSummaryPlaceholder)}
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                disabled={usingExistingTask}
              />
            </label>
            <label className="codeBuilderLabel">
              {t(messageKeys.codeBuilderDetailsLabel)}
              <textarea
                className="codeBuilderTextarea"
                placeholder={t(messageKeys.codeBuilderDetailPlaceholder)}
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                rows={3}
                disabled={usingExistingTask}
              />
            </label>
            <div className="codeBuilderFormRow">
              <label className="codeBuilderLabel">
                {t(messageKeys.codeBuilderProviderLabel)}
                <input
                  type="text"
                  className="codeBuilderInput"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </label>
              <label className="codeBuilderLabel">
                {t(messageKeys.codeBuilderModelLabel)}
                <input
                  type="text"
                  className="codeBuilderInput"
                  placeholder={t(messageKeys.codeBuilderModelPlaceholder)}
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
                {t(messageKeys.codeBuilderBack)}
              </button>
              <button
                type="button"
                className="operatorActionButton operatorActionButtonPrimary"
                onClick={handleCreateAndExecute}
                disabled={state.phase === 'creating' || state.phase === 'executing'}
              >
                {usingExistingTask
                  ? state.phase === 'executing'
                    ? t(messageKeys.codeBuilderContinueTaskBusy)
                    : t(messageKeys.codeBuilderContinueBuild)
                  : state.phase === 'creating'
                    ? t(messageKeys.codeBuilderCreatingTask)
                    : state.phase === 'executing'
                      ? t(messageKeys.codeBuilderStartingTaskBusy)
                      : t(messageKeys.codeBuilderCreateLabel)}
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
                navigate(buildCodeArtifactPath(id));
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
          {t(messageKeys.codeBuilderExecutionDoneBanner)}
        </div>
      ) : null}
    </div>
  );
}
