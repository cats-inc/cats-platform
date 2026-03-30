import { useCallback, useEffect, useState } from 'react';

import type { SuiteHostEnvelope } from '../../../shared/suite-contract';
import type { SuiteSurfaceId } from '../../../shared/suite-contract';
import type { RuntimeSetupSummary } from '../../../shared/runtimeSetup.js';
import {
  applyRuntimeSetup,
  completeSuiteSetup,
  fetchRuntimeSetup,
  scanRuntimeSetup,
} from './api';
import { getSuiteSetupPlugins } from './plugins';
import type { ProductSetupPlugin } from './types';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { createUnavailableRuntimeSetupSummary } from '../../../runtime/setup.js';

type SetupStep = 1 | 2 | 3 | 4;
type PendingAction =
  | 'complete'
  | 'refresh_runtime'
  | 'scan_runtime'
  | 'apply_runtime'
  | null;

function createInitialRuntimeSetup(
  envelope: SuiteHostEnvelope,
): RuntimeSetupSummary {
  return envelope.runtimeSetup ?? createUnavailableRuntimeSetupSummary(
    new Error('Cats Runtime setup was missing from the suite envelope.'),
  );
}

function resolveRuntimeStatusChip(
  runtimeSetup: RuntimeSetupSummary,
): { className: string; label: string } {
  switch (runtimeSetup.status) {
    case 'ready':
      return {
        className: 'statusChip statusChipReady',
        label: 'Runtime ready',
      };
    case 'ready_to_apply':
      return {
        className: 'statusChip statusChipWarm',
        label: 'Ready to apply',
      };
    case 'attention_required':
      return {
        className: 'statusChip statusChipWarm',
        label: 'Needs remediation',
      };
    case 'scan_required':
      return {
        className: 'statusChip statusChipWarm',
        label: 'Scan required',
      };
    case 'unavailable':
    default:
      return {
        className: 'statusChip statusChipWarm',
        label: 'Runtime unavailable',
      };
  }
}

function formatRuntimeTimestamp(timestamp: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString();
}

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
  const [modelSelection, setModelSelection] = useState<ProviderModelSelection | null>(null);
  const [busyAction, setBusyAction] = useState<PendingAction>(null);
  const [feedback, setFeedback] = useState('');
  const [runtimeSetup, setRuntimeSetup] = useState<RuntimeSetupSummary>(() =>
    createInitialRuntimeSetup(envelope),
  );

  const busy = busyAction !== null;
  const plugins = getSuiteSetupPlugins();
  const selectedPlugin = plugins.find((plugin) => plugin.surface === selectedProduct);
  const showBossCatStep = Boolean(createFirstCat && selectedPlugin?.hasConditionalStep);
  const totalSteps = showBossCatStep ? 4 : 3;
  const runtimeReady = runtimeSetup.status === 'ready' && runtimeSetup.bootstrapRequired === false;
  const canFinishBossCatStep = selectedPlugin?.validateConditionalStep
    ? selectedPlugin.validateConditionalStep({
        provider,
        instance,
        model,
        modelSelection,
        catName: bossCatName,
      })
    : true;
  const runtimeStatusChip = resolveRuntimeStatusChip(runtimeSetup);
  const scannedAt = formatRuntimeTimestamp(runtimeSetup.scannedAt);
  const appliedAt = formatRuntimeTimestamp(runtimeSetup.appliedAt);

  const refreshRuntimeSetup = useCallback(async (options: {
    manual?: boolean;
    silent?: boolean;
  } = {}): Promise<void> => {
    if (!options.silent) {
      setBusyAction(options.manual ? 'scan_runtime' : 'refresh_runtime');
      setFeedback('');
    }

    try {
      const nextSummary = options.manual
        ? await scanRuntimeSetup({ manual: true })
        : await fetchRuntimeSetup();
      setRuntimeSetup(nextSummary);
    } catch (error) {
      if (!options.silent) {
        setFeedback(error instanceof Error ? error.message : 'Failed to refresh runtime setup.');
      }
    } finally {
      if (!options.silent) {
        setBusyAction(null);
      }
    }
  }, []);

  const applyReadyProviders = useCallback(async (): Promise<void> => {
    setBusyAction('apply_runtime');
    setFeedback('');
    try {
      const nextSummary = await applyRuntimeSetup({
        providers: runtimeSetup.suggestedProviders,
      });
      setRuntimeSetup(nextSummary);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to apply runtime setup.');
    } finally {
      setBusyAction(null);
    }
  }, [runtimeSetup.suggestedProviders]);

  const finishSetup = useCallback(async (): Promise<void> => {
    setBusyAction('complete');
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
        bossCatModelSelection: createFirstCat ? modelSelection : undefined,
      });
      onComplete(result);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Setup failed.');
    } finally {
      setBusyAction(null);
    }
  }, [
    bossCatName,
    createFirstCat,
    instance,
    model,
    modelSelection,
    onComplete,
    ownerName,
    provider,
    selectedProduct,
  ]);

  useEffect(() => {
    if (step !== 3) {
      return;
    }
    void refreshRuntimeSetup({ silent: true });
  }, [step, refreshRuntimeSetup]);

  useEffect(() => {
    if (showBossCatStep || step !== 4) {
      return;
    }
    setStep(3);
  }, [showBossCatStep, step]);

  useEffect(() => {
    if (!showBossCatStep) {
      return;
    }

    const readyProviders = runtimeSetup.providersReadyToApply.map((entry) => entry.provider);
    if (readyProviders.length === 0 || readyProviders.includes(provider)) {
      return;
    }

    setProvider(readyProviders[0]!);
    setInstance('');
    setModel('');
    setModelSelection(null);
  }, [provider, runtimeSetup.providersReadyToApply, showBossCatStep]);

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
      if (step === 4 && !canFinishBossCatStep) {
        return;
      }
      if (step === 3 && !runtimeReady) {
        return;
      }

      e.preventDefault();
      if (step === 1) {
        setStep(2);
      } else if (step === 2) {
        setStep(3);
      } else if (step === 3) {
        if (showBossCatStep) {
          setStep(4);
        } else {
          void finishSetup();
        }
      } else if (step === 4) {
        void finishSetup();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, canFinishBossCatStep, finishSetup, ownerName, runtimeReady, showBossCatStep, step]);

  const dots = Array.from({ length: totalSteps }, (_, index) => index + 1);
  const runtimePrimaryDisabled = busy || (!runtimeReady && !runtimeSetup.canApply);
  const runtimePrimaryLabel = runtimeReady
    ? (showBossCatStep
      ? 'Continue'
      : busyAction === 'complete'
        ? 'Setting up...'
        : 'Finish setup')
    : busyAction === 'apply_runtime'
      ? 'Applying...'
      : 'Apply ready providers';

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
              {showBossCatStep ? 'Step 2 of 4' : 'Step 2 of 3'}
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
                  setFeedback('');
                  setStep(3);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">
              {showBossCatStep ? 'Step 3 of 4' : 'Step 3 of 3'}
            </p>
            <h1>Ready your runtime</h1>
            <p className="heroNote">
              Cats will finish setup only after Cats Runtime has a usable provider config.
            </p>

            <div className="setupRuntimePanel">
              <div className="setupRuntimeStatus">
                <span className={runtimeStatusChip.className}>{runtimeStatusChip.label}</span>
                <span className="setupRuntimeSummary">{runtimeSetup.summary}</span>
              </div>

              <div className="setupRuntimeMetrics">
                <div className="setupRuntimeMetric">
                  <strong>{runtimeSetup.availableCount}</strong>
                  <span>ready providers</span>
                </div>
                <div className="setupRuntimeMetric">
                  <strong>{runtimeSetup.providerCount}</strong>
                  <span>providers scanned</span>
                </div>
                <div className="setupRuntimeMetric">
                  <strong>{runtimeSetup.providersNeedingAttention.length}</strong>
                  <span>need attention</span>
                </div>
              </div>

              {runtimeSetup.providersReadyToApply.length > 0 ? (
                <div className="setupRuntimeSection">
                  <h2>Ready to apply</h2>
                  <ul className="setupRuntimeList">
                    {runtimeSetup.providersReadyToApply.map((entry) => (
                      <li key={entry.provider}>
                        <strong>{entry.provider}</strong>
                        <span>{entry.family}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {runtimeSetup.providersNeedingAttention.length > 0 ? (
                <div className="setupRuntimeSection">
                  <h2>Need attention</h2>
                  <ul className="setupRuntimeList">
                    {runtimeSetup.providersNeedingAttention.map((entry) => (
                      <li key={entry.provider}>
                        <strong>{entry.provider}</strong>
                        <span>
                          {entry.family}
                          {typeof entry.remediationCount === 'number'
                            ? ` • ${entry.remediationCount} fix step(s)`
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {appliedAt ? (
                <p className="setupRuntimeNote">Runtime config applied at {appliedAt}.</p>
              ) : scannedAt ? (
                <p className="setupRuntimeNote">Latest scan captured at {scannedAt}.</p>
              ) : null}

              <p className="setupRuntimeNote">
                Need deeper remediation?{' '}
                <a
                  href={`${envelope.runtime.baseUrl.replace(/\/$/, '')}/setup`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open standalone runtime setup
                </a>
                .
              </p>
            </div>

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
              <div className="setupActionGroup">
                <button
                  className="setupBackButton"
                  type="button"
                  disabled={busy}
                  onClick={() => void refreshRuntimeSetup()}
                >
                  {busyAction === 'refresh_runtime' ? 'Refreshing...' : 'Refresh'}
                </button>
                {runtimeSetup.canRunManualScan ? (
                  <button
                    className="setupBackButton"
                    type="button"
                    disabled={busy}
                    onClick={() => void refreshRuntimeSetup({ manual: true })}
                  >
                    {busyAction === 'scan_runtime' ? 'Scanning...' : 'Run scan'}
                  </button>
                ) : null}
                <button
                  className="primaryButton"
                  disabled={runtimePrimaryDisabled}
                  type="button"
                  onClick={() => {
                    if (runtimeReady) {
                      if (showBossCatStep) {
                        setStep(4);
                      } else {
                        void finishSetup();
                      }
                      return;
                    }
                    void applyReadyProviders();
                  }}
                >
                  {runtimeReady || runtimeSetup.canApply
                    ? runtimePrimaryLabel
                    : 'Resolve runtime setup first'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 && showBossCatStep ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">Step 4 of 4</p>
            <h1>Set up your first cat</h1>
            <p className="heroNote">
              Configure your Boss Cat. You can always change this later.
            </p>
            {selectedPlugin?.renderConditionalStep?.({
              provider,
              instance,
              model,
              modelSelection,
              catName: bossCatName,
              runtimeReachable: envelope.runtime.reachable,
              onTargetChange: (target) => {
                setProvider(target.provider);
                setInstance(target.instance);
                setModel(target.model);
                setModelSelection(target.modelSelection ?? null);
              },
              onCatNameChange: setBossCatName,
            })}
            {feedback ? <p className="feedbackText">{feedback}</p> : null}
            <div className="setupActions">
              <button
                className="setupBackButton"
                type="button"
                disabled={busy}
                onClick={() => setStep(3)}
              >
                Back
              </button>
              <button
                className="primaryButton"
                disabled={!canFinishBossCatStep || busy}
                type="button"
                onClick={() => void finishSetup()}
              >
                {busyAction === 'complete' ? 'Setting up...' : 'Finish setup'}
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
