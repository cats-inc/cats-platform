import { useEffect, useState, type ReactNode } from 'react';

import type {
  WorkDashboardProjection,
  WorkProjectDetailProjection,
  WorkTaskDetailProjection,
  WorkWorkItemDetailProjection,
} from '../api/projection';

import {
  fetchWorkDashboard,
  fetchWorkProjectDetail,
  fetchWorkTaskDetail,
  fetchWorkWorkItemDetail,
} from './api';
import './work.css';

type DashboardState =
  | { status: 'loading' }
  | { status: 'ready'; payload: WorkDashboardProjection }
  | { status: 'error'; message: string };

type FocusState =
  | { kind: 'task'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'workItem'; id: string }
  | null;

type DetailState =
  | { status: 'idle' }
  | { status: 'loading'; focus: FocusState }
  | { status: 'task'; payload: WorkTaskDetailProjection }
  | { status: 'project'; payload: WorkProjectDetailProjection }
  | { status: 'workItem'; payload: WorkWorkItemDetailProjection }
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

interface WorkListButtonProps {
  title: string;
  summary: string | null;
  status: string;
  meta: string;
  chips: string[];
  selected: boolean;
  onClick: () => void;
}

function WorkListButton({
  title,
  summary,
  status,
  meta,
  chips,
  selected,
  onClick,
}: WorkListButtonProps) {
  return (
    <button
      type="button"
      className={`workTaskButton${selected ? ' isSelected' : ''}`}
      onClick={onClick}
    >
      <div className="workTaskButtonHeader">
        <strong>{title}</strong>
        <span className="workBadge">{formatLabel(status)}</span>
      </div>
      <p className="workTaskButtonMeta">{meta}</p>
      <p className="workTaskButtonSummary">{summary ?? 'No summary recorded yet.'}</p>
      {chips.length > 0 ? (
        <div className="workChipRow">
          {chips.map((chip, index) => (
            <span className="workChip" key={`${title}:${chip}:${index}`}>{chip}</span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

interface DashboardSectionProps {
  title: string;
  subtitle: string;
  emptyState: string;
  children: ReactNode;
}

function DashboardSection({
  title,
  subtitle,
  emptyState,
  children,
}: DashboardSectionProps) {
  const isEmpty = children === null;

  return (
    <section className="workSectionCard">
      <div className="workSectionHeader">
        <div>
          <p className="workSectionEyebrow">{title}</p>
          <h2>{subtitle}</h2>
        </div>
      </div>
      {isEmpty ? <p className="workEmptyState">{emptyState}</p> : children}
    </section>
  );
}

function WorkProjectDetail({ payload }: { payload: WorkProjectDetailProjection }) {
  return (
    <section className="workDetailCard">
      <div className="workDetailHeader">
        <div>
          <p className="workSectionEyebrow">Project Detail</p>
          <h2>{payload.project.title}</h2>
          <p className="workTaskButtonMeta">
            Owner {payload.ownerName}
            {' · '}
            Updated {formatTimestamp(payload.project.updatedAt)}
          </p>
        </div>
        <span className="workBadge workBadgeStrong">{formatLabel(payload.project.status)}</span>
      </div>

      <div className="workSummaryGrid workSummaryGridCompact">
        <div className="workSummaryCard">
          <span className="workSummaryValue">{payload.workItems.length}</span>
          <span className="workSummaryLabel">Work Items</span>
        </div>
        <div className="workSummaryCard">
          <span className="workSummaryValue">{payload.linkedTasks.length}</span>
          <span className="workSummaryLabel">Linked Tasks</span>
        </div>
        <div className="workSummaryCard">
          <span className="workSummaryValue">{payload.artifacts.totalCount}</span>
          <span className="workSummaryLabel">Artifacts</span>
        </div>
        <div className="workSummaryCard">
          <span className="workSummaryValue">{payload.activity.totalCount}</span>
          <span className="workSummaryLabel">Activity</span>
        </div>
      </div>

      <div className="workDetailSection">
        <h3>Project Context</h3>
        <div className="workDefinitionList">
          <div>
            <dt>Primary conversation</dt>
            <dd>{payload.primaryConversation?.title ?? 'No linked conversation'}</dd>
          </div>
          <div>
            <dt>Repo path</dt>
            <dd>{payload.project.repoPath ?? 'No repo path recorded'}</dd>
          </div>
        </div>
        <p className="workDetailCopy">{payload.project.summary ?? 'No project summary recorded yet.'}</p>
      </div>

      <div className="workDetailSection">
        <h3>Workstream Snapshot</h3>
        {payload.workItems.length === 0 ? (
          <p className="workEmptyState">No work items linked to this project yet.</p>
        ) : (
          <ul className="workCompactList">
            {payload.workItems.map((workItem) => (
              <li key={workItem.id}>
                <strong>{workItem.title}</strong>
                <span>{formatLabel(workItem.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="workDetailSection">
        <h3>Recent Activity</h3>
        {payload.activity.latestMessages.length === 0 ? (
          <p className="workEmptyState">No recent project activity yet.</p>
        ) : (
          <ul className="workTimelineList">
            {payload.activity.latestMessages.map((message, index) => (
              <li className="workTimelineItem" key={`${payload.project.id}:activity:${index}`}>
                <p>{message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function WorkWorkItemDetail({ payload }: { payload: WorkWorkItemDetailProjection }) {
  return (
    <section className="workDetailCard">
      <div className="workDetailHeader">
        <div>
          <p className="workSectionEyebrow">Work Item Detail</p>
          <h2>{payload.workItem.title}</h2>
          <p className="workTaskButtonMeta">
            Owner {payload.ownerName}
            {' · '}
            Updated {formatTimestamp(payload.workItem.updatedAt)}
          </p>
        </div>
        <span className="workBadge workBadgeStrong">{formatLabel(payload.workItem.status)}</span>
      </div>

      <div className="workSummaryGrid workSummaryGridCompact">
        <div className="workSummaryCard">
          <span className="workSummaryValue">{payload.assignedActors.length}</span>
          <span className="workSummaryLabel">Assigned Actors</span>
        </div>
        <div className="workSummaryCard">
          <span className="workSummaryValue">{payload.linkedTask ? 1 : 0}</span>
          <span className="workSummaryLabel">Linked Task</span>
        </div>
        <div className="workSummaryCard">
          <span className="workSummaryValue">{payload.artifacts.totalCount}</span>
          <span className="workSummaryLabel">Artifacts</span>
        </div>
        <div className="workSummaryCard">
          <span className="workSummaryValue">{payload.activity.totalCount}</span>
          <span className="workSummaryLabel">Activity</span>
        </div>
      </div>

      <div className="workDetailSection">
        <h3>Context</h3>
        <div className="workDefinitionList">
          <div>
            <dt>Project</dt>
            <dd>{payload.project?.title ?? 'No linked project'}</dd>
          </div>
          <div>
            <dt>Conversation</dt>
            <dd>{payload.conversation?.title ?? 'No linked conversation'}</dd>
          </div>
          <div>
            <dt>Assigned actors</dt>
            <dd>
              {payload.assignedActors.length > 0
                ? payload.assignedActors.map((actor) => actor.displayName).join(', ')
                : 'No assigned actors'}
            </dd>
          </div>
        </div>
        <p className="workDetailCopy">{payload.workItem.summary ?? 'No work-item summary recorded yet.'}</p>
      </div>

      {payload.linkedTask ? (
        <div className="workDetailSection">
          <h3>Linked Task Snapshot</h3>
          <p className="workDetailCopy">
            {payload.linkedTask.task.title}
            {' · '}
            {formatLabel(payload.linkedTask.task.status)}
          </p>
          <div className="workChipRow">
            {payload.linkedTask.controlPlane.nextActions.map((action) => (
              <span className="workChip workChipAccent" key={action.kind}>{action.label}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="workDetailSection">
        <h3>Recent Activity</h3>
        {payload.activity.latestMessages.length === 0 ? (
          <p className="workEmptyState">No recent work-item activity yet.</p>
        ) : (
          <ul className="workTimelineList">
            {payload.activity.latestMessages.map((message, index) => (
              <li className="workTimelineItem" key={`${payload.workItem.id}:activity:${index}`}>
                <p>{message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function WorkTaskDetail({ payload }: { payload: WorkTaskDetailProjection }) {
  const { task, inspection, controlPlane, recovery, timeline } = payload;
  const latestWorkflow = controlPlane.latestWorkflowRecommendation;

  return (
    <section className="workDetailCard">
      <div className="workDetailHeader">
        <div>
          <p className="workSectionEyebrow">Task Detail</p>
          <h2>{task.title}</h2>
          <p className="workTaskButtonMeta">
            Task {task.id}
            {' · '}
            {task.conversationId ?? 'No conversation'}
            {' · '}
            Updated {formatTimestamp(task.updatedAt)}
          </p>
        </div>
        <span className="workBadge workBadgeStrong">{formatLabel(task.status)}</span>
      </div>

      <div className="workSummaryGrid workSummaryGridCompact">
        <div className="workSummaryCard">
          <span className="workSummaryValue">{inspection.counts.runs}</span>
          <span className="workSummaryLabel">Runs</span>
        </div>
        <div className="workSummaryCard">
          <span className="workSummaryValue">{inspection.counts.checkpoints}</span>
          <span className="workSummaryLabel">Checkpoints</span>
        </div>
        <div className="workSummaryCard">
          <span className="workSummaryValue">{inspection.counts.outcomes}</span>
          <span className="workSummaryLabel">Outcomes</span>
        </div>
        <div className="workSummaryCard">
          <span className="workSummaryValue">{timeline.summary.matching}</span>
          <span className="workSummaryLabel">Timeline Items</span>
        </div>
      </div>

      <div className="workDetailSection">
        <h3>Attention and Next Actions</h3>
        <p className="workDetailCopy">
          Severity: <strong>{formatLabel(controlPlane.attention.severity)}</strong>
          {' · '}
          Needs operator attention: <strong>{controlPlane.attention.needsOperatorAttention ? 'Yes' : 'No'}</strong>
        </p>
        <div className="workChipRow">
          {controlPlane.attention.reasons.length > 0
            ? controlPlane.attention.reasons.map((reason) => (
              <span className="workChip" key={reason}>{formatLabel(reason)}</span>
            ))
            : <span className="workChip">No active blockers</span>}
          {controlPlane.nextActions.map((action) => (
            <span className="workChip workChipAccent" key={action.kind}>
              {action.label}
            </span>
          ))}
        </div>
      </div>

      <div className="workDetailSection">
        <h3>Workflow and Delivery</h3>
        <div className="workDefinitionList">
          <div>
            <dt>Workflow shape</dt>
            <dd>{formatLabel(controlPlane.workflowSummary?.shape ?? controlPlane.workflowContinuation?.workflowShape ?? 'none')}</dd>
          </div>
          <div>
            <dt>Delivery mode</dt>
            <dd>{formatLabel(controlPlane.runtimeDeliveryIntent?.mode)}</dd>
          </div>
          <div>
            <dt>Review required</dt>
            <dd>{controlPlane.workflowContinuation?.reviewRequired || controlPlane.workflowSummary?.reviewRequired ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Recovery required</dt>
            <dd>{recovery.recoveryRequired ? 'Yes' : 'No'}</dd>
          </div>
        </div>
        {latestWorkflow ? (
          <p className="workDetailCopy">
            Latest workflow recommendation: {latestWorkflow.rationale ?? 'No rationale recorded.'}
          </p>
        ) : null}
      </div>

      <div className="workDetailSection">
        <h3>Timeline Preview</h3>
        {timeline.view.items.length === 0 ? (
          <p className="workEmptyState">No timeline items recorded for this task yet.</p>
        ) : (
          <ul className="workTimelineList">
            {timeline.view.items.map((item) => (
              <li className="workTimelineItem" key={item.timelineId}>
                <div className="workTimelineHeader">
                  <strong>{item.title}</strong>
                  <span>{formatTimestamp(item.timestamp)}</span>
                </div>
                <p>{item.summary ?? `${formatLabel(item.category)} · ${formatLabel(item.kind)}`}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function WorkDetailPane({ state }: { state: DetailState }) {
  if (state.status === 'idle') {
    return (
      <section className="workDetailCard">
        <p className="workSectionEyebrow">Work Detail</p>
        <h2>Select a project, work item, or task</h2>
        <p className="workEmptyState">
          Work now exposes shared-core planning and control-plane reads. Choose a record
          from the left to inspect context, activity, and execution state.
        </p>
      </section>
    );
  }

  if (state.status === 'loading') {
    return (
      <section className="workDetailCard">
        <p className="workSectionEyebrow">Work Detail</p>
        <h2>Loading selection</h2>
        <p className="workEmptyState">Fetching the selected Work record.</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="workDetailCard">
        <p className="workSectionEyebrow">Work Detail</p>
        <h2>Could not load selection</h2>
        <p className="workEmptyState">{state.message}</p>
      </section>
    );
  }

  if (state.status === 'project') {
    return <WorkProjectDetail payload={state.payload} />;
  }

  if (state.status === 'workItem') {
    return <WorkWorkItemDetail payload={state.payload} />;
  }

  return <WorkTaskDetail payload={state.payload} />;
}

export default function WorkApp() {
  const [dashboardState, setDashboardState] = useState<DashboardState>({ status: 'loading' });
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' });
  const [focus, setFocus] = useState<FocusState>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchWorkDashboard()
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setDashboardState({ status: 'ready', payload });
        setFocus((current) => current ?? (
          payload.selection.defaultProjectId
            ? { kind: 'project', id: payload.selection.defaultProjectId }
            : payload.selection.defaultWorkItemId
              ? { kind: 'workItem', id: payload.selection.defaultWorkItemId }
              : payload.selection.defaultTaskId
                ? { kind: 'task', id: payload.selection.defaultTaskId }
                : null
        ));
      })
      .catch((error) => {
        if (!cancelled) {
          setDashboardState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load Cats Work dashboard.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!focus) {
      setDetailState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setDetailState({ status: 'loading', focus });

    const loadDetail = async () => {
      if (focus.kind === 'project') {
        return { status: 'project' as const, payload: await fetchWorkProjectDetail(focus.id) };
      }
      if (focus.kind === 'workItem') {
        return { status: 'workItem' as const, payload: await fetchWorkWorkItemDetail(focus.id) };
      }
      return { status: 'task' as const, payload: await fetchWorkTaskDetail(focus.id) };
    };

    void loadDetail()
      .then((nextState) => {
        if (!cancelled) {
          setDetailState(nextState);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailState({
            status: 'error',
            focus,
            message: error instanceof Error ? error.message : 'Failed to load Work detail.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [focus]);

  if (dashboardState.status === 'loading') {
    return (
      <div className="workSurface">
        <section className="workHeroCard">
          <p className="workEyebrow">Cats Work</p>
          <h1>Loading operator dashboard...</h1>
        </section>
      </div>
    );
  }

  if (dashboardState.status === 'error') {
    return (
      <div className="workSurface">
        <section className="workHeroCard">
          <p className="workEyebrow">Cats Work</p>
          <h1>Could not load Work</h1>
          <p className="workEmptyState">{dashboardState.message}</p>
        </section>
      </div>
    );
  }

  const { payload } = dashboardState;

  return (
    <div className="workSurface">
      <section className="workHeroCard">
        <div className="workHeroCopy">
          <p className="workEyebrow">Cats Work</p>
          <h1>Shared-core planning and operations</h1>
          <p>
            Work now sits above Cats Core as a real planning surface: projects, work items,
            approvals, recovery, and task detail all come from the same shared records that
            Chat already writes.
          </p>
        </div>
        <div className="workSummaryGrid">
          <div className="workSummaryCard">
            <span className="workSummaryValue">{payload.summary.projectCount}</span>
            <span className="workSummaryLabel">Projects</span>
          </div>
          <div className="workSummaryCard">
            <span className="workSummaryValue">{payload.summary.workItemCount}</span>
            <span className="workSummaryLabel">Work Items</span>
          </div>
          <div className="workSummaryCard">
            <span className="workSummaryValue">{payload.summary.operatorAttentionCount}</span>
            <span className="workSummaryLabel">Need Attention</span>
          </div>
          <div className="workSummaryCard">
            <span className="workSummaryValue">{payload.summary.recoveryCount}</span>
            <span className="workSummaryLabel">Recovery</span>
          </div>
        </div>
      </section>

      <div className="workLayout">
        <div className="workSectionColumn">
          <DashboardSection
            title="Projects"
            subtitle={`${payload.sections.projects.summary.returned} visible records`}
            emptyState={payload.sections.projects.emptyState}
          >
            {payload.sections.projects.items.length === 0 ? null : (
              <div className="workTaskList">
                {payload.sections.projects.items.map((item) => (
                  <WorkListButton
                    key={`project:${item.id}`}
                    title={item.title}
                    summary={item.summary}
                    status={item.status}
                    meta={`${item.ownerName} · ${formatTimestamp(item.updatedAt)}`}
                    chips={[
                      `${item.linkedWorkItemCount} work items`,
                      `${item.linkedTaskCount} linked tasks`,
                    ]}
                    selected={focus?.kind === 'project' && focus.id === item.id}
                    onClick={() => setFocus({ kind: 'project', id: item.id })}
                  />
                ))}
              </div>
            )}
          </DashboardSection>

          <DashboardSection
            title="Work Items"
            subtitle={`${payload.sections.workItems.summary.returned} active records`}
            emptyState={payload.sections.workItems.emptyState}
          >
            {payload.sections.workItems.items.length === 0 ? null : (
              <div className="workTaskList">
                {payload.sections.workItems.items.map((item) => (
                  <WorkListButton
                    key={`work-item:${item.id}`}
                    title={item.title}
                    summary={item.summary}
                    status={item.status}
                    meta={`${item.projectTitle ?? 'No project'} · ${formatTimestamp(item.updatedAt)}`}
                    chips={[
                      item.taskTitle ?? 'No linked task',
                      ...item.assignedActorNames.slice(0, 2),
                    ]}
                    selected={focus?.kind === 'workItem' && focus.id === item.id}
                    onClick={() => setFocus({ kind: 'workItem', id: item.id })}
                  />
                ))}
              </div>
            )}
          </DashboardSection>

          <DashboardSection
            title="Operator Inbox"
            subtitle={`${payload.sections.operatorInbox.summary.returned} queued tasks`}
            emptyState={payload.sections.operatorInbox.emptyState}
          >
            {payload.sections.operatorInbox.items.length === 0 ? null : (
              <div className="workTaskList">
                {payload.sections.operatorInbox.items.map((item) => (
                  <WorkListButton
                    key={`operator:${item.taskId}`}
                    title={item.taskTitle}
                    summary={item.summary}
                    status={item.taskStatus}
                    meta={formatTimestamp(item.latestTimelineItem?.timestamp ?? null)}
                    chips={[
                      ...item.attention.reasons.map((reason) => formatLabel(reason)),
                      ...item.nextActions.map((action) => action.label),
                    ]}
                    selected={focus?.kind === 'task' && focus.id === item.taskId}
                    onClick={() => setFocus({ kind: 'task', id: item.taskId })}
                  />
                ))}
              </div>
            )}
          </DashboardSection>

          <DashboardSection
            title="Control Plane"
            subtitle={`${payload.sections.controlPlane.summary.returned} surfaced tasks`}
            emptyState={payload.sections.controlPlane.emptyState}
          >
            {payload.sections.controlPlane.items.length === 0 ? null : (
              <div className="workTaskList">
                {payload.sections.controlPlane.items.map((item) => (
                  <WorkListButton
                    key={`control:${item.taskId}`}
                    title={item.latestTimelineItem?.title ?? item.taskId}
                    summary={item.latestTimelineItem?.summary ?? null}
                    status={item.taskStatus}
                    meta={formatTimestamp(item.lastUpdatedAt)}
                    chips={[
                      formatLabel(item.attention.severity),
                      ...item.nextActions.map((action) => action.label),
                    ]}
                    selected={focus?.kind === 'task' && focus.id === item.taskId}
                    onClick={() => setFocus({ kind: 'task', id: item.taskId })}
                  />
                ))}
              </div>
            )}
          </DashboardSection>

          <DashboardSection
            title="Recovery"
            subtitle={`${payload.sections.recovery.summary.returned} recovery tasks`}
            emptyState={payload.sections.recovery.emptyState}
          >
            {payload.sections.recovery.items.length === 0 ? null : (
              <div className="workTaskList">
                {payload.sections.recovery.items.map((item) => (
                  <WorkListButton
                    key={`recovery:${item.taskId}`}
                    title={item.pendingDispatch?.bodyPreview ?? item.dispatchReplay?.bodyPreview ?? item.taskId}
                    summary={item.latestActivity?.message ?? 'Recovery context available.'}
                    status={item.taskStatus}
                    meta={formatTimestamp(
                      item.latestActivity?.createdAt
                        ?? item.workflowContinuationReplay?.recordedAt
                        ?? item.dispatchReplay?.recordedAt
                        ?? item.pendingDispatch?.blockedAt
                        ?? null,
                    )}
                    chips={[
                      item.canRetry ? 'Retry available' : 'Manual follow-up',
                      item.canResumeViaApproval ? 'Approval can resume' : 'No approval resume',
                    ]}
                    selected={focus?.kind === 'task' && focus.id === item.taskId}
                    onClick={() => setFocus({ kind: 'task', id: item.taskId })}
                  />
                ))}
              </div>
            )}
          </DashboardSection>
        </div>

        <div className="workDetailColumn">
          <WorkDetailPane state={detailState} />
        </div>
      </div>
    </div>
  );
}
