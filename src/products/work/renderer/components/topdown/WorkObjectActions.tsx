import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { OwnerRecordActions } from '../../../../shared/renderer/OwnerRecordActions.js';
import { TaskOperationalActions } from '../../../../shared/renderer/TaskOperationalActions.js';
import { RunExecutionActions } from '../../../../shared/renderer/RunExecutionActions.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import type { PlanningOwnerFamily } from '../../../../../core/ownerActionContracts.js';
import type { WorkGraphObjectSummary } from './types.js';
import { HistoryActions } from '../runs/HistoryActions.js';
import { RelationshipActions, relationshipRequest } from './RelationshipActions.js';

export function WorkObjectActions({ object, revision }: { object: WorkGraphObjectSummary; revision: number }) {
  const { t } = useI18n(); const client = useQueryClient(); const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const family = object.sourceRecordFamily, id = object.sourceRecordId;
  async function cancelMission() { setBusy(true); setError(''); try { await relationshipRequest(`/api/work/missions/${encodeURIComponent(id)}/cancel`, {}); await client.invalidateQueries(); } catch (cause) { setError(cause instanceof Error ? cause.message : t('ownerActionFailed')); } finally { setBusy(false); } }
  return <div className="ownerObjectActions">
    {object.canonicalPath ? <Link to={object.canonicalPath}>{t('ownerOpenDetail')}</Link> : null}
    {family === 'project' && object.metadata?.codeRelay ? <Link to={`/code/relay?projectId=${encodeURIComponent(id)}`}>{t('ownerOpenDispatch')}</Link> : null}
    {['project', 'work_item', 'task', 'artifact'].includes(family) ? <OwnerRecordActions family={family as PlanningOwnerFamily} id={id} /> : null}
    {family === 'task' ? <TaskOperationalActions taskId={id} /> : null}
    {family === 'run' ? <RunExecutionActions runId={id} status={object.status} /> : null}
    {family === 'mission' && !['completed', 'failed', 'cancelled'].includes(object.status) ? <button disabled={busy} onClick={() => void cancelMission()}>{t('ownerCancelWork')}</button> : null}
    {family === 'run' || family === 'mission' ? <HistoryActions subjects={[{ family, id }]} revision={revision} archiveEligible={['completed', 'failed', 'cancelled'].includes(object.status)} /> : null}
    {['project', 'work_item', 'task', 'run', 'mission', 'artifact', 'activity', 'trace', 'checkpoint', 'outcome'].includes(family) ? <RelationshipActions key={`${family}:${id}`} family={family} id={id} /> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
