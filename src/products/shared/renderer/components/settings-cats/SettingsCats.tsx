import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import { ConfirmDialog, useConfirmDialog } from '../../../../../design/components/ConfirmDialog.js';
import { ProviderModelFields } from '../../../../../design/components/ProviderModelFields.js';
import { ToastContainer, useToast } from '../../../../../design/components/Toast.js';
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
import { AvatarCropDialog } from '../../../../../design/components/AvatarCropDialog.js';
import { SettingsCatsDetailPanelContent } from './SettingsCatsDetailPanelContent.js';
import { SettingsCatsRegistry } from './SettingsCatsRegistry.js';
import { SettingsCatsTransportPanel } from './SettingsCatsTransportPanel.js';
import {
  findNewlyCreatedActiveCat,
  hasModelSelectionChanged,
} from './settingsCatsSupport.js';
import { SKILL_PROFILES } from './viewSupport.js';

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
}

export interface SettingsCatsRegistryActionsHookResult<TBotForm>
  extends SettingsCatsRegistryController<TBotForm> {
  catForm: CatFormState;
  setCatForm: Dispatch<SetStateAction<CatFormState>>;
  performCreateCat: () => Promise<AppShellPayload | null>;
  onCreateCat: (event: FormEvent<HTMLFormElement>) => Promise<AppShellPayload | null>;
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
  onPayloadUpdate?: (payload: AppShellPayload) => void;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}

export interface SettingsCatsCanvasProps {
  payload: AppShellPayload;
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

  useEffect(() => {
    // Clear any residual parent feedback once on entry so stale messages from other screens do not leak through.
    onFeedback('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toastFeedback = useCallback((message: string) => {
    if (message) {
      showToast(message);
    }
  }, [showToast]);

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
    performCreateCat,
    onDeleteBinding,
    onDeleteCat,
    onMakeBossCat,
    onArchiveCat,
    onUnarchiveCat,
    onRenameCat,
    onSkillChange,
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

  const activeCats = useMemo(
    () => payload.chat.cats.filter((cat) => cat.status === 'active'),
    [payload.chat.cats],
  );
  const archivedCats = useMemo(
    () => payload.chat.cats.filter((cat) => cat.status === 'archived'),
    [payload.chat.cats],
  );
  const activeCatCount = activeCats.length;
  const sortedActiveCats = useMemo(
    () => sortChatCatsForDisplay(activeCats, { bossCatIds: payload.chat.bossCatId }),
    [activeCats, payload.chat.bossCatId],
  );
  const sortedArchivedCats = useMemo(
    () => sortChatCatsForDisplay(archivedCats, { bossCatIds: null }),
    [archivedCats],
  );
  const atCatLimit = activeCatCount >= payload.chat.capabilities.maxCats;
  const [showArchived, setShowArchived] = useState(
    () => payload.chat.cats.filter((c) => c.status === 'active').length === 0
      && payload.chat.cats.some((c) => c.status === 'archived'),
  );

  const [selectedCatId, setSelectedCatId] = useState<string | null>(
    () => sortedActiveCats[0]?.id ?? sortedArchivedCats[0]?.id ?? null,
  );
  const hasAnyCat = activeCatCount > 0 || sortedArchivedCats.length > 0;
  const effectiveMode: 'create' | 'view' = isCreateRoute || !hasAnyCat ? 'create' : 'view';

  useEffect(() => {
    if (effectiveMode !== 'view') return;
    const current = selectedCatId
      ? payload.chat.cats.find((cat) => cat.id === selectedCatId) ?? null
      : null;
    const hiddenBecauseArchived = current?.status === 'archived' && !showArchived;
    if (!current || hiddenBecauseArchived) {
      const fallback = sortedActiveCats[0] ?? (showArchived ? sortedArchivedCats[0] : null);
      if (fallback) {
        setSelectedCatId(fallback.id);
      } else {
        setSelectedCatId(null);
        if (!location.pathname.endsWith('/cats/new')) {
          navigate('/settings/cats/new', { replace: true });
        }
      }
    }
  }, [effectiveMode, location.pathname, navigate, payload.chat.cats, selectedCatId, showArchived, sortedActiveCats, sortedArchivedCats]);

  useEffect(() => {
    if (effectiveMode === 'view' && selectedCatId) {
      setExpandedCatId(selectedCatId);
    }
  }, [effectiveMode, selectedCatId]);

  const prevActiveCatCountRef = useMemo(() => ({ current: activeCatCount }), []);
  const prevActiveCatIdsRef = useMemo(() => ({ current: new Set<string>(activeCats.map((c) => c.id)) }), []);
  useEffect(() => {
    if (activeCatCount > prevActiveCatCountRef.current) {
      const prevIds = prevActiveCatIdsRef.current;
      const newCat = sortedActiveCats.find((cat) => !prevIds.has(cat.id))
        ?? sortedActiveCats[sortedActiveCats.length - 1];
      if (newCat) {
        setSelectedCatId(newCat.id);
      }
      if (location.pathname.endsWith('/cats/new')) {
        navigate('/settings/cats', { replace: true });
      }
    }
    prevActiveCatCountRef.current = activeCatCount;
    prevActiveCatIdsRef.current = new Set(activeCats.map((c) => c.id));
  }, [activeCatCount, activeCats, location.pathname, navigate, onPayloadUpdate, prevActiveCatCountRef, prevActiveCatIdsRef, sortedActiveCats]);

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

  const selectedCat = useMemo(
    () => (selectedCatId ? payload.chat.cats.find((cat) => cat.id === selectedCatId) ?? null : null),
    [payload.chat.cats, selectedCatId],
  );
  useEffect(() => {
    if (selectedCat?.status === 'archived') setShowArchived(true);
  }, [selectedCat]);

  const createNameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (effectiveMode === 'create' && isCreateRoute) {
      const el = createNameInputRef.current;
      el?.focus();
      el?.select();
    }
  }, [effectiveMode, isCreateRoute]);

  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [detailMoreMenuOpen, setDetailMoreMenuOpen] = useState(false);
  useEffect(() => {
    if (!detailMoreMenuOpen) return;
    const onDocClick = () => setDetailMoreMenuOpen(false);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [detailMoreMenuOpen]);
  useEffect(() => {
    setDetailMoreMenuOpen(false);
  }, [selectedCatId, effectiveMode]);
  const [pendingCreateAvatar, setPendingCreateAvatar] = useState<string | null>(null);
  useEffect(() => {
    if (!isCreateRoute) setPendingCreateAvatar(null);
  }, [isCreateRoute]);

  const handleAvatarSave = async (dataUrl: string): Promise<void> => {
    setAvatarCropOpen(false);
    if (effectiveMode === 'create') {
      setPendingCreateAvatar(dataUrl);
      return;
    }
    if (!selectedCat) return;
    try {
      const next = await updateCatProfile(selectedCat.id, { avatarUrl: dataUrl });
      onPayloadUpdate(next);
    } catch {
      // silent
    }
  };
  const handleAvatarRemove = async (): Promise<void> => {
    if (effectiveMode === 'create') {
      setPendingCreateAvatar(null);
      return;
    }
    if (!selectedCat) return;
    try {
      const next = await updateCatProfile(selectedCat.id, { avatarUrl: null });
      onPayloadUpdate(next);
    } catch {
      // silent
    }
  };

  const [nameDraft, setNameDraft] = useState<string>(selectedCat?.name ?? '');
  const [skillDraft, setSkillDraft] = useState<string>(selectedCat?.skillProfile ?? 'chat-default');
  const [makeBossDraft, setMakeBossDraft] = useState<boolean>(false);
  const [providerDraft, setProviderDraft] = useState<ProviderTargetSelection>(() => ({
    provider: selectedCat?.defaultExecutionTarget.provider ?? '',
    instance: selectedCat?.defaultExecutionTarget.instance ?? '',
    model: selectedCat?.defaultExecutionTarget.model ?? '',
    modelSelection: selectedCat?.defaultModelSelection ?? null,
  }));
  useEffect(() => {
    if (!selectedCat) return;
    setNameDraft(selectedCat.name);
    setSkillDraft(selectedCat.skillProfile ?? 'chat-default');
    setMakeBossDraft(false);
    setProviderDraft({
      provider: selectedCat.defaultExecutionTarget.provider ?? '',
      instance: selectedCat.defaultExecutionTarget.instance ?? '',
      model: selectedCat.defaultExecutionTarget.model ?? '',
      modelSelection: selectedCat.defaultModelSelection ?? null,
    });
  }, [selectedCat]);

  const savedName = selectedCat?.name ?? '';
  const savedSkill = selectedCat?.skillProfile ?? 'chat-default';
  const savedProvider = selectedCat?.defaultExecutionTarget.provider ?? '';
  const savedInstance = selectedCat?.defaultExecutionTarget.instance ?? '';
  const savedModel = selectedCat?.defaultExecutionTarget.model ?? '';
  const savedModelSelection = selectedCat?.defaultModelSelection ?? null;
  const detailDirty = Boolean(
    selectedCat && (
      nameDraft.trim() !== savedName
      || skillDraft !== savedSkill
      || makeBossDraft
      || providerDraft.provider !== savedProvider
      || (providerDraft.instance ?? '') !== savedInstance
      || (providerDraft.model ?? '') !== savedModel
      || hasModelSelectionChanged(providerDraft.modelSelection, savedModelSelection)
    )
  );
  const isArchived = selectedCat?.status === 'archived';
  const saveDisabled = !detailDirty || nameDraft.trim().length === 0 || isArchived;
  const [savingDetail, setSavingDetail] = useState(false);

  const handleSaveAll = async () => {
    if (!selectedCat || saveDisabled) return;
    if (makeBossDraft && payload.chat.bossCatId && payload.chat.bossCatId !== selectedCat.id) {
      const currentBoss = payload.chat.cats.find((c) => c.id === payload.chat.bossCatId);
      const confirmed = await confirm({
        title: 'Change Boss Cat',
        message: `${currentBoss?.name ?? 'Another cat'} is currently the Boss Cat. Set ${selectedCat.name} as the Boss instead?`,
        confirmLabel: 'Confirm',
      });
      if (!confirmed) return;
    }
    setSavingDetail(true);
    try {
      const patch: Parameters<typeof updateCatProfile>[1] = {};
      const trimmedName = nameDraft.trim();
      if (trimmedName !== savedName) patch.name = trimmedName;
      if (skillDraft !== savedSkill) patch.skillProfile = skillDraft;
      if (makeBossDraft) patch.makeBoss = true;
      if (providerDraft.provider !== savedProvider) patch.provider = providerDraft.provider;
      if ((providerDraft.instance ?? '') !== savedInstance) patch.instance = providerDraft.instance || null;
      if ((providerDraft.model ?? '') !== savedModel) patch.model = providerDraft.model || null;
      if (hasModelSelectionChanged(providerDraft.modelSelection, savedModelSelection)) {
        patch.modelSelection = providerDraft.modelSelection ?? null;
      }
      const next = await updateCatProfile(selectedCat.id, patch);
      onPayloadUpdate(next);
      setMakeBossDraft(false);
      toastFeedback('Saved.');
    } catch (error) {
      toastFeedback(error instanceof Error ? error.message : 'Failed to save.');
    } finally {
      setSavingDetail(false);
    }
  };

  const handleRevert = () => {
    if (!selectedCat) return;
    setNameDraft(selectedCat.name);
    setSkillDraft(selectedCat.skillProfile ?? 'chat-default');
    setMakeBossDraft(false);
    setProviderDraft({
      provider: selectedCat.defaultExecutionTarget.provider ?? '',
      instance: selectedCat.defaultExecutionTarget.instance ?? '',
      model: selectedCat.defaultExecutionTarget.model ?? '',
      modelSelection: selectedCat.defaultModelSelection ?? null,
    });
  };

  const handleCreateCat = async () => {
    const next = await performCreateCat();
    const newCat = next ? findNewlyCreatedActiveCat(activeCats, next.chat.cats) : null;
    if (newCat) {
      setSelectedCatId(newCat.id);
      if (location.pathname.endsWith('/cats/new')) {
        navigate('/settings/cats', { replace: true });
      }
      if (pendingCreateAvatar) {
        try {
          const nextWithAvatar = await updateCatProfile(newCat.id, { avatarUrl: pendingCreateAvatar });
          onPayloadUpdate(nextWithAvatar);
          setPendingCreateAvatar(null);
        } catch (error) {
          setPendingCreateAvatar(null);
          toastFeedback(error instanceof Error ? error.message : 'Failed to save avatar.');
        }
      }
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
          {showArchived && sortedArchivedCats.length > 0 ? (
            <span className="catsSelectorDivider" aria-hidden="true" />
          ) : null}
          {showArchived ? sortedArchivedCats.map((cat) => {
            const isSelected = effectiveMode === 'view' && cat.id === selectedCatId;
            const className = [
              'catAvatar',
              'catsSelectorAvatar',
              'catsSelectorAvatarArchived',
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
                data-tooltip={`${cat.name} (archived)`}
                aria-label={`${cat.name} (archived)`}
              >
                {cat.avatarUrl ? null : catInitials(cat.name)}
              </button>
            );
          }) : null}
          {archivedCats.length > 0 ? (
            <label className="catsSelectorArchiveToggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              <span>Show archived ({archivedCats.length})</span>
            </label>
          ) : null}
        </nav>

        <section className="contentCard catsDetailCard">
          <header className="catsDetailHeader">
            <h2>
              {effectiveMode === 'create' ? 'New cat' : selectedCat ? (
                <>
                  {selectedCat.name}
                  {selectedCat.id === payload.chat.bossCatId ? (
                    <span className="catsDetailBossTag">Boss</span>
                  ) : null}
                  {selectedCat.status === 'archived' ? (
                    <span className="catsDetailArchivedTag">Archived</span>
                  ) : null}
                </>
              ) : null}
            </h2>
            {effectiveMode === 'view' && selectedCat ? (
              <div className="catsDetailHeaderActions">
                {detailDirty ? (
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={handleRevert}
                    disabled={savingDetail}
                  >
                    Revert
                  </button>
                ) : null}
                <button
                  type="button"
                  className="primaryButton"
                  disabled={saveDisabled || savingDetail}
                  onClick={() => void handleSaveAll()}
                >
                  {savingDetail ? 'Saving...' : detailDirty ? 'Save changes' : 'Saved'}
                </button>
                <div className="catsDetailMoreWrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="catsDetailMoreButton"
                    onClick={() => setDetailMoreMenuOpen((v) => !v)}
                    aria-label="More actions"
                    aria-haspopup="menu"
                    aria-expanded={detailMoreMenuOpen}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>
                  {detailMoreMenuOpen ? (
                    <div className="catsDetailMoreMenu" role="menu">
                      {selectedCat.status === 'active' ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={isCatBusy(busy, 'archive', selectedCat.id)}
                          onClick={() => {
                            setDetailMoreMenuOpen(false);
                            void onArchiveCat(selectedCat.id, selectedCat.name);
                          }}
                        >
                          Archive
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={isCatBusy(busy, 'unarchive', selectedCat.id)}
                            onClick={() => {
                              setDetailMoreMenuOpen(false);
                              void onUnarchiveCat(selectedCat.id, selectedCat.name);
                            }}
                          >
                            Recover
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="catsDetailMoreMenuDanger"
                            disabled={isCatBusy(busy, 'delete', selectedCat.id)}
                            onClick={() => {
                              setDetailMoreMenuOpen(false);
                              void onDeleteCat(selectedCat.id, selectedCat.name);
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {effectiveMode === 'create' ? (
              <div className="catsDetailHeaderActions">
                {activeCatCount > 0 ? (
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => navigate('/settings/cats', { replace: true })}
                    disabled={isCatBusy(busy, 'create')}
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  className="primaryButton"
                  disabled={!catForm.name.trim() || !catForm.provider.trim() || !catForm.model.trim() || atCatLimit || isCatBusy(busy, 'create')}
                  onClick={() => { void handleCreateCat(); }}
                >
                  {isCatBusy(busy, 'create') ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : null}
          </header>
          {effectiveMode === 'create' ? (
            <div className="catsDetailBody">
              <section className="catsSubCard catsIdentityCard">
                <div className="catsIdentityRow">
                  <div className="catsAvatarDock">
                    <button
                      type="button"
                      className={[
                        'catAvatar',
                        'catsIdentityAvatar',
                        pendingCreateAvatar ? '' : 'catsIdentityAvatarPlaceholder',
                      ].filter(Boolean).join(' ')}
                      style={pendingCreateAvatar
                        ? { backgroundImage: `url(${pendingCreateAvatar})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' }
                        : undefined}
                      onClick={() => setAvatarCropOpen(true)}
                      aria-label={pendingCreateAvatar ? 'Change avatar' : 'Upload avatar'}
                      data-tooltip={pendingCreateAvatar ? 'Change avatar' : 'Upload avatar'}
                    >
                      {pendingCreateAvatar ? '' : (catForm.name.trim() ? catInitials(catForm.name) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <line x1="19" y1="8" x2="19" y2="14" />
                          <line x1="22" y1="11" x2="16" y2="11" />
                        </svg>
                      ))}
                    </button>
                    <span className="catsAvatarCameraBadge" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </span>
                    {pendingCreateAvatar ? (
                      <button
                        type="button"
                        className="catsAvatarRemoveBadge"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingCreateAvatar(null);
                        }}
                        aria-label="Remove avatar"
                        data-tooltip="Remove avatar"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                  <label className="fieldLabel fieldLabelInline">
                    <input
                      type="checkbox"
                      checked={catForm.makeBoss}
                      onChange={async (event) => {
                        const next = event.target.checked;
                        if (next && payload.chat.bossCatId) {
                          const currentBoss = payload.chat.cats.find((c) => c.id === payload.chat.bossCatId);
                          const confirmed = await confirm({
                            title: 'Change Boss Cat',
                            message: `${currentBoss?.name ?? 'Another cat'} is currently the Boss Cat. Set this new cat as the Boss instead?`,
                            confirmLabel: 'Confirm',
                          });
                          if (!confirmed) return;
                        }
                        setCatForm({
                          ...catForm,
                          makeBoss: next,
                        });
                      }}
                    />
                    <span>Set as Boss Cat</span>
                  </label>
                </div>
                <label className="fieldLabel">
                  <span>Name</span>
                  <input
                    ref={createNameInputRef}
                    className="textInput"
                    value={catForm.name}
                    placeholder="Cat name"
                    onChange={(event) => setCatForm({ ...catForm, name: event.target.value })}
                  />
                </label>
                <div className="fieldLabel">
                  <span>Skill Profile</span>
                  <div className="skillPills">
                    {SKILL_PROFILES.map((profile) => (
                      <button
                        key={profile.value}
                        type="button"
                        className={(catForm.skillProfile || 'chat-default') === profile.value ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
                        onClick={() => setCatForm({ ...catForm, skillProfile: profile.value })}
                      >
                        {profile.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="catsSubCard">
                <p className="sectionLabel">AI Provider</p>
                <ProviderModelFields
                  provider={catForm.provider}
                  instance={catForm.instance}
                  model={catForm.model}
                  modelSelection={catForm.modelSelection}
                  onTargetChange={(target) => setCatForm({
                    ...catForm,
                    provider: target.provider,
                    instance: target.instance,
                    model: target.model,
                    modelSelection: target.modelSelection ?? null,
                  })}
                  fetchProviderRegistry={fetchProviderRegistry}
                  fetchProviderModels={fetchProviderModels}
                  fetchAdvancedProviderModels={fetchAdvancedProviderModels}
                />
              </section>
            </div>
          ) : selectedCat ? (
            <fieldset
              className={isArchived ? 'catsDetailBody catsDetailBodyReadOnly' : 'catsDetailBody'}
              disabled={isArchived}
            >
              <section className="catsSubCard catsIdentityCard">
                <div className="catsIdentityRow">
                  <div className="catsAvatarDock">
                    <button
                      type="button"
                      className="catAvatar catsIdentityAvatar"
                      style={selectedCat.avatarUrl
                        ? { backgroundImage: `url(${selectedCat.avatarUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', color: 'transparent' }
                        : selectedCat.avatarColor ? { background: selectedCat.avatarColor } : undefined}
                      onClick={() => { if (!isArchived) setAvatarCropOpen(true); }}
                      disabled={isArchived}
                      aria-label={selectedCat.avatarUrl ? 'Change avatar' : 'Upload avatar'}
                      data-tooltip={isArchived ? undefined : (selectedCat.avatarUrl ? 'Change avatar' : 'Upload avatar')}
                    >
                      {selectedCat.avatarUrl ? '' : catInitials(selectedCat.name)}
                    </button>
                    {!isArchived ? (
                      <span className="catsAvatarCameraBadge" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </span>
                    ) : null}
                    {selectedCat.avatarUrl && !isArchived ? (
                      <button
                        type="button"
                        className="catsAvatarRemoveBadge"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleAvatarRemove();
                        }}
                        aria-label="Remove avatar"
                        data-tooltip="Remove avatar"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                  {!isArchived && selectedCat.id !== payload.chat.bossCatId ? (
                    <label className="fieldLabel fieldLabelInline">
                      <input
                        type="checkbox"
                        checked={makeBossDraft}
                        onChange={(event) => {
                          setMakeBossDraft(event.target.checked);
                        }}
                      />
                      <span>Set as Boss Cat</span>
                    </label>
                  ) : null}
                </div>
                <label className="fieldLabel">
                  <span>Name</span>
                  <input
                    className="textInput"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    placeholder={selectedCat.name}
                    disabled={isArchived}
                  />
                </label>
                <div className="fieldLabel">
                  <span>Skill Profile</span>
                  <div className="skillPills">
                    {SKILL_PROFILES.map((profile) => (
                      <button
                        key={profile.value}
                        type="button"
                        className={skillDraft === profile.value ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
                        onClick={() => setSkillDraft(profile.value)}
                        disabled={isArchived}
                      >
                        {profile.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="catsSubCard">
                <p className="sectionLabel">AI Provider</p>
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
              </section>

              <section className="catsSubCard">
                <SettingsCatsDetailPanelContent
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
                  }}
                  telegramDiagnostics={telegramDiagnostics}
                  confirm={confirm}
                  sections={['telegram']}
                />
              </section>

              <section className="catsSubCard">
                <SettingsCatsDetailPanelContent
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
                  }}
                  telegramDiagnostics={telegramDiagnostics}
                  confirm={confirm}
                  sections={['memory']}
                />
              </section>

            </fieldset>
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
      {avatarCropOpen ? (
        <AvatarCropDialog
          onSave={(dataUrl) => void handleAvatarSave(dataUrl)}
          onClose={() => setAvatarCropOpen(false)}
        />
      ) : null}
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
