import { getWorkGraphKindLabel } from './shared.js';
import type { WorkGraphObjectKind } from './types.js';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import type { MessageKey } from '../../../../../shared/i18n/index.js';
import type { OwnerRelationshipView, OrphanLinkPreview } from '../../../shared/ownerRelationships.js';

const fieldLabels: Record<string, MessageKey> = { projectId: 'ownerProjectFilter', taskId: 'ownerTaskFilter', parentWorkItemId: 'ownerParent', parentTaskId: 'ownerParent', parentRunId: 'ownerParent', conversationId: 'ownerConversationAnchor', primaryConversationId: 'ownerConversationAnchor', managedWorkId: 'ownerWorkItemAnchor', workItemId: 'ownerWorkItemAnchor', runId: 'ownerRunAnchor', artifactId: 'ownerArtifactAnchor' };
export async function relationshipRequest<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? `Action failed (${response.status})`); return payload;
}
export function RelationshipActions({ family, id }: { family: string; id: string }) {
  const { t } = useI18n(); const client = useQueryClient();
  const [open, setOpen] = useState(false), [field, setField] = useState(''), [target, setTarget] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const url = `/api/work/relationships/${family}/${encodeURIComponent(id)}`;
  const query = useQuery<OwnerRelationshipView>({ queryKey: ['owner-relationships', family, id], queryFn: () => relationshipRequest(url), enabled: open, retry: false });
  const view = query.data; const selected = view?.fields.find(item => item.field === field);
  useEffect(() => { setField(view?.fields[0]?.field ?? ''); setTarget(view?.fields[0]?.current ?? ''); }, [view?.token, family, id]);
  async function apply() { if (!view) return; setBusy(true); setError(''); setMessage('');
    try { await relationshipRequest(url, { token: view.token, field, targetId: target || null }); await client.invalidateQueries(); setMessage(t('ownerSaved')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); await query.refetch(); }
    finally { setBusy(false); }
  }
  return <details className="ownerRecordActions" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{t('ownerRepairRelationships')}</summary>
    {view ? <form onSubmit={event => { event.preventDefault(); void apply(); }}><p>{t('ownerRepairScope')}</p><ul>{view.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul>
      <label>{t('ownerRelationship')} <select disabled={busy} value={field} onChange={event => { setField(event.target.value); setTarget(view.fields.find(item => item.field === event.target.value)?.current ?? ''); }}>{view.fields.map(item => <option key={item.field} value={item.field}>{t(fieldLabels[item.field] ?? 'ownerRelationship')}</option>)}</select></label>
      <label>{t('ownerRelationshipTarget')} <select disabled={busy} value={target} onChange={event => setTarget(event.target.value)}><option value="">{t('ownerDetach')}</option>{selected?.current && !selected.choices.some(choice => choice.id === selected.current) ? <option value={selected.current}>{t('ownerMissingTarget', { id: selected.current })}</option> : null}{selected?.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.title}</option>)}</select></label>
      <button disabled={busy || !selected || !!view.blockers.length || target === (selected.current ?? '') || !!target && !selected.choices.some(choice => choice.id === target)}>{t('ownerApply')}</button></form> : null}
    {query.isPending && open ? <p role="status">{t('ownerWorking')}</p> : null}{error || query.isError ? <p role="alert">{error || query.error?.message}</p> : null}{message ? <p role="status">{message}</p> : null}</details>;
}

interface LinkView { token: string; link: { sourceRecordFamily: string; sourceRecordId: string; targetRecordFamily: string; targetRecordId: string }; choices: Array<{ id: string; title: string }> }
export function LinkRepairActions({ id }: { id: string }) {
  const { t } = useI18n(); const client = useQueryClient(); const [open, setOpen] = useState(false), [source, setSource] = useState(''), [target, setTarget] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const url = `/api/work/relationships/link/${encodeURIComponent(id)}`;
  const query = useQuery<LinkView>({ queryKey: ['owner-link', id], queryFn: () => relationshipRequest(url), enabled: open, retry: false });
  useEffect(() => { if (query.data) { const link = query.data.link; setSource(`${link.sourceRecordFamily}:${link.sourceRecordId}`); setTarget(`${link.targetRecordFamily}:${link.targetRecordId}`); } }, [query.data?.token]);
  async function apply() { setBusy(true); setError(''); try { await relationshipRequest(url, { token: query.data?.token, source, target }); setOpen(false); await client.invalidateQueries(); } catch (cause) { setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); await query.refetch(); } finally { setBusy(false); } }
  return <details className="ownerRecordActions" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{t('ownerRelink')}</summary>{query.data ? <form onSubmit={event => { event.preventDefault(); void apply(); }}>{([{ label: 'ownerRelationshipSource' as const, value: source, set: setSource }, { label: 'ownerRelationshipTarget' as const, value: target, set: setTarget }]).map(input => <label key={input.label}>{t(input.label)}<select required disabled={busy} value={input.value} onChange={event => input.set(event.target.value)}><option value="">{t('ownerNone')}</option>{!query.data!.choices.some(choice => choice.id === input.value) && input.value ? <option value={input.value}>{t('ownerMissingTarget', { id: input.value })}</option> : null}{query.data!.choices.map(choice => <option key={choice.id} value={choice.id}>{getWorkGraphKindLabel(choice.id.split(':')[0] as WorkGraphObjectKind, t)}: {choice.title}</option>)}</select></label>)}<button disabled={busy || !query.data.choices.some(choice => choice.id === source) || !query.data.choices.some(choice => choice.id === target)}>{t('ownerApply')}</button></form> : null}{error || query.isError ? <p role="alert">{error || query.error?.message}</p> : null}</details>;
}

export function OrphanLinkActions({ ids, onChanged }: { ids: string[]; onChanged: () => void }) {
  const { t } = useI18n(); const client = useQueryClient(); const [preview, setPreview] = useState<OrphanLinkPreview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const selection = JSON.stringify(ids); const current = useRef(selection); current.current = selection; const region = useRef<HTMLElement>(null);
  useEffect(() => { setPreview(null); setError(''); }, [selection]); useEffect(() => { if (preview) region.current?.focus(); }, [preview]);
  async function action(action: 'preview' | 'apply') { setBusy(true); setError(''); try { const result = await relationshipRequest<OrphanLinkPreview>('/api/work/relationships/orphan-links', { action, ids, token: preview?.token }); if (current.current !== selection) return; if (action === 'preview') setPreview(result); else { setPreview(null); await client.invalidateQueries(); onChanged(); } } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); } finally { setBusy(false); } }
  return <div className="ownerRecordActions"><span>{t('ownerSelectionCount', { count: ids.length })}</span> <button disabled={busy || !ids.length} onClick={() => void action('preview')}>{t('ownerPreviewOrphanCleanup')}</button>{preview ? <section ref={region} tabIndex={-1} onKeyDown={event => { if (event.key === 'Escape' && !busy) setPreview(null); }}><p>{t('ownerOrphanCleanupScope')}</p><ul>{preview.items.map(item => <li key={item.id}>{item.kind}: {item.source} → {item.target}</li>)}</ul><button disabled={busy} onClick={() => void action('apply')}>{t('ownerApplyCleanup')}</button><button disabled={busy} onClick={() => setPreview(null)}>{t('ownerCancel')}</button></section> : null}{error ? <p role="alert">{error}</p> : null}</div>;
}
