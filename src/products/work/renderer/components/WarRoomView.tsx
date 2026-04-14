import {
  startTransition,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { taskExecutionProductLabel } from '../../../../core/taskHandoff.js';
import type { WorkDashboardProjection } from '../../api/projection.js';
import { buildChannelPath } from '../../shared/channelPaths.js';
import { fetchWorkDashboard } from '../api/dashboard.js';
import { IntakeStatusCard } from './IntakeStatusCard.js';

type WorkOperatorInboxItem = WorkDashboardProjection['sections']['operatorInbox']['items'][number];
type WorkControlPlaneItem = WorkDashboardProjection['sections']['controlPlane']['items'][number];
type WorkProjectItem = WorkDashboardProjection['sections']['projects']['items'][number];
type WorkRecoveryItem = WorkDashboardProjection['sections']['recovery']['items'][number];
type WorkWorkItemItem = WorkDashboardProjection['sections']['workItems']['items'][number];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Not recorded';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function compactList(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'None';
}

function formatProduct(product: string | null | undefined): string {
  if (!product) {
    return 'Unassigned';
  }

  return product === 'chat' || product === 'work' || product === 'code'
    ? taskExecutionProductLabel(product)
    : product;
}

function attentionBadgeClassName(severity: string | null | undefined): string {
  switch (severity) {
    case 'attention':
      return 'operatorStatusBadge isAttention';
    case 'error':
      return 'operatorStatusBadge isError';
    case 'progress':
      return 'operatorStatusBadge isProgress';
    case 'success':
      return 'operatorStatusBadge isSuccess';
    default:
      return 'operatorStatusBadge isMuted';
  }
}

function taskStatusBadgeClassName(status: string | null | undefined): string {
  switch (status) {
    case 'blocked':
    case 'paused':
    case 'cancelled':
      return 'operatorStatusBadge isError';
    case 'ready':
    case 'pending_approval':
    case 'planned':
      return 'operatorStatusBadge isAttention';
    case 'active':
    case 'in_progress':
      return 'operatorStatusBadge isProgress';
    case 'completed':
    case 'archived':
      return 'operatorStatusBadge isSuccess';
    default:
      return 'operatorStatusBadge isMuted';
  }
}

function WorkSummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <article className="operatorCard workWarRoomSummaryCard">
      <div className="operatorCardHeader">
        <strong>{label}</strong>
        <span className="operatorStatusBadge isMuted">{value}</span>
      </div>
      <p>{helper}</p>
    </article>
  );
}

function WorkSectionHeader({
  eyebrow,
  title,
  summary,
}: {
  eyebrow: string;
  title: string;
  summary: string;
}) {
  return (
    <div className="operatorPanelHeader">
      <div>
        <p className="operatorEyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <span className="operatorStatusBadge isMuted">{summary}</span>
    </div>
  );
}

function WorkWarRoomOpenTaskButton({
  taskId,
}: {
  taskId: string;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="operatorActionButton"
      onClick={() => {
        startTransition(() => {
          navigate(`/work/tasks/${encodeURIComponent(taskId)}`);
        });
      }}
    >
      Open task
    </button>
  );
}

function OperatorInboxSection({
  items,
  totalAvailable,
}: {
  items: WorkOperatorInboxItem[];
  totalAvailable: number;
}) {
  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow="Operate"
        title="Operator Inbox"
        summary={`${items.length} of ${totalAvailable}`}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>No tasks need operator attention.</strong>
            <span className="operatorStatusBadge isMuted">clear</span>
          </div>
          <p>The inbox will surface retry, approval, and blocked continuation work here.</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.taskId} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.taskTitle}</strong>
                <div className="workWarRoomBadgeRow">
                  <span className={attentionBadgeClassName(item.attention.severity)}>
                    {item.attention.severity}
                  </span>
                  <span className={taskStatusBadgeClassName(item.taskStatus)}>
                    {item.taskStatus}
                  </span>
                </div>
              </div>
              <p>{item.summary ?? 'No task summary recorded.'}</p>
              <div className="operatorMetaRow">
                <span>Reasons: {compactList(item.attention.reasons)}</span>
                <span>Actions: {compactList(item.nextActions.map((action) => action.kind))}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Product: {formatProduct(item.planning.effectiveProduct)}</span>
                <span>Strategy: {item.runtimeBridge.request.requestedStrategy ?? 'Not specified'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Delivery: {item.runtimeDeliveryIntent?.mode ?? 'Not specified'}</span>
                <span>Workflow: {item.workflowContinuation?.blockedReason ?? 'No replay block'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Latest: {item.latestTimelineItem?.title ?? 'No timeline item yet'}</span>
                <span>{formatTimestamp(item.latestTimelineItem?.timestamp)}</span>
              </div>
              <WorkWarRoomOpenTaskButton taskId={item.taskId} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ControlPlaneSection({
  items,
  totalAvailable,
}: {
  items: WorkControlPlaneItem[];
  totalAvailable: number;
}) {
  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow="Governance"
        title="Control Plane"
        summary={`${items.length} of ${totalAvailable}`}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>No governance or workflow signals are active.</strong>
            <span className="operatorStatusBadge isMuted">idle</span>
          </div>
          <p>Approval, delivery, and continuation signals will appear here once work starts moving.</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.taskId} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.taskId}</strong>
                <div className="workWarRoomBadgeRow">
                  <span className={attentionBadgeClassName(item.attention.severity)}>
                    {item.attention.severity}
                  </span>
                  <span className={taskStatusBadgeClassName(item.taskStatus)}>
                    {item.taskStatus}
                  </span>
                </div>
              </div>
              <p>
                {item.workflowContinuation?.targetNames.length
                  ? `Targets: ${item.workflowContinuation.targetNames.join(', ')}`
                  : item.workflowContinuation?.blockedReason
                    ? `Blocked by ${item.workflowContinuation.blockedReason}.`
                    : 'No continuation target currently recorded.'}
              </p>
              <div className="operatorMetaRow">
                <span>Product: {formatProduct(item.planning.effectiveProduct)}</span>
                <span>Strategy: {item.planning.effectiveStrategy ?? 'Not specified'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Next: {compactList(item.nextActions.map((action) => action.kind))}</span>
                <span>Delivery: {item.runtimeDeliveryIntent?.mode ?? 'Not specified'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Replay: {item.workflowContinuation?.replayState ?? 'Not recorded'}</span>
                <span>Blocked: {item.workflowContinuation?.blockedReason ?? 'No'}</span>
              </div>
              <WorkWarRoomOpenTaskButton taskId={item.taskId} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectsSection({
  items,
  totalAvailable,
}: {
  items: WorkProjectItem[];
  totalAvailable: number;
}) {
  const navigate = useNavigate();

  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow="Portfolio"
        title="Projects"
        summary={`${items.length} of ${totalAvailable}`}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>No projects recorded yet.</strong>
            <span className="operatorStatusBadge isMuted">empty</span>
          </div>
          <p>Projects created from intake or manual work setup will appear here.</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.id} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.title}</strong>
                <span className={taskStatusBadgeClassName(item.status)}>{item.status}</span>
              </div>
              <p>{item.summary ?? 'No project summary recorded.'}</p>
              <div className="operatorMetaRow">
                <span>Owner: {item.ownerName}</span>
                <span>Repo: {item.repoPath ?? 'Not bound'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Work items: {item.linkedWorkItemCount}</span>
                <span>Tasks: {item.linkedTaskCount}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Conversation: {item.primaryConversationTitle ?? 'No primary conversation'}</span>
                <span>{formatTimestamp(item.updatedAt)}</span>
              </div>
              <div className="workWarRoomHeaderActions">
                <WorkWarRoomOpenProjectButton projectId={item.id} />
                {item.primaryConversationSourceChannelId ? (
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => {
                      startTransition(() => {
                        navigate(buildChannelPath(item.primaryConversationSourceChannelId!));
                      });
                    }}
                  >
                    Open briefing thread
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkItemsSection({
  items,
  totalAvailable,
}: {
  items: WorkWorkItemItem[];
  totalAvailable: number;
}) {
  const navigate = useNavigate();

  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow="Managed Work"
        title="Work Items"
        summary={`${items.length} of ${totalAvailable}`}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>No work items recorded yet.</strong>
            <span className="operatorStatusBadge isMuted">empty</span>
          </div>
          <p>Operational work items will appear here as projects start executing.</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.id} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.title}</strong>
                <span className={taskStatusBadgeClassName(item.status)}>{item.status}</span>
              </div>
              <p>{item.summary ?? 'No work-item summary recorded.'}</p>
              <div className="operatorMetaRow">
                <span>Project: {item.projectTitle ?? 'No linked project'}</span>
                <span>Task: {item.taskTitle ?? 'No linked task'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Owner: {item.ownerName}</span>
                <span>Actors: {compactList(item.assignedActorNames)}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Conversation: {item.conversationTitle ?? 'No linked conversation'}</span>
                <span>{formatTimestamp(item.updatedAt)}</span>
              </div>
              <div className="workWarRoomHeaderActions">
                <WorkWarRoomOpenWorkItemButton workItemId={item.id} />
                {item.conversationSourceChannelId ? (
                  <button
                    type="button"
                    className="operatorActionButton"
                    onClick={() => {
                      startTransition(() => {
                        navigate(buildChannelPath(item.conversationSourceChannelId!));
                      });
                    }}
                  >
                    Open briefing thread
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RecoverySection({
  items,
  totalAvailable,
}: {
  items: WorkRecoveryItem[];
  totalAvailable: number;
}) {
  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow="Recovery"
        title="Replay & Retry"
        summary={`${items.length} of ${totalAvailable}`}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>No tasks currently need recovery.</strong>
            <span className="operatorStatusBadge isSuccess">stable</span>
          </div>
          <p>Blocked approvals, failed replays, and continuation recovery will surface here.</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.taskId} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.taskId}</strong>
                <div className="workWarRoomBadgeRow">
                  <span className={item.canRetry ? 'operatorStatusBadge isAttention' : 'operatorStatusBadge isMuted'}>
                    {item.canRetry ? 'retry available' : 'watch'}
                  </span>
                  <span className={taskStatusBadgeClassName(item.taskStatus)}>
                    {item.taskStatus}
                  </span>
                </div>
              </div>
              <p>
                {item.latestActivity?.message
                  ?? item.workflowContinuationReplay?.blockedReason
                  ?? item.dispatchReplay?.replayError
                  ?? 'No recovery note recorded.'}
              </p>
              <div className="operatorMetaRow">
                <span>Delivery: {item.context?.deliveryMode ?? 'Not specified'}</span>
                <span>Approval: {item.approval.status}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Replay: {item.workflowContinuationReplay?.replayState ?? item.dispatchReplay?.replayState ?? 'None'}</span>
                <span>Blocked: {item.workflowContinuationReplay?.blockedReason ?? 'No'}</span>
              </div>
              <div className="operatorMetaRow">
                <span>Latest source: {item.latestActivity?.source ?? 'Not recorded'}</span>
                <span>{formatTimestamp(item.latestActivity?.createdAt)}</span>
              </div>
              <WorkWarRoomOpenTaskButton taskId={item.taskId} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkWarRoomOpenProjectButton({
  projectId,
}: {
  projectId: string;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="operatorActionButton"
      onClick={() => {
        startTransition(() => {
          navigate(`/work/projects/${encodeURIComponent(projectId)}`);
        });
      }}
    >
      Open project
    </button>
  );
}

function WorkWarRoomOpenWorkItemButton({
  workItemId,
}: {
  workItemId: string;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="operatorActionButton"
      onClick={() => {
        startTransition(() => {
          navigate(`/work/work-items/${encodeURIComponent(workItemId)}`);
        });
      }}
    >
      Open work item
    </button>
  );
}

export function WarRoomView() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<WorkDashboardProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setError('');
    const nextPayload = await fetchWorkDashboard(signal);
    setPayload(nextPayload);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadDashboard(controller.signal)
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load war room.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadDashboard]);

  return (
    <div className="workWarRoomView">
      <div className="codeBuilderHeader">
        <div>
          <p className="operatorEyebrow">Work</p>
          <h1 className="codeBuilderTitle">War Room</h1>
        </div>
        <div className="workWarRoomHeaderActions">
          <button
            type="button"
            className="operatorActionButton"
            onClick={() => {
              setLoading(true);
              void loadDashboard()
                .catch((loadError) => {
                  setError(loadError instanceof Error ? loadError.message : 'Failed to refresh war room.');
                })
                .finally(() => setLoading(false));
            }}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="operatorActionButton operatorActionButtonPrimary"
            onClick={() => {
              startTransition(() => {
                navigate('/work/intake');
              });
            }}
          >
            Start intake
          </button>
        </div>
      </div>

      {error ? (
        <div className="codeBuilderFeedback">{error}</div>
      ) : null}

      {loading && !payload ? (
        <section className="operatorPanel">
          <WorkSectionHeader eyebrow="Loading" title="War Room" summary="pending" />
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <strong>Loading operational dashboard...</strong>
              <span className="operatorStatusBadge isProgress">loading</span>
            </div>
            <p>Collecting intake, operator, control-plane, and recovery sections from Cats Core.</p>
          </article>
        </section>
      ) : null}

      {payload ? (
        <>
          <section className="operatorPanel">
            <WorkSectionHeader
              eyebrow="Snapshot"
              title="Operational Summary"
              summary={`owner ${payload.summary.ownerActorId}`}
            />
            <div className="workWarRoomSummaryGrid">
              <WorkSummaryCard
                label="Projects"
                value={payload.summary.projectCount}
                helper={`${payload.sections.pendingPlans.summary.totalAvailable} planned initiatives awaiting review.`}
              />
              <WorkSummaryCard
                label="Tasks"
                value={payload.summary.taskCount}
                helper={`${payload.summary.inProgressCount} in progress, ${payload.summary.blockedCount} blocked.`}
              />
              <WorkSummaryCard
                label="Operator Attention"
                value={payload.summary.operatorAttentionCount}
                helper={`${payload.sections.operatorInbox.summary.returned} surfaced in the inbox right now.`}
              />
              <WorkSummaryCard
                label="Recovery"
                value={payload.summary.recoveryCount}
                helper={`${payload.sections.recovery.summary.returned} retry or replay queues are visible.`}
              />
            </div>
          </section>

          <section className="operatorPanel">
            <WorkSectionHeader
              eyebrow="Plan"
              title="Intake & Pending Review"
              summary={`${payload.sections.intake.summary.returned} active`}
            />
            <IntakeStatusCard
              intakeItems={payload.sections.intake.items}
              pendingPlans={payload.sections.pendingPlans.items}
              onViewPlan={(projectId) => {
                startTransition(() => {
                  navigate(`/work/intake/${encodeURIComponent(projectId)}`);
                });
              }}
              onStartIntake={() => {
                startTransition(() => {
                  navigate('/work/intake');
                });
              }}
            />
          </section>

          <ProjectsSection
            items={payload.sections.projects.items}
            totalAvailable={payload.sections.projects.summary.totalAvailable}
          />
          <WorkItemsSection
            items={payload.sections.workItems.items}
            totalAvailable={payload.sections.workItems.summary.totalAvailable}
          />
          <OperatorInboxSection
            items={payload.sections.operatorInbox.items}
            totalAvailable={payload.sections.operatorInbox.summary.totalAvailable}
          />
          <ControlPlaneSection
            items={payload.sections.controlPlane.items}
            totalAvailable={payload.sections.controlPlane.summary.totalAvailable}
          />
          <RecoverySection
            items={payload.sections.recovery.items}
            totalAvailable={payload.sections.recovery.summary.totalAvailable}
          />
        </>
      ) : null}
    </div>
  );
}
