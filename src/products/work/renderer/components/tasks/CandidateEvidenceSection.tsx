import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { attachCandidateEvidence } from '../../api/workRecords.js';

export function CandidateEvidenceSection({ taskId }: { taskId: string }): JSX.Element {
  const { t } = useI18n();
  const [receipt, setReceipt] = useState<{ root: string; launchId: string; instanceId: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const selection = useRef(0);
  useEffect(() => () => { selection.current++; }, []);
  return <section className="operatorPanel">
    <h3>{t('workTaskCandidateTitle')}</h3>
    <p>{t('workTaskCandidateDescription')}</p>
    <form onSubmit={event => { event.preventDefault(); if (!receipt || busy) return;
      setBusy(true); setError(false); setResult(null);
      void attachCandidateEvidence(taskId, receipt, t('workTaskCandidateError'))
        .then(value => setResult(value.path)).catch(() => setError(true)).finally(() => setBusy(false));
    }}>
      <label>{t('workTaskCandidateFile')}<input type="file" accept=".json,application/json" disabled={busy}
        onChange={event => {
          const current = ++selection.current;
          const file = event.target.files?.[0]; setReceipt(null); setError(false); setResult(null);
          if (!file) return;
          if (file.size > 8192) { setError(true); return; }
          void file.text().then(text => {
            if (current !== selection.current) return;
            const value = JSON.parse(text) as Record<string, unknown>;
            if (typeof value.root !== 'string' || typeof value.launchId !== 'string' || typeof value.instanceId !== 'string') throw new Error('invalid receipt');
            setReceipt({ root: value.root, launchId: value.launchId, instanceId: value.instanceId });
          }).catch(() => { if (current === selection.current) setError(true); });
        }} /></label>
      <button type="submit" disabled={!receipt || busy}>{t(busy ? 'workTaskCandidateChecking' : 'workTaskCandidateAttach')}</button>
    </form>
    {error ? <p role="alert">{t('workTaskCandidateError')}</p> : null}
    {result ? <Link to={result}>{t('workTaskCandidateOpen')}</Link> : null}
  </section>;
}
