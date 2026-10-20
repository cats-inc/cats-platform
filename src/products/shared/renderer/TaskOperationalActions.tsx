import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../app/renderer/i18n/index.js';
import type { CoreTaskControlPlaneView } from '../../../core/taskControlPlane.js';
import type { CoreTaskActionEnvelope } from '../../../core/taskActionEnvelopes.js';
import type { MessageKey } from '../../../shared/i18n/index.js';

const labels: Record<string, MessageKey> = { approve: 'workExecutionActionApprove', reject: 'workExecutionActionReject', reroute: 'workExecutionActionReroute', retry: 'workExecutionActionRetry', acknowledge: 'workExecutionActionAcknowledge', wait: 'workExecutionActionWait', complete: 'workExecutionActionComplete' };
export function TaskOperationalActions({ taskId }: { taskId: string }) {
  const { t } = useI18n(); const client = useQueryClient(); const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const currentTask = useRef(taskId); currentTask.current = taskId;
  useEffect(() => { setError(''); setMessage(''); }, [taskId]);
  async function load(): Promise<CoreTaskControlPlaneView> { const response = await fetch(`/api/core/tasks/${encodeURIComponent(taskId)}/control-plane`); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? t('ownerActionFailed')); return body.controlPlane; }
  const query = useQuery({ queryKey: ['owner-operational', taskId], queryFn: load });
  async function apply(action: CoreTaskActionEnvelope) {
    setBusy(true); setError(''); setMessage('');
    try {
      const latest = await load();
      if (currentTask.current !== taskId) return;
      if (!latest.nextActions.some(next => JSON.stringify(next.action) === JSON.stringify(action)) || !['/api/core/approvals', '/api/core/operator-actions'].includes(action.path) || action.body.taskId !== taskId) throw new Error(t('ownerOperationalChanged'));
      const response = await fetch(action.path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action.body) }); const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? t('ownerActionFailed'));
      await client.invalidateQueries(); window.dispatchEvent(new Event('cats:owner-records-changed'));
      if (currentTask.current === taskId) setMessage(body.autoResume && body.autoResume.status !== 'dispatched' ? t('ownerDecisionSavedBlocked', { reason: body.autoResume.error ?? body.autoResume.blockedReason ?? body.autoResume.status }) : t('ownerSaved'));
    } catch (cause) { if (currentTask.current === taskId) { setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); await query.refetch(); } }
    finally { setBusy(false); }
  }
  const view = query.data;
  const path = view?.planning.effectiveProduct === 'code' ? `/code/tasks/${encodeURIComponent(taskId)}` : `/work/tasks/${encodeURIComponent(taskId)}`;
  return <div className="ownerRecordActions"><Link to={path}>{t('ownerOpenDetail')}</Link> {view?.latestRunId ? <Link to={`/work/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(view.latestRunId)}`}>{t('ownerRunAnchor')}</Link> : null}
    {view?.nextActions.map(next => next.action ? <button disabled={busy} key={next.kind} onClick={() => void apply(next.action!)}>{t(labels[next.kind] ?? 'ownerActions')}</button> : <span key={next.kind}> {t(labels[next.kind] ?? 'ownerActions')}</span>)}
    {error || query.isError ? <p role="alert">{error || query.error?.message}</p> : null}{message ? <p role="status">{message}</p> : null}</div>;
}
