import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../app/renderer/i18n/index.js';

export function RunExecutionActions({ runId, status, onChanged }: { runId: string; status: string; onChanged?: () => void }) {
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

