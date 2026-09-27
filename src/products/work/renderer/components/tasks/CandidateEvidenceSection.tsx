import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { attachCandidateEvidence, prepareCandidate } from '../../api/workRecords.js';

export function CandidateEvidenceSection({ taskId }: { taskId: string }): JSX.Element {
  const { t } = useI18n();
  const [receipt, setReceipt] = useState<{ root: string; launchId: string; instanceId: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [root, setRoot] = useState(''), [prepared, setPrepared] = useState<Record<string, unknown> | null>(null);
  const requestId = useRef('');
  const selection = useRef(0);
  const lifetime = useRef(0);
  useEffect(() => {
    lifetime.current++; selection.current++;
    setReceipt(null); setResult(null); setPrepared(null); setRoot(''); setBusy(false); setError(false); requestId.current = '';
    return () => { lifetime.current++; selection.current++; };
  }, [taskId]);
  return <section className="operatorPanel">
    <h3>{t('workTaskCandidateTitle')}</h3>
    <p>{t('workTaskCandidateDescription')}</p>
    <details>
      <summary>{t('workTaskCandidatePrepare')}</summary>
      <p>{t('workTaskCandidatePreparationDescription')}</p>
      <form onSubmit={event => { event.preventDefault(); if (!root.trim() || busy) return;
        const current = lifetime.current;
        requestId.current ||= crypto.randomUUID(); setBusy(true); setError(false);
        void prepareCandidate(taskId, { root: root.trim(), requestId: requestId.current }, t('workTaskCandidateError'))
          .then(value => { if (current === lifetime.current) setPrepared(value.ownership); })
          .catch(() => { if (current === lifetime.current) setError(true); })
          .finally(() => { if (current === lifetime.current) setBusy(false); });
      }}>
        <label>{t('workTaskCandidateRoot')}<input value={root} disabled={busy} onChange={event => {
          setRoot(event.target.value); setPrepared(null); requestId.current = '';
        }} /></label>
        <button type="submit" disabled={!root.trim() || busy}>{t('workTaskCandidatePrepare')}</button>
      </form>
      {prepared ? <a href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(prepared, null, 2))}`}
        download="candidate-ownership.json">{t('workTaskCandidateDownload')}</a> : null}
    </details>
    <form onSubmit={event => { event.preventDefault(); if (!receipt || busy) return;
      const current = lifetime.current;
      setBusy(true); setError(false); setResult(null);
      void attachCandidateEvidence(taskId, receipt, t('workTaskCandidateError'))
        .then(value => { if (current === lifetime.current) setResult(value.path); })
        .catch(() => { if (current === lifetime.current) setError(true); })
        .finally(() => { if (current === lifetime.current) setBusy(false); });
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
