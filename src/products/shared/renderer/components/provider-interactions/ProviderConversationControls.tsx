import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderConversationSnapshot } from '../../../../../shared/providerInteractions.js';
import { readProviderConversation, respondProviderRequest, openProviderUrl } from './api.js';
import { ProviderInteractionCard } from './ProviderInteractionCard.js';
import { ProviderCapabilities } from './ProviderCapabilities.js';
import './providerInteractions.css';

export function ProviderConversationControls({ conversationId, initiallyOpen = false }: { conversationId: string; initiallyOpen?: boolean }) {
  const [snapshot, setSnapshot] = useState<ProviderConversationSnapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [details, setDetails] = useState(initiallyOpen);
  const [sessionId, setSessionId] = useState('');
  const generation = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const dirty = useRef(false);
  const anchor = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    if (inFlight.current) { dirty.current = true; return inFlight.current; }
    const current = generation.current;
    const pending = (async () => {
      do {
        dirty.current = false;
        try {
          const value = await readProviderConversation(conversationId);
          if (current !== generation.current) return;
          setSnapshot(value); setUnavailable(false);
          setSessionId(old => value.sessions.some(s => s.sessionId === old) ? old : value.sessions[0]?.sessionId ?? '');
        } catch { if (current === generation.current) { setUnavailable(true); setSnapshot(null); } }
      } while (dirty.current && current === generation.current);
    })()
      .finally(() => { if (inFlight.current === pending) inFlight.current = null; });
    inFlight.current = pending;
    return pending;
  }, [conversationId]);
  useEffect(() => {
    generation.current++; inFlight.current = null; dirty.current = false; setSnapshot(null); setUnavailable(false); setDetails(initiallyOpen); setSessionId('');
    void refresh(); const timer = setInterval(() => void refresh(), 2000);
    return () => { generation.current++; clearInterval(timer); };
  }, [refresh, initiallyOpen]);
  const visible = snapshot?.conversationId === conversationId ? snapshot : null;
  const active = visible?.interactions.filter(i => ['pending', 'responding'].includes(i.status)) ?? [];
  const activeIds = active.map(i => `${i.sessionId}:${i.interactionId}`).join(',');
  useEffect(() => { if (activeIds) anchor.current?.scrollIntoView({ block: 'nearest' }); }, [activeIds]);
  return <aside className="native-provider-controls" aria-label="Provider controls">
    <div className="native-provider-toolbar"><span role="status">{active.length ? `Waiting for your response (${active.length})` : ''}</span>
      <button type="button" onClick={() => setDetails(v => !v)} aria-expanded={details}>Session access and tools</button></div>
    {unavailable && <p role="status">Provider controls are disconnected. Reconnecting; pending forms will return when their live state is confirmed.</p>}
    {details && <div>
      {unavailable ? <p>Provider controls are unavailable. Sign in as the owner in the local app, then refresh.</p>
        : !visible?.sessions.length ? <p>No current session has been observed.</p> : <>
          <label>Session <select value={sessionId} onChange={e => setSessionId(e.target.value)}>{visible.sessions.map(s => <option key={s.sessionId} value={s.sessionId}>{s.label}</option>)}</select></label>
          {visible.supported === false ? <p>Current worker controls are unavailable or unsupported. No live policy or tools have been confirmed.</p>
            : sessionId && <ProviderCapabilities key={sessionId} conversationId={conversationId} sessionId={sessionId} />}
        </>}
    </div>}
    <div ref={anchor} className="native-provider-active">{active.map(i => <ProviderInteractionCard key={`${i.workerGeneration}:${i.interactionId}`} interaction={i}
      refresh={async () => { await refresh(); }} respond={respondProviderRequest} openUrl={openProviderUrl} />)}</div>
    {details && visible?.interactions.filter(i => !['pending', 'responding'].includes(i.status)).slice(-4).map(i =>
      <ProviderInteractionCard key={`${i.workerGeneration}:${i.interactionId}`} interaction={i} refresh={refresh} respond={respondProviderRequest} openUrl={openProviderUrl} />)}
  </aside>;
}
