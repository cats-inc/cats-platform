import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { recordCandidateReview } from '../../api/workRecords.js';
import type { CandidateReviewReceipt, CandidateReviewTarget } from '../../../shared/candidateReview.js';

function newestReview(current: CandidateReviewReceipt | undefined, incoming: CandidateReviewReceipt | undefined, binding: string) {
  const previous = current?.bindingDigest === binding ? current : undefined;
  const next = incoming?.bindingDigest === binding ? incoming : undefined;
  return previous && (!next || previous.reviewedAt >= next.reviewedAt) ? previous : next;
}

export function CandidateReviewSection({ taskId, artifactId, target, lastReview }: {
  taskId: string; artifactId: string; target: CandidateReviewTarget; lastReview?: CandidateReviewReceipt;
}): JSX.Element {
  const { t } = useI18n();
  const [checks, setChecks] = useState('');
  const [verdict, setVerdict] = useState<'accepted' | 'changes_requested'>('changes_requested');
  const [saved, setSaved] = useState(lastReview);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const requestId = useRef(''), lifetime = useRef(0);
  useEffect(() => {
    lifetime.current++; requestId.current = ''; setChecks(''); setVerdict('changes_requested'); setBusy(false); setError(false);
    return () => { lifetime.current++; };
  }, [taskId, artifactId, target.bindingDigest]);
  useEffect(() => {
    setSaved(current => newestReview(current, lastReview, target.bindingDigest));
  }, [lastReview, taskId, artifactId, target.bindingDigest]);
  return <details>
    <summary>{t('workTaskCandidateReview')}</summary>
    <p>{t('workTaskCandidateReviewDescription')}</p>
    <p>{target.members.map(member => member.member + ': ' + member.commitId.slice(0, 12)).join(' · ')}</p>
    <form onSubmit={event => {
      event.preventDefault(); if (busy || !checks.trim()) return;
      const current = lifetime.current;
      requestId.current ||= crypto.randomUUID(); setBusy(true); setError(false);
      void recordCandidateReview(taskId, { artifactId, bindingDigest: target.bindingDigest,
        requestId: requestId.current, verdict, checks }, t('workTaskCandidateReviewError'))
        .then(result => { if (current === lifetime.current) {
          setSaved(current => newestReview(current, result.review, target.bindingDigest)); setChecks(''); requestId.current = '';
        } })
        .catch(() => { if (current === lifetime.current) setError(true); })
        .finally(() => { if (current === lifetime.current) setBusy(false); });
    }}>
      <label>{t('workTaskCandidateReviewChecks')}<textarea value={checks} disabled={busy} maxLength={2000}
        onChange={event => { setChecks(event.target.value); requestId.current = ''; }} /></label>
      <label>{t('workTaskCandidateReviewVerdict')}<select value={verdict} disabled={busy}
        onChange={event => { setVerdict(event.target.value as typeof verdict); requestId.current = ''; }}>
        <option value="changes_requested">{t('workTaskCandidateReviewChanges')}</option>
        <option value="accepted">{t('workTaskCandidateReviewAccepted')}</option>
      </select></label>
      <button type="submit" disabled={busy || !checks.trim()}>{t('workTaskCandidateReviewSave')}</button>
    </form>
    {saved ? <div role="status">
      <p>{t('workTaskCandidateReviewLast')}: {t(saved.verdict === 'accepted' ? 'workTaskCandidateReviewAccepted' : 'workTaskCandidateReviewChanges')}</p>
      <p>{saved.checks}</p>
      <p>{saved.reviewerActorId} · {saved.reviewedAt}</p>
    </div> : null}
    {error ? <p role="alert">{t('workTaskCandidateReviewError')}</p> : null}
  </details>;
}
