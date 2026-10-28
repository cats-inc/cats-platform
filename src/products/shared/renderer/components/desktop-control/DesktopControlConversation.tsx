import { useCallback, useEffect, useRef, useState } from 'react';
import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import {
  decideDesktopControlGrant, readDesktopControl, setConversationDesktopControl, stopDesktopControl,
  type DesktopControlState,
} from './api.js';
import '../provider-interactions/providerInteractions.css';

const POLICY_REASONS = new Set(['policy_preapproves_tools', 'policy_not_explicit', 'no_tool_approval_host']);

/**
 * SPEC-133 DC-03, DC-08, DC-12 and DC-18 for one conversation: its switch, its status, the
 * owner's grant cards and Stop. Grants are answered only here, never through provider approvals.
 * Nothing renders unless the local owner turned desktop control on and this computer supports it.
 */
export function DesktopControlConversation({ channelId }: { channelId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<DesktopControlState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const current = generation.current;
    try {
      const next = await readDesktopControl(channelId);
      if (current === generation.current) setState(next);
    } catch {
      // A remote or non-owner client gets 403; such clients simply see no panel.
      if (current === generation.current) setState(null);
    }
  }, [channelId]);

  useEffect(() => {
    generation.current++;
    setState(null);
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => { generation.current++; clearInterval(timer); };
  }, [refresh]);

  async function act(action: () => Promise<DesktopControlState>) {
    setBusy(true);
    setFailed(false);
    try {
      setState(await action());
    } catch {
      setFailed(true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const conversation = state?.conversation?.channelId === channelId ? state.conversation : undefined;
  if (!state?.available || !state.enabled || !conversation) return null;

  const reason = conversation.reason && POLICY_REASONS.has(conversation.reason)
    ? t(messageKeys.desktopControlReasonPolicy) : conversation.reason ?? '';
  const status = {
    unavailable: t(messageKeys.desktopControlUnavailable, { reason }),
    off: t(messageKeys.desktopControlStatusOff),
    not_injected: t(messageKeys.desktopControlStatusNotInjected, { reason }),
    injected: t(messageKeys.desktopControlStatusInjected),
    active_turn: t(messageKeys.desktopControlStatusActiveTurn),
    holding: t(messageKeys.desktopControlStatusHolding),
  }[conversation.status];

  return (
    <aside className="native-provider-controls desktop-control" aria-label={t(messageKeys.desktopControlSettingsTitle)}>
      <div className="native-provider-toolbar">
        <label>
          <input
            type="checkbox"
            checked={conversation.enabled}
            disabled={busy}
            onChange={(event) => { void act(() => setConversationDesktopControl(channelId, event.target.checked)); }}
          />
          {' '}{t(messageKeys.desktopControlConversationToggle)}
        </label>
        {conversation.enabled && (conversation.grants.length > 0 || conversation.pendingRequests.length > 0) && (
          <button type="button" disabled={busy} onClick={() => { void act(() => stopDesktopControl(channelId)); }}>
            {t(messageKeys.desktopControlStop)}
          </button>
        )}
      </div>
      {conversation.enabled && <p role="status">{status}</p>}
      {failed && <p role="alert">{t(messageKeys.desktopControlActionFailure)}</p>}
      {conversation.pendingRequests.map((request) => (
        <div key={request.requestId} className="native-provider-card" role="group">
          <strong>{t(messageKeys.desktopControlGrantTitle, { name: request.name })}</strong>
          <small>{request.path}</small>
          <small>{request.publisher
            ? t(messageKeys.desktopControlGrantPublisher, { publisher: request.publisher })
            : t(messageKeys.desktopControlGrantUnsigned)}</small>
          {request.tier === 'observe_only' && <small>{t(messageKeys.desktopControlGrantObserveOnly)}</small>}
          <p>{t(messageKeys.desktopControlGrantReason, { reason: request.reason })}</p>
          <div className="native-provider-actions">
            <button type="button" disabled={busy}
              onClick={() => { void act(() => decideDesktopControlGrant(channelId, request.requestId, 'allow')); }}>
              {t(messageKeys.desktopControlAllow)}
            </button>
            <button type="button" disabled={busy}
              onClick={() => { void act(() => decideDesktopControlGrant(channelId, request.requestId, 'deny')); }}>
              {t(messageKeys.desktopControlDeny)}
            </button>
          </div>
        </div>
      ))}
      {conversation.grants.length > 0 && (
        <div>
          <strong>{t(messageKeys.desktopControlGranted)}</strong>
          <ul>{conversation.grants.map((app) => <li key={`${app.path}|${app.publisher}`}>{app.name}</li>)}</ul>
        </div>
      )}
    </aside>
  );
}
