import { useOwnerListing } from '../../../shared/renderer/OwnerRecordActions.js';
import { useWorkDashboardQuery } from '../state/queries/workDashboardQuery.js';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { TaskOperationalActions } from '../../../shared/renderer/TaskOperationalActions.js';

/** One operator inbox, backed by the same approval/recovery envelopes as Task details. */
export function WorkOverviewOperations() {
  const { t } = useI18n(); const listing = useOwnerListing('task'); const query = useWorkDashboardQuery(t('workWarRoomLoadError'));
  const payload = query.data;
  const items = new Map<string, { taskId: string; taskTitle: string }>();
  for (const item of payload?.sections.operatorInbox.items ?? []) items.set(item.taskId, item);
  for (const item of payload?.sections.recovery.items ?? []) items.set(item.taskId, { taskId: item.taskId, taskTitle: item.taskContext.taskTitle ?? item.taskId });
  for (const item of payload?.sections.controlPlane.items ?? []) if (item.nextActions.some(action => action.action)) items.set(item.taskId, { taskId: item.taskId, taskTitle: item.taskContext.taskTitle ?? item.taskId });
  return <section className="operatorPanel ownerOverviewOperations" aria-label={t('ownerOverviewOperations')}><h2>{t('ownerOverviewOperations')}</h2>
    {query.isPending ? <p role="status">{t('ownerWorking')}</p> : null}{query.isError ? <p role="alert">{query.error.message}</p> : null}
    {payload && !items.size ? <p>{t('workWarRoomOperatorInboxEmptyTitle')}</p> : null}
    <div className="ownerOverviewOperations__items">{Array.from(items.values()).filter(item => listing.accepts(item.taskId)).map(item => <article key={item.taskId}><strong>{item.taskTitle}</strong><TaskOperationalActions taskId={item.taskId} /></article>)}</div>
  </section>;
}
