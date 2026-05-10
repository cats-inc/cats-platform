import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlatformHostEnvelope } from '../../../shared/platform-contract';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
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
  const [createGuideCat, setCreateGuideCat] = useState(false);
  const [provider, setProvider] = useState('claude');
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
    ownerName.trim() && adminIdentifier.trim() && adminPassword,
  );
  const canContinueGuideCatStep = canContinueGuideCatSetupStep({
    createGuideCat,
    model,
  });
  const attemptId = envelope.bootstrapAttemptId ?? null;

  const finishSetup = useCallback(async (): Promise<void> => {
    setBusyAction('complete');
    setFeedback('');
    try {
      const result = await completePlatformSetup({
        attemptId,
        ownerDisplayName: ownerName.trim(),
        adminIdentifier: adminIdentifier.trim(),
        adminPassword,
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
          internal_error: t(messageKeys.setupWizardServerError),
        },
      });
      await syncDesktopHostPlatformShell(result);
      onComplete(result);
    } catch (error) {
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
    instance,
    model,
    modelSelection,
    onComplete,
    ownerName,
    provider,
    attemptId,
    t,
  ]);

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
    void prefetchProviderRegistryFromClientCache();
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
            <p className="setupRuntimeNote">
              {t(messageKeys.setupWizardAdminCredentialsHint)}
            </p>
            <label className="fieldLabel">
              <span>{t(messageKeys.setupWizardAdminIdentifierLabel)}</span>
              <input
                className="textInput"
                value={adminIdentifier}
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
