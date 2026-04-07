import { useCallback, useState } from 'react';

import type { AppShellPayload } from '../../../products/chat/api/contracts.js';
import type { GuideCatRecord } from '../../../core/types.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { CatCreationFields } from '../setup/CatCreationFields.js';
import { buildExecutionLabel } from '../../../shared/executionLabel.js';

export interface SettingsAssistantsProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

interface GuideCatFormState {
  name: string;
  provider: string;
  instance: string;
  model: string;
  modelSelection: ProviderModelSelection | null;
}

function formStateFromRecord(record: GuideCatRecord | null): GuideCatFormState {
  return {
    name: record?.name ?? 'Guide Cat',
    provider: record?.executionTarget.provider ?? 'claude',
    instance: record?.executionTarget.instance ?? '',
    model: record?.executionTarget.model ?? '',
    modelSelection: record?.modelSelection ?? null,
  };
}

export function SettingsAssistants({
  payload,
  onPayloadUpdate,
}: SettingsAssistantsProps) {
  const guideCat = payload.guideCat ?? null;
  const [form, setForm] = useState<GuideCatFormState>(() => formStateFromRecord(guideCat));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const canSave = form.name.trim().length > 0 && form.provider.trim().length > 0 && form.model.trim().length > 0;

  const handleSave = useCallback(async () => {
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch('/api/platform/guide-cat', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          provider: form.provider,
          instance: form.instance || null,
          model: form.model || null,
          modelSelection: form.modelSelection,
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(
          (errorPayload as { error?: { message?: string } } | null)?.error?.message
          ?? `Save failed (${response.status})`,
        );
      }
      const result = (await response.json()) as { guideCat: GuideCatRecord };
      onPayloadUpdate({ ...payload, guideCat: result.guideCat });
      setFeedback('Saved.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to save Guide Cat.');
    } finally {
      setBusy(false);
    }
  }, [form, onPayloadUpdate, payload]);

  const handleDelete = useCallback(async () => {
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch('/api/platform/guide-cat', {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(
          (errorPayload as { error?: { message?: string } } | null)?.error?.message
          ?? `Delete failed (${response.status})`,
        );
      }
      onPayloadUpdate({ ...payload, guideCat: null });
      setForm(formStateFromRecord(null));
      setFeedback('Guide Cat removed.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to remove Guide Cat.');
    } finally {
      setBusy(false);
    }
  }, [onPayloadUpdate, payload]);

  return (
    <div className="catsLayout">
      <section className="contentCard">
        <div className="contentCardHeader">
          <div>
            <p className="sectionLabel">Guide Cat</p>
            <h2>{guideCat ? guideCat.name : 'No Guide Cat configured'}</h2>
          </div>
          {guideCat ? (
            <span className="statusChip statusChipReady">Active</span>
          ) : null}
        </div>

        {guideCat ? (
          <div className="settingsCardNote">
            <p>
              <strong>Target:</strong>{' '}
              {buildExecutionLabel(
                guideCat.executionTarget.provider,
                guideCat.executionTarget.instance,
                guideCat.executionTarget.model,
              )}
            </p>
            <p className="muted">
              Created {new Date(guideCat.createdAt).toLocaleDateString()}
              {guideCat.updatedAt !== guideCat.createdAt
                ? ` \u00b7 Updated ${new Date(guideCat.updatedAt).toLocaleDateString()}`
                : ''}
            </p>
          </div>
        ) : (
          <p className="settingsCardNote">
            You can create a Guide Cat to help you across Chat, Work, and Code.
          </p>
        )}
      </section>

      <section className="contentCard contentCardForm">
        <div className="contentCardHeader">
          <div>
            <p className="sectionLabel">{guideCat ? 'Edit' : 'Create'}</p>
            <h2>Guide Cat</h2>
          </div>
        </div>
        <div className="stackForm">
          <CatCreationFields
            name={form.name}
            onNameChange={(name) => setForm((prev) => ({ ...prev, name }))}
            provider={form.provider}
            instance={form.instance}
            model={form.model}
            modelSelection={form.modelSelection}
            onTargetChange={(target) =>
              setForm((prev) => ({
                ...prev,
                provider: target.provider,
                instance: target.instance,
                model: target.model,
                modelSelection: target.modelSelection ?? null,
              }))}
            nameLabel="Guide Cat name"
            namePlaceholder="Guide Cat"
            nameHint="An optional helper Cat that supports you across Chat, Work, and Code."
            hideMakeBoss
            hideProductToggles
          />
          {feedback ? <p className="feedbackText">{feedback}</p> : null}
          <div className="settingsActionRow">
            <button
              className="primaryButton"
              type="button"
              disabled={busy || !canSave}
              onClick={() => void handleSave()}
            >
              {busy ? 'Saving...' : guideCat ? 'Save changes' : 'Create Guide Cat'}
            </button>
            {guideCat ? (
              <button
                className="dangerButton"
                type="button"
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
