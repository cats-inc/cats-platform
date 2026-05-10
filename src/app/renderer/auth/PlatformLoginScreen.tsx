import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { useI18n } from '../i18n/index.js';
import { fetchPlatformEnvelope } from '../setup/api.js';
import {
  fetchPlatformAuthStatus,
  loginPlatformGoogle,
  loginPlatformLocal,
} from './api.js';
import {
  GoogleIdentityServicesButton,
  type GoogleIdentityCredential,
} from './GoogleIdentityServicesButton.js';
import { PLATFORM_AUTH_ERROR_CODES } from '../../../platform/auth/errorCodes.js';

export function PlatformLoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: (envelope: PlatformHostEnvelope) => void;
}) {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const canSubmit = Boolean(identifier.trim() && password && !busy);
  const authApiOptions = useCallback(() => ({
    fallbackMessageForStatus: (status: number) =>
      t(messageKeys.authLoginFailedWithStatus, { status }),
    errorMessagesByCode: {
      [PLATFORM_AUTH_ERROR_CODES.unauthenticated]: t(messageKeys.authLoginInvalidCredentials),
      [PLATFORM_AUTH_ERROR_CODES.forbidden]: t(messageKeys.authLoginForbidden),
      [PLATFORM_AUTH_ERROR_CODES.csrfMismatch]: t(messageKeys.authLoginCsrfMismatch),
    },
  }), [t]);

  useEffect(() => {
    let active = true;
    void fetchPlatformAuthStatus(authApiOptions())
      .then((status) => {
        if (!active) {
          return;
        }
        const clientId = status.providers.google.enabled
          ? status.providers.google.clientId?.trim() || null
          : null;
        setGoogleClientId(clientId);
      })
      .catch(() => {
        if (active) {
          setGoogleClientId(null);
        }
      });
    return () => {
      active = false;
    };
  }, [authApiOptions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      await loginPlatformLocal({
        identifier: identifier.trim(),
        password,
      }, authApiOptions());
      const envelope = await fetchPlatformEnvelope({
        fallbackMessageForStatus: (status) =>
          t(messageKeys.appLoadStateFailedWithStatus, { status }),
      });
      onAuthenticated(envelope);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.authLoginFailed));
    } finally {
      setBusy(false);
    }
  }

  const handleGoogleCredential = useCallback(async (
    input: GoogleIdentityCredential,
  ): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      await loginPlatformGoogle({
        credential: input.credential,
        csrfToken: input.csrfToken,
      }, authApiOptions());
      const envelope = await fetchPlatformEnvelope({
        fallbackMessageForStatus: (status) =>
          t(messageKeys.appLoadStateFailedWithStatus, { status }),
      });
      onAuthenticated(envelope);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.authLoginFailed));
    } finally {
      setBusy(false);
    }
  }, [authApiOptions, busy, onAuthenticated, t]);

  const handleGoogleError = useCallback((): void => {
    setFeedback(t(messageKeys.authLoginGoogleUnavailable));
  }, [t]);

  return (
    <div className="screen screenCentered">
      <form className="contentCard setupCard" onSubmit={(event) => void handleSubmit(event)}>
        <p className="eyebrow">{t(messageKeys.appBrandName)}</p>
        <h1>{t(messageKeys.authLoginTitle)}</h1>
        <p className="heroNote">{t(messageKeys.authLoginSubtitle)}</p>
        <label className="fieldLabel">
          <span>{t(messageKeys.authLoginIdentifierLabel)}</span>
          <input
            className="textInput"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder={t(messageKeys.authLoginIdentifierPlaceholder)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="fieldLabel">
          <span>{t(messageKeys.authLoginPasswordLabel)}</span>
          <input
            className="textInput"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t(messageKeys.authLoginPasswordPlaceholder)}
            autoComplete="current-password"
          />
        </label>
        {feedback ? <p className="feedbackText">{feedback}</p> : null}
        <button className="primaryButton setupPrimaryButton" disabled={!canSubmit} type="submit">
          {busy ? t(messageKeys.authLoginSubmitting) : t(messageKeys.authLoginSubmit)}
        </button>
        {googleClientId ? (
          <div className="googleSignInSection">
            <div className="setupRuntimeNote">{t(messageKeys.authLoginGoogleOriginHint)}</div>
            <GoogleIdentityServicesButton
              clientId={googleClientId}
              disabled={busy}
              onCredential={(credential) => void handleGoogleCredential(credential)}
              onError={handleGoogleError}
            />
          </div>
        ) : null}
      </form>
    </div>
  );
}
