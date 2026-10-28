import { useEffect, useRef, useState } from 'react';
import type { SessionCapabilitiesSnapshot } from '../../../../../shared/providerInteractions.js';
import { readProviderCapabilities } from './api.js';

export function ProviderCapabilities({ conversationId, sessionId }: { conversationId: string; sessionId: string }) {
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
    <button type="button" disabled={busy} onClick={() => void refresh(true)}>Refresh observation</button>
    {error && <p role="status">Session observation is unavailable.</p>}
    {snapshot && !o && <p>{snapshot.reason?.replaceAll('_', ' ') ?? 'Not observed'}. No model turn was started.</p>}
    {o && <>
      <p>Policy: {o.policy.source} · {o.policy.status}{o.policy.reason ? ` · ${o.policy.reason.replaceAll('_', ' ')}` : ''}</p>
      {o.policy.observed && <p>Observed: {o.policy.observed.access}; network {o.policy.observed.network ? 'allowed' : 'off'}; approval {o.policy.observed.approval}; reviewer {o.policy.observed.reviewer}.</p>}
      <p>Tools: {o.inventory.state}{o.inventory.stale ? ' · stale' : ''}. Top-level MCP only; nested tools may load later.</p>
      <details><summary>Observation details</summary>
        <p>{o.inventory.observedAt ?? 'Not observed'} · {o.inventory.coverage}. Built-ins: {o.inventory.builtins}. Tool invocation has not been verified.</p>
        {o.inventory.servers.map(s => <details key={`${s.source}:${s.name}`}><summary>{s.name} · {s.source} · {s.connection} · {s.tools.length} tools</summary>
          <p>Authentication mechanism: {s.auth}. Discovery: {s.discovery}. Unsupported authentication is not unsupported tools.</p>
          <ul>{s.tools.map(t => <li key={t.qualifiedName}>{t.qualifiedName}</li>)}</ul>
        </details>)}
        {o.inventory.dynamicTools.length > 0 && <details><summary>Runtime dynamic tools</summary><ul>{o.inventory.dynamicTools.map(t => <li key={t.name}>{t.name}</li>)}</ul></details>}
        {o.policy.requested && <details><summary>Requested policy</summary><pre>{JSON.stringify(o.policy.requested, null, 2)}</pre></details>}
      </details>
      {o.dependencies.map(d => <p key={d.kind}>{d.kind === 'browser' ? 'Chrome / browser' : 'Computer use'}: {d.status}. {d.evidence} {d.remediation}</p>)}
      <a href="https://learn.chatgpt.com/docs/plugins" target="_blank" rel="noopener noreferrer">Codex plugins and host setup</a>
    </>}
  </div>;
}
