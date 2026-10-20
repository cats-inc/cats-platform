import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../../app/renderer/i18n/index.js';
import type { OwnerActionView, PlanningOwnerAction, PlanningOwnerFamily } from '../../../core/ownerActionContracts.js';
import type { MessageKey } from '../../../shared/i18n/index.js';

const statusLabels: Record<string, MessageKey> = {"draft":"workObjectStatusDraft","planned":"workObjectStatusPlanned","active":"workObjectStatusActive","paused":"workObjectStatusPaused","archived":"workObjectStatusArchived","ready":"workObjectStatusReady","in_progress":"workObjectStatusInProgress","blocked":"workObjectStatusBlocked","completed":"workObjectStatusCompleted","cancelled":"workObjectStatusCancelled","running":"workObjectStatusRunning","queued":"workObjectStatusQueued","pending_approval":"workNewTaskStatusPendingApproval","approved":"workNewTaskStatusApproved"};
const actionLabels: Record<PlanningOwnerAction, MessageKey> = { edit: 'ownerEdit', pause: 'ownerPause', resume: 'ownerResume', complete: 'ownerComplete', reopen: 'ownerReopen', cancel: 'ownerCancelWork', archive: 'ownerArchive', restore: 'ownerRestore', delete: 'ownerDeleteRecord' };
async function request<T>(url: string, command?: unknown): Promise<T> {
  const response = await fetch(url, command ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) } : undefined);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? `Action failed (${response.status})`);
  return body;
}

export function useOwnerListing(family: PlanningOwnerFamily) {
  const { t } = useI18n();
  const [view, setView] = useState('visible');
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all');
  const query = useQuery<{ items: Array<{ id: string; title: string; summary: string | null; status: string; listing: string }> }>({ queryKey: ['owner-listing', family], queryFn: () => request(`/api/core/owner/${family}`) });
  return {
    accepts: (id: string) => { const item = query.data?.items.find(item => item.id === id); return (view === 'all' || (item?.listing ?? 'visible') === view) && (status === 'all' || item?.status === status) && (!search || `${item?.title ?? ''} ${item?.summary ?? ''}`.toLowerCase().includes(search.toLowerCase())); },
    control: <div><label>{t('ownerView')} <select value={view} onChange={event => setView(event.target.value)}><option value="visible">{t('ownerCurrent')}</option><option value="archived">{t('ownerArchived')}</option><option value="all">{t('ownerAll')}</option></select>{query.isError ? <span role="alert">{t('ownerActionFailed')}</span> : null}</label>{family !== 'artifact' ? <><label>{t('ownerSearch')} <input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label><label>{t('ownerStatus')} <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">{t('ownerAll')}</option>{Array.from(new Set(query.data?.items.map(item => item.status))).sort().map(status => <option key={status} value={status}>{statusLabels[status] ? t(statusLabels[status]) : t('workObjectStatusUnknown', { status })}</option>)}</select></label></> : null}</div>,
  };
}

export function OwnerRecordActions({ family, id, expanded = false, onChanged }: { family: PlanningOwnerFamily; id: string; expanded?: boolean; onChanged?: (removed: boolean) => void }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [open, setOpen] = useState(expanded);
  const [action, setAction] = useState<PlanningOwnerAction>('edit');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [form, setForm] = useState({ title: '', summary: '', assignedActorIds: [] as string[], projectId: '', parentId: '', priority: '', acceptanceConfirmed: false, acceptanceNote: '' });
  const url = `/api/core/owner/${family}/${encodeURIComponent(id)}`;
  const query = useQuery<OwnerActionView>({ queryKey: ['owner-actions', family, id], queryFn: () => request(url), enabled: open, retry: false });
  const view = query.data;
  useEffect(() => { if (view) setForm({ title: view.title, summary: view.summary ?? '', assignedActorIds: view.assignedActorIds, projectId: view.projectId ?? '', parentId: view.parentId ?? '', priority: view.priority, acceptanceConfirmed: false, acceptanceNote: '' }); }, [view?.token]);
  useEffect(() => { setError(''); setMessage(''); }, [id, action]);
  const capability = view?.actions.find(item => item.action === action);
  async function apply() {
    if (!view || !capability || capability.blockers.length || busy) return;
    if (action === 'delete' && !window.confirm(t('ownerDeleteRecordNotice'))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request<{ removed: boolean; view: OwnerActionView | null }>(url, { ...form, action, token: view.token });
      if (result.view) client.setQueryData(['owner-actions', family, id], result.view);
      await client.invalidateQueries();
      window.dispatchEvent(new Event('cats:owner-records-changed'));
      setMessage(t(result.removed ? 'ownerRecordRemoved' : 'ownerSaved'));
      onChanged?.(result.removed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); await query.refetch(); }
    finally { setBusy(false); }
  }
  return <details className="ownerRecordActions" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('ownerActions')}</summary>
    {query.isPending && open ? <p role="status">{t('ownerWorking')}</p> : null}
    {query.isError ? <p role="alert">{query.error.message} <button onClick={() => void query.refetch()}>{t('ownerRefresh')}</button></p> : null}
    {view ? <form onSubmit={event => { event.preventDefault(); void apply(); }}>
      <p>{t('ownerSource')}: {view.source} · {statusLabels[view.status] ? t(statusLabels[view.status]) : view.status}{view.sourcePath ? <> · <Link to={view.sourcePath}>{t('ownerOpenSource')}</Link></> : null}</p>
      <label>{t('ownerActions')} <select value={action} disabled={busy} onChange={event => setAction(event.target.value as PlanningOwnerAction)}>{view.actions.map(item => <option key={item.action} value={item.action}>{t(actionLabels[item.action])}</option>)}</select></label>
      {action === 'edit' ? <fieldset disabled={busy || !!capability?.blockers.length}>
        <label>{t('ownerTitle')} <input required maxLength={200} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        {family !== 'artifact' ? <label>{t('ownerSummary')} <textarea maxLength={12000} value={form.summary} onChange={event => setForm({ ...form, summary: event.target.value })} /></label> : null}
        {family === 'task' || family === 'work_item' ? <>
          <label>{t('ownerAssignees')} <select multiple value={form.assignedActorIds} onChange={event => setForm({ ...form, assignedActorIds: Array.from(event.target.selectedOptions, option => option.value) })}>{view.choices.actors.map(actor => <option key={actor.id} value={actor.id}>{actor.title}</option>)}</select></label>
          <label>{t('ownerParent')} <select value={form.parentId} onChange={event => setForm({ ...form, parentId: event.target.value })}><option value="">{t('ownerDetach')}</option>{view.choices.parents.map(parent => <option key={parent.id} value={parent.id}>{parent.title}</option>)}</select></label>
          {family === 'work_item' ? <label>{t('ownerProjectFilter')} <select value={form.projectId} onChange={event => setForm({ ...form, projectId: event.target.value })}><option value="">{t('ownerDetach')}</option>{view.choices.projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label> : null}
          <label>{t('ownerPriority')} <select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>{['', 'urgent', 'high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{t(priority === 'urgent' ? 'ownerPriorityUrgent' : priority === 'high' ? 'ownerPriorityHigh' : priority === 'medium' ? 'ownerPriorityMedium' : priority === 'low' ? 'ownerPriorityLow' : 'ownerNone')}</option>)}</select></label>
        </> : null}
      </fieldset> : null}
      {action === 'complete' && view.acceptanceCriteria ? <div><p>{view.acceptanceCriteria}</p><label><input type="checkbox" checked={form.acceptanceConfirmed} onChange={event => setForm({ ...form, acceptanceConfirmed: event.target.checked })} />{t('ownerAcceptanceConfirmed')}</label><label>{t('ownerAcceptanceNote')} <textarea required value={form.acceptanceNote} onChange={event => setForm({ ...form, acceptanceNote: event.target.value })} /></label></div> : null}
      {action === 'delete' ? <p>{t('ownerDeleteRecordNotice')}</p> : null}
      {capability?.blockers.length ? <ul>{capability.blockers.map(reason => <li key={reason}>{reason}</li>)}</ul> : null}
      {view.dependencies.length ? <details><summary>{t('ownerDependencies', { count: view.dependencies.length })}</summary><ul>{view.dependencies.map(item => <li key={`${item.family}:${item.id}`}>{item.family}: {item.title}</li>)}</ul></details> : null}
      <button disabled={busy || !capability || !!capability.blockers.length || action === 'complete' && !!view.acceptanceCriteria && !form.acceptanceConfirmed}>{t(busy ? 'ownerWorking' : 'ownerApply')}</button>
      {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    </form> : null}
  </details>;
}

export function OwnerBatchActions({ family, ids, onChanged }: { family: PlanningOwnerFamily; ids: string[]; onChanged: () => void }) {
  const { t } = useI18n(); const client = useQueryClient();
  const [preview, setPreview] = useState<{ token: string; items: Array<{ id: string; title: string; actions: OwnerActionView['actions'] }> } | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const selection = ids.join('\n');
  const currentSelection = useRef(selection); currentSelection.current = selection;
  useEffect(() => { setPreview(null); setError(''); }, [selection]);
  async function act(action: 'preview' | 'archive' | 'restore') {
    setBusy(true); setError('');
    try {
      const result = await request<NonNullable<typeof preview>>(`/api/core/owner/${family}/batch`, { action, ids, token: preview?.token });
      if (action === 'preview') { if (currentSelection.current === selection) setPreview(result); }
      else { setPreview(null); await client.invalidateQueries(); window.dispatchEvent(new Event('cats:owner-records-changed')); onChanged(); }
    } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); }
    finally { setBusy(false); }
  }
  return <div className="ownerRecordActions"><span>{t('ownerSelectionCount', { count: ids.length })}</span> <button disabled={busy || !ids.length} onClick={() => void act('preview')}>{t('ownerPreviewCleanup')}</button>
    {preview ? <div><ul>{preview.items.map(item => <li key={item.id}>{item.title}{item.actions.flatMap(action => action.blockers).join('; ')}</li>)}</ul>{(['archive', 'restore'] as const).map(action => <button key={action} disabled={busy || preview.items.some(item => item.actions.find(capability => capability.action === action)?.blockers.length)} onClick={() => void act(action)}>{t(action === 'archive' ? 'ownerArchive' : 'ownerRestore')}</button>)}<button onClick={() => setPreview(null)}>{t('ownerCancel')}</button></div> : null}
    {error ? <p role="alert">{error}</p> : null}</div>;
}
