import { useCallback, useEffect, useState } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import type { AssistantPresetRecord, GuideCatRecord } from '../../../core/types.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { CatCreationFields } from '../setup/CatCreationFields.js';
import { buildExecutionLabel } from '../../../shared/executionLabel.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';
import {
  isGuideCatEnabledStatus,
  resolveClientGuideCatName,
} from '../../../shared/guideCatIdentity.js';

export interface SettingsAssistantsProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

interface GuideCatFormState {
  provider: string;
  instance: string;
  model: string;
  modelSelection: ProviderModelSelection | null;
}

interface AssistantPresetFormState extends GuideCatFormState {
  name: string;
  roleHint: string;
}

function guideCatFormStateFromRecord(record: GuideCatRecord | null): GuideCatFormState {
  return {
    provider: record?.executionTarget.provider ?? 'claude',
    instance: record?.executionTarget.instance ?? '',
    model: record?.executionTarget.model ?? '',
    modelSelection: record?.modelSelection ?? null,
  };
}

function assistantPresetFormStateFromRecord(
  record: AssistantPresetRecord | null,
): AssistantPresetFormState {
  return {
    name: record?.name ?? 'Assistant',
    provider: record?.executionTarget.provider ?? 'claude',
    instance: record?.executionTarget.instance ?? '',
    model: record?.executionTarget.model ?? '',
    modelSelection: record?.modelSelection ?? null,
    roleHint: record?.roleHint ?? '',
  };
}

function formatTimestamps(record: { createdAt: string; updatedAt: string }): string {
  const created = `Created ${new Date(record.createdAt).toLocaleDateString()}`;
  if (record.updatedAt === record.createdAt) {
    return created;
  }
  return `${created} \u00b7 Updated ${new Date(record.updatedAt).toLocaleDateString()}`;
}

export function SettingsAssistants({
  payload,
  onPayloadUpdate,
}: SettingsAssistantsProps) {
  const guideCat = payload.guideCat ?? null;
  const guideCatName = resolveClientGuideCatName();
  const guideCatEnabled = guideCat ? isGuideCatEnabledStatus(guideCat.status) : false;
  const assistantPresets = payload.assistantPresets ?? [];
  const [guideForm, setGuideForm] = useState<GuideCatFormState>(() =>
    guideCatFormStateFromRecord(guideCat),
  );
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideFeedback, setGuideFeedback] = useState('');
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(
    assistantPresets[0]?.id ?? null,
  );
  const selectedAssistant = assistantPresets.find(
    (assistant) => assistant.id === selectedAssistantId,
  ) ?? null;
  const [assistantForm, setAssistantForm] = useState<AssistantPresetFormState>(() =>
    assistantPresetFormStateFromRecord(selectedAssistant),
  );
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantFeedback, setAssistantFeedback] = useState('');

  useEffect(() => {
    setGuideForm(guideCatFormStateFromRecord(guideCat));
  }, [guideCat]);

  useEffect(() => {
    if (
      selectedAssistantId
      && !assistantPresets.some((assistant) => assistant.id === selectedAssistantId)
    ) {
      setSelectedAssistantId(assistantPresets[0]?.id ?? null);
    }
  }, [assistantPresets, selectedAssistantId]);

  useEffect(() => {
    setAssistantForm(assistantPresetFormStateFromRecord(selectedAssistant));
  }, [selectedAssistant]);

  const canSaveGuide = guideForm.provider.trim().length > 0
    && guideForm.model.trim().length > 0;
  const canSaveAssistant = assistantForm.name.trim().length > 0
    && assistantForm.provider.trim().length > 0
    && assistantForm.model.trim().length > 0;

  const saveGuideConfig = useCallback(async (): Promise<GuideCatRecord> => {
    const response = await fetch('/api/platform/guide-cat', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        provider: guideForm.provider,
        instance: guideForm.instance || null,
        model: guideForm.model || null,
        modelSelection: guideForm.modelSelection,
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
    return result.guideCat;
  }, [guideForm.instance, guideForm.model, guideForm.modelSelection, guideForm.provider]);

  const patchGuideStatus = useCallback(async (
    status: 'active' | 'dismissed',
  ): Promise<GuideCatRecord> => {
    const response = await fetch('/api/platform/guide-cat', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(
        (errorPayload as { error?: { message?: string } } | null)?.error?.message
        ?? `Status update failed (${response.status})`,
      );
    }
    const result = (await response.json()) as { guideCat: GuideCatRecord };
    return result.guideCat;
  }, []);

  const handleSaveGuide = useCallback(async () => {
    setGuideBusy(true);
    setGuideFeedback('');
    try {
      const nextGuideCat = await saveGuideConfig();
      onPayloadUpdate({ ...payload, guideCat: nextGuideCat });
      dispatchPlatformEnvelopeRefresh();
      setGuideFeedback('Saved.');
    } catch (error) {
      setGuideFeedback(error instanceof Error ? error.message : 'Failed to save Guide Cat.');
    } finally {
      setGuideBusy(false);
    }
  }, [onPayloadUpdate, payload, saveGuideConfig]);

  const handleEnableGuide = useCallback(async () => {
    setGuideBusy(true);
    setGuideFeedback('');
    try {
      let nextGuideCat = guideCat;
      if (!nextGuideCat) {
        nextGuideCat = await saveGuideConfig();
      } else if (!isGuideCatEnabledStatus(nextGuideCat.status)) {
        nextGuideCat = await saveGuideConfig();
        nextGuideCat = await patchGuideStatus('active');
      }
      if (!nextGuideCat) {
        throw new Error('Failed to enable Guide Cat.');
      }
      onPayloadUpdate({ ...payload, guideCat: nextGuideCat });
      dispatchPlatformEnvelopeRefresh();
      setGuideFeedback('Guide Cat enabled.');
    } catch (error) {
      setGuideFeedback(error instanceof Error ? error.message : 'Failed to enable Guide Cat.');
    } finally {
      setGuideBusy(false);
    }
  }, [guideCat, onPayloadUpdate, patchGuideStatus, payload, saveGuideConfig]);

  const handleDisableGuide = useCallback(async () => {
    if (!guideCat) {
      return;
    }
    setGuideBusy(true);
    setGuideFeedback('');
    try {
      const nextGuideCat = await patchGuideStatus('dismissed');
      onPayloadUpdate({ ...payload, guideCat: nextGuideCat });
      dispatchPlatformEnvelopeRefresh();
      setGuideFeedback('Guide Cat disabled.');
    } catch (error) {
      setGuideFeedback(error instanceof Error ? error.message : 'Failed to disable Guide Cat.');
    } finally {
      setGuideBusy(false);
    }
  }, [guideCat, onPayloadUpdate, patchGuideStatus, payload]);

  const handleSelectAssistant = useCallback((assistantId: string | null) => {
    setSelectedAssistantId(assistantId);
    setAssistantFeedback('');
    if (assistantId === null) {
      setAssistantForm(assistantPresetFormStateFromRecord(null));
    }
  }, []);

  const handleSaveAssistant = useCallback(async () => {
    setAssistantBusy(true);
    setAssistantFeedback('');
    const isEditing = Boolean(selectedAssistant);
    try {
      const response = await fetch(
        isEditing
          ? `/api/platform/assistants/${selectedAssistant!.id}`
          : '/api/platform/assistants',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name: assistantForm.name.trim(),
            provider: assistantForm.provider,
            instance: assistantForm.instance || null,
            model: assistantForm.model || null,
            modelSelection: assistantForm.modelSelection,
            roleHint: assistantForm.roleHint.trim() || null,
          }),
        },
      );
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(
          (errorPayload as { error?: { message?: string } } | null)?.error?.message
          ?? `Save failed (${response.status})`,
        );
      }
      const result = (await response.json()) as {
        assistant: AssistantPresetRecord;
        assistants: AssistantPresetRecord[];
      };
      onPayloadUpdate({ ...payload, assistantPresets: result.assistants });
      setSelectedAssistantId(result.assistant.id);
      setAssistantForm(assistantPresetFormStateFromRecord(result.assistant));
      setAssistantFeedback(isEditing ? 'Assistant updated.' : 'Assistant saved.');
    } catch (error) {
      setAssistantFeedback(error instanceof Error ? error.message : 'Failed to save assistant.');
    } finally {
      setAssistantBusy(false);
    }
  }, [assistantForm, onPayloadUpdate, payload, selectedAssistant]);

  const handleDeleteAssistant = useCallback(async () => {
    if (!selectedAssistant) {
      return;
    }
    setAssistantBusy(true);
    setAssistantFeedback('');
    try {
      const response = await fetch(`/api/platform/assistants/${selectedAssistant.id}`, {
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
      const result = (await response.json()) as {
        assistants: AssistantPresetRecord[];
      };
      onPayloadUpdate({ ...payload, assistantPresets: result.assistants });
      setSelectedAssistantId(null);
      setAssistantForm(assistantPresetFormStateFromRecord(null));
      setAssistantFeedback('Assistant removed.');
    } catch (error) {
      setAssistantFeedback(error instanceof Error ? error.message : 'Failed to remove assistant.');
    } finally {
      setAssistantBusy(false);
    }
  }, [onPayloadUpdate, payload, selectedAssistant]);

  return (
    <div className="catsLayout">
      <section className="contentCard">
        <div className="contentCardHeader">
          <div>
            <p className="sectionLabel">Guide Cat</p>
            <h2>{guideCatName}</h2>
          </div>
          <span className={guideCatEnabled ? 'statusChip statusChipReady' : 'statusChip statusChipWarm'}>
            {guideCatEnabled ? 'Enabled' : 'Disabled'}
          </span>
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
            {!guideCatEnabled ? (
              <p className="muted">
                {guideCatName} is currently disabled. Enable it again here whenever you want the
                floating helper back.
              </p>
            ) : null}
            <p className="muted">{formatTimestamps(guideCat)}</p>
          </div>
        ) : (
          <p className="settingsCardNote">
            {guideCatName} is currently disabled. Enable it to help across Chat, Work, and Code.
          </p>
        )}
      </section>

      <section className="contentCard contentCardForm">
        <div className="contentCardHeader">
          <div>
            <p className="sectionLabel">{guideCatEnabled ? 'Edit' : 'Enable'}</p>
            <h2>{guideCatName}</h2>
          </div>
        </div>
        <div className="stackForm">
          <CatCreationFields
            name={guideCatName}
            onNameChange={() => {}}
            nameReadOnly
            provider={guideForm.provider}
            instance={guideForm.instance}
            model={guideForm.model}
            modelSelection={guideForm.modelSelection}
            onTargetChange={(target) =>
              setGuideForm((prev) => ({
                ...prev,
                provider: target.provider,
                instance: target.instance,
                model: target.model,
                modelSelection: target.modelSelection ?? null,
              }))}
            nameLabel="Guide Cat name"
            namePlaceholder={guideCatName}
            nameHint="Cats keeps this name fixed. It can vary by app language later."
            hideMakeBoss
            hideProductToggles
          />
          {guideFeedback ? <p className="feedbackText">{guideFeedback}</p> : null}
          <div className="settingsActionRow">
            {!guideCatEnabled ? (
              <button
                className="primaryButton"
                type="button"
                disabled={guideBusy || !canSaveGuide}
                onClick={() => void handleEnableGuide()}
              >
                {guideBusy ? 'Saving...' : `Enable ${guideCatName}`}
              </button>
            ) : null}
            <button
              className={guideCatEnabled ? 'primaryButton' : 'secondaryButton'}
              type="button"
              disabled={guideBusy || !canSaveGuide}
              onClick={() => void handleSaveGuide()}
            >
              {guideBusy ? 'Saving...' : 'Save changes'}
            </button>
            {guideCatEnabled ? (
              <button
                className="secondaryButton"
                type="button"
                disabled={guideBusy}
                onClick={() => void handleDisableGuide()}
              >
                Disable
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="contentCard">
        <div className="contentCardHeader">
          <div>
            <p className="sectionLabel">Saved Assistants</p>
            <h2>
              {assistantPresets.length > 0
                ? `${assistantPresets.length} saved`
                : 'No saved assistants yet'}
            </h2>
          </div>
          {assistantPresets.length > 0 ? (
            <span className="statusChip statusChipReady">{assistantPresets.length}</span>
          ) : null}
        </div>
        {assistantPresets.length > 0 ? (
          <div className="stackForm">
            {assistantPresets.map((assistant) => (
              <div key={assistant.id} className="settingsCardNote">
                <p>
                  <strong>{assistant.name}</strong>
                </p>
                <p>
                  {buildExecutionLabel(
                    assistant.executionTarget.provider,
                    assistant.executionTarget.instance,
                    assistant.executionTarget.model,
                  )}
                </p>
                {assistant.roleHint ? <p className="muted">{assistant.roleHint}</p> : null}
                <p className="muted">{formatTimestamps(assistant)}</p>
                <div className="settingsActionRow">
                  <button
                    className="secondaryButton"
                    type="button"
                    onClick={() => handleSelectAssistant(assistant.id)}
                  >
                    {selectedAssistant?.id === assistant.id ? 'Editing' : 'Edit'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="settingsCardNote">
            Saved assistants are reusable lightweight presets for group chats. Channel-only
            temporary participants stay inside the room.
          </p>
        )}
      </section>

      <section className="contentCard contentCardForm">
        <div className="contentCardHeader">
          <div>
            <p className="sectionLabel">{selectedAssistant ? 'Edit' : 'Create'}</p>
            <h2>{selectedAssistant ? selectedAssistant.name : 'Assistant preset'}</h2>
          </div>
        </div>
        <div className="stackForm">
          <label className="fieldLabel">
            <span>Role hint</span>
            <textarea
              className="textInput"
              rows={3}
              value={assistantForm.roleHint}
              placeholder="Reviewer, debugger, copy editor, API specialist..."
              onChange={(event) =>
                setAssistantForm((prev) => ({ ...prev, roleHint: event.target.value }))}
            />
            <span className="fieldHint">
              Lightweight display guidance only. This slice does not treat it as a full persona.
            </span>
          </label>
          <CatCreationFields
            name={assistantForm.name}
            onNameChange={(name) => setAssistantForm((prev) => ({ ...prev, name }))}
            provider={assistantForm.provider}
            instance={assistantForm.instance}
            model={assistantForm.model}
            modelSelection={assistantForm.modelSelection}
            onTargetChange={(target) =>
              setAssistantForm((prev) => ({
                ...prev,
                provider: target.provider,
                instance: target.instance,
                model: target.model,
                modelSelection: target.modelSelection ?? null,
              }))}
            nameLabel="Assistant name"
            namePlaceholder="Assistant"
            nameHint="Reusable lightweight preset for group chat. It does not create a full Cat."
            hideMakeBoss
            hideProductToggles
          />
          {assistantFeedback ? <p className="feedbackText">{assistantFeedback}</p> : null}
          <div className="settingsActionRow">
            <button
              className="primaryButton"
              type="button"
              disabled={assistantBusy || !canSaveAssistant}
              onClick={() => void handleSaveAssistant()}
            >
              {assistantBusy
                ? 'Saving...'
                : selectedAssistant
                  ? 'Save changes'
                  : 'Create assistant'}
            </button>
            <button
              className="secondaryButton"
              type="button"
              disabled={assistantBusy}
              onClick={() => handleSelectAssistant(null)}
            >
              New assistant
            </button>
            {selectedAssistant ? (
              <button
                className="dangerButton"
                type="button"
                disabled={assistantBusy}
                onClick={() => void handleDeleteAssistant()}
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
