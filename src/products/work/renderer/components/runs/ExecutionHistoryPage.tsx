import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import type { ExecutionHistoryList } from '../../../state/historyListing.js';
import type { MessageKey } from '../../../../../shared/i18n/index.js';
import { getWorkObjectStatusLabel } from '../topdown/WorkObjectCard.js';
import { HistoryActions } from './HistoryActions.js';

const sourceLabels: Record<string, MessageKey> = { managed: 'ownerSourceManaged', all: 'ownerAllSources', work: 'ownerSourceWork', room: 'ownerSourceRoom', schedule: 'ownerSourceSchedule', delegation: 'ownerSourceDelegation', unknown: 'ownerSourceUnknown' };

export function ExecutionHistoryPage({ family }: { family: 'run' | 'mission' }) {
  const { locale, t } = useI18n();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({ source: searchParams.get('source') ?? 'managed', status: 'all', view: 'visible', q: searchParams.get('q') ?? '', from: '', to: '', taskId: '', projectId: '', ruleId: searchParams.get('ruleId') ?? '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  function filter(key: keyof typeof filters, value: string) { setFilters(current => ({ ...current, [key]: value })); setPage(1); setSelected([]); }
  const query = useQuery<ExecutionHistoryList>({ queryKey: ['execution-history', family, filters, page], queryFn: async ({ signal }) => {
    const params = new URLSearchParams({ family, ...filters, page: String(page) });
    const response = await fetch(`/api/work/history?${params}`, { signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? t('ownerActionFailed'));
    return payload;
  } });
  const items = query.data?.items ?? [];
  const visibleIds = items.map(item => item.id).join('\n');
  useEffect(() => { setSelected(current => { const next = current.filter(id => items.some(item => item.id === id)); return next.length === current.length ? current : next; }); }, [visibleIds]);
  const selection = items.filter(item => selected.includes(item.id)).map(item => ({ family: item.family, id: item.id }));
  return <div className="runsList">
    <header className="channelTopBar runsListTopBar"><div className="channelTopBarStart"><h1 className="channelTopBarTitle">{t(family === 'run' ? 'workRunsListTitle' : 'workMissionsListTitle')}</h1>
      <span className="runsListTopBar__count">{query.data?.total ?? 0}</span></div></header>
    <main className="runsList__main">
      <div className="ownerHistoryFilters">{filters.ruleId ? <button onClick={() => filter('ruleId', '')}>{t('ownerSourceSchedule')} · {t('ownerAll')}</button> : null}
        <label>{t('ownerSearch')}<input type="search" value={filters.q} onChange={event => filter('q', event.target.value)} /></label>
        <label>{t('ownerSource')}<select value={filters.source} onChange={event => filter('source', event.target.value)}>{Object.entries(sourceLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
        <label>{t('ownerStatus')}<select value={filters.status} onChange={event => filter('status', event.target.value)}>{['all', 'queued', 'running', 'blocked', 'completed', 'failed', 'cancelled', ...(family === 'mission' ? ['draft', 'planned'] : [])].map(status => <option key={status} value={status}>{status === 'all' ? t('ownerAll') : getWorkObjectStatusLabel(status, t)}</option>)}</select></label>
        <label>{t('ownerView')}<select value={filters.view} onChange={event => filter('view', event.target.value)}><option value="visible">{t('ownerCurrent')}</option><option value="archived">{t('ownerArchived')}</option><option value="all">{t('ownerAll')}</option></select></label>
        <label>{t('ownerFrom')}<input type="date" value={filters.from} onChange={event => filter('from', event.target.value)} /></label>
        <label>{t('ownerTo')}<input type="date" value={filters.to} onChange={event => filter('to', event.target.value)} /></label>
        <label>{t('ownerTaskFilter')}<select value={filters.taskId} onChange={event => filter('taskId', event.target.value)}><option value="">{t('ownerAll')}</option>{query.data?.contexts.tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        <label>{t('ownerProjectFilter')}<select value={filters.projectId} onChange={event => filter('projectId', event.target.value)}><option value="">{t('ownerAll')}</option>{query.data?.contexts.projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
      </div>
      <p>{t('ownerHistoryDefaultNotice')} <button onClick={() => filter('source', 'all')}>{t('ownerAllSources')}</button></p>
      <HistoryActions subjects={selection} revision={query.data?.revision ?? 0} onChanged={() => setSelected([])} />
      {query.isPending ? <p role="status">{t('ownerWorking')}</p> : query.isError ? <p role="alert">{String(query.error.message)}</p> : null}
      {!query.isPending && !items.length ? <p>{t('ownerHistoryEmpty')}</p> : null}
      {items.length ? <label className="ownerHistorySelectAll"><input type="checkbox" checked={items.every(item => selected.includes(item.id))} onChange={event => setSelected(event.target.checked ? items.map(item => item.id) : [])} />{t('ownerSelectPage')}</label> : null}
      <ul className="runsList__list">{items.map(item => <li key={item.id} className={`runsList__row ownerHistoryRow${item.parentRunId ? ' ownerHistoryRow--child' : ''}`}>
        <input type="checkbox" aria-label={t('ownerSelectItem', { title: item.title })} checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />
        <div className="ownerHistoryRow__body"><Link className="runsList__rowLink" to={item.path}><span>{item.title}</span><span>{getWorkObjectStatusLabel(item.status, t)}</span></Link>
          {item.summary ? <p>{item.summary}</p> : null}
          <small>{t(sourceLabels[item.source])} · {item.taskTitle ?? ''} · {new Date(item.updatedAt).toLocaleString(locale)}</small>
          {item.parentRunId ? <p><Link to={`/work/tasks/orphan/runs/${encodeURIComponent(item.parentRunId)}`}>{t('ownerParentRun')}: {item.parentRunTitle ?? item.parentRunId}</Link></p> : null}
          {item.logsClearedAt ? <p>{t('ownerLogsCleared')}</p> : null}
        </div>
      </li>)}</ul>
      <nav aria-label={t('ownerPages')} className="ownerHistoryActions__bar">
        <button disabled={page <= 1} onClick={() => { setPage(current => current - 1); setSelected([]); }}>{t('ownerPrevious')}</button>
        <span>{page} / {Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 25)))}</span>
        <button disabled={page * (query.data?.pageSize ?? 25) >= (query.data?.total ?? 0)} onClick={() => { setPage(current => current + 1); setSelected([]); }}>{t('ownerNext')}</button>
      </nav>
    </main>
  </div>;
}
