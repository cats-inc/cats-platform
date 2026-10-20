import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import type { HistoryRetentionView } from '../../../shared/historyRetention.js';

export function HistoryRetentionControls() {
  const { locale, t } = useI18n(); const client = useQueryClient();
  const [enabled, setEnabled] = useState(false), [days, setDays] = useState(30), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const query = useQuery<HistoryRetentionView>({ queryKey: ['history-retention'], refetchInterval: 60_000, queryFn: async () => {
    const response = await fetch('/api/work/history/retention'); const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? t('ownerActionFailed')); return body;
  } });
  const policy = query.data?.policy;
  useEffect(() => { if (policy) { setEnabled(policy.enabled); setDays(policy.days); } }, [policy?.enabled, policy?.days]);
  async function save() {
    setBusy(true); setError(''); setSaved(false);
    try {
      const response = await fetch('/api/work/history/retention', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled, days, revision: query.data?.revision }) }); const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? t('ownerActionFailed'));
      client.setQueryData(['history-retention'], body); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); await query.refetch(); }
    finally { setBusy(false); }
  }
  const time = (value: string) => new Date(value).toLocaleString(locale);
  return <details className="ownerRecordActions"><summary>{t('ownerRetentionTitle')}</summary>
    <p>{t('ownerRetentionScope')}</p><p>{t('ownerRetentionProtection')}</p>
    <label><input type="checkbox" checked={enabled} disabled={!policy || busy} onChange={event => { setEnabled(event.target.checked); setSaved(false); }} />{t('ownerRetentionEnable')}</label>
    <label>{t('ownerRetentionDays')} <input type="number" min={1} max={3650} value={Number.isNaN(days) ? '' : days} onChange={event => { setDays(event.target.valueAsNumber); setSaved(false); }} /></label>
    <button disabled={!policy || busy || !Number.isInteger(days) || days < 1 || days > 3650} onClick={() => void save()}>{t(busy ? 'ownerWorking' : 'ownerSave')}</button>
    {query.data?.nextCleanupAt ? <p>{t('ownerRetentionNext', { time: time(query.data.nextCleanupAt) })}</p> : <p>{t('ownerRetentionDisabled')}</p>}
    {policy?.lastCleanupAt ? <p>{t('ownerRetentionLast', { time: time(policy.lastCleanupAt) })}</p> : null}
    {policy?.lastResult ? <p>{t('ownerRetentionResult', policy.lastResult)}</p> : null}
    {policy?.lastError ? <p role="alert">{policy.lastError}</p> : null}{error || query.isError ? <p role="alert">{error || query.error?.message}</p> : null}{saved ? <p role="status">{t('ownerSaved')}</p> : null}
  </details>;
}
