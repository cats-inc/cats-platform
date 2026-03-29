import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  createPreviewSurfaceFallbackCandidates,
  resolvePreviewSurfaceTarget,
  type ProductPreviewSurfaceCandidate,
  type ProductPreviewSurfaceTarget,
} from '../../../../core/previewSurfaces.js';
import {
  normalizeCodeBuilderTaskId,
  resolveCodeBuilderExecutionTaskId,
} from '../../shared/builderExecution.js';
import { useCodeTaskExecution } from '../hooks/useCodeTaskExecution.js';
import { PlanPanel, type PlanState } from './PlanPanel.js';
import { BuildPreviewPanel, type ArtifactItem } from './BuildPreviewPanel.js';
import { DeliveryPanel, type RepoStatus } from './DeliveryPanel.js';
import {
  previewCommit as apiPreviewCommit,
  applyCommit as apiApplyCommit,
  previewPush as apiPreviewPush,
  applyPush as apiApplyPush,
  exportArtifacts as apiExportArtifacts,
  observeRuntimeSession,
  fetchCodeTaskDetail,
} from '../api/codeTask.js';

type BuilderStep = 'workspace' | 'task' | 'running' | 'done';

export function CodeBuilderView() {
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
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [previewTarget, setPreviewTarget] = useState<ProductPreviewSurfaceTarget | null>(null);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

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
        const detail = (await fetchCodeTaskDetail(state.taskId)) as Record<string, unknown>;
        if (cancelled) {
          return;
        }

        const linked = detail.linkedArtifacts;
        if (Array.isArray(linked) && linked.length > 0) {
          linkedArtifacts = linked as ArtifactItem[];
          setArtifacts(linkedArtifacts);
        } else {
          setArtifacts([]);
        }
      } catch {
        // Non-fatal
      }

      // Observe runtime session to detect completion
      if (state.sessionId && step === 'running') {
        try {
          const observation = (await observeRuntimeSession(state.sessionId)) as Record<string, unknown>;
          if (cancelled) {
            return;
          }
          setPreviewTarget(resolveLatestPreviewTarget(observation, linkedArtifacts));
          const session = observation.session as Record<string, unknown> | undefined;
          if (session?.status === 'closed') {
            setStep('done');
            refreshRepoStatus(workspacePath);
          }
        } catch {
          setPreviewTarget(resolveLatestPreviewTarget(null, linkedArtifacts));
        }
      } else {
        setPreviewTarget(resolveLatestPreviewTarget(null, linkedArtifacts));
      }
    }

    void poll();
    const interval = setInterval(poll, 6_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, state.taskId, state.sessionId, workspacePath, refreshRepoStatus]);

  const handleWorkspaceSubmit = useCallback(() => {
    if (!workspacePath.trim()) {
      setFeedback('Please enter a workspace path.');
      return;
    }
    setFeedback('');
    setStep('task');
  }, [workspacePath]);

  const handleCreateAndExecute = useCallback(async () => {
    if (!taskTitle.trim()) {
      setFeedback('Please enter a task title.');
      return;
    }
    if (!workspacePath.trim()) {
      setFeedback('Please enter a workspace path.');
      return;
    }
    setFeedback('');

    let taskId = resolveCodeBuilderExecutionTaskId(state.taskId, resumeTaskId);
    if (!taskId) {
      taskId = await create({
        title: taskTitle.trim(),
        summary: taskDescription.trim() || null,
        workspacePath: workspacePath.trim(),
        acceptanceCriteria: taskDescription.trim() || null,
      });
    }

    if (!taskId) {
      setFeedback(state.error || 'Failed to create task.');
      return;
    }

    const sessionId = await execute(taskId, {
      workspacePath: workspacePath.trim(),
      provider,
      model: model.trim() || null,
    });

    if (sessionId) {
      setStep('running');
      refreshRepoStatus(workspacePath.trim());
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
    resumeTaskId,
    state.error,
    state.taskId,
    refreshRepoStatus,
  ]);

  const handleResumeTask = useCallback(async () => {
    const normalizedTaskId = normalizeCodeBuilderTaskId(resumeTaskId);
    if (!workspacePath.trim()) {
      setFeedback('Please enter a workspace path before resuming a task.');
      return;
    }
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

    try {
      const detail = (await fetchCodeTaskDetail(resumedTaskId)) as Record<string, unknown>;
      const task = isRecord(detail.task) ? detail.task : null;
      if (typeof task?.title === 'string' && task.title.trim()) {
        setTaskTitle(task.title);
      }
      if (typeof task?.summary === 'string') {
        setTaskDescription(task.summary);
      }
    } catch {
      // Non-fatal: keep the resumed task id and let the owner continue from the task step.
    }

    setStep('task');
    setFeedback(`Task ${resumedTaskId} is ready to continue in this workspace.`);
  }, [resumeTaskId, resume, state.error, workspacePath]);

  const plan = state.plan as PlanState | null;
  const repoStatus = state.repoStatus as RepoStatus | null;
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
                    handleWorkspaceSubmit();
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
              Resume is for a draft, blocked, or failed Code task you want to continue in this
              workspace.
            </p>
            <div className="codeBuilderFormRow">
              <button
                type="button"
                className="operatorActionButton operatorActionButtonPrimary"
                onClick={handleWorkspaceSubmit}
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

function resolveLatestPreviewTarget(
  observation: Record<string, unknown> | null,
  artifacts: ArtifactItem[],
): ProductPreviewSurfaceTarget | null {
  const runtimeCandidates = observation ? readRuntimePreviewCandidates(observation) : [];
  const artifactCandidates = createPreviewSurfaceFallbackCandidates(artifacts);
  return resolvePreviewSurfaceTarget([...runtimeCandidates, ...artifactCandidates]);
}

function readRuntimePreviewCandidates(
  observation: Record<string, unknown>,
): ProductPreviewSurfaceCandidate[] {
  const session = isRecord(observation.session) ? observation.session : null;
  const inspection = session && isRecord(session.inspection) ? session.inspection : null;
  const directCandidates = Array.isArray(session?.previewSurfaces) ? session.previewSurfaces : [];
  const nestedCandidates = Array.isArray(inspection?.previewSurfaces)
    ? inspection.previewSurfaces
    : [];

  return [...directCandidates, ...nestedCandidates]
    .filter(isRecord)
    .map((candidate) => ({
      id: readOptionalString(candidate.id),
      label: readOptionalString(candidate.label),
      renderHint: readOptionalString(candidate.renderHint),
      url: readOptionalString(candidate.url),
      path: readOptionalString(candidate.path),
      artifactId: readOptionalString(candidate.artifactId),
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
