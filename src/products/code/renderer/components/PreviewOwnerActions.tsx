import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { buildCodeApiLivePreviewPath, buildCodeApiPreviewArtifactPath } from '../../shared/apiPaths.js';

export function PreviewOwnerActions({ previewId, artifactId, onChanged }: { previewId: string; artifactId: string | null; onChanged: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ token: string; blockers: string[]; logBytes: number } | null>(null);
  const region = useRef<HTMLElement>(null);
  const currentId = useRef(previewId); currentId.current = previewId;
  useEffect(() => { setPreview(null); setError(''); setMessage(''); }, [previewId]);
  useEffect(() => { if (preview) region.current?.focus(); }, [preview]);
  async function action(operation: 'restart' | 'export' | 'preview' | 'apply') {
    setBusy(true); setError(''); setMessage('');
    try {
      const url = operation === 'restart' ? `${buildCodeApiPreviewArtifactPath(artifactId!)}/restart` : `${buildCodeApiLivePreviewPath(previewId)}/${operation === 'export' ? 'logs' : 'owner'}`;
      const response = await fetch(url, operation === 'export' ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: operation, token: preview?.token }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? t('ownerActionFailed'));
      if (currentId.current !== previewId) return;
      if (operation === 'preview') setPreview(body);
      else if (operation === 'export') { const url = URL.createObjectURL(new Blob([body.logs ?? ''], { type: 'text/plain' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'cats-preview.log'; anchor.click(); URL.revokeObjectURL(url); }
      else { setPreview(null); setMessage(t(operation === 'apply' ? 'ownerPreviewHistoryRemoved' : 'ownerSaved')); onChanged(); }
    } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); }
    finally { setBusy(false); }
  }
  return <div className="ownerRecordActions">{artifactId ? <button disabled={busy} onClick={() => void action('restart')}>{t('codeLivePreviewRetry')}</button> : <p>{t('ownerPreviewRestartNeedsArtifact')}</p>}
    <button disabled={busy} onClick={() => void action('export')}>{t('ownerExport')}</button> <button disabled={busy} onClick={() => void action('preview')}>{t('ownerPreviewCleanup')}</button>
    {preview ? <section ref={region} tabIndex={-1} onKeyDown={event => { if (event.key === 'Escape' && !busy) setPreview(null); }}><p>{t('ownerPreviewHistoryScope')}</p><p>{t('ownerPreviewLogBytes', { count: preview.logBytes })}</p><ul>{preview.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul><button disabled={busy || !!preview.blockers.length} onClick={() => void action('apply')}>{t('ownerApplyCleanup')}</button><button disabled={busy} onClick={() => setPreview(null)}>{t('ownerCancel')}</button></section> : null}
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}</div>;
}
