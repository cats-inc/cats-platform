import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';

import type { WorkDashboardProjection } from '../../api/projection.js';
import { buildChannelPath, buildMyCatPath } from '../../shared/channelPaths.js';
import { listCatActorLinks } from '../actorLinks.js';
import { useWorkDashboardQuery } from '../state/queries/workDashboardQuery.js';
import {
  formatWorkDeliveryMode,
  formatWorkApprovalStatus,
  formatWorkExecutionProduct,
  formatWorkExecutionStrategy,
  formatWorkTokenList,
  formatWorkTokenValue,
} from '../workExecutionPresentation.js';
import {
  getWorkObjectStatusLabel,
} from './topdown/WorkObjectCard';
import { presentWorkTimelineTitle } from './workTimelineLabels.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

type WorkOperatorInboxItem = WorkDashboardProjection['sections']['operatorInbox']['items'][number];
type WorkControlPlaneItem = WorkDashboardProjection['sections']['controlPlane']['items'][number];
type WorkProjectItem = WorkDashboardProjection['sections']['projects']['items'][number];
type WorkRecoveryItem = WorkDashboardProjection['sections']['recovery']['items'][number];
type WorkWorkItemItem = WorkDashboardProjection['sections']['workItems']['items'][number];
type WorkTaskActionContext = WorkOperatorInboxItem['taskContext'];
type I18nTranslate = ReturnType<typeof useI18n>['t'];

function formatTimestamp(
  value: string | null | undefined,
  t: I18nTranslate,
): string {
  if (!value) {
    return t('workWarRoomNotRecorded');
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function compactList(
  values: readonly string[],
  t: I18nTranslate,
): string {
  return values.length > 0 ? values.join(', ') : t('workWarRoomNone');
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

function getWarRoomAttentionLabel(
  severity: string | null | undefined,
  t: I18nTranslate,
): string {
  return severity === 'attention'
    ? t('workWarRoomAttentionAttention')
    : severity === 'error'
      ? t('workWarRoomAttentionError')
      : severity === 'progress'
        ? t('workWarRoomAttentionProgress')
        : severity === 'success'
          ? t('workWarRoomAttentionSuccess')
          : severity === 'muted'
            ? t('workWarRoomAttentionMuted')
            : t('workWarRoomAttentionFallback', { severity });
}

function getWarRoomStatusLabel(
  status: string | null | undefined,
  t: I18nTranslate,
): string {
  if (!status) {
    return t('workWarRoomNoStatus');
  }

  const normalized = getWorkObjectStatusLabel(status, t);
  return normalized === status
    ? t('workWarRoomStatusFallback', { status })
    : normalized;
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
  t,
}: {
  taskId: string;
  t: I18nTranslate;
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
      {t('workWarRoomOpenTask')}
    </button>
  );
}

function WorkWarRoomTaskContextActions({
  taskId,
  taskContext,
  t,
}: {
  taskId: string;
  taskContext: WorkTaskActionContext;
  t: I18nTranslate;
}) {
  const navigate = useNavigate();

  return (
    <div className="workWarRoomHeaderActions">
      <WorkWarRoomOpenTaskButton taskId={taskId} t={t} />
      {taskContext.projectId ? (
        <button
          type="button"
          className="operatorActionButton"
          onClick={() => {
            startTransition(() => {
              navigate(`/work/projects/${encodeURIComponent(taskContext.projectId!)}`);
            });
          }}
        >
          {t('workWarRoomOpenProject')}
        </button>
      ) : null}
      {taskContext.workItemId ? (
        <button
          type="button"
          className="operatorActionButton"
          onClick={() => {
            startTransition(() => {
              navigate(`/work/work-items/${encodeURIComponent(taskContext.workItemId!)}`);
            });
          }}
        >
          {t('workWarRoomOpenWorkItem')}
        </button>
      ) : null}
      {taskContext.conversationSourceChannelId ? (
        <button
          type="button"
          className="operatorActionButton"
          onClick={() => {
            startTransition(() => {
              navigate(buildChannelPath(taskContext.conversationSourceChannelId!));
            });
          }}
        >
          {t('workWarRoomOpenBriefingThread')}
        </button>
      ) : null}
      {listCatActorLinks(taskContext.assignedActors).map((actor) => (
        <button
          key={actor.actorId}
          type="button"
          className="operatorActionButton"
          onClick={() => {
            startTransition(() => {
              navigate(buildMyCatPath(actor.catId));
            });
          }}
        >
          {t('workWarRoomOpenActor', { actorName: actor.displayName })}
        </button>
      ))}
    </div>
  );
}

function OperatorInboxSection({
  items,
  totalAvailable,
  t,
}: {
  items: WorkOperatorInboxItem[];
  totalAvailable: number;
  t: I18nTranslate;
}) {
  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow={t('workWarRoomOperateEyebrow')}
        title={t('workWarRoomOperatorInbox')}
        summary={t('workWarRoomCountSummary', {
          count: items.length,
          total: totalAvailable,
        })}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t('workWarRoomOperatorInboxEmptyTitle')}</strong>
            <span className="operatorStatusBadge isMuted">
              {t('workWarRoomOperatorInboxEmptyBadge')}
            </span>
          </div>
          <p>{t('workWarRoomOperatorInboxEmptyBody')}</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.taskId} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.taskTitle}</strong>
                <div className="workWarRoomBadgeRow">
                  <span className={attentionBadgeClassName(item.attention.severity)}>
                    {getWarRoomAttentionLabel(item.attention.severity, t)}
                  </span>
                  <span className={taskStatusBadgeClassName(item.taskStatus)}>
                    {getWarRoomStatusLabel(item.taskStatus, t)}
                  </span>
                </div>
              </div>
              <p>{item.summary ?? t('workWarRoomNoTaskSummary')}</p>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelReasons')}:{' '}
                  {formatWorkTokenList(item.attention.reasons, t)}
                </span>
                <span>
                  {t('workWarRoomMetaLabelActions')}:{' '}
                  {formatWorkTokenList(item.nextActions.map((action) => action.kind), t)}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelProduct')}:{' '}
                  {formatWorkExecutionProduct(item.planning.effectiveProduct, t)}
                </span>
                <span>
                  {t('workWarRoomMetaLabelStrategy')}:{' '}
                  {formatWorkExecutionStrategy(item.runtimeBridge.request.requestedStrategy, t)}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelDelivery')}:{' '}
                  {formatWorkDeliveryMode(item.runtimeDeliveryIntent?.mode, t)}
                </span>
                <span>
                  {t('workWarRoomMetaLabelWorkflow')}:{' '}
                  {formatWorkTokenValue(
                    item.workflowContinuation?.blockedReason,
                    t,
                    t('workWarRoomMetaValueNoReplayBlock'),
                  )}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelLatest')}:{' '}
                  {item.latestTimelineItem
                    ? presentWorkTimelineTitle(item.latestTimelineItem.title, t)
                    : t('workWarRoomMetaValueNoTimelineItem')}
                </span>
                <span>{formatTimestamp(item.latestTimelineItem?.timestamp, t)}</span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelProject')}: {item.taskContext.projectTitle ?? t('workWarRoomNoLinkedProject')}
                </span>
                <span>
                  {t('workWarRoomMetaLabelWorkItem')}:{' '}
                  {item.taskContext.workItemTitle ?? t('workWarRoomNoLinkedWorkItem')}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelConversation')}:{' '}
                  {item.taskContext.conversationTitle ?? t('workWarRoomNoLinkedConversation')}
                </span>
                <span>
                  {t('workWarRoomMetaLabelActors')}:{' '}
                  {compactList(
                    item.taskContext.assignedActors.map((actor) => actor.displayName),
                    t,
                  )}
                </span>
              </div>
              <WorkWarRoomTaskContextActions
                taskId={item.taskId}
                taskContext={item.taskContext}
                t={t}
              />
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
  t,
}: {
  items: WorkControlPlaneItem[];
  totalAvailable: number;
  t: I18nTranslate;
}) {
  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow={t('workWarRoomGovernanceEyebrow')}
        title={t('workWarRoomControlPlane')}
        summary={t('workWarRoomCountSummary', {
          count: items.length,
          total: totalAvailable,
        })}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t('workWarRoomControlPlaneEmptyTitle')}</strong>
            <span className="operatorStatusBadge isMuted">{t('workWarRoomControlPlaneEmptyBadge')}</span>
          </div>
          <p>{t('workWarRoomControlPlaneEmptyBody')}</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.taskId} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.taskId}</strong>
                <div className="workWarRoomBadgeRow">
                  <span className={attentionBadgeClassName(item.attention.severity)}>
                    {getWarRoomAttentionLabel(item.attention.severity, t)}
                  </span>
                  <span className={taskStatusBadgeClassName(item.taskStatus)}>
                    {getWarRoomStatusLabel(item.taskStatus, t)}
                  </span>
                </div>
              </div>
              <p>
                {item.workflowContinuation?.targetNames.length
                  ? t('workWarRoomControlPlaneTargets', {
                      targets: item.workflowContinuation.targetNames.join(', '),
                    })
                  : item.workflowContinuation?.blockedReason
                    ? t('workWarRoomControlPlaneBlockedBy', {
                        reason: formatWorkTokenValue(
                          item.workflowContinuation.blockedReason,
                          t,
                        ),
                      })
                    : t('workWarRoomControlPlaneNoTargets')}
              </p>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelProduct')}:{' '}
                  {formatWorkExecutionProduct(item.planning.effectiveProduct, t)}
                </span>
                <span>
                  {t('workWarRoomMetaLabelStrategy')}:{' '}
                  {formatWorkExecutionStrategy(item.planning.effectiveStrategy, t)}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelNext')}:{' '}
                  {formatWorkTokenList(item.nextActions.map((action) => action.kind), t)}
                </span>
                <span>
                  {t('workWarRoomMetaLabelDelivery')}:{' '}
                  {formatWorkDeliveryMode(item.runtimeDeliveryIntent?.mode, t)}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelReplay')}:{' '}
                  {formatWorkTokenValue(
                    item.workflowContinuation?.replayState,
                    t,
                    t('workWarRoomMetaValueNotRecorded'),
                  )}
                </span>
                <span>
                  {t('workWarRoomMetaLabelBlocked')}:{' '}
                  {formatWorkTokenValue(
                    item.workflowContinuation?.blockedReason,
                    t,
                    t('workWarRoomMetaValueNo'),
                  )}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelProject')}:{' '}
                  {item.taskContext.projectTitle ?? t('workWarRoomNoLinkedProject')}
                </span>
                <span>
                  {t('workWarRoomMetaLabelWorkItem')}:{' '}
                  {item.taskContext.workItemTitle ?? t('workWarRoomNoLinkedWorkItem')}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelConversation')}:{' '}
                  {item.taskContext.conversationTitle ?? t('workWarRoomNoLinkedConversation')}
                </span>
                <span>
                  {t('workWarRoomMetaLabelActors')}:{' '}
                  {compactList(
                    item.taskContext.assignedActors.map((actor) => actor.displayName),
                    t,
                  )}
                </span>
              </div>
              <WorkWarRoomTaskContextActions
                taskId={item.taskId}
                taskContext={item.taskContext}
                t={t}
              />
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
  t,
}: {
  items: WorkProjectItem[];
  totalAvailable: number;
  t: I18nTranslate;
}) {
  const navigate = useNavigate();

  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow={t('workWarRoomPortfolioEyebrow')}
        title={t('workWarRoomProjects')}
        summary={t('workWarRoomCountSummary', {
          count: items.length,
          total: totalAvailable,
        })}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t('workWarRoomProjectsEmptyTitle')}</strong>
            <span className="operatorStatusBadge isMuted">{t('workWarRoomProjectsEmptyBadge')}</span>
          </div>
          <p>{t('workWarRoomProjectsEmptyBody')}</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.id} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.title}</strong>
                <span className={taskStatusBadgeClassName(item.status)}>
                  {getWarRoomStatusLabel(item.status, t)}
                </span>
              </div>
              <p>{item.summary ?? t('workWarRoomNoProjectSummary')}</p>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelOwner')}: {item.ownerName}
                </span>
                <span>
                  {t('workWarRoomMetaLabelRepo')}: {item.repoPath ?? t('workWarRoomMetaValueNotBound')}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelWorkItems')}: {item.linkedWorkItemCount}
                </span>
                <span>
                  {t('workWarRoomMetaLabelTasks')}: {item.linkedTaskCount}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelConversation')}: {item.primaryConversationTitle ?? t('workWarRoomNoPrimaryConversation')}
                </span>
                <span>{formatTimestamp(item.updatedAt, t)}</span>
              </div>
              <div className="workWarRoomHeaderActions">
                <WorkWarRoomOpenProjectButton projectId={item.id} t={t} />
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
                  {t('workWarRoomOpenBriefingThread')}
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
  t,
}: {
  items: WorkWorkItemItem[];
  totalAvailable: number;
  t: I18nTranslate;
}) {
  const navigate = useNavigate();

  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow={t('workWarRoomManagedWorkEyebrow')}
        title={t('workWarRoomWorkItems')}
        summary={t('workWarRoomCountSummary', {
          count: items.length,
          total: totalAvailable,
        })}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t('workWarRoomWorkItemsEmptyTitle')}</strong>
            <span className="operatorStatusBadge isMuted">{t('workWarRoomWorkItemsEmptyBadge')}</span>
          </div>
          <p>{t('workWarRoomWorkItemsEmptyBody')}</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.id} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.title}</strong>
                <span className={taskStatusBadgeClassName(item.status)}>
                  {getWarRoomStatusLabel(item.status, t)}
                </span>
              </div>
              <p>{item.summary ?? t('workWarRoomNoWorkItemSummary')}</p>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelProject')}:{' '}
                  {item.projectTitle ?? t('workWarRoomNoLinkedProject')}
                </span>
                <span>
                  {t('workWarRoomMetaLabelTask')}:{' '}
                  {item.taskTitle ?? t('workWarRoomNoLinkedTask')}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelOwner')}: {item.ownerName}
                </span>
                <span>
                  {t('workWarRoomMetaLabelActors')}:{' '}
                  {compactList(item.assignedActors.map((actor) => actor.displayName), t)}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelConversation')}: {item.conversationTitle ?? t('workWarRoomNoLinkedConversation')}
                </span>
                <span>{formatTimestamp(item.updatedAt, t)}</span>
              </div>
              <div className="workWarRoomHeaderActions">
                <WorkWarRoomOpenWorkItemButton workItemId={item.id} t={t} />
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
                    {t('workWarRoomOpenBriefingThread')}
                  </button>
                ) : null}
                {listCatActorLinks(item.assignedActors).map((actor) => (
                  <button
                    key={actor.actorId}
                    type="button"
                    className="operatorActionButton"
                    onClick={() => {
                      startTransition(() => {
                        navigate(buildMyCatPath(actor.catId));
                      });
                    }}
                  >
                    {t('workWarRoomOpenActor', { actorName: actor.displayName })}
                  </button>
                ))}
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
  t,
}: {
  items: WorkRecoveryItem[];
  totalAvailable: number;
  t: I18nTranslate;
}) {
  return (
    <section className="operatorPanel">
      <WorkSectionHeader
        eyebrow={t('workWarRoomRecoveryEyebrow')}
        title={t('workWarRoomRecovery')}
        summary={t('workWarRoomCountSummary', {
          count: items.length,
          total: totalAvailable,
        })}
      />
      {items.length === 0 ? (
        <article className="operatorCard">
          <div className="operatorCardHeader">
            <strong>{t('workWarRoomRecoveryEmptyTitle')}</strong>
            <span className="operatorStatusBadge isSuccess">{t('workWarRoomRecoveryEmptyBadge')}</span>
          </div>
          <p>{t('workWarRoomRecoveryEmptyBody')}</p>
        </article>
      ) : (
        <div className="workWarRoomTaskGrid">
          {items.map((item) => (
            <article key={item.taskId} className="operatorCard workWarRoomTaskCard">
              <div className="operatorCardHeader">
                <strong>{item.taskId}</strong>
                <div className="workWarRoomBadgeRow">
                  <span className={item.canRetry ? 'operatorStatusBadge isAttention' : 'operatorStatusBadge isMuted'}>
                    {item.canRetry
                      ? t('workWarRoomMetaLabelRetryAvailable')
                      : t('workWarRoomMetaLabelWatch')}
                  </span>
                  <span className={taskStatusBadgeClassName(item.taskStatus)}>
                    {getWarRoomStatusLabel(item.taskStatus, t)}
                  </span>
                </div>
              </div>
              <p>
                {item.latestActivity?.message ??
                  (item.workflowContinuationReplay?.blockedReason
                    ? formatWorkTokenValue(item.workflowContinuationReplay.blockedReason, t)
                    : null) ??
                  item.dispatchReplay?.replayError ??
                  t('workWarRoomRecoveryNoRecoveryNote')}
              </p>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelDelivery')}: {formatWorkDeliveryMode(item.context?.deliveryMode, t)}
                </span>
                <span>
                  {t('workWarRoomMetaLabelApproval')}:{' '}
                  {formatWorkApprovalStatus(item.approval.status, t)}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelReplay')}:{' '}
                  {formatWorkTokenValue(
                    item.workflowContinuationReplay?.replayState ??
                      item.dispatchReplay?.replayState,
                    t,
                    t('workWarRoomMetaValueNone'),
                  )}
                </span>
                <span>
                  {t('workWarRoomMetaLabelBlocked')}:{' '}
                  {formatWorkTokenValue(
                    item.workflowContinuationReplay?.blockedReason,
                    t,
                    t('workWarRoomMetaValueNo'),
                  )}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelLatestSource')}:{' '}
                  {formatWorkTokenValue(
                    item.latestActivity?.source,
                    t,
                    t('workWarRoomMetaValueNotRecorded'),
                  )}
                </span>
                <span>{formatTimestamp(item.latestActivity?.createdAt, t)}</span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelProject')}: {item.taskContext.projectTitle ?? t('workWarRoomNoLinkedProject')}
                </span>
                <span>
                  {t('workWarRoomMetaLabelWorkItem')}:{' '}
                  {item.taskContext.workItemTitle ?? t('workWarRoomNoLinkedWorkItem')}
                </span>
              </div>
              <div className="operatorMetaRow">
                <span>
                  {t('workWarRoomMetaLabelConversation')}:{' '}
                  {item.taskContext.conversationTitle ?? t('workWarRoomNoLinkedConversation')}
                </span>
                <span>
                  {t('workWarRoomMetaLabelActors')}:{' '}
                  {compactList(item.taskContext.assignedActors.map((actor) => actor.displayName), t)}
                </span>
              </div>
              <WorkWarRoomTaskContextActions
                taskId={item.taskId}
                taskContext={item.taskContext}
                t={t}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkWarRoomOpenProjectButton({
  projectId,
  t,
}: {
  projectId: string;
  t: I18nTranslate;
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
      {t('workWarRoomOpenProject')}
    </button>
  );
}

function WorkWarRoomOpenWorkItemButton({
  workItemId,
  t,
}: {
  workItemId: string;
  t: I18nTranslate;
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
      {t('workWarRoomOpenWorkItem')}
    </button>
  );
}

export function WarRoomView() {
  const { t } = useI18n();
  const dashboardQuery = useWorkDashboardQuery(t('workWarRoomLoadError'));
  const payload = dashboardQuery.data ?? null;
  const error = dashboardQuery.error
    ? dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : t('workWarRoomLoadError')
    : '';

  return (
    <div className="workWarRoomView">
      <div className="codeBuilderHeader">
        <div>
          <p className="operatorEyebrow">{t('workWarRoomPageEyebrow')}</p>
          <h1 className="codeBuilderTitle">{t('workWarRoomPageTitle')}</h1>
        </div>
      </div>

      {error ? (
        <div className="codeBuilderFeedback">{error}</div>
      ) : null}

      {dashboardQuery.isPending && !payload ? (
        <section className="operatorPanel">
          <WorkSectionHeader
            eyebrow={t('workWarRoomLoadingEyebrow')}
            title={t('workWarRoomPageTitle')}
            summary={t('workWarRoomLoadingSummary')}
          />
          <article className="operatorCard">
            <div className="operatorCardHeader">
              <strong>{t('workWarRoomLoadingTitle')}</strong>
              <span className="operatorStatusBadge isProgress">{t('workWarRoomLoadingBadge')}</span>
            </div>
            <p>{t('workWarRoomLoadingBody')}</p>
          </article>
        </section>
      ) : null}

      {payload ? (
        <>
          <section className="operatorPanel">
            <WorkSectionHeader
              eyebrow={t('workWarRoomSnapshotEyebrow')}
              title={t('workWarRoomSnapshotTitle')}
              summary={t('workWarRoomSnapshotSummary', {
                ownerActorId: payload.summary.ownerActorId,
              })}
            />
            <div className="workWarRoomSummaryGrid">
              <WorkSummaryCard
                label={t('workWarRoomSummaryLabelProjects')}
                value={payload.summary.projectCount}
                helper={t('workWarRoomSummaryInProgressBlocked', {
                  inProgress: payload.summary.inProgressCount,
                  blocked: payload.summary.blockedCount,
                })}
              />
              <WorkSummaryCard
                label={t('workWarRoomSummaryLabelTasks')}
                value={payload.summary.taskCount}
                helper={t('workWarRoomSummaryInProgressBlocked', {
                  inProgress: payload.summary.inProgressCount,
                  blocked: payload.summary.blockedCount,
                })}
              />
              <WorkSummaryCard
                label={t('workWarRoomSummaryLabelAttention')}
                value={payload.summary.operatorAttentionCount}
                helper={t('workWarRoomSummaryAttention', {
                  count: payload.sections.operatorInbox.summary.returned,
                })}
              />
              <WorkSummaryCard
                label={t('workWarRoomSummaryLabelRecovery')}
                value={payload.summary.recoveryCount}
                helper={t('workWarRoomSummaryRecovery', {
                  count: payload.sections.recovery.summary.returned,
                })}
              />
            </div>
          </section>

          <ProjectsSection
            items={payload.sections.projects.items}
            totalAvailable={payload.sections.projects.summary.totalAvailable}
            t={t}
          />
          <WorkItemsSection
            items={payload.sections.workItems.items}
            totalAvailable={payload.sections.workItems.summary.totalAvailable}
            t={t}
          />
          <OperatorInboxSection
            items={payload.sections.operatorInbox.items}
            totalAvailable={payload.sections.operatorInbox.summary.totalAvailable}
            t={t}
          />
          <ControlPlaneSection
            items={payload.sections.controlPlane.items}
            totalAvailable={payload.sections.controlPlane.summary.totalAvailable}
            t={t}
          />
          <RecoverySection
            items={payload.sections.recovery.items}
            totalAvailable={payload.sections.recovery.summary.totalAvailable}
            t={t}
          />
        </>
      ) : null}
    </div>
  );
}
