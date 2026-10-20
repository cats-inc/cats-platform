import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import type { previewScheduleOwner } from '../../../../../platform/scheduler/ownerManagement.js';
import { updateWorkSchedule, type WorkScheduleRule } from '../../api/schedules.js';
import { ScheduleEditor } from './ScheduleEditor.js';

export function ScheduleManagement({ rule, expanded = false, onRemoved }: { rule: WorkScheduleRule; expanded?: boolean; onRemoved?: () => void }) {
  const { t } = useI18n(); const client = useQueryClient();
  const [open, setOpen] = useState(expanded), [editor, setEditor] = useState<'edit' | 'duplicate' | null>(null);
  const [scope, setScope] = useState('rule'), [preview, setPreview] = useState<ReturnType<typeof previewScheduleOwner> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const previewRef = useRef<HTMLElement>(null);
  useEffect(() => { if (expanded) setOpen(true); }, [expanded]);
  useEffect(() => { if (preview) previewRef.current?.focus(); }, [preview]);
  async function action(operation: 'toggle' | 'preview' | 'apply') {
    setBusy(true); setError(''); setMessage('');
    try {
      if (operation === 'toggle') { await updateWorkSchedule(rule.id, { enabled: !rule.enabled, expectedRule: rule }); await client.invalidateQueries(); }
      else {
        const response = await fetch(`/api/work/schedules/${encodeURIComponent(rule.id)}/owner`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: operation, scope, token: preview?.token }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? t('ownerActionFailed'));
        if (operation === 'preview') setPreview(body);
        else { setPreview(null); setMessage(t('ownerScheduleRetainedNotice')); await client.invalidateQueries(); if (body.removed) onRemoved?.(); }
      }
    } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); await client.invalidateQueries(); }
    finally { setBusy(false); }
  }
  return <details className="ownerRecordActions" id={`schedule-owner-${rule.id}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{t('ownerActions')}</summary>
    <button disabled={busy} onClick={() => void action('toggle')}>{t(rule.enabled ? 'ownerScheduleDisable' : 'ownerScheduleEnable')}</button> <button onClick={() => setEditor('edit')}>{t('ownerEdit')}</button> <button onClick={() => setEditor('duplicate')}>{t('ownerDuplicate')}</button>
    <Link to={`/work/runs?source=schedule&ruleId=${encodeURIComponent(rule.id)}`}>{t('ownerScheduleHistory')}</Link>
    {editor ? <ScheduleEditor key={`${rule.updatedAt}:${editor}`} rule={rule} duplicate={editor === 'duplicate'} onClose={() => setEditor(null)} /> : null}
    <label>{t('ownerCleanupScope')} <select disabled={busy} value={scope} onChange={event => { setScope(event.target.value); setPreview(null); }}><option value="rule">{t('ownerScheduleRemoveRule')}</option><option value="receipts">{t('ownerScheduleClearReceipts')}</option></select></label>
    <button disabled={busy} onClick={() => void action('preview')}>{t('ownerPreviewCleanup')}</button>
    {preview ? <section ref={previewRef} tabIndex={-1} onKeyDown={event => { if (event.key === 'Escape') setPreview(null); }}><h3>{preview.title}</h3><p>{t('ownerScheduleRetainedNotice')}</p><p>{t('ownerDependencies', { count: preview.receiptCount })}</p>
      <ul>{preview.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul><ul>{preview.retainedRuns.map(run => <li key={run.id}><Link to={`/work/tasks/orphan/runs/${encodeURIComponent(run.id)}`}>{run.title}</Link></li>)}</ul>
      <button disabled={busy || !!preview.blockers.length} onClick={() => void action('apply')}>{t('ownerApplyCleanup')}</button><button disabled={busy} onClick={() => setPreview(null)}>{t('ownerCancel')}</button></section> : null}
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
  </details>;
}
