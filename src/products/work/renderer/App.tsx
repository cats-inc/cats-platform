import { useEffect, useState, type ReactNode } from 'react';

import type {
  WorkDashboardProjection,
  WorkTaskDetailProjection,
} from '../api/projection';

import { fetchWorkDashboard, fetchWorkTaskDetail } from './api';
import './work.css';

type DashboardState =
  | { status: 'loading' }
  | { status: 'ready'; payload: WorkDashboardProjection }
  | { status: 'error'; message: string };

type DetailState =
  | { status: 'idle' }
  | { status: 'loading'; taskId: string }
  | { status: 'ready'; taskId: string; payload: WorkTaskDetailProjection }
  | { status: 'error'; taskId: string; message: string };

function formatLabel(value: string | null | undefined): string {
  if (!value) {
    return 'none';
  }

  return value
    .replace(/_/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatTimelineTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'No recent timeline';
  }

  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface TaskListButtonProps {
  title: string;
  summary: string | null;
  status: string;
  meta: string;
  chips: string[];
  selected: boolean;
  onClick: () => void;
}

function TaskListButton({
  title,
  summary,
  status,
  meta,
  chips,
  selected,
  onClick,
}: TaskListButtonProps) {
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

interface WorkTaskDetailProps {
  state: DetailState;
}

function WorkTaskDetail({ state }: WorkTaskDetailProps) {
  if (state.status === 'idle') {
    return (
      <section className="workDetailCard">
        <p className="workSectionEyebrow">Task Detail</p>
        <h2>Select a task</h2>
        <p className="workEmptyState">
          Pick an inbox, control-plane, or recovery item to inspect the shared-core
          timeline, governance state, and runtime delivery context.
        </p>
      </section>
    );
  }

  if (state.status === 'loading') {
    return (
      <section className="workDetailCard">
        <p className="workSectionEyebrow">Task Detail</p>
        <h2>Loading task</h2>
        <p className="workEmptyState">Fetching control-plane detail for {state.taskId}.</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="workDetailCard">
        <p className="workSectionEyebrow">Task Detail</p>
        <h2>Could not load task</h2>
        <p className="workEmptyState">{state.message}</p>
      </section>
    );
  }

  const { payload } = state;
  const { task, inspection, controlPlane, recovery, timeline } = payload;
  const latestWorkflow = controlPlane.latestWorkflowRecommendation;

  return (
    <section className="workDetailCard">
      <div className="workDetailHeader">
        <div>
          <p className="workSectionEyebrow">Task Detail</p>
          <h2>{task.title}</h2>
          <p className="workTaskButtonMeta">
            Task {task.id} · {task.conversationId ?? 'No conversation'} · Updated {formatTimelineTimestamp(task.updatedAt)}
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
                  <span>{formatTimelineTimestamp(item.timestamp)}</span>
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

export default function WorkApp() {
  const [dashboardState, setDashboardState] = useState<DashboardState>({ status: 'loading' });
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchWorkDashboard()
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setDashboardState({ status: 'ready', payload });
        setSelectedTaskId((current) => current ?? payload.selection.defaultTaskId);
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
    if (!selectedTaskId) {
      setDetailState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setDetailState({ status: 'loading', taskId: selectedTaskId });

    void fetchWorkTaskDetail(selectedTaskId)
      .then((payload) => {
        if (!cancelled) {
          setDetailState({ status: 'ready', taskId: selectedTaskId, payload });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailState({
            status: 'error',
            taskId: selectedTaskId,
            message: error instanceof Error ? error.message : 'Failed to load task detail.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

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
          <h1>Shared-core operator dashboard</h1>
          <p>
            Work now consumes the same task, approval, recovery, and timeline substrate
            that Chat already writes. This surface is the first real Work slice above
            Cats Core instead of a placeholder route.
          </p>
        </div>
        <div className="workSummaryGrid">
          <div className="workSummaryCard">
            <span className="workSummaryValue">{payload.summary.taskCount}</span>
            <span className="workSummaryLabel">Tasks</span>
          </div>
          <div className="workSummaryCard">
            <span className="workSummaryValue">{payload.summary.operatorAttentionCount}</span>
            <span className="workSummaryLabel">Need Attention</span>
          </div>
          <div className="workSummaryCard">
            <span className="workSummaryValue">{payload.summary.pendingApprovalCount}</span>
            <span className="workSummaryLabel">Pending Approval</span>
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
            title="Operator Inbox"
            subtitle={`${payload.sections.operatorInbox.summary.returned} queued tasks`}
            emptyState={payload.sections.operatorInbox.emptyState}
          >
            {payload.sections.operatorInbox.items.length === 0 ? null : (
              <div className="workTaskList">
                {payload.sections.operatorInbox.items.map((item) => (
                  <TaskListButton
                    key={`operator:${item.taskId}`}
                    title={item.taskTitle}
                    summary={item.summary}
                    status={item.taskStatus}
                    meta={formatTimelineTimestamp(item.latestTimelineItem?.timestamp ?? null)}
                    chips={[
                      ...item.attention.reasons.map((reason) => formatLabel(reason)),
                      ...item.nextActions.map((action) => action.label),
                    ]}
                    selected={selectedTaskId === item.taskId}
                    onClick={() => setSelectedTaskId(item.taskId)}
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
                  <TaskListButton
                    key={`control:${item.taskId}`}
                    title={item.latestTimelineItem?.title ?? item.taskId}
                    summary={item.latestTimelineItem?.summary ?? null}
                    status={item.taskStatus}
                    meta={formatTimelineTimestamp(item.lastUpdatedAt)}
                    chips={[
                      formatLabel(item.attention.severity),
                      ...item.nextActions.map((action) => action.label),
                    ]}
                    selected={selectedTaskId === item.taskId}
                    onClick={() => setSelectedTaskId(item.taskId)}
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
                  <TaskListButton
                    key={`recovery:${item.taskId}`}
                    title={item.pendingDispatch?.bodyPreview ?? item.dispatchReplay?.bodyPreview ?? item.taskId}
                    summary={item.latestActivity?.message ?? 'Recovery context available.'}
                    status={item.taskStatus}
                    meta={formatTimelineTimestamp(
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
                    selected={selectedTaskId === item.taskId}
                    onClick={() => setSelectedTaskId(item.taskId)}
                  />
                ))}
              </div>
            )}
          </DashboardSection>
        </div>

        <div className="workDetailColumn">
          <WorkTaskDetail state={detailState} />
        </div>
      </div>
    </div>
  );
}
