import { useEffect, type Dispatch, type SetStateAction } from 'react';

import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import type { BotFormState } from '../../hooks/settingsCatsRegistryActions.js';

export interface TelegramConnectDialogProps {
  botForm: BotFormState;
  setBotForm: Dispatch<SetStateAction<BotFormState>>;
  busyCreating: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export function TelegramConnectDialog({
  botForm,
  setBotForm,
  busyCreating,
  onSubmit,
  onClose,
}: TelegramConnectDialogProps) {
  const { t } = useI18n();
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busyCreating) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busyCreating, onClose]);

  const submitDisabled =
    !botForm.botName.trim() || !botForm.botToken.trim() || busyCreating;

  return (
    <div
      className="catsDialogOverlay"
      onClick={() => {
        if (!busyCreating) onClose();
      }}
    >
      <form
        className="catsDialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (submitDisabled) return;
          onSubmit();
        }}
      >
        <p className="catsDialogTitle">{t(messageKeys.sharedTelegramConnectDialogTitle)}</p>
        <label className="fieldLabel">
          <span>{t(messageKeys.sharedTelegramConnectBotUsernameLabel)}</span>
          <input
            className="textInput"
            placeholder={t(messageKeys.sharedTelegramConnectBotUsernamePlaceholder)}
            value={botForm.botName}
            onChange={(event) => setBotForm({ ...botForm, botName: event.target.value })}
            autoFocus
          />
        </label>
        <label className="fieldLabel">
          <span>{t(messageKeys.sharedTelegramConnectBotTokenLabel)}</span>
          <input
            className="textInput"
            type="password"
            placeholder={t(messageKeys.sharedTelegramConnectBotTokenPlaceholder)}
            value={botForm.botToken}
            onChange={(event) => setBotForm({ ...botForm, botToken: event.target.value })}
          />
        </label>
        <div className="fieldLabel">
          <span>{t(messageKeys.sharedTelegramConnectModeLabel)}</span>
          <div className="skillPills">
            <button
              type="button"
              className={botForm.inboundMode === 'polling' ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
              onClick={() => setBotForm({ ...botForm, inboundMode: 'polling' })}
            >
              {t(messageKeys.sharedTelegramConnectModePolling)}
            </button>
            <button
              type="button"
              className={botForm.inboundMode === 'webhook' ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
              onClick={() => setBotForm({ ...botForm, inboundMode: 'webhook' })}
            >
              {t(messageKeys.sharedTelegramConnectModeWebhook)}
            </button>
          </div>
        </div>
        {botForm.inboundMode === 'webhook' ? (
          <label className="fieldLabel">
            <span>{t(messageKeys.sharedTelegramConnectWebhookSecretLabel)}</span>
            <input
              className="textInput"
              placeholder={t(messageKeys.sharedTelegramConnectWebhookSecretPlaceholder)}
              value={botForm.webhookSecret}
              onChange={(event) => setBotForm({ ...botForm, webhookSecret: event.target.value })}
            />
          </label>
        ) : null}
        <div className="catsDialogActions">
          <button
            className="confirmCancelButton"
            type="button"
            onClick={onClose}
            disabled={busyCreating}
          >
            {t(messageKeys.sharedTelegramConnectCancel)}
          </button>
          <button
            className="primaryButton"
            type="submit"
            disabled={submitDisabled}
          >
            {busyCreating
              ? t(messageKeys.sharedTelegramConnectConnecting)
              : t(messageKeys.sharedTelegramConnectConnect)}
          </button>
        </div>
      </form>
    </div>
  );
}
