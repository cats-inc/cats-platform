import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { useI18n } from '../i18n/index.js';
import type { PlatformAuthActionPurpose } from './api.js';

export interface PlatformReauthenticationDialogProps {
  purpose: PlatformAuthActionPurpose;
  busy: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

/**
 * Accessible local-password step-up modal.
 *
 * This dialog is presentation only. The authorization boundary is the server
 * action grant issued by `POST /api/auth/reauth`; ADR-111 explicitly rejects
 * treating a renderer modal as the step-up itself.
 */
export function PlatformReauthenticationDialog({
  purpose,
  busy,
  onSubmit,
  onCancel,
}: PlatformReauthenticationDialogProps) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    passwordRef.current?.focus();
    return () => {
      // Restore focus to whatever opened the dialog (SPEC-113 requirement 50).
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, []);

  const trapFocus = useCallback((event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) {
      return;
    }
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, [busy, onCancel]);

  useEffect(() => {
    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [trapFocus]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // Requirement 50: a second submit while the first is in flight must not
    // spend another step-up attempt against the login throttle.
    if (busy || !password) {
      return;
    }
    onSubmit(password);
  }

  const description = purpose === 'link_google'
    ? t(messageKeys.settingsAccountReauthLinkDescription)
    : t(messageKeys.settingsAccountReauthUnlinkDescription);

  return (
    <div className="settingsRuntimeConfirmOverlay" role="dialog" aria-modal="true"
      aria-labelledby="cats-reauth-title">
      <div className="settingsRuntimeConfirmCard" ref={dialogRef}>
        <h3 id="cats-reauth-title">{t(messageKeys.settingsAccountReauthTitle)}</h3>
        <p className="heroNote">{description}</p>
        {purpose === 'unlink_google' ? (
          <p className="heroNote">{t(messageKeys.settingsAccountUnlinkWarning)}</p>
        ) : null}
        <form className="settingsAccountReauthForm" onSubmit={handleSubmit}>
          <label className="settingsAccountReauthField">
            <span className="settings-option-row__label">
              {t(messageKeys.settingsAccountReauthPasswordLabel)}
            </span>
            <input
              ref={passwordRef}
              className="textInput"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              placeholder={t(messageKeys.settingsAccountReauthPasswordPlaceholder)}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="setupActionGroup">
            <button
              type="button"
              className="secondaryButton"
              disabled={busy}
              onClick={onCancel}
            >
              {t(messageKeys.settingsAccountReauthCancel)}
            </button>
            <button
              type="submit"
              className="primaryButton"
              disabled={busy || !password}
            >
              {busy
                ? t(messageKeys.settingsAccountReauthSubmitting)
                : t(messageKeys.settingsAccountReauthSubmit)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
