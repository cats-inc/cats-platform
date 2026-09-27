import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { controlCandidate, listCandidates, type WorkCandidateControlRow } from '../../api/workRecords.js';

export function CandidateLifecycleSection({ taskId }: { taskId: string }): JSX.Element {
  const { t } = useI18n();
  const [rows, setRows] = useState<WorkCandidateControlRow[] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const lifetime = useRef(0);
  useEffect(() => {
    lifetime.current++; setRows(null); setBusy(false); setError(false);
    return () => { lifetime.current++; };
  }, [taskId]);
  const run = (operation: () => Promise<WorkCandidateControlRow[]>) => {
    if (busy) return;
    const current = lifetime.current; setBusy(true); setError(false);
    void operation().then(value => { if (current === lifetime.current) setRows(value); })
      .catch(() => { if (current === lifetime.current) setError(true); })
      .finally(() => { if (current === lifetime.current) setBusy(false); });
  };
  const act = (row: WorkCandidateControlRow, action: 'status' | 'stop') => {
    if (busy) return;
    if (action === 'stop') setRows(current => current?.map(candidate => candidate.artifactId === row.artifactId && candidate.observation
      ? { ...candidate, observation: { ...candidate.observation, state: 'unconfirmed' } } : candidate) ?? null);
    run(async () => {
      const result = await controlCandidate(taskId, row.artifactId, action, t('workTaskCandidateControlError'));
      return (rows ?? []).map(candidate => candidate.artifactId === result.artifactId ? { ...candidate, observation: result.observation } : candidate);
    });
  };
  const states = { running: 'workTaskCandidateRunning', stopping: 'workTaskCandidateStopping',
    drained: 'workTaskCandidateDrained', failed: 'workTaskCandidateFailed', unconfirmed: 'workTaskCandidateUnconfirmed' } as const;
  return <details>
    <summary>{t('workTaskCandidateManage')}</summary>
    <p>{t('workTaskCandidateControlDescription')}</p>
    <button type="button" disabled={busy} onClick={() => run(async () => (await listCandidates(taskId, t('workTaskCandidateControlError'))).candidates)}>
      {t('workTaskCandidateList')}
    </button>
    {rows?.length === 0 ? <p>{t('workTaskCandidateEmpty')}</p> : null}
    {rows?.map(row => <div key={row.artifactId}>
      <p>{row.root}</p>
      <p role="status">{t(row.observation ? states[row.observation.state] : 'workTaskCandidateUnconfirmed')}</p>
      <button type="button" disabled={busy} onClick={() => act(row, 'status')}>{t('workTaskCandidateStatus')}</button>
      <button type="button" disabled={busy || row.observation?.state !== 'running' || !row.observation.instanceBoundStop}
        onClick={() => act(row, 'stop')}>{t('workTaskCandidateStop')}</button>
      {row.observation?.state === 'running' && !row.observation.instanceBoundStop ? <p>{t('workTaskCandidateUpgrade')}</p> : null}
    </div>)}
    {error ? <p role="alert">{t('workTaskCandidateControlError')}</p> : null}
  </details>;
}
