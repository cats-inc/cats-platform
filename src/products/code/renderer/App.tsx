import { useEffect, useState, type ReactNode } from 'react';

import type {
  CodeArtifactDetailProjection,
  CodeDashboardProjection,
  CodeTaskDetailProjection,
} from '../api/projection';

import {
  fetchCodeArtifactDetail,
  fetchCodeDashboard,
  fetchCodeTaskDetail,
} from './api';
import './code.css';

type DashboardState =
  | { status: 'loading' }
  | { status: 'ready'; payload: CodeDashboardProjection }
  | { status: 'error'; message: string };

type FocusState =
  | { kind: 'task'; id: string }
  | { kind: 'artifact'; id: string }
  | null;

type DetailState =
  | { status: 'idle' }
  | { status: 'loading'; focus: FocusState }
  | { status: 'task'; payload: CodeTaskDetailProjection }
  | { status: 'artifact'; payload: CodeArtifactDetailProjection }
  | { status: 'error'; focus: FocusState; message: string };

function formatLabel(value: string | null | undefined): string {
  if (!value) {
    return 'none';
  }

  return value
    .replace(/_/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'No recent update';
  }

  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatBytes(value: number | null | undefined): string {
  if (!value || value <= 0) {
    return 'Unknown size';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let remaining = value;
  let unitIndex = 0;
  while (remaining >= 1024 && unitIndex < units.length - 1) {
    remaining /= 1024;
    unitIndex += 1;
  }

  return `${remaining.toFixed(remaining >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

interface CodeListButtonProps {
  title: string;
  summary: string | null;
  status: string;
  meta: string;
  chips: string[];
  selected: boolean;
  onClick: () => void;
}

function CodeListButton({
  title,
  summary,
  status,
  meta,
  chips,
  selected,
  onClick,
}: CodeListButtonProps) {
  return (
    <button
      type="button"
      className={`codeListButton${selected ? ' isSelected' : ''}`}
      onClick={onClick}
    >
      <div className="codeListButtonHeader">
        <strong>{title}</strong>
        <span className="codeBadge">{formatLabel(status)}</span>
      </div>
      <p className="codeCardMeta">{meta}</p>
      <p className="codeCardCopy">{summary ?? 'No summary recorded yet.'}</p>
      {chips.length > 0 ? (
        <div className="codeChipRow">
          {chips.map((chip, index) => (
            <span className="codeChip" key={`${title}:${chip}:${index}`}>{chip}</span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

interface CodeSectionProps {
  title: string;
  subtitle: string;
  emptyState: string;
  children: ReactNode;
}

function CodeSection({
  title,
  subtitle,
  emptyState,
  children,
}: CodeSectionProps) {
  const isEmpty = children === null;

  return (
    <section className="codeSectionCard">
      <div className="codeSectionHeader">
        <div>
          <p className="codeSectionEyebrow">{title}</p>
          <h2>{subtitle}</h2>
        </div>
      </div>
      {isEmpty ? <p className="codeEmptyState">{emptyState}</p> : children}
    </section>
  );
}

function CodeTaskDetail({
  payload,
  onSelectArtifact,
}: {
  payload: CodeTaskDetailProjection;
  onSelectArtifact: (artifactId: string) => void;
}) {
  return (
    <section className="codeDetailCard">
      <div className="codeDetailHeader">
        <div>
          <p className="codeSectionEyebrow">Task Detail</p>
          <h2>{payload.task.title}</h2>
          <p className="codeCardMeta">
            Updated {formatTimestamp(payload.task.updatedAt)}
            {' · '}
            {payload.conversation?.title ?? 'No linked conversation'}
          </p>
        </div>
        <span className="codeBadge codeBadgeStrong">{formatLabel(payload.task.status)}</span>
      </div>

      <div className="codeSummaryGrid codeSummaryGridCompact">
        <div className="codeSummaryCard">
          <span className="codeSummaryValue">{payload.artifactSummary.totalCount}</span>
          <span className="codeSummaryLabel">Linked Outputs</span>
        </div>
        <div className="codeSummaryCard">
          <span className="codeSummaryValue">{payload.artifactSummary.buildCount}</span>
          <span className="codeSummaryLabel">Builds</span>
        </div>
        <div className="codeSummaryCard">
          <span className="codeSummaryValue">{payload.artifactSummary.previewCount}</span>
          <span className="codeSummaryLabel">Previews</span>
        </div>
        <div className="codeSummaryCard">
          <span className="codeSummaryValue">{payload.timeline.summary.returned}</span>
          <span className="codeSummaryLabel">Timeline Events</span>
        </div>
      </div>

      <div className="codeDetailSection">
        <h3>Execution Context</h3>
        <div className="codeDefinitionList">
          <div>
            <dt>Strategy</dt>
            <dd>{payload.effectiveStrategy ?? 'No strategy resolved'}</dd>
          </div>
          <div>
            <dt>Linked work item</dt>
            <dd>{payload.workItem?.title ?? 'No linked work item'}</dd>
          </div>
          <div>
            <dt>Latest run</dt>
            <dd>{payload.inspection.latestRun?.id ?? 'No run recorded yet'}</dd>
          </div>
          <div>
            <dt>Workflow stage</dt>
            <dd>{payload.inspection.workflowSummary?.stageId ?? 'No workflow summary yet'}</dd>
          </div>
        </div>
        <p className="codeDetailCopy">{payload.task.summary ?? 'No task summary recorded yet.'}</p>
      </div>

      <div className="codeDetailSection">
        <h3>Linked Outputs</h3>
        {payload.linkedArtifacts.length === 0 ? (
          <p className="codeEmptyState">No build or preview outputs recorded for this task yet.</p>
        ) : (
          <div className="codeCompactList">
            {payload.linkedArtifacts.map((artifact) => (
              <button
                type="button"
                className="codeInlineButton"
                key={artifact.id}
                onClick={() => onSelectArtifact(artifact.id)}
              >
                <strong>{artifact.title}</strong>
                <span>{formatLabel(artifact.kind)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="codeDetailSection">
        <h3>Recent Timeline</h3>
        {payload.timeline.view.items.length === 0 ? (
          <p className="codeEmptyState">No timeline events recorded yet.</p>
        ) : (
          <ul className="codeTimelineList">
            {payload.timeline.view.items.map((item) => (
              <li className="codeTimelineItem" key={item.timelineId}>
                <div className="codeTimelineHeader">
                  <strong>{item.title}</strong>
                  <span>{formatTimestamp(item.timestamp)}</span>
                </div>
                <p>{item.summary ?? `${formatLabel(item.kind)} event`}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CodeArtifactDetail({
  payload,
  onSelectTask,
  onSelectArtifact,
}: {
  payload: CodeArtifactDetailProjection;
  onSelectTask: (taskId: string) => void;
  onSelectArtifact: (artifactId: string) => void;
}) {
  return (
    <section className="codeDetailCard">
      <div className="codeDetailHeader">
        <div>
          <p className="codeSectionEyebrow">Output Detail</p>
          <h2>{payload.artifact.title}</h2>
          <p className="codeCardMeta">
            Updated {formatTimestamp(payload.artifact.updatedAt)}
            {' · '}
            {payload.focus.kind === 'artifact'
              ? 'Code artifact'
              : `${formatLabel(payload.focus.kind)} output`}
          </p>
        </div>
        <span className="codeBadge codeBadgeStrong">{formatLabel(payload.artifact.status)}</span>
      </div>

      <div className="codeSummaryGrid codeSummaryGridCompact">
        <div className="codeSummaryCard">
          <span className="codeSummaryValue">{formatLabel(payload.artifact.kind)}</span>
          <span className="codeSummaryLabel">Kind</span>
        </div>
        <div className="codeSummaryCard">
          <span className="codeSummaryValue">{formatBytes(payload.artifact.sizeBytes)}</span>
          <span className="codeSummaryLabel">Size</span>
        </div>
        <div className="codeSummaryCard">
          <span className="codeSummaryValue">{payload.relatedArtifacts.length}</span>
          <span className="codeSummaryLabel">Related Outputs</span>
        </div>
        <div className="codeSummaryCard">
          <span className="codeSummaryValue">{payload.focus.isReady ? 'Ready' : 'Draft'}</span>
          <span className="codeSummaryLabel">Availability</span>
        </div>
      </div>

      <div className="codeDetailSection">
        <h3>Context</h3>
        <div className="codeDefinitionList">
          <div>
            <dt>Path</dt>
            <dd>{payload.artifact.path ?? 'No artifact path recorded'}</dd>
          </div>
          <div>
            <dt>MIME type</dt>
            <dd>{payload.artifact.mimeType ?? 'Unknown MIME type'}</dd>
          </div>
          <div>
            <dt>Task</dt>
            <dd>
              {payload.task ? (
                <button
                  type="button"
                  className="codeLinkButton"
                  onClick={() => onSelectTask(payload.task!.id)}
                >
                  {payload.task.title}
                </button>
              ) : 'No linked task'}
            </dd>
          </div>
          <div>
            <dt>Work item</dt>
            <dd>{payload.workItem?.title ?? 'No linked work item'}</dd>
          </div>
          <div>
            <dt>Project</dt>
            <dd>{payload.project?.title ?? 'No linked project'}</dd>
          </div>
          <div>
            <dt>Conversation</dt>
            <dd>{payload.conversation?.title ?? 'No linked conversation'}</dd>
          </div>
        </div>
        <p className="codeDetailCopy">{payload.artifact.summary ?? 'No artifact summary recorded yet.'}</p>
      </div>

      <div className="codeDetailSection">
        <h3>Related Outputs</h3>
        {payload.relatedArtifacts.length === 0 ? (
          <p className="codeEmptyState">No sibling outputs recorded yet.</p>
        ) : (
          <div className="codeCompactList">
            {payload.relatedArtifacts.map((artifact) => (
              <button
                type="button"
                className="codeInlineButton"
                key={artifact.id}
                onClick={() => onSelectArtifact(artifact.id)}
              >
                <strong>{artifact.title}</strong>
                <span>{formatLabel(artifact.kind)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function CodeApp() {
  const [dashboardState, setDashboardState] = useState<DashboardState>({ status: 'loading' });
  const [focus, setFocus] = useState<FocusState>(null);
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;

    void fetchCodeDashboard()
      .then((payload) => {
        if (!cancelled) {
          setDashboardState({ status: 'ready', payload });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDashboardState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load Cats Code.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dashboardState.status !== 'ready') {
      return;
    }

    const { payload } = dashboardState;
    if (focus === null) {
      if (payload.selection.defaultArtifactId) {
        setFocus({ kind: 'artifact', id: payload.selection.defaultArtifactId });
        return;
      }
      if (payload.selection.defaultTaskId) {
        setFocus({ kind: 'task', id: payload.selection.defaultTaskId });
      }
    }
  }, [dashboardState, focus]);

  useEffect(() => {
    if (!focus) {
      setDetailState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setDetailState({ status: 'loading', focus });

    const request = focus.kind === 'task'
      ? fetchCodeTaskDetail(focus.id)
      : fetchCodeArtifactDetail(focus.id);

    void request
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setDetailState(
          focus.kind === 'task'
            ? { status: 'task', payload: payload as CodeTaskDetailProjection }
            : { status: 'artifact', payload: payload as CodeArtifactDetailProjection },
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailState({
            status: 'error',
            focus,
            message: error instanceof Error ? error.message : 'Failed to load Code detail.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [focus]);

  if (dashboardState.status === 'loading') {
    return (
      <div className="codeSurface">
        <section className="codeHeroCard">
          <p className="codeEyebrow">Cats Code</p>
          <h1>Loading code workspace...</h1>
        </section>
      </div>
    );
  }

  if (dashboardState.status === 'error') {
    return (
      <div className="codeSurface">
        <section className="codeHeroCard">
          <p className="codeEyebrow">Cats Code</p>
          <h1>Could not load Code</h1>
          <p className="codeEmptyState">{dashboardState.message}</p>
        </section>
      </div>
    );
  }

  const { payload } = dashboardState;

  return (
    <div className="codeSurface">
      <section className="codeHeroCard">
        <div className="codeHeroCopy">
          <p className="codeEyebrow">Cats Code</p>
          <h1>Local builder loop over shared tasks and outputs</h1>
          <p>
            Cats Code now treats build and preview records as a real workspace:
            code-targeted tasks, linked outputs, and task timelines stay in one
            surface instead of a read-only summary dashboard.
          </p>
        </div>
        <div className="codeSummaryGrid">
          <div className="codeSummaryCard">
            <span className="codeSummaryValue">{payload.summary.taskCount}</span>
            <span className="codeSummaryLabel">Code Tasks</span>
          </div>
          <div className="codeSummaryCard">
            <span className="codeSummaryValue">{payload.summary.artifactCount}</span>
            <span className="codeSummaryLabel">Outputs</span>
          </div>
          <div className="codeSummaryCard">
            <span className="codeSummaryValue">{payload.summary.buildCount}</span>
            <span className="codeSummaryLabel">Builds</span>
          </div>
          <div className="codeSummaryCard">
            <span className="codeSummaryValue">{payload.summary.previewCount}</span>
            <span className="codeSummaryLabel">Previews</span>
          </div>
        </div>
      </section>

      <div className="codeWorkspace">
        <div className="codeCollectionsColumn">
          <CodeSection
            title={payload.sections.tasks.title}
            subtitle={`${payload.sections.tasks.summary.returned} of ${payload.sections.tasks.summary.totalAvailable} tasks`}
            emptyState={payload.sections.tasks.emptyState}
          >
            {payload.sections.tasks.items.length === 0 ? null : (
              <div className="codeCardList">
                {payload.sections.tasks.items.map((task) => (
                  <CodeListButton
                    key={task.id}
                    title={task.title}
                    summary={task.summary}
                    status={task.status}
                    meta={`${task.conversationTitle ?? 'No linked conversation'} · ${formatTimestamp(task.updatedAt)}`}
                    chips={[
                      `Strategy: ${task.effectiveStrategy ?? 'not resolved'}`,
                      task.workItemTitle ?? 'No linked work item',
                    ]}
                    selected={focus?.kind === 'task' && focus.id === task.id}
                    onClick={() => setFocus({ kind: 'task', id: task.id })}
                  />
                ))}
              </div>
            )}
          </CodeSection>

          <CodeSection
            title={payload.sections.artifacts.title}
            subtitle={`${payload.sections.artifacts.summary.returned} of ${payload.sections.artifacts.summary.totalAvailable} outputs`}
            emptyState={payload.sections.artifacts.emptyState}
          >
            {payload.sections.artifacts.items.length === 0 ? null : (
              <div className="codeCardList">
                {payload.sections.artifacts.items.map((artifact) => (
                  <CodeListButton
                    key={artifact.id}
                    title={artifact.title}
                    summary={artifact.summary ?? artifact.path}
                    status={artifact.status}
                    meta={`${formatLabel(artifact.kind)} · ${formatTimestamp(artifact.updatedAt)}`}
                    chips={[
                      artifact.taskTitle ?? 'No linked task',
                      artifact.workItemTitle ?? 'No linked work item',
                    ]}
                    selected={focus?.kind === 'artifact' && focus.id === artifact.id}
                    onClick={() => setFocus({ kind: 'artifact', id: artifact.id })}
                  />
                ))}
              </div>
            )}
          </CodeSection>
        </div>

        <div className="codeDetailColumn">
          {detailState.status === 'idle' ? (
            <section className="codeDetailCard codeDetailCardEmpty">
              <p className="codeSectionEyebrow">Workspace Detail</p>
              <h2>Select a task or output</h2>
              <p className="codeEmptyState">
                Cats Code now keeps task context and output context in one place.
                Pick a code task or artifact from the left to inspect it.
              </p>
            </section>
          ) : null}

          {detailState.status === 'loading' ? (
            <section className="codeDetailCard codeDetailCardEmpty">
              <p className="codeSectionEyebrow">Workspace Detail</p>
              <h2>Loading detail...</h2>
            </section>
          ) : null}

          {detailState.status === 'error' ? (
            <section className="codeDetailCard codeDetailCardEmpty">
              <p className="codeSectionEyebrow">Workspace Detail</p>
              <h2>Could not load detail</h2>
              <p className="codeEmptyState">{detailState.message}</p>
            </section>
          ) : null}

          {detailState.status === 'task' ? (
            <CodeTaskDetail
              payload={detailState.payload}
              onSelectArtifact={(artifactId) => setFocus({ kind: 'artifact', id: artifactId })}
            />
          ) : null}

          {detailState.status === 'artifact' ? (
            <CodeArtifactDetail
              payload={detailState.payload}
              onSelectTask={(taskId) => setFocus({ kind: 'task', id: taskId })}
              onSelectArtifact={(artifactId) => setFocus({ kind: 'artifact', id: artifactId })}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
