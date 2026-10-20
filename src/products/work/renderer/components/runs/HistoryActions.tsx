import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import type { HistoryPreview, HistorySubject } from '../../../state/historyManagement.js';

const ownerQueryRoots = new Set(['runs', 'missions', 'execution-history', 'workGraph', 'workDashboard', 'tasks', 'workItems', 'projects', 'task-golden-path']);

export async function historyRequest<T>(operation: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/work/history/${operation}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? `Action failed (${response.status})`);
  return payload;
}

export function HistoryActions({ subjects, revision, onChanged, archiveEligible = true }: { subjects: HistorySubject[]; revision: number; onChanged?: () => void; archiveEligible?: boolean }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [scope, setScope] = useState<'logs' | 'history'>('logs');
  const [preview, setPreview] = useState<HistoryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const selection = JSON.stringify(subjects);
  const currentRequest = useRef('');
  currentRequest.current = `${selection}:${scope}`;
  useEffect(() => { setPreview(null); setError(null); }, [selection, scope]);
  useEffect(() => { if (preview) previewRef.current?.focus(); }, [preview]);
  async function invalidate() {
    await client.invalidateQueries({ predicate: query => ownerQueryRoots.has(String(query.queryKey[0])) });
    onChanged?.();
  }
  async function act(operation: 'archive' | 'restore' | 'export' | 'preview' | 'apply') {
    setBusy(true); setError(null); setMessage(null);
    try {
      const request = { subjects, scope };
      const requestKey = currentRequest.current;
      if (operation === 'preview') {
        const result = await historyRequest<HistoryPreview>('preview', request);
        if (currentRequest.current === requestKey) setPreview(result);
      }
      else if (operation === 'apply') {
        if (!preview) return;
        const result = await historyRequest<{ receipt: { results: Array<{ status: string; reason?: string }> } }>('apply', preview);
        setPreview(null);
        setMessage(result.receipt.results.map(item => `${t(item.status === 'removed' ? 'ownerHistoryRemoved' : item.status === 'compacted' ? 'ownerHistoryCompacted' : item.status === 'retained' ? 'ownerHistoryRetained' : 'ownerHistoryBlocked')}${item.reason ? `: ${item.reason}` : ''}`).join(' · '));
        await invalidate(); previewButton.current?.focus();
      } else if (operation === 'export') {
        const exported = await historyRequest('export', request);
        const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'cats-execution-history.json'; anchor.click(); URL.revokeObjectURL(url);
      } else { await historyRequest('listing', { ...request, revision, action: operation }); await invalidate(); }
    } catch (err) { setError(err instanceof Error ? err.message : t('ownerActionFailed')); if (operation === 'apply') setPreview(null); await invalidate(); }
    finally { setBusy(false); }
  }
  const outcomeLabel = (outcome: string) => t(outcome === 'removed' ? 'ownerHistoryRemoved' : outcome === 'compacted' ? 'ownerHistoryCompacted' : outcome === 'retained' ? 'ownerHistoryRetained' : 'ownerHistoryBlocked');
  return <div className="ownerHistoryActions">
    <div className="ownerHistoryActions__bar">
      <span>{t('ownerSelectionCount', { count: subjects.length })}</span>
      <button disabled={busy || !subjects.length || !archiveEligible} title={!archiveEligible ? t('ownerHistoryArchiveTerminal') : undefined} onClick={() => void act('archive')}>{t('ownerArchive')}</button>
      <button disabled={busy || !subjects.length} onClick={() => void act('restore')}>{t('ownerRestore')}</button>
      <button disabled={busy || !subjects.length} onClick={() => void act('export')}>{t('ownerExport')}</button>
      <label>{t('ownerCleanupScope')}<select disabled={busy} value={scope} onChange={event => setScope(event.target.value as typeof scope)}>
        <option value="logs">{t('ownerClearDetail')}</option><option value="history">{t('ownerRemoveHistory')}</option>
      </select></label>
      <button ref={previewButton} disabled={busy || !subjects.length} onClick={() => void act('preview')}>{t('ownerPreviewCleanup')}</button>
    </div>
    {busy ? <p role="status">{t('ownerWorking')}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {preview ? <section tabIndex={-1} ref={previewRef} className="ownerHistoryPreview" aria-label={t('ownerPreviewCleanup')}
      onKeyDown={event => { if (event.key === 'Escape' && !busy) { setPreview(null); previewButton.current?.focus(); } }}>
      <h2>{t('ownerPreviewCleanup')}</h2><p>{t('ownerHistoryKeepNotice')}</p>
      <p>{t('ownerCleanupDetailCount', { count: preview.detailRecords })}</p>
      <ul>{preview.items.map(item => <li key={`${item.family}:${item.id}`}><strong>{item.title}</strong> · {outcomeLabel(item.outcome)}
        {item.reasons.length ? <p>{item.reasons.join('; ')}</p> : null}</li>)}</ul>
      <button disabled={busy || preview.items.every(item => item.outcome === 'blocked')} onClick={() => void act('apply')}>{t('ownerApplyCleanup')}</button>
      <button disabled={busy} onClick={() => { setPreview(null); previewButton.current?.focus(); }}>{t('ownerCancel')}</button>
    </section> : null}
  </div>;
}
