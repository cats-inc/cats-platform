import { useEffect, useState } from 'react';

import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import {
  chooseTelegramOwner,
  fetchTelegramTransportDiagnostics,
  resetTelegramOwner,
  type TelegramOwnerRecordSummary,
} from '../../api/index.js';
import { formatTransportTimestamp } from './viewSupport.js';

export interface TelegramOwnerRowProps {
  bindingId: string;
  owner: TelegramOwnerRecordSummary | null;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  /** Injected in tests; the real calls by default. */
  actions?: {
    reset: typeof resetTelegramOwner;
    choose: typeof chooseTelegramOwner;
    refresh?: (bindingId: string) => Promise<TelegramOwnerRecordSummary | null>;
  };
}

/**
 * A display name is whatever the sender typed, so a stranger could copy the
 * owner's; the username and the numeric id always show beside it.
 */
function ownerName(input: { displayName: string | null; username: string | null; userId: string }): string {
  return [input.displayName, input.username ? `@${input.username}` : null, input.userId]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

async function refreshOwner(bindingId: string): Promise<TelegramOwnerRecordSummary | null> {
  const diagnostics = await fetchTelegramTransportDiagnostics();
  return diagnostics.owners?.find((entry) => entry.bindingId === bindingId) ?? null;
}

/**
 * SPEC-140: who a Telegram bot binding answers. Only the owner's private chat
 * reaches the Cat, and the Cat's Telegram messages go only there.
 */
export function TelegramOwnerRow({ bindingId, owner: initialOwner, confirm, actions }: TelegramOwnerRowProps) {
  const { t } = useI18n();
  const [owner, setOwner] = useState(initialOwner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = actions?.reset ?? resetTelegramOwner;
  const choose = actions?.choose ?? chooseTelegramOwner;
  const refresh = actions?.refresh ?? refreshOwner;

  useEffect(() => {
    setOwner(initialOwner);
  }, [initialOwner]);

  if (!owner) {
    return null;
  }

  async function reload() {
    try {
      const latest = await refresh(bindingId);
      if (latest) setOwner(latest);
    } catch {
      // The error shown is the action's; a failed reload keeps what is on screen.
    }
  }

  async function run(action: () => Promise<{ owner: TelegramOwnerRecordSummary }>) {
    setBusy(true);
    setError(null);
    try {
      setOwner((await action()).owner);
    } catch (failure) {
      setError(t(messageKeys.sharedSettingsCatsTelegramOwnerError, {
        error: failure instanceof Error ? failure.message : String(failure),
      }));
      // A refused choice (for example a stale list) shows what the server has now.
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    setBusy(true);
    setError(null);
    await reload();
    setBusy(false);
  }

  async function onReset() {
    const confirmed = confirm
      ? await confirm({
        title: t(messageKeys.sharedSettingsCatsTelegramOwnerResetTitle),
        message: t(messageKeys.sharedSettingsCatsTelegramOwnerResetMessage),
        confirmLabel: t(messageKeys.sharedSettingsCatsTelegramOwnerReset),
      })
      : true;
    if (confirmed) {
      await run(() => reset(bindingId));
    }
  }

  const how = owner.state === 'pinned'
    ? {
      first_message: messageKeys.sharedSettingsCatsTelegramOwnerHowFirstMessage,
      history: messageKeys.sharedSettingsCatsTelegramOwnerHowHistory,
      owner_choice: messageKeys.sharedSettingsCatsTelegramOwnerHowChoice,
    }[owner.how]
    : null;

  return (
    <div className="catsTelegramOwner" data-owner-state={owner.state}>
      {owner.state === 'pinned' ? (
        <div className="catsTelegramOwnerPinned">
          <span>{t(messageKeys.sharedSettingsCatsTelegramOwnerPinned, { name: ownerName(owner) })}</span>
          {how ? <span className="catsTelegramOwnerHow">{t(how)}</span> : null}
          <button type="button" className="secondaryButton" disabled={busy} onClick={() => void onReset()}>
            {t(messageKeys.sharedSettingsCatsTelegramOwnerReset)}
          </button>
        </div>
      ) : null}
      {owner.state === 'open' ? (
        <div className="catsTelegramOwnerActions">
          <p className="catsTelegramOwnerOpen">{t(messageKeys.sharedSettingsCatsTelegramOwnerOpen)}</p>
          <button type="button" className="secondaryButton" disabled={busy} onClick={() => void onRefresh()}>
            {t(messageKeys.sharedSettingsCatsTelegramOwnerRefresh)}
          </button>
        </div>
      ) : null}
      {owner.state === 'choose' ? (
        <div className="catsTelegramOwnerChoose">
          <p>
            {t(owner.candidates.length === 0
              ? messageKeys.sharedSettingsCatsTelegramOwnerCollecting
              : messageKeys.sharedSettingsCatsTelegramOwnerChoose)}
          </p>
          <ul>
            {owner.candidates.map((candidate) => (
              <li key={candidate.userId}>
                <span>{ownerName(candidate)}</span>
                {candidate.lastInboundAt ? (
                  <span className="catsTelegramOwnerLastMessage">
                    {t(messageKeys.sharedSettingsCatsTelegramOwnerLastMessage, {
                      time: formatTransportTimestamp(candidate.lastInboundAt),
                    })}
                  </span>
                ) : null}
                {candidate.lastMessagePreview ? (
                  <span className="catsTelegramOwnerPreview">
                    {t(messageKeys.sharedSettingsCatsTelegramOwnerPreview, { text: candidate.lastMessagePreview })}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={busy}
                  onClick={() => void run(() => choose(bindingId, candidate.userId))}
                >
                  {t(messageKeys.sharedSettingsCatsTelegramOwnerChooseThis)}
                </button>
              </li>
            ))}
          </ul>
          <div className="catsTelegramOwnerActions">
            <button type="button" className="secondaryButton" disabled={busy} onClick={() => void onRefresh()}>
              {t(messageKeys.sharedSettingsCatsTelegramOwnerRefresh)}
            </button>
            {owner.candidates.length > 0 ? (
              <button type="button" className="secondaryButton" disabled={busy} onClick={() => void onReset()}>
                {t(messageKeys.sharedSettingsCatsTelegramOwnerNoneOfThese)}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="catsTelegramOwnerHint">{t(messageKeys.sharedSettingsCatsTelegramOwnerHint)}</p>
      {error ? <div className="catsTelegramOwnerError" role="alert">{error}</div> : null}
    </div>
  );
}
