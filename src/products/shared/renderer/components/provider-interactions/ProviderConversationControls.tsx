import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { STANDING_GRANT_REASON, type ProviderConversationSnapshot } from '../../../../../shared/providerInteractions.js';
import { cancelChatChannel } from '../../api/chat.js';
import { readProviderConversation, respondProviderRequest, openProviderUrl, stopProviderGrants } from './api.js';
import { StandingGrantsBar } from './StandingGrantsBar.js';
import { ProviderInteractionCard } from './ProviderInteractionCard.js';
import { ProviderCapabilities } from './ProviderCapabilities.js';
import './providerInteractions.css';

export function ProviderConversationControls({ conversationId, channelId, initiallyOpen = false }: {
  conversationId: string; initiallyOpen?: boolean;
  /** ADR-155: the chat channel whose running turn Stop cancels with the grants. */
  channelId?: string;
}) {
  const { t } = useI18n();
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
  // ADR-155: a request Runtime answered from a standing grant is never a card and never waits.
  const active = visible?.interactions.filter(i => ['pending', 'responding'].includes(i.status) && i.reason !== STANDING_GRANT_REASON) ?? [];
  const activeIds = active.map(i => `${i.sessionId}:${i.interactionId}`).join(',');
  useEffect(() => { if (activeIds) anchor.current?.scrollIntoView({ block: 'nearest' }); }, [activeIds]);
  return <aside className="native-provider-controls" aria-label={t(messageKeys.providerControlsControls)}>
    <div className="native-provider-toolbar"><span role="status">{active.length ? t(messageKeys.providerControlsWaiting, { count: active.length }) : ''}</span>
      <button type="button" onClick={() => setDetails(v => !v)} aria-expanded={details}>{t(messageKeys.providerControlsSessionTools)}</button></div>
    {visible?.standingGrants?.length ? <StandingGrantsBar grants={visible.standingGrants} onStop={async () => {
      // Stop the grants and the running turn at the same time, so nothing more is approved meanwhile.
      const [revoked] = await Promise.allSettled([stopProviderGrants(conversationId),
        ...(channelId ? [cancelChatChannel(channelId)] : [])]);
      await refresh();
      if (revoked.status === 'rejected') throw revoked.reason;
    }} /> : null}
    {unavailable && <p role="status">{t(messageKeys.providerControlsDisconnected)}</p>}
    {details && <div>
      {unavailable ? <p>{t(messageKeys.providerControlsOwnerRequired)}</p>
        : !visible?.sessions.length ? <p>{t(messageKeys.providerControlsNoSession)}</p> : <>
          <label>{t(messageKeys.providerControlsSession)} <select value={sessionId} onChange={e => setSessionId(e.target.value)}>{visible.sessions.map(s => <option key={s.sessionId} value={s.sessionId}>{s.label}</option>)}</select></label>
          {visible.supported === false ? <p>{t(messageKeys.providerControlsWorkerUnavailable)}</p>
            : sessionId && <ProviderCapabilities key={sessionId} conversationId={conversationId} sessionId={sessionId}
              provider={visible.sessions.find(s => s.sessionId === sessionId)?.provider} />}
        </>}
    </div>}
    <div ref={anchor} className="native-provider-active">{active.map(i => <ProviderInteractionCard key={`${i.workerGeneration}:${i.interactionId}`} interaction={i}
      refresh={async () => { await refresh(); }} respond={respondProviderRequest} openUrl={openProviderUrl} />)}</div>
    {details && visible?.interactions.filter(i => !['pending', 'responding'].includes(i.status) && i.reason !== STANDING_GRANT_REASON).slice(-4).map(i =>
      <ProviderInteractionCard key={`${i.workerGeneration}:${i.interactionId}`} interaction={i} refresh={refresh} respond={respondProviderRequest} openUrl={openProviderUrl} />)}
  </aside>;
}
