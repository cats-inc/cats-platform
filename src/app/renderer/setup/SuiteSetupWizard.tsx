import { useCallback, useEffect, useRef, useState } from 'react';

import type { SuiteHostEnvelope } from '../../../shared/suite-contract';
import type { SuiteSurfaceId } from '../../../shared/suite-contract';
import { completeSuiteSetup } from './api';
import { getSuiteSetupPlugins } from './plugins';
import type { ProductSetupPlugin } from './types';

type SetupStep = 1 | 2 | 3;

export function SuiteSetupWizard({
  envelope,
  onComplete,
}: {
  envelope: SuiteHostEnvelope;
  onComplete: (envelope: SuiteHostEnvelope) => void;
}) {
  const [step, setStep] = useState<SetupStep>(1);
  const [ownerName, setOwnerName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<SuiteSurfaceId>('chat');
  const [createFirstCat, setCreateFirstCat] = useState(false);
  const [bossCatName, setBossCatName] = useState('Boss Cat');
  const [provider, setProvider] = useState('claude');
  const [instance, setInstance] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const plugins = getSuiteSetupPlugins();
  const selectedPlugin = plugins.find((p) => p.surface === selectedProduct);
  const showStep3 = createFirstCat && selectedPlugin?.hasConditionalStep;
  const totalSteps = showStep3 ? 3 : 2;

  const finishSetup = useCallback(async (): Promise<void> => {
    setBusy(true);
    setFeedback('');
    try {
      const result = await completeSuiteSetup({
        ownerDisplayName: ownerName.trim(),
        selectedProduct,
        createBossCat: createFirstCat,
        bossCatName: createFirstCat ? (bossCatName.trim() || undefined) : undefined,
        bossCatProvider: createFirstCat ? provider : undefined,
        bossCatInstance: createFirstCat ? (instance || undefined) : undefined,
        bossCatModel: createFirstCat ? (model || undefined) : undefined,
      });
      onComplete(result);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Setup failed.');
    } finally {
      setBusy(false);
    }
  }, [
    ownerName, selectedProduct, createFirstCat, bossCatName,
    provider, instance, model, onComplete,
  ]);

  const canFinishStep2 = !createFirstCat;
  const canFinishStep3 = selectedPlugin?.validateConditionalStep
    ? selectedPlugin.validateConditionalStep({ provider, instance, model, catName: bossCatName })
    : true;

  // Global Enter key handler — fires regardless of focus target.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Enter' || busy) {
        return;
      }
      // Don't hijack Enter inside <select> or <textarea> elements.
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      e.preventDefault();
      if (step === 1 && ownerName.trim()) {
        setStep(2);
      } else if (step === 2 && canFinishStep2) {
        void finishSetup();
      } else if (step === 2 && !canFinishStep2) {
        setStep(3);
      } else if (step === 3 && canFinishStep3) {
        void finishSetup();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [step, busy, ownerName, canFinishStep2, canFinishStep3, finishSetup]);

  const dots = Array.from({ length: totalSteps }, (_, i) => i + 1);

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
              Your personal AI workspace. Let&apos;s get you set up &mdash; it only takes a moment.
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
              className="primaryButton"
              disabled={!ownerName.trim()}
              type="button"
              onClick={() => setStep(2)}
            >
              Get started
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">
              {totalSteps === 2 ? 'Step 2 of 2' : 'Step 2 of 3'}
            </p>
            <h1>Choose your product</h1>
            <p className="heroNote">
              Pick which experience to start with.
            </p>
            <div className="setupProductGrid">
              {plugins.map((plugin) => (
                <ProductCard
                  key={plugin.surface}
                  plugin={plugin}
                  selected={selectedProduct === plugin.surface}
                  onSelect={() => {
                    if (plugin.enabled) {
                      setSelectedProduct(plugin.surface);
                      if (!plugin.hasConditionalStep) {
                        setCreateFirstCat(false);
                      }
                    }
                  }}
                />
              ))}
            </div>
            {selectedPlugin?.hasConditionalStep ? (
              <label className="setupCheckboxLabel">
                <input
                  type="checkbox"
                  className="setupCheckbox"
                  checked={createFirstCat}
                  onChange={(e) => setCreateFirstCat(e.target.checked)}
                />
                <span>Create my first cat</span>
              </label>
            ) : null}
            {feedback ? <p className="feedbackText">{feedback}</p> : null}
            <div className="setupActions">
              <button
                className="setupBackButton"
                type="button"
                disabled={busy}
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                className="primaryButton"
                disabled={busy}
                type="button"
                onClick={() => {
                  if (canFinishStep2) { void finishSetup(); }
                  else { setStep(3); }
                }}
              >
                {canFinishStep2
                  ? (busy ? 'Setting up...' : 'Finish setup')
                  : 'Continue'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 && showStep3 ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">Step 3 of 3</p>
            <h1>Set up your first cat</h1>
            <p className="heroNote">
              Configure your Boss Cat &mdash; you can always change this later.
            </p>
            {selectedPlugin?.renderConditionalStep?.({
              provider,
              instance,
              model,
              catName: bossCatName,
              runtimeReachable: envelope.runtime.reachable,
              onTargetChange: (target) => {
                setProvider(target.provider);
                setInstance(target.instance);
                setModel(target.model);
              },
              onCatNameChange: setBossCatName,
            })}
            {feedback ? <p className="feedbackText">{feedback}</p> : null}
            <div className="setupActions">
              <button
                className="setupBackButton"
                type="button"
                disabled={busy}
                onClick={() => setStep(2)}
              >
                Back
              </button>
              <button
                className="primaryButton"
                disabled={!canFinishStep3 || busy}
                type="button"
                onClick={() => void finishSetup()}
              >
                {busy ? 'Setting up...' : 'Finish setup'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProductCard({
  plugin,
  selected,
  onSelect,
}: {
  plugin: ProductSetupPlugin;
  selected: boolean;
  onSelect: () => void;
}) {
  const baseClass = 'setupProductCard';
  const className = !plugin.enabled
    ? `${baseClass} setupProductCardDisabled`
    : selected
      ? `${baseClass} setupProductCardSelected`
      : baseClass;

  return (
    <button
      type="button"
      className={className}
      disabled={!plugin.enabled}
      onClick={onSelect}
    >
      <span className="setupProductLabel">{plugin.label}</span>
      <span className="setupProductDescription">{plugin.description}</span>
      {plugin.disabledReason ? (
        <span className="setupDisabledReason">{plugin.disabledReason}</span>
      ) : null}
    </button>
  );
}
