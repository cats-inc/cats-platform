import { useCallback, useEffect, useMemo, useState, type ComponentType, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import { ConfirmDialog, useConfirmDialog } from '../../../../../design/components/ConfirmDialog.js';
import { ProviderModelFields } from '../../../../../design/components/ProviderModelFields.js';
import { ToastContainer, useToast } from '../../../../../design/components/Toast.js';
import { ALL_PLATFORM_SURFACES } from '../../../../../shared/platformSurfaces.js';
import type { ProviderTargetSelection } from '../../../../../shared/providerSelection.js';
import { isCatBusy, type WorkspaceBusyState } from '../../../../../shared/workspaceBusy.js';
import {
  fetchAdvancedProviderModels,
  fetchProviderModels,
  fetchProviderRegistry,
  updateCatProfile,
} from '../../api/index.js';
import type { CatFormState } from '../../workspaceChatUtils.js';
import { catInitials, sortChatCatsForDisplay } from '../../workspaceChatUtils.js';
import { useSettingsCatsMemory } from '../../hooks/useSettingsCatsMemory.js';
import {
  useSettingsCatsRegistryActions,
  type BotFormState,
} from '../../hooks/useSettingsCatsRegistryActions.js';
import { useSettingsCatsTelegram } from '../../hooks/useSettingsCatsTelegram.js';
import { SettingsCatsCreateForm } from './SettingsCatsCreateForm.js';
import { SettingsCatsDetailPanel } from './SettingsCatsDetailPanel.js';
import { SettingsCatsRegistry } from './SettingsCatsRegistry.js';
import { SettingsCatsTransportPanel } from './SettingsCatsTransportPanel.js';

export interface SettingsCatsRegistryController<TBotForm> {
  botForm: TBotForm;
  renameValue: string;
  setBotForm: Dispatch<SetStateAction<TBotForm>>;
  setRenameValue: Dispatch<SetStateAction<string>>;
  onCreateBinding: (catId: string) => Promise<void>;
  onDeleteBinding: (bindingId: string) => Promise<void>;
  onArchiveCat: (catId: string, catName: string) => Promise<void>;
  onUnarchiveCat: (catId: string, catName: string) => Promise<void>;
  onDeleteCat: (catId: string, catName: string) => Promise<void>;
  onMakeBossCat: (catId: string) => Promise<void>;
  onRenameCat: (catId: string) => Promise<void>;
  onSkillChange: (catId: string, skillProfile: string) => Promise<void>;
  onUpdateProducts: (catId: string, products: string[]) => Promise<void>;
}

export interface SettingsCatsRegistryActionsHookResult<TBotForm>
  extends SettingsCatsRegistryController<TBotForm> {
  catForm: CatFormState;
  setCatForm: Dispatch<SetStateAction<CatFormState>>;
  onCreateCat: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export interface SettingsCatsRegistryComponentProps<TBotForm> {
  botBindings: NonNullable<AppShellPayload['chat']['botBindings']>;
  busy: WorkspaceBusyState;
  expandedCatId: string | null;
  memoryController: ReturnType<typeof useSettingsCatsMemory>;
  payload: AppShellPayload;
  registryController: SettingsCatsRegistryController<TBotForm>;
  setExpandedCatId: Dispatch<SetStateAction<string | null>>;
  telegramDiagnostics: ReturnType<typeof useSettingsCatsTelegram>['telegramDiagnostics'];
  availableSurfaces?: string[];
  enabledSurfaces?: string[];
  onPayloadUpdate?: (payload: AppShellPayload) => void;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export interface SettingsCatsCanvasProps {
  payload: AppShellPayload;
  feedback: string;
  busy: WorkspaceBusyState;
  onPayloadUpdate: (payload: AppShellPayload) => void;
  onFeedback: (message: string) => void;
  onBusy: (busy: WorkspaceBusyState) => void;
}

export interface SharedSettingsCatsCanvasProps extends SettingsCatsCanvasProps {
  useSettingsCatsRegistryActionsHook: (options: {
    expandedCatId: string | null;
    setExpandedCatId: Dispatch<SetStateAction<string | null>>;
    onBusy: (busy: WorkspaceBusyState) => void;
    onFeedback: (message: string) => void;
    onPayloadUpdate: (payload: AppShellPayload) => void;
    confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  }) => SettingsCatsRegistryActionsHookResult<BotFormState>;
  SettingsCatsRegistryComponent?: ComponentType<SettingsCatsRegistryComponentProps<BotFormState>>;
}

export function SettingsCatsCanvas({
  payload,
  feedback,
  busy,
  onPayloadUpdate,
  onFeedback,
  onBusy,
  useSettingsCatsRegistryActionsHook,
}: SharedSettingsCatsCanvasProps) {
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const { toasts, showToast } = useToast();
  const { dialog, confirm, handleClose } = useConfirmDialog();
  const location = useLocation();
  const navigate = useNavigate();
  const isCreateRoute = location.pathname.endsWith('/cats/new');

  const toastFeedback = useCallback((message: string) => {
    onFeedback(message);
    if (message) {
      showToast(message);
    }
  }, [onFeedback, showToast]);

  const actions = useSettingsCatsRegistryActionsHook({
    expandedCatId,
    setExpandedCatId,
    onBusy,
    onFeedback: toastFeedback,
    onPayloadUpdate,
    confirm,
  });
  const {
    botForm,
    catForm,
    renameValue,
    setBotForm,
    setCatForm,
    setRenameValue,
    onCreateBinding,
    onCreateCat,
    onDeleteBinding,
    onDeleteCat,
    onMakeBossCat,
    onArchiveCat,
    onUnarchiveCat,
    onRenameCat,
    onSkillChange,
    onUpdateProducts,
  } = actions;
  const {
    botBindings,
    telegramStatus,
    telegramDiagnostics,
    telegramLoading,
    telegramError,
    refreshTelegramDiagnostics,
  } = useSettingsCatsTelegram(payload);
  const memoryController = useSettingsCatsMemory({
    expandedCatId,
    onBusy,
    onFeedback: toastFeedback,
  });
  const enabledSurfaces = payload.chat.capabilities.availableSurfaces;
  const configurableSurfaces = [...ALL_PLATFORM_SURFACES];

  const activeCats = useMemo(
    () => payload.chat.cats.filter((cat) => cat.status === 'active'),
    [payload.chat.cats],
  );
  const activeCatCount = activeCats.length;
  const sortedActiveCats = useMemo(
    () => sortChatCatsForDisplay(activeCats, { bossCatIds: payload.chat.bossCatId }),
    [activeCats, payload.chat.bossCatId],
  );
  const atCatLimit = activeCatCount >= payload.chat.capabilities.maxCats;

  const [selectedCatId, setSelectedCatId] = useState<string | null>(() => sortedActiveCats[0]?.id ?? null);
  const effectiveMode: 'create' | 'view' = isCreateRoute || activeCatCount === 0 ? 'create' : 'view';

  useEffect(() => {
    if (effectiveMode === 'view' && sortedActiveCats.length > 0) {
      if (!selectedCatId || !sortedActiveCats.some((cat) => cat.id === selectedCatId)) {
        setSelectedCatId(sortedActiveCats[0].id);
      }
    }
  }, [effectiveMode, selectedCatId, sortedActiveCats]);

  useEffect(() => {
    if (effectiveMode === 'view' && selectedCatId) {
      setExpandedCatId(selectedCatId);
    }
  }, [effectiveMode, selectedCatId]);

  const prevActiveCatCountRef = useMemo(() => ({ current: activeCatCount }), []);
  useEffect(() => {
    if (activeCatCount > prevActiveCatCountRef.current) {
      const next = sortedActiveCats[sortedActiveCats.length - 1];
      if (next) {
        setSelectedCatId(next.id);
      }
      if (location.pathname.endsWith('/cats/new')) {
        navigate('/settings/cats', { replace: true });
      }
    }
    prevActiveCatCountRef.current = activeCatCount;
  }, [activeCatCount, location.pathname, navigate, prevActiveCatCountRef, sortedActiveCats]);

  const handleSelectCat = (catId: string) => {
    setSelectedCatId(catId);
    if (location.pathname.endsWith('/cats/new')) {
      navigate('/settings/cats', { replace: true });
    }
  };

  const handleStartCreate = () => {
    if (atCatLimit) return;
    navigate('/settings/cats/new');
  };

  const handleCancelCreate = () => {
    if (activeCatCount > 0 && location.pathname.endsWith('/cats/new')) {
      navigate('/settings/cats', { replace: true });
    }
  };

  const selectedCat = useMemo(
    () => (selectedCatId ? sortedActiveCats.find((cat) => cat.id === selectedCatId) ?? null : null),
    [selectedCatId, sortedActiveCats],
  );

  const [providerDraft, setProviderDraft] = useState<ProviderTargetSelection>(() => ({
    provider: selectedCat?.defaultExecutionTarget.provider ?? '',
    instance: selectedCat?.defaultExecutionTarget.instance ?? '',
    model: selectedCat?.defaultExecutionTarget.model ?? '',
    modelSelection: selectedCat?.defaultModelSelection ?? null,
  }));
  useEffect(() => {
    if (!selectedCat) return;
    setProviderDraft({
      provider: selectedCat.defaultExecutionTarget.provider ?? '',
      instance: selectedCat.defaultExecutionTarget.instance ?? '',
      model: selectedCat.defaultExecutionTarget.model ?? '',
      modelSelection: selectedCat.defaultModelSelection ?? null,
    });
  }, [selectedCat]);
  const providerDirty = Boolean(
    selectedCat && (
      providerDraft.provider !== (selectedCat.defaultExecutionTarget.provider ?? '')
      || (providerDraft.instance ?? '') !== (selectedCat.defaultExecutionTarget.instance ?? '')
      || (providerDraft.model ?? '') !== (selectedCat.defaultExecutionTarget.model ?? '')
    )
  );
  const [savingProvider, setSavingProvider] = useState(false);
  const handleSaveProvider = async () => {
    if (!selectedCat) return;
    setSavingProvider(true);
    try {
      const next = await updateCatProfile(selectedCat.id, {
        provider: providerDraft.provider,
        instance: providerDraft.instance || null,
        model: providerDraft.model || null,
        modelSelection: providerDraft.modelSelection ?? null,
      });
      onPayloadUpdate(next);
      toastFeedback('Provider saved.');
    } catch (error) {
      toastFeedback(error instanceof Error ? error.message : 'Failed to save provider.');
    } finally {
      setSavingProvider(false);
    }
  };

  return (
    <>
      <div className="catsLayout catsLayoutSidePanel">
        <nav className="catsSelectorStrip" role="tablist" aria-label="Select a cat">
          {sortedActiveCats.map((cat) => {
            const isSelected = effectiveMode === 'view' && cat.id === selectedCatId;
            const isBoss = cat.id === payload.chat.bossCatId;
            const className = [
              'catAvatar',
              'catsSelectorAvatar',
              isBoss ? 'catsSelectorAvatarBoss' : '',
              isSelected ? 'catsSelectorAvatarActive' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={className}
                style={cat.avatarUrl
                  ? { backgroundImage: `url(${cat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : cat.avatarColor ? { background: cat.avatarColor } : undefined}
                onClick={() => handleSelectCat(cat.id)}
                data-tooltip={cat.name}
                aria-label={cat.name}
              >
                {cat.avatarUrl ? null : catInitials(cat.name)}
              </button>
            );
          })}
          <button
            type="button"
            className={[
              'catAvatar',
              'catsSelectorAvatar',
              'catsSelectorNewAvatar',
              effectiveMode === 'create' ? 'catsSelectorAvatarActive' : '',
            ].filter(Boolean).join(' ')}
            onClick={handleStartCreate}
            disabled={atCatLimit && effectiveMode !== 'create'}
            aria-label="Add new cat"
            data-tooltip={atCatLimit ? 'Cat limit reached' : 'Add new cat'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </nav>

        <section className="contentCard catsDetailCard">
          <header className="catsDetailHeader">
            {effectiveMode === 'create' ? (
              <>
                <p className="sectionLabel">Create</p>
                <h2>New cat</h2>
                <p className="catsDetailHeaderHint">Configure name and provider, then save.</p>
              </>
            ) : selectedCat ? (
              <>
                <p className="sectionLabel">
                  {selectedCat.id === payload.chat.bossCatId ? 'Boss · Cat' : 'Cat'}
                </p>
                <h2>{selectedCat.name}</h2>
                <p className="catsDetailHeaderHint">Edit avatar, provider, memory and bindings.</p>
              </>
            ) : null}
          </header>
          {effectiveMode === 'create' ? (
            <SettingsCatsCreateForm
              busy={busy}
              catForm={catForm}
              onCatFormChange={setCatForm}
              onCreateCat={onCreateCat}
              atCatLimit={atCatLimit}
              availableSurfaces={configurableSurfaces}
              enabledSurfaces={enabledSurfaces}
              autoFocusName={isCreateRoute}
              collapsible={activeCatCount > 0}
              expanded
              onExpandChange={(next) => { if (!next) handleCancelCreate(); }}
              embedded
            />
          ) : selectedCat ? (
            <>
              <div className="catDetailSection catsProviderSection">
                <div className="catDetailSectionHeader">
                  <p className="sectionLabel">AI Provider</p>
                  <button
                    className="primaryButton"
                    type="button"
                    disabled={!providerDirty || savingProvider || isCatBusy(busy, 'create')}
                    onClick={() => void handleSaveProvider()}
                  >
                    {savingProvider ? 'Saving...' : 'Save provider'}
                  </button>
                </div>
                <ProviderModelFields
                  provider={providerDraft.provider}
                  instance={providerDraft.instance}
                  model={providerDraft.model}
                  modelSelection={providerDraft.modelSelection}
                  onTargetChange={setProviderDraft}
                  fetchProviderRegistry={fetchProviderRegistry}
                  fetchProviderModels={fetchProviderModels}
                  fetchAdvancedProviderModels={fetchAdvancedProviderModels}
                />
              </div>
              <SettingsCatsDetailPanel
                busy={busy}
                botBindings={botBindings}
                cat={selectedCat}
                isBossCat={selectedCat.id === payload.chat.bossCatId}
                memoryController={memoryController}
                registryController={{
                  botForm,
                  renameValue,
                  setBotForm,
                  setRenameValue,
                  onCreateBinding,
                  onDeleteBinding,
                  onMakeBossCat,
                  onRenameCat,
                  onSkillChange,
                  onUpdateProducts,
                }}
                telegramDiagnostics={telegramDiagnostics}
                availableSurfaces={configurableSurfaces}
                enabledSurfaces={enabledSurfaces}
                onPayloadUpdate={onPayloadUpdate}
                confirm={confirm}
              />
            </>
          ) : null}
        </section>

        {activeCatCount > 0 ? (
          <details className="contentCard catsTransportDetails">
            <summary className="catsTransportSummary">
              <span className="sectionLabel">Transport bindings</span>
              <span className="catsTransportSummaryHint">Telegram and other channel bindings</span>
            </summary>
            <div className="catsTransportBody">
              <SettingsCatsTransportPanel
                telegramDiagnostics={telegramDiagnostics}
                telegramError={telegramError}
                telegramLoading={telegramLoading}
                telegramStatus={telegramStatus}
                onRefresh={() => void refreshTelegramDiagnostics()}
              />
            </div>
          </details>
        ) : null}
      </div>
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
      <ToastContainer toasts={toasts} />
    </>
  );
}

export interface WorkspaceSettingsCatsCanvasProps extends Omit<
  SharedSettingsCatsCanvasProps,
  'useSettingsCatsRegistryActionsHook' | 'SettingsCatsRegistryComponent'
> {}

export function WorkspaceSettingsCatsCanvas(props: WorkspaceSettingsCatsCanvasProps) {
  return (
    <SettingsCatsCanvas
      {...props}
      useSettingsCatsRegistryActionsHook={useSettingsCatsRegistryActions}
      SettingsCatsRegistryComponent={SettingsCatsRegistry}
    />
  );
}
