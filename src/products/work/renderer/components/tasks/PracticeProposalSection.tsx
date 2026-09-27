import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { importPracticeDevelopmentProposal } from '../../api/workRecords.js';
import { parsePracticeProposal, type PracticeDevelopmentProposal } from '../../../shared/practiceProposal.js';

export function PracticeProposalSection(): JSX.Element {
  const { t } = useI18n();
  const [proposal, setProposal] = useState<PracticeDevelopmentProposal | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(false), [result, setResult] = useState<string | null>(null);
  const selection = useRef(0);
  useEffect(() => () => { selection.current++; }, []);
  return <details className="operatorPanel">
    <summary>{t('workPracticeProposalTitle')}</summary>
    <p>{t('workPracticeProposalDescription')}</p>
    <form onSubmit={event => {
      event.preventDefault(); if (!proposal || !confirmed || busy) return;
      setBusy(true); setError(false); setResult(null);
      void importPracticeDevelopmentProposal(proposal, t('workPracticeProposalError'))
        .then(value => setResult(value.path)).catch(() => setError(true)).finally(() => setBusy(false));
    }}>
      <label>{t('workPracticeProposalFile')}<input type="file" accept=".json,application/json" disabled={busy}
        onChange={event => {
          const current = ++selection.current, file = event.target.files?.[0];
          setProposal(null); setConfirmed(false); setError(false); setResult(null);
          if (!file) return;
          if (file.size > 16 * 1024) { setError(true); return; }
          void file.text().then(text => {
            if (current === selection.current) setProposal(parsePracticeProposal(JSON.parse(text)));
          }).catch(() => { if (current === selection.current) setError(true); });
        }} /></label>
      {proposal ? <div>
        <strong>{proposal.title}</strong><p>{proposal.summary}</p>
        <p>{t(proposal.evidenceMode === 'fixture' ? 'workPracticeProposalFixture' : 'workPracticeProposalUnverified')}</p>
        <label><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={event => setConfirmed(event.target.checked)} />{t('workPracticeProposalConfirm')}</label>
      </div> : null}
      <button type="submit" disabled={!proposal || !confirmed || busy}>{t('workPracticeProposalCreate')}</button>
    </form>
    {error ? <p role="alert">{t('workPracticeProposalError')}</p> : null}
    {result ? <Link to={result}>{t('workPracticeProposalOpen')}</Link> : null}
  </details>;
}
