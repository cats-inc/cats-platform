import { useEffect, type Dispatch, type SetStateAction } from 'react';

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
        <p className="catsDialogTitle">Connect Telegram</p>
        <label className="fieldLabel">
          <span>Bot username</span>
          <input
            className="textInput"
            placeholder="my_cat_bot"
            value={botForm.botName}
            onChange={(event) => setBotForm({ ...botForm, botName: event.target.value })}
            autoFocus
          />
        </label>
        <label className="fieldLabel">
          <span>Bot token</span>
          <input
            className="textInput"
            type="password"
            placeholder="Paste from @BotFather"
            value={botForm.botToken}
            onChange={(event) => setBotForm({ ...botForm, botToken: event.target.value })}
          />
        </label>
        <div className="fieldLabel">
          <span>Mode</span>
          <div className="skillPills">
            <button
              type="button"
              className={botForm.inboundMode === 'polling' ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
              onClick={() => setBotForm({ ...botForm, inboundMode: 'polling' })}
            >
              Polling
            </button>
            <button
              type="button"
              className={botForm.inboundMode === 'webhook' ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
              onClick={() => setBotForm({ ...botForm, inboundMode: 'webhook' })}
            >
              Webhook
            </button>
          </div>
        </div>
        {botForm.inboundMode === 'webhook' ? (
          <label className="fieldLabel">
            <span>Webhook secret</span>
            <input
              className="textInput"
              placeholder="Optional"
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
            Cancel
          </button>
          <button
            className="primaryButton"
            type="submit"
            disabled={submitDisabled}
          >
            {busyCreating ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </form>
    </div>
  );
}
