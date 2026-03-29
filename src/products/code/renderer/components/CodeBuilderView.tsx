import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../api/contracts.js';
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

export interface CodeBuilderViewProps {
  payload: AppShellPayload;
}

export function CodeBuilderView({ payload }: CodeBuilderViewProps) {
  const navigate = useNavigate();
  const { state, create, execute, resume, refreshRepoStatus, reset, stopPolling } = useCodeTaskExecution();

  const [step, setStep] = useState<BuilderStep>('workspace');
  const [workspacePath, setWorkspacePath] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [provider, setProvider] = useState('claude');
  const [model, setModel] = useState('');
  const [feedback, setFeedback] = useState('');
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

      // Fetch task detail for artifacts
      try {
        const detail = (await fetchCodeTaskDetail(state.taskId)) as Record<string, unknown>;
        if (cancelled) {
          return;
        }

        const linked = detail.linkedArtifacts;
        if (Array.isArray(linked) && linked.length > 0) {
          setArtifacts(linked as ArtifactItem[]);

          // Find the latest ready preview artifact's URL if any
          const readyPreview = (linked as ArtifactItem[]).find(
            (a) => a.kind === 'preview' && a.status === 'ready' && a.path,
          );
          setPreviewUrl(readyPreview?.path ?? null);
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
          const session = observation.session as Record<string, unknown> | undefined;
          if (session?.status === 'closed') {
            setStep('done');
            refreshRepoStatus(workspacePath);
          }
        } catch {
          // Non-fatal
        }
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
    setFeedback('');

    const taskId = await create({
      title: taskTitle.trim(),
      summary: taskDescription.trim() || null,
      workspacePath: workspacePath.trim(),
      acceptanceCriteria: taskDescription.trim() || null,
    });

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
  }, [taskTitle, taskDescription, workspacePath, provider, model, create, execute, state.error, refreshRepoStatus]);

  const plan = state.plan as PlanState | null;
  const repoStatus = state.repoStatus as RepoStatus | null;

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
    setFeedback('');
    setArtifacts([]);
    setPreviewUrl(null);
  }, [reset]);

  return (
    <div className="codeBuilderView">
      <div className="codeBuilderHeader">
        <h1 className="codeBuilderTitle">Code Builder</h1>
        {step !== 'workspace' ? (
          <button
            type="button"
            className="operatorAction"
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
            <button
              type="button"
              className="operatorAction operatorActionPrimary"
              onClick={handleWorkspaceSubmit}
            >
              Continue
            </button>
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
            <label className="codeBuilderLabel">
              What do you want to build?
              <input
                type="text"
                className="codeBuilderInput"
                placeholder="e.g. Add user authentication"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
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
                className="operatorAction"
                onClick={() => setStep('workspace')}
              >
                Back
              </button>
              <button
                type="button"
                className="operatorAction operatorActionPrimary"
                onClick={handleCreateAndExecute}
                disabled={state.phase === 'creating' || state.phase === 'executing'}
              >
                {state.phase === 'creating'
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
              previewUrl={previewUrl}
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
