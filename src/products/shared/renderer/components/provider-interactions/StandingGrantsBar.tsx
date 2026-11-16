import { messageKeys, type MessageKey } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import { useEffect, useState } from 'react';
import type { BoundStandingGrants, GrantCategory } from '../../../../../shared/providerInteractions.js';

const CATEGORY_KEYS: Record<GrantCategory, MessageKey> = {
  computer_use: messageKeys.providerControlsGrantComputerUse,
  command: messageKeys.providerControlsGrantCommand,
  file: messageKeys.providerControlsGrantFile,
};

/**
 * ADR-155: what each cat may do without asking, for how long, and a Stop that ends every grant in the
 * conversation and cancels its reply. A Stop Runtime did not confirm says so and stays in view.
 */
export function StandingGrantsBar({ grants, onStop }: { grants: BoundStandingGrants[]; onStop(): Promise<void> }) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now());
  const [stopping, setStopping] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const lines = grants.map(({ binding, standingGrants }) => {
    const parts = standingGrants.map((grant) => {
      const minutes = grant.expiresAt ? Math.max(1, Math.ceil((Date.parse(grant.expiresAt) - now) / 60_000)) : null;
      return `${t(CATEGORY_KEYS[grant.category])} (${minutes === null
        ? t(messageKeys.providerControlsGrantForConversation)
        : t(messageKeys.providerControlsGrantMinutesLeft, { minutes })})`;
    });
    return { key: binding.sessionId, text: `${binding.label}: ${parts.join(', ')}` };
  });
  return <section className="native-provider-grants" role="status" aria-label={t(messageKeys.providerControlsGrantsActive)}>
    <strong>{t(messageKeys.providerControlsGrantsActive)}</strong>
    {lines.map((line) => <p key={line.key}>{line.text}</p>)}
    {failed && <p role="alert">{t(messageKeys.providerControlsGrantStopFailed)}</p>}
    <div className="native-provider-actions">
      <button type="button" disabled={stopping} onClick={() => {
        setStopping(true); setFailed(false);
        void onStop().catch(() => setFailed(true)).finally(() => setStopping(false));
      }}>{t(stopping ? messageKeys.providerControlsGrantStopping : messageKeys.providerControlsGrantStop)}</button>
      <small>{t(messageKeys.providerControlsGrantStopHint)}</small>
    </div>
  </section>;
}
