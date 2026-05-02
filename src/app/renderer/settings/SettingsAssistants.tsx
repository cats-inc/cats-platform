import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import type { AssistantPresetRecord, GuideCatRecord } from '../../../core/types.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { ConfirmDialog, useConfirmDialog } from '../../../design/components/ConfirmDialog.js';
import { GUIDE_CAT_AVATAR_URL } from '../../../design/components/GuideCatSidecar.js';
import { ProviderModelBrainCard } from '../../../design/components/ProviderModelBrainCard.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import {
  SettingsActionBar,
  SettingsSection,
  SettingsSectionHeader,
  SettingsSubSection,
} from '../../../design/components/settings/index.js';
import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import {
  fetchAdvancedProviderModels,
  fetchProviderModels,
  fetchProviderRegistry,
} from '../../../products/shared/renderer/api/index.js';
import {
  isGuideCatEnabledStatus,
  resolveClientGuideCatName,
} from '../../../shared/guideCatIdentity.js';
import { useI18n } from '../i18n/index.js';
import { dispatchPlatformEnvelopeRefresh } from '../platformEnvelopeEvents.js';

export interface SettingsAssistantsProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

interface AssistantDraft {
  name: string;
  roleHint: string;
  provider: string;
  instance: string;
  model: string;
  modelSelection: ProviderModelSelection | null;
}

function assistantInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

export function SettingsAssistants({
  payload,
  onPayloadUpdate,
}: SettingsAssistantsProps) {
  const guideCat = payload.guideCat ?? null;
  const guideCatName = resolveClientGuideCatName();
  const guideCatEnabled = guideCat ? isGuideCatEnabledStatus(guideCat.status) : false;
  const assistantPresets = payload.assistantPresets ?? [];
  const runtimeSetupHref = `${payload.runtime.baseUrl.replace(/\/$/, '')}/setup`;

  const { t } = useI18n();
  const defaultAssistantName = t(messageKeys.settingsAssistantsNamePlaceholder);
  const emptyAssistantDraft = useCallback((): AssistantDraft => ({
    name: defaultAssistantName,
    roleHint: '',
    provider: 'claude',
    instance: '',
    model: '',
    modelSelection: null,
  }), [defaultAssistantName]);

  const { toasts, showToast } = useToast();
  const { dialog, confirm, handleClose } = useConfirmDialog();

  const [guideBusy, setGuideBusy] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);

  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(
    assistantPresets[0]?.id ?? null,
  );
  const selectedAssistant = useMemo(
    () => assistantPresets.find((a) => a.id === selectedAssistantId) ?? null,
    [assistantPresets, selectedAssistantId],
  );
  const [isCreatingAssistant, setIsCreatingAssistant] = useState<boolean>(
    () => assistantPresets.length === 0,
  );
  const [createDraft, setCreateDraft] = useState<AssistantDraft>(emptyAssistantDraft);

  useEffect(() => {
    if (selectedAssistantId
      && !assistantPresets.some((a) => a.id === selectedAssistantId)) {
      setSelectedAssistantId(assistantPresets[0]?.id ?? null);
    }
    if (assistantPresets.length === 0 && !isCreatingAssistant) {
      setIsCreatingAssistant(true);
    }
  }, [assistantPresets, isCreatingAssistant, selectedAssistantId]);

  const toastError = useCallback(
    (message: string) => { showToast(message); },
    [showToast],
  );

  // ── Guide Cat helpers ────────────────────────────────────────────────
  const commitGuideCat = useCallback(
    async (
      patch: Partial<{
        provider: string;
        instance: string | null;
        model: string | null;
        modelSelection: ProviderModelSelection | null;
      }>,
    ): Promise<boolean> => {
      setGuideBusy(true);
      try {
        const body = {
          provider: patch.provider ?? guideCat?.executionTarget.provider ?? 'claude',
          instance: patch.instance !== undefined
            ? patch.instance
            : guideCat?.executionTarget.instance ?? null,
          model: patch.model !== undefined
            ? patch.model
            : guideCat?.executionTarget.model ?? null,
          modelSelection: patch.modelSelection !== undefined
            ? patch.modelSelection
            : guideCat?.modelSelection ?? null,
        };
        const response = await fetch('/api/platform/guide-cat', {
          method: 'PUT',
          headers: { 'content-type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw new Error(
            (errorPayload as { error?: { message?: string } } | null)?.error?.message
              ?? t(messageKeys.settingsAssistantsSaveFailedWithError, {
                status: response.status,
              }),
          );
        }
        const result = (await response.json()) as { guideCat: GuideCatRecord };
        onPayloadUpdate({ ...payload, guideCat: result.guideCat });
        dispatchPlatformEnvelopeRefresh();
        return true;
      } catch (error) {
        toastError(error instanceof Error ? error.message : t(messageKeys.settingsAssistantsGuideCatSaveFailed));
        return false;
      } finally {
        setGuideBusy(false);
      }
    },
    [guideCat, onPayloadUpdate, payload, toastError, t],
  );

  const patchGuideStatus = useCallback(
    async (status: 'active' | 'dismissed'): Promise<boolean> => {
      setGuideBusy(true);
      try {
        const response = await fetch('/api/platform/guide-cat', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw new Error(
            (errorPayload as { error?: { message?: string } } | null)?.error?.message
              ?? t(messageKeys.settingsAssistantsStatusUpdateFailed, {
                status: response.status,
              }),
          );
        }
        const result = (await response.json()) as { guideCat: GuideCatRecord };
        onPayloadUpdate({ ...payload, guideCat: result.guideCat });
        dispatchPlatformEnvelopeRefresh();
        return true;
      } catch (error) {
        toastError(error instanceof Error ? error.message : t(messageKeys.settingsAssistantsGuideCatUpdateFailed));
        return false;
      } finally {
        setGuideBusy(false);
      }
    },
    [onPayloadUpdate, payload, toastError, t],
  );

  const handleEnableGuide = useCallback(async () => {
    if (!guideCat) {
      const saved = await commitGuideCat({});
      if (saved) await patchGuideStatus('active');
      return;
    }
    if (!isGuideCatEnabledStatus(guideCat.status)) {
      await patchGuideStatus('active');
    }
  }, [commitGuideCat, guideCat, patchGuideStatus]);

  const handleDisableGuide = useCallback(() => {
    if (!guideCat) return;
    void patchGuideStatus('dismissed');
  }, [guideCat, patchGuideStatus]);

  // ── Assistant helpers ────────────────────────────────────────────────
  const commitAssistant = useCallback(
    async (
      assistantId: string,
      patch: Partial<{
        name: string;
        roleHint: string | null;
        provider: string;
        instance: string | null;
        model: string | null;
        modelSelection: ProviderModelSelection | null;
      }>,
      errorLabel: string,
    ): Promise<boolean> => {
      const current = assistantPresets.find((a) => a.id === assistantId);
      if (!current) return false;
      setAssistantBusy(true);
      try {
        const body = {
          name: patch.name !== undefined ? patch.name : current.name,
          provider: patch.provider !== undefined
            ? patch.provider
            : current.executionTarget.provider,
          instance: patch.instance !== undefined
            ? patch.instance
            : current.executionTarget.instance ?? null,
          model: patch.model !== undefined
            ? patch.model
            : current.executionTarget.model ?? null,
          modelSelection: patch.modelSelection !== undefined
            ? patch.modelSelection
            : current.modelSelection,
          roleHint: patch.roleHint !== undefined
            ? patch.roleHint
            : current.roleHint,
        };
        const response = await fetch(`/api/platform/assistants/${assistantId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw new Error(
            (errorPayload as { error?: { message?: string } } | null)?.error?.message
              ?? t(messageKeys.settingsAssistantsSaveFailedWithError, {
                status: response.status,
              }),
          );
        }
        const result = (await response.json()) as {
          assistant: AssistantPresetRecord;
          assistants: AssistantPresetRecord[];
        };
        onPayloadUpdate({ ...payload, assistantPresets: result.assistants });
        return true;
      } catch (error) {
        toastError(error instanceof Error ? error.message : errorLabel);
        return false;
      } finally {
        setAssistantBusy(false);
      }
    },
    [assistantPresets, onPayloadUpdate, payload, toastError],
  );

  const handleCreateAssistant = useCallback(async () => {
    setAssistantBusy(true);
    try {
      const response = await fetch('/api/platform/assistants', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: createDraft.name.trim(),
          provider: createDraft.provider,
          instance: createDraft.instance || null,
          model: createDraft.model || null,
          modelSelection: createDraft.modelSelection,
          roleHint: createDraft.roleHint.trim() || null,
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(
          (errorPayload as { error?: { message?: string } } | null)?.error?.message
            ?? t(messageKeys.settingsAssistantsSaveFailedWithError, {
              status: response.status,
            }),
        );
      }
      const result = (await response.json()) as {
        assistant: AssistantPresetRecord;
        assistants: AssistantPresetRecord[];
      };
      onPayloadUpdate({ ...payload, assistantPresets: result.assistants });
      setSelectedAssistantId(result.assistant.id);
      setIsCreatingAssistant(false);
      setCreateDraft(emptyAssistantDraft());
    } catch (error) {
      toastError(error instanceof Error ? error.message : t(messageKeys.settingsAssistantsCreateFailed));
    } finally {
      setAssistantBusy(false);
    }
  }, [createDraft, emptyAssistantDraft, onPayloadUpdate, payload, t, toastError]);

  const handleDeleteAssistant = useCallback(async () => {
    if (!selectedAssistant) return;
    const confirmed = await confirm({
      title: t(messageKeys.settingsAssistantsRemoveTitle),
      message: t(messageKeys.settingsAssistantsRemoveMessage, {
        title: selectedAssistant.name,
      }),
      confirmLabel: t(messageKeys.settingsAssistantsRemoveButton),
    });
    if (!confirmed) return;
    setAssistantBusy(true);
    try {
      const response = await fetch(
        `/api/platform/assistants/${selectedAssistant.id}`,
        {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
        },
      );
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(
          (errorPayload as { error?: { message?: string } } | null)?.error?.message
            ?? t(messageKeys.settingsAssistantsStatusFailed, { status: response.status }),
        );
      }
      const result = (await response.json()) as {
        assistants: AssistantPresetRecord[];
      };
      onPayloadUpdate({ ...payload, assistantPresets: result.assistants });
      setSelectedAssistantId(result.assistants[0]?.id ?? null);
      if (result.assistants.length === 0) {
        setIsCreatingAssistant(true);
      }
    } catch (error) {
      toastError(error instanceof Error ? error.message : t(messageKeys.settingsAssistantsRemoveFailed));
    } finally {
      setAssistantBusy(false);
    }
  }, [confirm, onPayloadUpdate, payload, selectedAssistant, t, toastError]);

  const handleSelectAssistant = useCallback((assistantId: string) => {
    setSelectedAssistantId(assistantId);
    setIsCreatingAssistant(false);
  }, []);

  const handleStartCreate = useCallback(() => {
    setIsCreatingAssistant(true);
    setCreateDraft(emptyAssistantDraft());
  }, [emptyAssistantDraft]);

  const handleCancelCreate = useCallback(() => {
    if (assistantPresets.length === 0) return;
    setIsCreatingAssistant(false);
    if (!selectedAssistantId) {
      setSelectedAssistantId(assistantPresets[0]?.id ?? null);
    }
  }, [assistantPresets, selectedAssistantId]);

  const canSaveCreate = createDraft.name.trim().length > 0
    && createDraft.provider.trim().length > 0
    && createDraft.model.trim().length > 0;

  const showCreateView = isCreatingAssistant || !selectedAssistant;

  return (
    <>
      <div className="catsLayout catsLayoutSidePanel">
        {/* ── Guide Cat ───────────────────────────────────────────── */}
        <SettingsSection
          className="catsDetailCard"
          header={
            <SettingsSectionHeader
              title={guideCatName}
              status={
                <SettingsActionBar>
                  {guideCatEnabled ? (
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={guideBusy}
                      onClick={() => void handleDisableGuide()}
                    >
                      {t(messageKeys.settingsAssistantsDisableButton)}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primaryButton"
                      disabled={guideBusy}
                      onClick={() => void handleEnableGuide()}
                    >
                      {guideBusy
                        ? t(messageKeys.sharedCommonSaving)
                        : t(messageKeys.settingsAssistantsEnableButton)}
                    </button>
                  )}
                </SettingsActionBar>
              }
            />
          }
        >
          <div className="catsDetailBody">
            <div className="catsDetailColumn">
              <SettingsSubSection headerless className="catsSubCard catsIdentityCard">
                <div className="fieldLabel">
                  <span>{t(messageKeys.settingsAssistantsAvatarLabel)}</span>
                  <div className="catsAvatarDock">
                    <div
                      className="catAvatar catsIdentityAvatar catsIdentityAvatarStatic"
                      aria-label={guideCatName}
                    >
                      <img
                        className="catsIdentityAvatarImage"
                        src={GUIDE_CAT_AVATAR_URL}
                        alt=""
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
                <div className="fieldLabel">
                  <span>{t(messageKeys.settingsAssistantsNameLabel)}</span>
                  <div className="catsIdentityNameStatic">{guideCatName}</div>
                </div>
              </SettingsSubSection>
            </div>
            <div className="catsDetailColumn">
              <ProviderModelBrainCard
                provider={guideCat?.executionTarget.provider ?? 'claude'}
                instance={guideCat?.executionTarget.instance ?? ''}
                model={guideCat?.executionTarget.model ?? ''}
                modelSelection={guideCat?.modelSelection ?? null}
                providerRegistrySetupHrefOverride={runtimeSetupHref}
                onTargetChange={(target) => {
                  void commitGuideCat({
                    provider: target.provider,
                    instance: target.instance || null,
                    model: target.model || null,
                    modelSelection: target.modelSelection ?? null,
                  });
                }}
                fetchProviderRegistry={fetchProviderRegistry}
                fetchProviderModels={fetchProviderModels}
                fetchAdvancedProviderModels={fetchAdvancedProviderModels}
              />
            </div>
          </div>
        </SettingsSection>

        {/* ── Assistants roster ───────────────────────────────────── */}
        <nav
          className="catsSelectorStrip"
          role="tablist"
          aria-label={t(messageKeys.settingsAssistantsSelectAriaLabel)}
        >
          {assistantPresets.map((assistant) => {
            const isSelected = !isCreatingAssistant
              && assistant.id === selectedAssistantId;
            const className = [
              'catAvatar',
              'catsSelectorAvatar',
              isSelected ? 'catsSelectorAvatarActive' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={assistant.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={className}
                onClick={() => handleSelectAssistant(assistant.id)}
                data-tooltip={assistant.name}
                aria-label={assistant.name}
              >
                {assistantInitials(assistant.name)}
              </button>
            );
          })}
          <button
            type="button"
            className={[
              'catAvatar',
              'catsSelectorAvatar',
              'catsSelectorNewAvatar',
              isCreatingAssistant ? 'catsSelectorAvatarActive' : '',
            ].filter(Boolean).join(' ')}
            onClick={handleStartCreate}
            aria-label={t(messageKeys.settingsAssistantsAddNewLabel)}
            data-tooltip={t(messageKeys.settingsAssistantsAddNewLabel)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </nav>

        {/* ── Assistant detail ────────────────────────────────────── */}
        <SettingsSection
          className="catsDetailCard"
          header={
            <SettingsSectionHeader
              title={showCreateView
                ? t(messageKeys.settingsAssistantsNewAssistantTitle)
                : (selectedAssistant?.name ?? '')}
              status={
                showCreateView ? (
                  <SettingsActionBar>
                    {assistantPresets.length > 0 ? (
                      <button
                        type="button"
                        className="secondaryButton"
                        disabled={assistantBusy}
                        onClick={handleCancelCreate}
                      >
                        {t(messageKeys.settingsAssistantsCancelButton)}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="primaryButton"
                      disabled={assistantBusy || !canSaveCreate}
                      onClick={() => void handleCreateAssistant()}
                    >
                      {assistantBusy
                        ? t(messageKeys.sharedCommonSaving)
                        : t(messageKeys.settingsAssistantsCreateButton)}
                    </button>
                  </SettingsActionBar>
                ) : (
                  <SettingsActionBar>
                    <button
                      type="button"
                      className="dangerButton"
                      disabled={assistantBusy}
                      onClick={() => void handleDeleteAssistant()}
                    >
                      {t(messageKeys.settingsAssistantsDeleteButton)}
                    </button>
                  </SettingsActionBar>
                )
              }
            />
          }
        >
          {showCreateView ? (
            <div className="catsDetailBody">
              <div className="catsDetailColumn">
                <SettingsSubSection headerless className="catsSubCard catsIdentityCard">
                  <label className="fieldLabel">
                    <span>{t(messageKeys.settingsAssistantsNameLabel)}</span>
                    <input
                      className="textInput"
                      value={createDraft.name}
                      placeholder={t(messageKeys.settingsAssistantsNamePlaceholder)}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))}
                    />
                  </label>
                </SettingsSubSection>
                <SettingsSubSection
                  className="catsSubCard"
                  header={<SettingsSectionHeader
                    title={t(messageKeys.settingsAssistantsRoleHintTitle)}
                    nested
                  />}
                >
                  <textarea
                    className="textInput"
                    rows={3}
                    value={createDraft.roleHint}
                    placeholder={t(messageKeys.settingsAssistantsRoleHintPlaceholder)}
                    onChange={(event) =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        roleHint: event.target.value,
                      }))}
                  />
                </SettingsSubSection>
              </div>
              <div className="catsDetailColumn">
                <ProviderModelBrainCard
                  provider={createDraft.provider}
                  instance={createDraft.instance}
                  model={createDraft.model}
                  modelSelection={createDraft.modelSelection}
                  providerRegistrySetupHrefOverride={runtimeSetupHref}
                  onTargetChange={(target) =>
                    setCreateDraft((prev) => ({
                      ...prev,
                      provider: target.provider,
                      instance: target.instance,
                      model: target.model,
                      modelSelection: target.modelSelection ?? null,
                    }))}
                  fetchProviderRegistry={fetchProviderRegistry}
                  fetchProviderModels={fetchProviderModels}
                  fetchAdvancedProviderModels={fetchAdvancedProviderModels}
                />
              </div>
            </div>
          ) : selectedAssistant ? (
            <div className="catsDetailBody">
              <div className="catsDetailColumn">
                <SettingsSubSection headerless className="catsSubCard catsIdentityCard">
                  <label className="fieldLabel">
                    <span>{t(messageKeys.settingsAssistantsNameLabel)}</span>
                    <input
                      key={selectedAssistant.id}
                      className="textInput"
                      defaultValue={selectedAssistant.name}
                      placeholder={t(messageKeys.settingsAssistantsNamePlaceholder)}
                      onBlur={async (event) => {
                        const next = event.currentTarget.value.trim();
                        if (!next) {
                          event.currentTarget.value = selectedAssistant.name;
                          return;
                        }
                        if (next === selectedAssistant.name) return;
                        const ok = await commitAssistant(
                          selectedAssistant.id,
                          { name: next },
                          t(messageKeys.settingsAssistantsRenameFailed),
                        );
                        if (!ok) {
                          event.currentTarget.value = selectedAssistant.name;
                        }
                      }}
                    />
                  </label>
                </SettingsSubSection>
                <SettingsSubSection
                  className="catsSubCard"
                  header={<SettingsSectionHeader
                    title={t(messageKeys.settingsAssistantsRoleHintTitle)}
                    nested
                  />}
                >
                  <textarea
                    key={selectedAssistant.id}
                    className="textInput"
                    rows={3}
                    defaultValue={selectedAssistant.roleHint ?? ''}
                    placeholder={t(messageKeys.settingsAssistantsRoleHintPlaceholder)}
                    onBlur={async (event) => {
                      const raw = event.currentTarget.value.trim();
                      const next: string | null = raw ? raw : null;
                      const current = selectedAssistant.roleHint ?? null;
                      if (next === current) return;
                      const ok = await commitAssistant(
                        selectedAssistant.id,
                        { roleHint: next },
                        t(messageKeys.settingsAssistantsRoleHintUpdateFailed),
                      );
                      if (!ok) {
                        event.currentTarget.value = selectedAssistant.roleHint ?? '';
                      }
                    }}
                  />
                </SettingsSubSection>
              </div>
              <div className="catsDetailColumn">
                <ProviderModelBrainCard
                  provider={selectedAssistant.executionTarget.provider}
                  instance={selectedAssistant.executionTarget.instance ?? ''}
                  model={selectedAssistant.executionTarget.model ?? ''}
                  modelSelection={selectedAssistant.modelSelection}
                  providerRegistrySetupHrefOverride={runtimeSetupHref}
                  onTargetChange={(target) => {
                    void commitAssistant(
                      selectedAssistant.id,
                      {
                        provider: target.provider,
                        instance: target.instance || null,
                        model: target.model || null,
                        modelSelection: target.modelSelection ?? null,
                      },
                      t(messageKeys.settingsAssistantsBrainUpdateFailed),
                    );
                  }}
                  fetchProviderRegistry={fetchProviderRegistry}
                  fetchProviderModels={fetchProviderModels}
                  fetchAdvancedProviderModels={fetchAdvancedProviderModels}
                />
              </div>
            </div>
          ) : null}
        </SettingsSection>
      </div>
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
      <ToastContainer toasts={toasts} />
    </>
  );
}
