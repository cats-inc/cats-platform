import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { AppShellPayload } from '../../../api/workspaceContracts.js';
import { ConfirmDialog, useConfirmDialog } from '../../../../../design/components/ConfirmDialog.js';
import { ProviderModelBrainCard } from '../../../../../design/components/ProviderModelBrainCard.js';
import { ToastContainer, useToast } from '../../../../../design/components/Toast.js';
import {
  SettingsActionBar,
  SettingsSection,
  SettingsSectionHeader,
  SettingsSubSection,
} from '../../../../../design/components/settings/index.js';
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
import { CoverCropDialog } from '../../../../../design/components/CoverCropDialog.js';
import {
  readCatCover,
  subscribeCatCover,
  writeCatCover,
} from '../../catCoverStorage.js';
import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
import { SettingsCatsDetailPanelContent } from './SettingsCatsDetailPanelContent.js';
import { SettingsCatsRegistry } from './SettingsCatsRegistry.js';
import { findNewlyCreatedActiveCat } from './settingsCatsSupport.js';
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
  const { t } = useI18n();

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
    telegramDiagnostics,
    telegramError,
  } = useSettingsCatsTelegram(payload);
  // The Telegram hook still fetches diagnostics (per-binding info is
  // rendered inside each cat's Telegram sub-card); surface any fetch
  // error via toast (SPEC-073 forbids inline feedback for Settings).
  useEffect(() => {
    if (telegramError) {
      toastFeedback(telegramError);
    }
  }, [telegramError, toastFeedback]);
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
  const [pendingCreateAvatar, setPendingCreateAvatar] = useState<string | null>(null);
  const [pendingCreateCover, setPendingCreateCover] = useState<string | null>(null);
  useEffect(() => {
    if (!isCreateRoute) {
      setPendingCreateAvatar(null);
      setPendingCreateCover(null);
    }
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

  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverCropOpen, setCoverCropOpen] = useState(false);
  useEffect(() => {
    if (!selectedCat) {
      setCoverUrl(null);
      return;
    }
    setCoverUrl(readCatCover(selectedCat.id));
    return subscribeCatCover(selectedCat.id, setCoverUrl);
  }, [selectedCat?.id]);

  const handleCoverSave = (dataUrl: string) => {
    setCoverCropOpen(false);
    if (effectiveMode === 'create') {
      setPendingCreateCover(dataUrl);
      return;
    }
    if (!selectedCat) return;
    writeCatCover(selectedCat.id, dataUrl);
  };
  const handleCoverRemove = () => {
    if (effectiveMode === 'create') {
      setPendingCreateCover(null);
      return;
    }
    if (!selectedCat) return;
    writeCatCover(selectedCat.id, null);
  };

  const isArchived = selectedCat?.status === 'archived';

  // All view-mode field edits save immediately (on change for discrete
  // choices, on blur for free-text). No dirty tracking / Save button:
  // each field commits through `updateCatProfile` and surfaces failure
  // via toast. Create mode still uses the `catForm` draft (see below) —
  // a new cat is an all-or-nothing batch with required fields.
  const commitCatProfile = useCallback(
    async (
      catId: string,
      patch: Parameters<typeof updateCatProfile>[1],
      errorLabel: string,
    ): Promise<boolean> => {
      try {
        const next = await updateCatProfile(catId, patch);
        onPayloadUpdate(next);
        return true;
      } catch (error) {
        toastFeedback(error instanceof Error ? error.message : errorLabel);
        return false;
      }
    },
    [onPayloadUpdate, toastFeedback],
  );

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
      if (pendingCreateCover) {
        writeCatCover(newCat.id, pendingCreateCover);
        setPendingCreateCover(null);
      }
    }
  };

  return (
    <>
      <div className="catsLayout catsLayoutSidePanel">
        <nav className="catsSelectorStrip" role="tablist" aria-label={t(messageKeys.sharedSettingsCatsSelectCatAria)}>
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
            aria-label={t(messageKeys.sharedSettingsCatsAddNewCatLabel)}
            data-tooltip={atCatLimit
              ? t(messageKeys.sharedCatsCreateCatLimitReached)
              : t(messageKeys.sharedSettingsCatsAddNewCatLabel)}
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
                data-tooltip={`${cat.name} (${t(messageKeys.workObjectStatusArchived)})`}
                aria-label={`${cat.name} (${t(messageKeys.workObjectStatusArchived)})`}
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
              <span>
                {t(messageKeys.sharedSettingsCatsShowArchivedLabel, { count: archivedCats.length })}
              </span>
            </label>
          ) : null}
        </nav>

        <SettingsSection
          className="catsDetailCard"
          header={
            <SettingsSectionHeader
              title={
                effectiveMode === 'create' ? t(messageKeys.sharedCatsCreateNewCat) : selectedCat ? (
                  <>
                    {selectedCat.name}
                    {selectedCat.id === payload.chat.bossCatId ? (
                      <span className="catsDetailBossTag">{t(messageKeys.sharedCatInspectBossLabel)}</span>
                    ) : null}
                    {selectedCat.status === 'archived' ? (
                      <span className="catsDetailArchivedTag">{t(messageKeys.workObjectStatusArchived)}</span>
                    ) : null}
                  </>
                ) : ''
              }
              status={
                effectiveMode === 'view' && selectedCat ? (
                  <SettingsActionBar>
                    {selectedCat.status === 'active' ? (
                          <button
                            type="button"
                            className="secondaryButton"
                            disabled={isCatBusy(busy, 'archive', selectedCat.id)}
                            onClick={() => void onArchiveCat(selectedCat.id, selectedCat.name)}
                          >
                        {t(messageKeys.sharedSettingsCatsArchiveLabel)}
                          </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="secondaryButton"
                          disabled={isCatBusy(busy, 'unarchive', selectedCat.id)}
                          onClick={() => void onUnarchiveCat(selectedCat.id, selectedCat.name)}
                        >
                          Recover
                        </button>
                        <button
                          type="button"
                          className="dangerButton"
                          disabled={isCatBusy(busy, 'delete', selectedCat.id)}
                          onClick={() => void onDeleteCat(selectedCat.id, selectedCat.name)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </SettingsActionBar>
                ) : effectiveMode === 'create' ? (
                  <SettingsActionBar>
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
                  </SettingsActionBar>
                ) : null
              }
            />
          }
        >
          {effectiveMode === 'create' ? (
            <div className="catsDetailBody">
              <div className="catsDetailColumn">
                <SettingsSubSection headerless className="catsSubCard catsIdentityCard">
                  <div className="fieldLabel">
                    <span>Avatar</span>
                    <div className="catsIdentityAvatarRow">
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
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
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
                      <label className="fieldLabelInline catsIdentityBossToggle">
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
                  <div className="fieldLabel catsCoverField">
                    <span>Cover photo</span>
                    <div className="catsCoverDock">
                      <button
                        type="button"
                        className={`catsCoverThumb${pendingCreateCover ? ' catsCoverThumbLoaded' : ' catsCoverThumbPlaceholder'}`}
                        style={pendingCreateCover ? { backgroundImage: `url(${pendingCreateCover})` } : undefined}
                        onClick={() => setCoverCropOpen(true)}
                        aria-label={pendingCreateCover ? 'Change cover photo' : 'Upload cover photo'}
                        data-tooltip={pendingCreateCover ? 'Change cover' : 'Upload cover'}
                      >
                        {!pendingCreateCover ? (
                          <svg
                            className="catsCoverPlaceholderIcon"
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                        ) : null}
                      </button>
                      <span className="catsCoverCameraBadge" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </span>
                      {pendingCreateCover ? (
                        <button
                          type="button"
                          className="catsCoverRemoveBadge"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingCreateCover(null);
                          }}
                          aria-label="Remove cover"
                          data-tooltip="Remove cover"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </SettingsSubSection>

                <SettingsSubSection
                  className="catsSubCard"
                  header={<SettingsSectionHeader title="Skill" nested />}
                >
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
                </SettingsSubSection>
              </div>

              <div className="catsDetailColumn">
                <ProviderModelBrainCard
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
              </div>
            </div>
          ) : selectedCat ? (
            <fieldset
              className={isArchived ? 'catsDetailBody catsDetailBodyReadOnly' : 'catsDetailBody'}
              disabled={isArchived}
            >
              <div className="catsDetailColumn">
              <SettingsSubSection headerless className="catsSubCard catsIdentityCard">
                <div className="fieldLabel">
                  <span>Avatar</span>
                  <div className="catsIdentityAvatarRow">
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
                      <label className="fieldLabelInline catsIdentityBossToggle">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={async (event) => {
                            if (!event.target.checked) return;
                            if (payload.chat.bossCatId && payload.chat.bossCatId !== selectedCat.id) {
                              const currentBoss = payload.chat.cats.find((c) => c.id === payload.chat.bossCatId);
                              const confirmed = await confirm({
                                title: 'Change Boss Cat',
                                message: `${currentBoss?.name ?? 'Another cat'} is currently the Boss Cat. Set ${selectedCat.name} as the Boss instead?`,
                                confirmLabel: 'Confirm',
                              });
                              if (!confirmed) return;
                            }
                            await commitCatProfile(
                              selectedCat.id,
                              { makeBoss: true },
                              'Failed to set Boss Cat.',
                            );
                          }}
                        />
                        <span>Set as Boss Cat</span>
                      </label>
                    ) : null}
                  </div>
                </div>
                <label className="fieldLabel">
                  <span>Name</span>
                  <input
                    // `key` re-mounts the uncontrolled input when the
                    // selected cat switches, picking up the new
                    // defaultValue without a second useState.
                    key={selectedCat.id}
                    className="textInput"
                    defaultValue={selectedCat.name}
                    placeholder={selectedCat.name}
                    disabled={isArchived}
                    onBlur={async (event) => {
                      const next = event.currentTarget.value.trim();
                      if (!next) {
                        event.currentTarget.value = selectedCat.name;
                        return;
                      }
                      if (next === selectedCat.name) return;
                      const ok = await commitCatProfile(
                        selectedCat.id,
                        { name: next },
                        'Failed to rename.',
                      );
                      if (!ok) {
                        event.currentTarget.value = selectedCat.name;
                      }
                    }}
                  />
                </label>
                <div className="fieldLabel catsCoverField">
                  <span>Cover photo</span>
                  <div
                    className="catsCoverDock"
                    style={
                      selectedCat.avatarColor
                        ? ({ '--cat-avatar-color': selectedCat.avatarColor } as Record<string, string>)
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      className={`catsCoverThumb${coverUrl ? ' catsCoverThumbLoaded' : ''}`}
                      style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
                      onClick={() => { if (!isArchived) setCoverCropOpen(true); }}
                      disabled={isArchived}
                      aria-label={coverUrl ? 'Change cover photo' : 'Upload cover photo'}
                      data-tooltip={isArchived ? undefined : (coverUrl ? 'Change cover' : 'Upload cover')}
                    />
                    {!isArchived ? (
                      <span className="catsCoverCameraBadge" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </span>
                    ) : null}
                    {coverUrl && !isArchived ? (
                      <button
                        type="button"
                        className="catsCoverRemoveBadge"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCoverRemove();
                        }}
                        aria-label="Remove cover"
                        data-tooltip="Remove cover"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </div>
              </SettingsSubSection>

              <SettingsSubSection
                className="catsSubCard"
                header={<SettingsSectionHeader title="Skill" nested />}
              >
                <div className="skillPills">
                  {SKILL_PROFILES.map((profile) => {
                    const active = (selectedCat.skillProfile ?? 'chat-default') === profile.value;
                    return (
                      <button
                        key={profile.value}
                        type="button"
                        className={active ? 'draftLeadPill draftLeadPillActive' : 'draftLeadPill'}
                        disabled={isArchived || active}
                        onClick={() => {
                          void commitCatProfile(
                            selectedCat.id,
                            { skillProfile: profile.value },
                            'Failed to change skill profile.',
                          );
                        }}
                      >
                        {profile.label}
                      </button>
                    );
                  })}
                </div>
              </SettingsSubSection>

              <SettingsSubSection
                className="catsSubCard"
                header={<SettingsSectionHeader title="Channel" nested />}
              >
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
              </SettingsSubSection>

              <SettingsSubSection
                className="catsSubCard"
                header={<SettingsSectionHeader title="Memory" nested />}
              >
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
              </SettingsSubSection>
              </div>

              <div className="catsDetailColumn">
                <ProviderModelBrainCard
                  provider={selectedCat.defaultExecutionTarget.provider ?? ''}
                  instance={selectedCat.defaultExecutionTarget.instance ?? ''}
                  model={selectedCat.defaultExecutionTarget.model ?? ''}
                  modelSelection={selectedCat.defaultModelSelection ?? null}
                  onTargetChange={(target) => {
                    void commitCatProfile(
                      selectedCat.id,
                      {
                        provider: target.provider,
                        instance: target.instance || null,
                        model: target.model || null,
                        modelSelection: target.modelSelection ?? null,
                      },
                      'Failed to update Brain.',
                    );
                  }}
                  fetchProviderRegistry={fetchProviderRegistry}
                  fetchProviderModels={fetchProviderModels}
                  fetchAdvancedProviderModels={fetchAdvancedProviderModels}
                />
              </div>
            </fieldset>
          ) : null}
        </SettingsSection>

      </div>
      <ConfirmDialog dialog={dialog} onClose={handleClose} />
      <ToastContainer toasts={toasts} />
      {avatarCropOpen ? (
        <AvatarCropDialog
          onSave={(dataUrl) => void handleAvatarSave(dataUrl)}
          onClose={() => setAvatarCropOpen(false)}
          initialDataUrl={
            effectiveMode === 'create'
              ? pendingCreateAvatar
              : selectedCat?.avatarUrl ?? null
          }
        />
      ) : null}
      {coverCropOpen ? (
        <CoverCropDialog
          onSave={handleCoverSave}
          onClose={() => setCoverCropOpen(false)}
          initialDataUrl={effectiveMode === 'create' ? pendingCreateCover : coverUrl}
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
