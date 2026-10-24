import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlatformHostEnvelope } from '../../../shared/platform-contract';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { DEFAULT_PRODUCT_PROVIDER } from '../../../shared/providerCatalogData.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { useI18n } from '../i18n/index.js';
import {
  completePlatformSetup,
  markPlatformSetupOpened,
} from './api';
import { prefetchProviderRegistryFromClientCache } from '../providerRegistryClient.js';
import {
  canContinueGuideCatSetupStep,
  GuideCatSetupFields,
} from './plugins';
import { syncDesktopHostPlatformShell } from './desktopHostBridge.js';
import {
  nextSetupStep,
  previousSetupStep,
  TOTAL_SETUP_STEPS,
  type SetupStep,
} from './flow';
import {
  resolveClientGuideCatName,
} from '../../../shared/guideCatIdentity.js';
import { formatSetupWizardCompletionError } from './setupWizardErrorLabels.js';
import { useDesktopGoogleAuth } from '../auth/useDesktopGoogleAuth.js';

type PendingAction = 'complete' | null;

export function shouldPrefetchGuideCatProviderRegistry(input: {
  step: SetupStep;
  createGuideCat: boolean;
}): boolean {
  return input.step === 2 && input.createGuideCat;
}

export function PlatformSetupWizard({
  envelope,
  onComplete,
}: {
  envelope: PlatformHostEnvelope;
  onComplete: (envelope: PlatformHostEnvelope) => void;
}) {
  const [step, setStep] = useState<SetupStep>(1);
  const [ownerName, setOwnerName] = useState('');
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminMethod, setAdminMethod] = useState<'local_password' | 'google'>('local_password');
  const [googleTransactionId, setGoogleTransactionId] = useState<string | null>(null);
  const [fallbackAttemptId] = useState(() => globalThis.crypto.randomUUID());
  const nativeGoogle = useDesktopGoogleAuth();
  const [createGuideCat, setCreateGuideCat] = useState(false);
  const [provider, setProvider] = useState<string>(DEFAULT_PRODUCT_PROVIDER);
  const [instance, setInstance] = useState('');
  const [model, setModel] = useState('');
  const [modelSelection, setModelSelection] = useState<ProviderModelSelection | null>(null);
  const [busyAction, setBusyAction] = useState<PendingAction>(null);
  const [feedback, setFeedback] = useState('');
  const setupOpenedRecorded = useRef(false);
  const { t } = useI18n();

  const busy = busyAction !== null;
  const guideCatName = resolveClientGuideCatName();
  const canContinueOwnerStep = Boolean(
    ownerName.trim() && !nativeGoogle.busy && (adminMethod === 'google'
      ? googleTransactionId : /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(adminIdentifier.trim()) && adminPassword),
  );
  const canContinueGuideCatStep = canContinueGuideCatSetupStep({
    createGuideCat,
    model,
  });
  const attemptId = envelope.bootstrapAttemptId ?? fallbackAttemptId;

  const finishSetup = useCallback(async (): Promise<void> => {
    setBusyAction('complete');
    setFeedback('');
    try {
      const result = await completePlatformSetup({
        attemptId,
        ownerDisplayName: ownerName.trim(),
        ...(adminMethod === 'google' ? { adminMethod: 'google' as const } : {
          adminIdentifier: adminIdentifier.trim(), adminPassword,
        }),
        createGuideCat,
        guideCatProvider: createGuideCat ? provider : undefined,
        guideCatInstance: createGuideCat ? (instance || undefined) : undefined,
        guideCatModel: createGuideCat ? (model || undefined) : undefined,
        guideCatModelSelection: createGuideCat ? modelSelection : undefined,
      }, {
        fallbackMessageForStatus: (status) => t(messageKeys.setupWizardFailedWithStatus, { status }),
        errorMessagesByCode: {
          already_complete: t(messageKeys.setupWizardAlreadyCompleteError),
          bad_request: t(messageKeys.setupWizardInvalidRequestError),
          configuration_error: t(messageKeys.setupWizardServerError),
          internal_error: t(messageKeys.setupWizardServerError),
        },
      }, adminMethod === 'google' ? googleTransactionId ?? undefined : undefined);
      await syncDesktopHostPlatformShell(result);
      onComplete(result);
    } catch (error) {
      if (adminMethod === 'google') { setGoogleTransactionId(null); setStep(1); }
      setFeedback(formatSetupWizardCompletionError(
        error,
        t(messageKeys.setupWizardFailedMessage),
        t,
      ));
    } finally {
      setBusyAction(null);
    }
  }, [
    createGuideCat,
    adminIdentifier,
    adminPassword,
    adminMethod,
    googleTransactionId,
    instance,
    model,
    modelSelection,
    onComplete,
    ownerName,
    provider,
    attemptId,
    t,
  ]);

  async function verifyGoogle(): Promise<void> {
    setFeedback('');
    setGoogleTransactionId(null);
    try { setGoogleTransactionId(await nativeGoogle.begin({ purpose: 'bootstrap', attemptId })); }
    catch { setFeedback(t(messageKeys.authNativeFailed)); }
  }

  useEffect(() => {
    if (setupOpenedRecorded.current) {
      return;
    }
    setupOpenedRecorded.current = true;
    void markPlatformSetupOpened(attemptId, {
      fallbackMessageForStatus: (status) =>
        t(messageKeys.setupWizardRecordOpenFailedWithStatus, { status }),
    }).catch(() => undefined);
  }, [attemptId, t]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Enter' || busy) {
        return;
      }
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (step === 1 && !canContinueOwnerStep) {
        return;
      }
      if (step === 2 && !canContinueGuideCatStep) {
        return;
      }

      e.preventDefault();
      if (step === 1) {
        setStep(nextSetupStep(step));
      } else if (step === 2) {
        void finishSetup();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, canContinueGuideCatStep, canContinueOwnerStep, finishSetup, step]);

  useEffect(() => {
    if (!shouldPrefetchGuideCatProviderRegistry({ step, createGuideCat })) {
      return;
    }
    // The mounted picker owns automatic recovery. Best-effort prefetch must
    // not leave an unhandled rejection when auth or selection changes mid-read.
    void prefetchProviderRegistryFromClientCache().catch(() => {});
  }, [createGuideCat, step]);

  const dots = Array.from({ length: TOTAL_SETUP_STEPS }, (_, index) => index + 1);

  return (
    <div className="screen screenCentered">
      <div className="setupWizard">
        <div className="setupStepIndicator">
          {dots.map((n) => (
            <span
              key={n}
              className={n <= step ? 'setupDot setupDotActive' : 'setupDot'}
            />
          ))}
        </div>

        {step === 1 ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">{t(messageKeys.appBrandName)}</p>
            <h1>{t(messageKeys.setupWizardWelcomeTitle)}</h1>
            <p className="heroNote">
              {t(messageKeys.setupWizardWelcomeIntro)}
            </p>
            <label className="fieldLabel">
              <span>{t(messageKeys.setupWizardOwnerNameLabel)}</span>
              <input
                className="textInput"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder={t(messageKeys.setupWizardOwnerNamePlaceholder)}
                autoFocus
              />
            </label>
            {nativeGoogle.supported ? <div className="setupActionGroup">
              <button type="button" className="secondaryButton" aria-pressed={adminMethod === 'local_password'}
                disabled={nativeGoogle.busy} onClick={() => {
                  setAdminMethod('local_password'); setGoogleTransactionId(null); void nativeGoogle.cancel();
                }}>{t(messageKeys.setupWizardPasswordMethod)}</button>
              <button type="button" className="secondaryButton" aria-pressed={adminMethod === 'google'}
                disabled={nativeGoogle.busy} onClick={() => setAdminMethod('google')}>
                {t(messageKeys.setupWizardGoogleMethod)}
              </button>
            </div> : null}
            {adminMethod === 'google' ? <div className="googleSignInSection">
              <p className="setupRuntimeNote">{googleTransactionId
                ? t(messageKeys.authNativeVerified) : nativeGoogle.available
                  ? t(messageKeys.settingsAccountPasswordOptional) : t(messageKeys.authNativeUnavailable)}</p>
              <button type="button" className="secondaryButton"
                disabled={!nativeGoogle.available || nativeGoogle.busy || Boolean(googleTransactionId)}
                onClick={() => void verifyGoogle()}>
                {nativeGoogle.busy ? t(messageKeys.authNativeWaiting) : t(messageKeys.authNativeContinue)}
              </button>
              {nativeGoogle.busy || googleTransactionId ? <button type="button" className="secondaryButton"
                disabled={nativeGoogle.snapshot?.committing}
                onClick={() => { setGoogleTransactionId(null); void nativeGoogle.cancel(); }}>
                {t(messageKeys.authNativeCancel)}
              </button> : null}
            </div> : <>
            <p className="setupRuntimeNote">
              {t(messageKeys.setupWizardAdminCredentialsHint)}
            </p>
            <label className="fieldLabel">
              <span>{t(messageKeys.setupWizardAdminIdentifierLabel)}</span>
              <input
                className="textInput"
                value={adminIdentifier}
                type="email"
                onChange={(e) => setAdminIdentifier(e.target.value)}
                placeholder={t(messageKeys.setupWizardAdminIdentifierPlaceholder)}
                autoComplete="username"
              />
            </label>
            <label className="fieldLabel">
              <span>{t(messageKeys.setupWizardAdminPasswordLabel)}</span>
              <input
                className="textInput"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder={t(messageKeys.setupWizardAdminPasswordPlaceholder)}
                autoComplete="new-password"
              />
            </label>
            </>}
            {feedback ? <p className="feedbackText">{feedback}</p> : null}
            <button
              className="primaryButton setupPrimaryButton"
              disabled={!canContinueOwnerStep}
              type="button"
              onClick={() => setStep(nextSetupStep(step))}
            >
              {t(messageKeys.setupWizardGetStartedButton)}
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">
              {t(messageKeys.setupWizardStepIndicator, {
                step: 2,
                total: 2,
              })}
            </p>
            <h1>{t(messageKeys.setupWizardEnableGuideTitle, { guideCatName })}</h1>
            <p className="heroNote">
              {t(messageKeys.setupWizardEnableGuideSubtitle)}
            </p>
            <label className="setupCheckboxLabel">
              <input
                type="checkbox"
                className="setupCheckbox"
                checked={createGuideCat}
                onChange={(e) => setCreateGuideCat(e.target.checked)}
              />
              <span>{t(messageKeys.setupWizardEnableGuideLabel, { guideCatName })}</span>
            </label>
            {createGuideCat ? (
              <GuideCatSetupFields
                provider={provider}
                instance={instance}
                model={model}
                modelSelection={modelSelection}
                runtimeReachable={envelope.runtime.reachable}
                onTargetChange={(target) => {
                  setProvider(target.provider);
                  setInstance(target.instance);
                  setModel(target.model);
                  setModelSelection(target.modelSelection ?? null);
                }}
              />
            ) : (
              <p className="setupRuntimeNote">
                {t(messageKeys.setupWizardSkipGuideMessage, { guideCatName })}
              </p>
            )}
            {feedback ? <p className="feedbackText">{feedback}</p> : null}
            <div className="setupActions">
              <button
                className="setupBackButton"
                type="button"
                disabled={busy}
                onClick={() => setStep(previousSetupStep(step))}
              >
                {t(messageKeys.setupWizardBackButton)}
              </button>
              <button
                className="primaryButton setupPrimaryButton"
                disabled={busy || !canContinueGuideCatStep}
                type="button"
                onClick={() => void finishSetup()}
              >
                {busyAction === 'complete'
                  ? t(messageKeys.setupWizardOpeningCatsAction)
                  : t(messageKeys.setupWizardOpenCatsAction)}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
