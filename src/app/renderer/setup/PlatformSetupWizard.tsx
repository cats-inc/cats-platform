import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlatformHostEnvelope } from '../../../shared/platform-contract';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
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
  const [createGuideCat, setCreateGuideCat] = useState(false);
  const [provider, setProvider] = useState('claude');
  const [instance, setInstance] = useState('');
  const [model, setModel] = useState('');
  const [modelSelection, setModelSelection] = useState<ProviderModelSelection | null>(null);
  const [busyAction, setBusyAction] = useState<PendingAction>(null);
  const [feedback, setFeedback] = useState('');
  const setupOpenedRecorded = useRef(false);

  const busy = busyAction !== null;
  const guideCatName = resolveClientGuideCatName();
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
        createGuideCat,
        guideCatProvider: createGuideCat ? provider : undefined,
        guideCatInstance: createGuideCat ? (instance || undefined) : undefined,
        guideCatModel: createGuideCat ? (model || undefined) : undefined,
        guideCatModelSelection: createGuideCat ? modelSelection : undefined,
      });
      await syncDesktopHostPlatformShell(result);
      onComplete(result);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Setup failed.');
    } finally {
      setBusyAction(null);
    }
  }, [
    createGuideCat,
    instance,
    model,
    modelSelection,
    onComplete,
    ownerName,
    provider,
    attemptId,
  ]);

  useEffect(() => {
    if (setupOpenedRecorded.current) {
      return;
    }
    setupOpenedRecorded.current = true;
    void markPlatformSetupOpened(attemptId).catch(() => undefined);
  }, [attemptId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Enter' || busy) {
        return;
      }
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (step === 1 && !ownerName.trim()) {
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
  }, [busy, canContinueGuideCatStep, finishSetup, ownerName, step]);

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
            <p className="eyebrow">Cats Inc</p>
            <h1>Welcome to Cats</h1>
            <p className="heroNote">
              Your personal AI workspace. Let&apos;s get you set up; it only takes a moment.
            </p>
            <label className="fieldLabel">
              <span>Your name</span>
              <input
                className="textInput"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Your display name"
                autoFocus
              />
            </label>
            {feedback ? <p className="feedbackText">{feedback}</p> : null}
            <button
              className="primaryButton setupPrimaryButton"
              disabled={!ownerName.trim()}
              type="button"
              onClick={() => setStep(nextSetupStep(step))}
            >
              Get started
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">Step 2 of 2</p>
            <h1>Enable your {guideCatName}</h1>
            <p className="heroNote">
              This optional helper can support you across Chat, Work, and Code.
            </p>
            <label className="setupCheckboxLabel">
              <input
                type="checkbox"
                className="setupCheckbox"
                checked={createGuideCat}
                onChange={(e) => setCreateGuideCat(e.target.checked)}
              />
              <span>Enable {guideCatName}</span>
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
                You can skip this for now and enable {guideCatName} later from Settings &gt; Assistants.
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
                Back
              </button>
              <button
                className="primaryButton setupPrimaryButton"
                disabled={busy || !canContinueGuideCatStep}
                type="button"
                onClick={() => void finishSetup()}
              >
                {busyAction === 'complete' ? 'Opening Cats...' : 'Open Cats'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
