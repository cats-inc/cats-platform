import { useState, type FormEvent } from 'react';

import { PLATFORM_AUTH_ERROR_CODES } from '../../../platform/auth/errorCodes.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { useI18n } from '../i18n/index.js';
import { fetchPlatformEnvelope } from '../setup/api.js';
import { repairPlatformFirstAdmin } from './api.js';

export function PlatformRepairScreen({
  onRepaired,
}: {
  onRepaired: (envelope: PlatformHostEnvelope) => void;
}) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryToken, setRecoveryToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const canSubmit = Boolean(identifier.trim() && password && !busy);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      setFeedback(t(messageKeys.authRepairFailed));
      return;
    }

    setBusy(true);
    setFeedback('');
    try {
      const trimmedDisplayName = displayName.trim();
      const trimmedRecoveryToken = recoveryToken.trim();
      await repairPlatformFirstAdmin({
        displayName: trimmedDisplayName || undefined,
        identifier: identifier.trim(),
        password,
        recoveryToken: trimmedRecoveryToken || undefined,
      }, {
        fallbackMessageForStatus: (status) =>
          t(messageKeys.authRepairFailedWithStatus, { status }),
        errorMessagesByCode: {
          [PLATFORM_AUTH_ERROR_CODES.forbidden]: t(messageKeys.authRepairForbidden),
        },
      });
      const envelope = await fetchPlatformEnvelope({
        fallbackMessageForStatus: (status) =>
          t(messageKeys.appLoadStateFailedWithStatus, { status }),
      });
      onRepaired(envelope);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t(messageKeys.authRepairFailed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen screenCentered">
      <form className="contentCard setupCard" onSubmit={(event) => void handleSubmit(event)}>
        <p className="eyebrow">{t(messageKeys.appBrandName)}</p>
        <h1>{t(messageKeys.authRepairTitle)}</h1>
        <p className="heroNote">{t(messageKeys.authRepairSubtitle)}</p>
        <label className="fieldLabel">
          <span>{t(messageKeys.authRepairDisplayNameLabel)}</span>
          <input
            className="textInput"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={t(messageKeys.authRepairDisplayNamePlaceholder)}
            autoComplete="name"
            autoFocus
          />
        </label>
        <label className="fieldLabel">
          <span>{t(messageKeys.authRepairIdentifierLabel)}</span>
          <input
            className="textInput"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder={t(messageKeys.authRepairIdentifierPlaceholder)}
            autoComplete="username"
          />
        </label>
        <label className="fieldLabel">
          <span>{t(messageKeys.authRepairPasswordLabel)}</span>
          <input
            className="textInput"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t(messageKeys.authRepairPasswordPlaceholder)}
            autoComplete="new-password"
          />
        </label>
        <label className="fieldLabel">
          <span>{t(messageKeys.authRepairRecoveryTokenLabel)}</span>
          <input
            className="textInput"
            value={recoveryToken}
            onChange={(event) => setRecoveryToken(event.target.value)}
            placeholder={t(messageKeys.authRepairRecoveryTokenPlaceholder)}
            autoComplete="off"
          />
        </label>
        <p className="setupRuntimeNote">{t(messageKeys.authRepairRecoveryTokenHint)}</p>
        {feedback ? (
          <p className="feedbackText" role="alert">
            {feedback}
          </p>
        ) : null}
        <button className="primaryButton setupPrimaryButton" disabled={!canSubmit} type="submit">
          {busy ? t(messageKeys.authRepairSubmitting) : t(messageKeys.authRepairSubmit)}
        </button>
      </form>
    </div>
  );
}
