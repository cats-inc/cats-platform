import { useCallback, useEffect, useRef, useState } from 'react';

import {
  SettingsOptionRow,
  SettingsStatusChip,
} from '../../../design/components/settings/index.js';
import { PLATFORM_AUTH_ERROR_CODES } from '../../../platform/auth/errorCodes.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { useI18n } from '../i18n/index.js';
import {
  fetchPlatformAuthStatus,
  linkPlatformGoogle,
  reauthenticatePlatformLocal,
  runPlatformAuthCsrfMutation,
  unlinkPlatformGoogle,
  type PlatformAuthActionPurpose,
  type PlatformAuthApiRequestOptions,
  type PlatformAuthLoginMethods,
  type PlatformAuthStatusPayload,
} from '../auth/api.js';
import {
  GoogleIdentityServicesButton,
  type GoogleIdentityCredential,
} from '../auth/GoogleIdentityServicesButton.js';
import { PlatformReauthenticationDialog } from '../auth/PlatformReauthenticationDialog.js';

export interface PlatformSettingsAccountSectionProps {
  showToast: (message: string) => void;
}

type AccountFlowStage =
  /** Nothing in flight; both actions are available. */
  | { kind: 'idle' }
  /** Password modal is open. `busy` is the in-flight step-up request. */
  | { kind: 'reauthenticating'; purpose: PlatformAuthActionPurpose; busy: boolean }
  /** Step-up succeeded for `link_google`; GIS is now allowed to initialize. */
  | { kind: 'awaitingGoogle' }
  /** The link or unlink mutation itself is in flight. */
  | { kind: 'submitting' };

/**
 * `Settings > General > Account` login-method body.
 *
 * SPEC-113 requirement 42 keeps this inside the existing `PlatformSettingsShell`
 * — it is a section body composed into the General page, not a second Settings
 * shell or a product-owned account route.
 */
export function PlatformSettingsAccountSection({
  showToast,
}: PlatformSettingsAccountSectionProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<PlatformAuthStatusPayload | null>(null);
  const [stage, setStage] = useState<AccountFlowStage>({ kind: 'idle' });
  /**
   * Requirement 47: the one-time action grant lives in component memory only.
   * A ref keeps it out of the rendered tree, and it is discarded on cancel, on
   * completion, and on unmount.
   */
  const actionToken = useRef<string | null>(null);

  const buildAuthOptions = useCallback((
    fallbackKey: keyof typeof messageKeys,
    fallbackWithStatusKey: keyof typeof messageKeys,
  ): PlatformAuthApiRequestOptions => ({
    fallbackMessageForStatus: (statusCode) =>
      t(messageKeys[fallbackWithStatusKey], { status: statusCode }),
    errorMessagesByCode: {
      [PLATFORM_AUTH_ERROR_CODES.unauthenticated]: t(messageKeys[fallbackKey]),
      [PLATFORM_AUTH_ERROR_CODES.forbidden]: t(messageKeys[fallbackKey]),
      [PLATFORM_AUTH_ERROR_CODES.csrfMismatch]: t(
        messageKeys.settingsGeneralSignOutCsrfError,
      ),
      [PLATFORM_AUTH_ERROR_CODES.reauthRequired]: t(
        messageKeys.settingsAccountReauthRequired,
      ),
    },
  }), [t]);

  const statusOptions = useCallback((): PlatformAuthApiRequestOptions => ({
    fallbackMessageForStatus: (statusCode) =>
      t(messageKeys.settingsAccountLinkFailedWithStatus, { status: statusCode }),
  }), [t]);

  useEffect(() => {
    let active = true;
    void fetchPlatformAuthStatus(statusOptions())
      .then((next) => {
        if (active) {
          setStatus(next);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      actionToken.current = null;
    };
  }, [statusOptions]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      setStatus(await fetchPlatformAuthStatus(statusOptions()));
    } catch {
      // A refresh failure leaves the previous truthful projection in place.
    }
  }, [statusOptions]);

  const finishFlow = useCallback((): void => {
    actionToken.current = null;
    setStage({ kind: 'idle' });
  }, []);

  const beginStepUp = useCallback((purpose: PlatformAuthActionPurpose): void => {
    actionToken.current = null;
    setStage({ kind: 'reauthenticating', purpose, busy: false });
  }, []);

  const completeUnlink = useCallback(async (token: string): Promise<void> => {
    setStage({ kind: 'submitting' });
    const options = buildAuthOptions(
      'settingsAccountUnlinkFailed',
      'settingsAccountUnlinkFailedWithStatus',
    );
    try {
      const next = await runPlatformAuthCsrfMutation(
        (csrfToken) => unlinkPlatformGoogle(csrfToken, token, {
          ...options,
          errorMessagesByCode: {
            ...options.errorMessagesByCode,
            [PLATFORM_AUTH_ERROR_CODES.identityConflict]: t(
              messageKeys.settingsAccountUnlinkConflict,
            ),
          },
        }),
        options,
      );
      setStatus(next);
    } catch (error) {
      showToast(error instanceof Error
        ? error.message
        : t(messageKeys.settingsAccountUnlinkFailed));
      await refreshStatus();
    } finally {
      finishFlow();
    }
  }, [buildAuthOptions, finishFlow, refreshStatus, showToast, t]);

  const completeLink = useCallback(async (
    credential: GoogleIdentityCredential,
  ): Promise<void> => {
    const token = actionToken.current;
    if (!token) {
      finishFlow();
      showToast(t(messageKeys.settingsAccountReauthRequired));
      return;
    }
    setStage({ kind: 'submitting' });
    const options = buildAuthOptions(
      'settingsAccountLinkFailed',
      'settingsAccountLinkFailedWithStatus',
    );
    try {
      const next = await runPlatformAuthCsrfMutation(
        (csrfToken) => linkPlatformGoogle({
          credential: credential.credential,
          csrfToken: credential.csrfToken,
        }, csrfToken, token, {
          ...options,
          errorMessagesByCode: {
            ...options.errorMessagesByCode,
            [PLATFORM_AUTH_ERROR_CODES.identityConflict]: t(
              messageKeys.settingsAccountLinkConflict,
            ),
          },
        }),
        options,
      );
      setStatus(next);
    } catch (error) {
      showToast(error instanceof Error
        ? error.message
        : t(messageKeys.settingsAccountLinkFailed));
      await refreshStatus();
    } finally {
      finishFlow();
    }
  }, [buildAuthOptions, finishFlow, refreshStatus, showToast, t]);

  const submitStepUp = useCallback(async (
    purpose: PlatformAuthActionPurpose,
    password: string,
  ): Promise<void> => {
    setStage({ kind: 'reauthenticating', purpose, busy: true });
    const options = buildAuthOptions(
      'settingsAccountReauthFailed',
      'settingsAccountReauthFailedWithStatus',
    );
    const stepUpOptions: PlatformAuthApiRequestOptions = {
      ...options,
      errorMessagesByCode: {
        ...options.errorMessagesByCode,
        [PLATFORM_AUTH_ERROR_CODES.unauthenticated]: t(
          messageKeys.settingsAccountReauthInvalidPassword,
        ),
      },
    };
    let grantToken: string;
    try {
      const grant = await runPlatformAuthCsrfMutation(
        (csrfToken) => reauthenticatePlatformLocal(
          { password, purpose },
          csrfToken,
          stepUpOptions,
        ),
        stepUpOptions,
      );
      grantToken = grant.actionToken;
      actionToken.current = grant.actionToken;
    } catch (error) {
      finishFlow();
      showToast(error instanceof Error
        ? error.message
        : t(messageKeys.settingsAccountReauthFailed));
      return;
    }

    // Only after the server issued the grant may GIS be initialized
    // (SPEC-113 requirement 44).
    if (purpose === 'link_google') {
      setStage({ kind: 'awaitingGoogle' });
      return;
    }
    await completeUnlink(grantToken);
  }, [buildAuthOptions, completeUnlink, finishFlow, showToast, t]);

  const handleGoogleError = useCallback((): void => {
    finishFlow();
    showToast(t(messageKeys.settingsAccountGoogleUnavailableError));
  }, [finishFlow, showToast, t]);

  const loginMethods: PlatformAuthLoginMethods | null = status?.loginMethods ?? null;
  const googleClientId = status?.providers.google.enabled
    ? status.providers.google.clientId?.trim() || null
    : null;
  const googleLinked = loginMethods?.google.linked ?? false;
  const localPasswordLinked = loginMethods?.localPassword.linked ?? false;
  const submitting = stage.kind === 'submitting';

  return (
    <>
      {status?.principal ? (
        <p className="heroNote">
          {t(messageKeys.settingsAccountSignedInAs, {
            name: status.principal.email ?? status.principal.displayName,
          })}
        </p>
      ) : null}

      <SettingsOptionRow
        label={t(messageKeys.settingsAccountLocalPasswordLabel)}
        description={t(messageKeys.settingsAccountLocalPasswordDescription)}
        control={
          <SettingsStatusChip tone={localPasswordLinked ? 'ready' : 'muted'}>
            {localPasswordLinked
              ? t(messageKeys.settingsAccountLocalPasswordLinked)
              : t(messageKeys.settingsAccountLocalPasswordMissing)}
          </SettingsStatusChip>
        }
      />

      <SettingsOptionRow
        label={t(messageKeys.settingsAccountGoogleLabel)}
        description={
          googleClientId
            ? t(messageKeys.settingsAccountGoogleDescription)
            : t(messageKeys.settingsAccountGoogleUnavailableHint)
        }
        control={
          <SettingsStatusChip
            tone={googleLinked ? 'ready' : googleClientId ? 'warm' : 'muted'}
          >
            {googleLinked
              ? t(messageKeys.settingsAccountGoogleLinkedStatus, {
                  email: loginMethods?.google.email ?? '',
                })
              : googleClientId
                ? t(messageKeys.settingsAccountGoogleNotLinkedStatus)
                : t(messageKeys.settingsAccountGoogleUnavailableStatus)}
          </SettingsStatusChip>
        }
      />

      {googleClientId && loginMethods ? (
        <div className="setupActionGroup">
          {googleLinked ? (
            <button
              type="button"
              className="secondaryButton"
              disabled={stage.kind !== 'idle' || !localPasswordLinked}
              onClick={() => beginStepUp('unlink_google')}
            >
              {submitting
                ? t(messageKeys.settingsAccountGoogleUnlinkingLabel)
                : t(messageKeys.settingsAccountGoogleUnlinkButton)}
            </button>
          ) : (
            <button
              type="button"
              className="secondaryButton"
              disabled={stage.kind !== 'idle'}
              onClick={() => beginStepUp('link_google')}
            >
              {submitting
                ? t(messageKeys.settingsAccountGoogleLinkingLabel)
                : t(messageKeys.settingsAccountGoogleLinkButton)}
            </button>
          )}
        </div>
      ) : null}

      {stage.kind === 'awaitingGoogle' && googleClientId ? (
        <div className="settingsAccountGoogleStep">
          <p className="settings-option-row__label">
            {t(messageKeys.settingsAccountGoogleContinueTitle)}
          </p>
          <p className="heroNote">
            {t(messageKeys.settingsAccountGoogleContinueDescription)}
          </p>
          <GoogleIdentityServicesButton
            clientId={googleClientId}
            onCredential={(credential) => void completeLink(credential)}
            onError={handleGoogleError}
          />
          <button type="button" className="secondaryButton" onClick={finishFlow}>
            {t(messageKeys.settingsAccountReauthCancel)}
          </button>
        </div>
      ) : null}

      {stage.kind === 'reauthenticating' ? (
        <PlatformReauthenticationDialog
          purpose={stage.purpose}
          busy={stage.busy}
          onSubmit={(password) => void submitStepUp(stage.purpose, password)}
          onCancel={finishFlow}
        />
      ) : null}
    </>
  );
}
