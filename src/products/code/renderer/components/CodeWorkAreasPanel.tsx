import { useEffect, useRef } from 'react';
import { useI18n } from '../../../../app/renderer/i18n/index.js';
import { messageKeys as m } from '../../../../shared/i18n/messageKeys.js';
import type { CodeWorkAreasState } from '../hooks/useCodeWorkAreas.js';
import type { CodeParticipantWorkAreas } from '../../shared/workAreas.js';

export function CodeWorkAreasPanel({ state, selectedParticipantId, focusRequest, onFocusHandled, onInspectRun }: {
  state: CodeWorkAreasState;
  selectedParticipantId: string | null;
  focusRequest: number;
  onFocusHandled?: () => void;
  onInspectRun: (runId: string) => void;
}) {
  const { t, locale } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  // Only the user's avatar action changes focus. Live updates preserve selection and DOM state.
  useEffect(() => {
    if (!focusRequest) return;
    const heading = [...(root.current?.querySelectorAll<HTMLElement>('[data-work-area-participant]') ?? [])]
      .find(element => element.dataset.workAreaParticipant === selectedParticipantId);
    if (heading) {
      heading.focus({ preventScroll: true }); heading.scrollIntoView?.({ block: 'nearest' });
      onFocusHandled?.();
    } else if (state.status === 'ready' && state.data) onFocusHandled?.();
  }, [focusRequest, selectedParticipantId, state.data, state.status, onFocusHandled]);
  const labels = {
    kind: { original: m.codeWorkAreasOriginal, worktree: m.codeWorkAreasWorktree,
      non_git: m.codeWorkAreasDirectory, unknown: m.codeWorkAreasUnknown },
    management: { runtime_managed: m.codeWorkAreasManaged, unmanaged: m.codeWorkAreasUnmanaged, unknown: m.codeWorkAreasUnknown },
    verification: { verified: m.codeWorkAreasVerified, unverified: m.codeWorkAreasUnverified, unavailable: m.codeWorkAreasUnavailable },
    coverage: { available: m.codeWorkAreasAvailable, partial: m.codeWorkAreasPartial,
      unsupported: m.codeWorkAreasNotReported, unavailable: m.codeWorkAreasUnavailable },
    continuity: { current: m.codeWorkAreasCurrent, last_known: m.codeWorkAreasLastKnown,
      interrupted: m.codeWorkAreasInterrupted, not_reported: m.codeWorkAreasNotReported },
    operation: { read: m.codeWorkAreasRead, write: m.codeWorkAreasWrite, test: m.codeWorkAreasTest,
      git: m.codeWorkAreasGit, shell: m.codeWorkAreasShell, other: m.codeWorkAreasOther },
    result: { running: m.codeWorkAreasRunning, succeeded: m.codeWorkAreasSucceeded,
      failed: m.codeWorkAreasFailed, cancelled: m.codeWorkAreasCancelled, unknown: m.codeWorkAreasUnknown },
  };
  const time = (value: string) => <time dateTime={value} title={value}>{new Date(value).toLocaleString(locale)}</time>;
  const participant = (entry: CodeParticipantWorkAreas) => (
    <section className={`codeWorkAreaParticipant${selectedParticipantId === entry.participantId ? ' isSelected' : ''}`}
      key={entry.canonicalParticipantId}>
      <h3 tabIndex={-1} data-work-area-participant={entry.participantId}>
        {entry.name}{entry.coordinator ? <small>{t(m.codeWorkAreasCoordinator)}</small> : null}
      </h3>
      {entry.executions.length ? entry.executions.map(execution => (
        <details className="codeWorkAreaExecution" key={execution.sessionId}>
          <summary>{t(labels.continuity[execution.continuity])} · {t(labels.coverage[execution.coverage.status])}</summary>
          <dl>
            <dt>{t(m.codeWorkAreasSession)}</dt><dd>{execution.sessionId}</dd>
            <dt>{t(m.codeWorkAreasStartupCwd)}</dt><dd>{execution.startupCwd ?? t(m.codeWorkAreasUnknown)}</dd>
            <dt>{t(m.codeWorkAreasRuntimeCwd)}</dt><dd>{execution.runtimeCwd ?? t(m.codeWorkAreasUnknown)}</dd>
            {execution.observedAt ? <><dt>{t(m.codeWorkAreasObservedAt)}</dt><dd>{time(execution.observedAt)}</dd></> : null}
          </dl>
        </details>
      )) : <p>{t(m.codeWorkAreasNotReported)}</p>}
      {entry.repositories.length ? entry.repositories.map(repository => (
        <div className="codeWorkAreaRepository" key={`${repository.executionLocationId}:${repository.id}`}>
          <h4>{repository.label ?? t(m.codeWorkAreasDirectory)}</h4>
          {repository.checkouts.map(checkout => (
            <details className="codeWorkAreaCheckout" key={checkout.checkoutId}>
              <summary>
                <span>{t(labels.kind[checkout.kind])} · {checkout.branch
                  ?? (checkout.detachedCommit ? t(m.codeWorkAreasDetached, { commit: checkout.detachedCommit.slice(0, 12) })
                    : t(m.codeWorkAreasUnknown))}</span>
                <span className="codeWorkAreaPath">{checkout.path}</span>
                <span>{t(labels.management[checkout.management])}</span>
                {checkout.operations.some(operation => operation.active) ? <strong>{t(m.codeWorkAreasRunning)}</strong> : null}
              </summary>
              <dl>
                <dt>{t(m.codeWorkAreasCodespaceRelation)}</dt><dd>{t(m.codeWorkAreasUnverified)}</dd>
                <dt>{t(m.codeWorkAreasVerification)}</dt><dd>{t(labels.verification[checkout.verification])}</dd>
                <dt>{t(m.codeWorkAreasIdentityAt)}</dt><dd>{time(checkout.identityObservedAt)}</dd>
                <dt>{t(m.codeWorkAreasLocation)}</dt><dd>{checkout.executionLocationId}</dd>
                <dt>{t(m.codeWorkAreasAssociation)}</dt><dd>{t(checkout.association === 'session_binding'
                  ? m.codeWorkAreasBoundContext : m.codeWorkAreasObservedOperation)}</dd>
              </dl>
              {checkout.operations.length ? <ul className="codeWorkAreaOperations">{checkout.operations.map(operation => (
                <li key={`${operation.sessionId}:${operation.id}`}>
                  <span>{t(labels.operation[operation.kind])} · {t(labels.result[operation.displayState])}</span>
                  <span>{time(operation.endedAt ?? operation.startedAt)}</span>
                  <details>
                    <summary>{t(m.codeWorkAreasProvenance)}</summary>
                    <dl>
                      <dt>{t(m.codeWorkAreasSession)}</dt><dd>{operation.sessionId}</dd>
                      <dt>{t(m.codeWorkAreasEvidence)}</dt><dd>{t(operation.evidence === 'runtime_tool'
                        ? m.codeWorkAreasRuntimeEvidence : m.codeWorkAreasProviderEvidence)}</dd>
                      <dt>{t(m.codeWorkAreasRun)}</dt><dd><button type="button" className="operatorActionButton"
                        onClick={() => onInspectRun(operation.runId)}>{t(m.codeWorkAreasViewRun)}</button></dd>
                    </dl>
                  </details>
                </li>
              ))}</ul> : <p>{t(m.codeWorkAreasEmpty)}</p>}
            </details>
          ))}
        </div>
      )) : <p>{t(m.codeWorkAreasEmpty)}</p>}
    </section>
  );
  return <div className="codeWorkAreas" ref={root}>
    <p className="codeWorkAreasNotice">{t(m.codeWorkAreasObservationHint)}</p>
    {state.status === 'loading' ? <p role="status">{t(m.codeWorkAreasLoading)}</p> : null}
    {state.status === 'interrupted' ? <p role="status">{t(m.codeWorkAreasInterrupted)}</p> : null}
    {state.status === 'unavailable' ? <p role="status">{t(m.codeWorkAreasUnavailable)}</p> : null}
    {state.data?.participants.map(participant)}
    {state.data?.truncated ? <p>{t(m.codeWorkAreasTruncated)}</p> : null}
  </div>;
}
