import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

export function CodeRunActions({ runId, status, onChanged }: { runId: string; status: string; onChanged?: () => void }) {
  const { t } = useI18n(); const client = useQueryClient();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function stop() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/work/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reasonNote: 'Owner stopped this attempt from its Code context.', idempotencyKey: crypto.randomUUID() }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? body.blockers?.map((item: { message?: string }) => item.message).join('; ') ?? t('ownerActionFailed'));
      await client.invalidateQueries(); onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); }
    finally { setBusy(false); }
  }
  return <div className="ownerRecordActions"><Link to={`/work/tasks/orphan/runs/${encodeURIComponent(runId)}`}>{t('ownerScheduleHistory')}</Link> {['queued', 'running', 'blocked', 'requested'].includes(status) ? <button disabled={busy} onClick={() => void stop()}>{t('codeLivePreviewStop')}</button> : null}{error ? <p role="alert">{error}</p> : null}</div>;
}

export function CodeTaskExecutionActions({ taskId }: { taskId: string }) {
  const { t } = useI18n(); const client = useQueryClient(); const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const query = useQuery<{ inspection?: { latestRun?: { id: string; status: string } | null } }>({ queryKey: ['code-owner-execution', taskId], queryFn: async () => { const response = await fetch(`/api/code/tasks/${encodeURIComponent(taskId)}`); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? t('ownerActionFailed')); return body; }, refetchInterval: query => ['queued', 'running', 'blocked'].includes(query.state.data?.inspection?.latestRun?.status ?? '') ? 3000 : false });
  async function reconcile() {
    setBusy(true); setError('');
    try { const response = await fetch(`/api/code/tasks/${encodeURIComponent(taskId)}/reconcile`, { method: 'POST' }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? t('ownerActionFailed')); await client.invalidateQueries(); window.dispatchEvent(new Event('cats:owner-records-changed')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); }
    finally { setBusy(false); }
  }
  const run = query.data?.inspection?.latestRun;
  return <div>{run ? <CodeRunActions runId={run.id} status={run.status} /> : null}<p>{t('ownerSessionAcceptanceNotice')}</p><button disabled={busy} onClick={() => void reconcile()}>{t('ownerRefreshExecution')}</button>{query.isError || error ? <p role="alert">{error || query.error?.message}</p> : null}</div>;
}
