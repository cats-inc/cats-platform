import { RunExecutionActions } from '../../../shared/renderer/RunExecutionActions.js';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../../app/renderer/i18n/index.js';

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
  return <div>{run ? <RunExecutionActions runId={run.id} status={run.status} /> : null}<p>{t('ownerSessionAcceptanceNotice')}</p><button disabled={busy} onClick={() => void reconcile()}>{t('ownerRefreshExecution')}</button>{query.isError || error ? <p role="alert">{error || query.error?.message}</p> : null}</div>;
}
