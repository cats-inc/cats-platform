import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../../../shared/app-shell';
import { NEW_CHAT_PATH } from '../../../../shared/channelPaths';
import { completeSetup } from '../api';
import { ProviderModelFields } from './ProviderModelFields';

type SetupStep = 1 | 2 | 3;

const TOTAL_STEPS = 3;

export function SetupWizard({
  payload,
  onComplete,
}: {
  payload: AppShellPayload;
  onComplete: (payload: AppShellPayload) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<SetupStep>(1);
  const [provider, setProvider] = useState('claude');
  const [instance, setInstance] = useState('');
  const [model, setModel] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [bossCatName, setBossCatName] = useState('Boss Cat');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  async function finishSetup(): Promise<void> {
    setBusy(true);
    setFeedback('');
    try {
      const result = await completeSetup({
        ownerDisplayName: ownerName.trim(),
        bossCatName: bossCatName.trim() || undefined,
        bossCatProvider: provider,
        bossCatInstance: instance || undefined,
        bossCatModel: model || undefined,
      });
      onComplete(result);
      navigate(NEW_CHAT_PATH, { replace: true });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Setup failed.');
    } finally {
      setBusy(false);
    }
  }

  const dots = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);

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
            <p className="eyebrow">Cats Chat</p>
            <h1>Welcome to Cats Chat</h1>
            <p className="heroNote">
              Your personal AI companion space. Let&apos;s get you set up &mdash; it only takes a moment.
            </p>
            <button
              className="primaryButton"
              type="button"
              onClick={() => setStep(2)}
            >
              Get started
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">Step 1 of 2</p>
            <h1>What&apos;s your name?</h1>
            <p className="heroNote">
              Tell us your name, and give your Boss Cat a name if you&apos;d like.
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
            <label className="fieldLabel">
              <span>Boss Cat name</span>
              <input
                className="textInput"
                value={bossCatName}
                onChange={(e) => setBossCatName(e.target.value)}
                placeholder="Boss Cat"
              />
              <span className="fieldHint">Your personal AI agent that manages tasks and coordinates other cats.</span>
            </label>
            {feedback ? <p className="feedbackText">{feedback}</p> : null}
            <div className="setupActions">
              <button
                className="setupBackButton"
                type="button"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                className="primaryButton"
                disabled={!ownerName.trim()}
                type="button"
                onClick={() => setStep(3)}
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="contentCard setupCard">
            <p className="eyebrow">Step 2 of 2</p>
            <h1>Choose your AI provider</h1>
            <p className="heroNote">
              Select the AI provider and model your Boss Cat will use. You can change this later.
            </p>
            <ProviderModelFields
              provider={provider}
              instance={instance}
              model={model}
              onTargetChange={(target) => {
                setProvider(target.provider);
                setInstance(target.instance);
                setModel(target.model);
              }}
            />
            <div className="setupRuntimeStatus">
              <span
                className={
                  payload.runtime.reachable
                    ? 'statusChip statusChipReady'
                    : 'statusChip statusChipWarm'
                }
              >
                {payload.runtime.reachable
                  ? 'Cats Runtime connected'
                  : 'Cats Runtime not detected'}
              </span>
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
              <button
                className="primaryButton"
                disabled={!model.trim() || busy}
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
