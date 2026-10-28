import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import { useEffect, useRef, useState } from 'react';
import type { SessionCapabilitiesSnapshot } from '../../../../../shared/providerInteractions.js';
import { readProviderCapabilities } from './api.js';

export function ProviderCapabilities({ conversationId, sessionId }: { conversationId: string; sessionId: string }) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<SessionCapabilitiesSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ticket = useRef(0);
  const inFlight = useRef(false);
  async function refresh(force: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    const current = ++ticket.current; setBusy(true); setError(false);
    try { const value = await readProviderCapabilities(conversationId, sessionId, force);
      if (current === ticket.current) setSnapshot(value);
    } catch { if (current === ticket.current) { setSnapshot(null); setError(true); } }
    finally { if (current === ticket.current) { setBusy(false); inFlight.current = false; } }
  }
  useEffect(() => {
    setSnapshot(null); inFlight.current = false; void refresh(false);
    // Runtime caches discovery; this also detects an idle worker disappearing or
    // being replaced under the same session ID. It never sends a model turn.
    const timer = setInterval(() => void refresh(false), 2000);
    return () => { ticket.current++; clearInterval(timer); };
  }, [conversationId, sessionId]);
  const o = snapshot?.observation;
  return <div className="native-provider-capabilities">
    <button type="button" disabled={busy} onClick={() => void refresh(true)}>{t(messageKeys.providerControlsRefresh)}</button>
    {error && <p role="status">{t(messageKeys.providerControlsUnavailable)}</p>}
    {snapshot && !o && <p>{t(messageKeys.providerControlsNoTurn, { reason: snapshot.reason?.replaceAll('_', ' ') ?? t(messageKeys.providerControlsNotObserved) })}</p>}
    {o && <>
      <p>{t(messageKeys.providerControlsPolicy, { source: o.policy.source, status: o.policy.status, reason: o.policy.reason ? ` · ${o.policy.reason.replaceAll('_', ' ')}` : '' })}</p>
      {o.policy.observed && <p>{t(messageKeys.providerControlsObserved, { ...o.policy.observed, network: t(o.policy.observed.network ? messageKeys.providerControlsNetworkAllowed : messageKeys.providerControlsNetworkOff) })}</p>}
      <p>{t(messageKeys.providerControlsTools, { state: o.inventory.state, stale: o.inventory.stale ? t(messageKeys.providerControlsStale) : '' })}</p>
      <details><summary>{t(messageKeys.providerControlsObservationDetails)}</summary>
        <p>{t(messageKeys.providerControlsCoverage, { observedAt: o.inventory.observedAt ?? t(messageKeys.providerControlsNotObserved), coverage: o.inventory.coverage, builtins: o.inventory.builtins })}</p>
        {o.inventory.servers.map(s => <details key={`${s.source}:${s.name}`}><summary>{t(messageKeys.providerControlsServer, { ...s, count: s.tools.length })}</summary>
          <p>{t(messageKeys.providerControlsAuthentication, { auth: s.auth, discovery: s.discovery })}</p>
          <ul>{s.tools.map(t => <li key={t.qualifiedName}>{t.qualifiedName}</li>)}</ul>
        </details>)}
        {o.inventory.dynamicTools.length > 0 && <details><summary>{t(messageKeys.providerControlsDynamicTools)}</summary><ul>{o.inventory.dynamicTools.map(t => <li key={t.name}>{t.name}</li>)}</ul></details>}
        {o.policy.requested && <details><summary>{t(messageKeys.providerControlsRequestedPolicy)}</summary><pre>{JSON.stringify(o.policy.requested, null, 2)}</pre></details>}
      </details>
      {o.dependencies.map(d => <p key={d.kind}>{t(d.kind === 'browser' ? messageKeys.providerControlsBrowser : messageKeys.providerControlsComputer)}: {d.status}. {d.evidence} {d.remediation}</p>)}
      <a href="https://learn.chatgpt.com/docs/plugins" target="_blank" rel="noopener noreferrer">{t(messageKeys.providerControlsSetup)}</a>
    </>}
  </div>;
}
