import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router-dom';

import type {
  AppShellPayload,
  NewChatEntryKind,
} from '../api/contracts';
import { useConfirmDialog } from '../../../design/components/ConfirmDialog';
import {
  CHAT_PREFIX,
  isNewChatPath,
  readNewChatDefaultRecipientCatId,
  readNewChatMode,
} from '../shared/channelPaths';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import {
  getProviderDisplayName,
} from '../../../shared/providerCatalog';
import { platformSurfaceRoutePrefix } from '../../../core/platformSurface.js';
import {
  BootShell,
  createDraftTemporaryParticipant,
  createNextGroupTemporaryParticipant,
  pickGreeting,
  presentChannelTitle,
  createInitialGroupParticipants,
  emptyCatForm,
  reconcileDraftAudienceKeysAfterParticipantRemoval,
  resolveGenericDraftTemporaryParticipants,
  syncLeadDraftTemporaryParticipantWithTarget,
  type CatFormState,
} from './chatUtils';
import { AppRoutes } from './AppRoutes';
import { deriveAppRouteState, deriveAppViewState, type AppLoadState } from './appViewState';
import {
  resolveDraftRouteContext,
} from './draftParticipants';
import { useAppChrome } from './hooks/useAppChrome';
import { useAppDraftUiActions } from './hooks/useAppDraftUiActions';
import { useAppNavigationActions } from './hooks/useAppNavigationActions';
import { useAppShellRouting } from './hooks/useAppShellRouting';
import { useCatAssignmentActions } from './hooks/useCatAssignmentActions';
import { useComposerSubmit } from './hooks/useComposerSubmit';
import { useFolderBrowser } from './hooks/useFolderBrowser';
import { useGovernanceActions } from './hooks/useGovernanceActions';
import { useOperatorLoop } from './hooks/useOperatorLoop';
import { useLiveIndicator } from './hooks/useLiveIndicator';
import { setBrowserLiveTraceEnabled } from '../../../shared/liveTrace.js';
import { useChannelParticipantUpdate } from './hooks/useChannelParticipantUpdate';
import { useCompanionMode } from './hooks/useCompanionMode';
import { useDraftParticipantState } from './hooks/useDraftParticipantState';
import { useParallelChatDraft } from './hooks/useParallelChatDraft';
import {
  useOnGenericDraftRouteEntry,
} from '../../shared/renderer/hooks/useOnGenericDraftRouteEntry.js';
import {
  useProductChannelDocumentTitle,
} from '../../shared/renderer/hooks/useProductChannelDocumentTitle.js';
import {
  useWorkspaceDirectLaneModelSave,
  useWorkspaceResumeChannel,
} from '../../shared/renderer/hooks/useWorkspaceAppShellChannelActions.js';
import {
  useWorkspaceModelSelectionState,
} from '../../shared/renderer/hooks/useWorkspaceModelSelectionState.js';
import {
  useWorkspaceAppTransientState,
} from '../../shared/renderer/hooks/useWorkspaceAppTransientState.js';
import {
  usePublishReadyPayload,
} from '../../shared/renderer/hooks/usePublishReadyPayload.js';
import {
  ProductAppStateBoundary,
} from '../../shared/renderer/ProductRendererFrame.js';
import { ProductReadyShell } from '../../shared/renderer/ProductReadyShell.js';
import {
  buildFolderBrowserContentProps,
  resolveVisibleChatChannelId,
} from '../../shared/renderer/appShellPresentation.js';
import {
  activateChatChannel,
  fetchAppShell,
  updateCatProfile,
  updateChannelParticipantApi,
  updateChannelPendingExecutionTarget,
  updateNewChatDefaultsPreference,
} from './api';
import type { ModelSelectorValue } from './components/ModelSelector';
import {
  Sidebar,
} from './components/Sidebar';
import './styles.css';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const settingsMode = location.pathname === '/settings' || location.pathname.startsWith('/settings/');
  const channelMatch = useMatch(`${CHAT_PREFIX}/chats/:channelId`);
  const myCatMatch = useMatch(`${CHAT_PREFIX}/my-cats/:catId`);
  const routeChannelId = channelMatch?.params.channelId ?? null;
  const routeMyCatId = myCatMatch?.params.catId ?? null;
  const showingNewChatDraft = isNewChatPath(location.pathname);
  const newChatMode = showingNewChatDraft ? readNewChatMode(location.search) : 'default';
  const showingParallelChatDraft = newChatMode === 'parallel';
  const draftDefaultRecipientCatId = routeMyCatId ?? readNewChatDefaultRecipientCatId(location.search);
  const draftRoute = resolveDraftRouteContext({
    draftDefaultRecipientCatId,
    showingMyCatDirectLane: Boolean(routeMyCatId),
  });

  const {
    state,
    setState,
    composerDraft,
    setComposerDraft,
    catForm,
    setCatForm,
    busy,
    setBusy,
    feedback,
    setFeedback,
    addCatTab,
    setAddCatTab,
    greeting,
    draftCwd,
    setDraftCwd,
    draftFiles,
    setDraftFiles,
    channelFiles,
    setChannelFiles,
  } = useWorkspaceAppTransientState<AppLoadState, CatFormState>({
    initialState: { status: 'loading' },
    createEmptyCatForm: emptyCatForm,
    pickGreeting,
  });
  const maxDraftGroupParticipants = state.status === 'ready'
    ? state.payload.chat.capabilities.maxChatParticipants ?? Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  const maxDraftAudienceParticipants = state.status === 'ready'
    ? state.payload.chat.capabilities.maxAudienceParticipants ?? Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  const [draftWorkflowShape, setDraftWorkflowShape] = useState<'sequential' | 'concurrent'>('sequential');
  const [draftAudienceKeys, setDraftAudienceKeys] = useState<string[] | null>(null);
  const { dialog: appDialog, confirm: appConfirm, handleClose: appHandleClose } = useConfirmDialog();

  const publishReadyPayload = usePublishReadyPayload<AppShellPayload>(setState);

  const onDirectLaneModelSave = useWorkspaceDirectLaneModelSave<AppShellPayload>({
    updateCatProfile,
    publishReadyPayload,
  });

  const onUpdateChannelParticipant = useChannelParticipantUpdate({
    updateChannelParticipantApi,
    setBusy,
    setFeedback,
    setState,
  });

  const {
    draftCatIds,
    setDraftCatIds,
    draftTemporaryParticipants,
    setDraftTemporaryParticipants,
    draftHighlightedCatId,
    setDraftHighlightedCatId,
    draftCatModelOverrides,
    setDraftCatModelOverrides,
    draftParticipants,
    onToggleDraftCat,
    onAddDraftTemporaryParticipant,
    onRemoveDraftTemporaryParticipant,
    onUpdateDraftTemporaryParticipant,
    onDraftCatModelOverride,
  } = useDraftParticipantState({
    state,
    draftDefaultRecipientCatId: draftRoute.routeDefaultRecipientCatId,
    maxDraftGroupParticipants,
  });
  const draftEntryKind: NewChatEntryKind = draftRoute.isDirectLaneRoute
    ? 'direct'
    : newChatMode === 'group'
      || draftRoute.isRecipientScopedNewChatRoute
      || draftParticipants.hasParticipants
      || draftTemporaryParticipants.length > 0
      ? 'group'
      : 'solo';

  const {
    accountMenuOpen,
    setAccountMenuOpen,
    sidebarOpen,
    overflowMenuOpenId,
    setOverflowMenuOpenId,
    plusMenuOpen,
    setPlusMenuOpen,
    addCatOpen,
    setAddCatOpen,
    channelPlusMenuOpen,
    setChannelPlusMenuOpen,
    accountMenuRef,
    plusMenuRef,
    addCatPanelRef,
    fileInputRef,
    channelPlusMenuRef,
    channelFileInputRef,
    autoResize,
    onToggleSidebar,
    onCollapsedSidebarClick,
  } = useAppChrome();
  const {
    browseFolder,
    folderBrowseCurrentPath,
    folderBrowseEntries,
    folderBrowseError,
    folderBrowseLoading,
    folderBrowseParentPath,
    folderBrowsePath,
    openFolderBrowser,
    selectCurrentFolder,
    setFolderBrowsePath,
  } = useFolderBrowser({
    onSelectPath: setDraftCwd,
  });
  const {
    toggleAddCatPanel,
    toggleChannelPlusMenu,
    openChannelFilePicker,
    toggleDraftPlusMenu,
    openDraftFilePicker,
    openDraftFolderPicker,
    openDraftAddCatPanel,
    changeDraftDefaultRecipient,
  } = useAppDraftUiActions({
    addCatOpen,
    channelPlusMenuOpen,
    plusMenuOpen,
    draftCwd,
    draftDefaultRecipientCatId: draftRoute.routeDefaultRecipientCatId,
    showingMyCatDirectLane: draftRoute.isDirectLaneRoute,
    navigate,
    setAddCatOpen,
    setAddCatTab,
    setFeedback,
    setCatForm,
    setPlusMenuOpen,
    setChannelPlusMenuOpen,
    channelFileInputRef,
    fileInputRef,
    openFolderBrowser,
  });
  const {
    readyPayload,
    readyChat,
    readySelectedChannel,
    selectedChannelId,
    selectedChannelViewId,
    selectedChannelEntryLifecycle,
    routeChannelExists,
    routeChannelTitle,
    routeDirectLaneSummary,
    selectedChannel,
    selectedDirectLane,
    operatorRefreshKey,
  } = deriveAppRouteState({
    state,
    routeChannelId,
    draftDefaultRecipientCatId: draftRoute.routeDefaultRecipientCatId,
    showingMyCatDirectLane: draftRoute.isDirectLaneRoute,
  });
  const {
    operatorState,
    setOperatorState,
  } = useOperatorLoop(readyPayload, operatorRefreshKey);
  const {
    draftModel,
    setDraftModel,
    soloChannelModel,
    setSoloChannelModel,
  } = useWorkspaceModelSelectionState({
    state,
    readyChat,
    readySelectedChannel,
    setState,
    setFeedback,
    updateNewChatDefaultsPreference,
    updateChannelPendingExecutionTarget,
  });
  const {
    draftParallelChatTargets,
    compareSendScope,
    setCompareSendScope,
    selectedParallelChatGroup,
    resetDraftParallelChatTargets,
    onDraftParallelChatTargetChange,
    onAddDraftParallelChatTarget,
    onRemoveDraftParallelChatTarget,
    onRelayCompareMessage,
  } = useParallelChatDraft({
    readyPayload,
    selectedChannel,
    draftModel,
    setState,
    setBusy,
    setFeedback,
  });
  const seedDraftGroupParticipants = useCallback(
    () => createInitialGroupParticipants(draftModel, maxDraftGroupParticipants),
    [
      draftModel.instance,
      draftModel.model,
      draftModel.modelSelection,
      draftModel.provider,
      maxDraftGroupParticipants,
    ],
  );
  const onQuickAddDraftTemporaryParticipant = useCallback(() => {
    if (state.status !== 'ready') {
      return;
    }

    const visibleCatNames = draftParticipants.participantCatIds
      .map((catId) => state.payload.chat.cats.find((cat) => cat.id === catId)?.name ?? '')
      .filter((name) => name.trim().length > 0);
    let addedParticipantId: string | null = null;

    setDraftTemporaryParticipants((current) => {
      if (draftParticipants.participantCatIds.length + current.length >= maxDraftGroupParticipants) {
        return current;
      }

      const nextParticipant = current.length === 0 && draftParticipants.participantCatIds.length === 0
        ? createDraftTemporaryParticipant({
            provider: draftModel.provider,
            instance: draftModel.instance,
            model: draftModel.model,
            modelSelection: draftModel.modelSelection,
            takenNames: [...visibleCatNames, ...current.map((participant) => participant.name)],
            randomUUID: () =>
              globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`,
          })
        : createNextGroupTemporaryParticipant({
            baseProvider: draftModel.provider,
            existingParticipants: current,
            takenNames: [...visibleCatNames, ...current.map((participant) => participant.name)],
            randomUUID: () =>
              globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`,
          });
      addedParticipantId = nextParticipant.participantId;
      return [...current, nextParticipant];
    });

    if (!addedParticipantId) {
      return;
    }

    // Auto-add new member to audience if under the limit; otherwise leave unchecked.
    setDraftAudienceKeys((current) => {
      const visibleCatKeys = draftParticipants.participantCatIds.map((catId) => `cat:${catId}`);
      const currentParticipantKeys = [
        ...visibleCatKeys,
        ...draftTemporaryParticipants.map((participant) => `temp:${participant.participantId}`),
      ];
      const nextParticipantKey = `temp:${addedParticipantId}`;
      const baseAudienceKeys = current ?? currentParticipantKeys;
      const normalizedAudienceKeys = baseAudienceKeys.filter((key, index, source) =>
        source.indexOf(key) === index && currentParticipantKeys.includes(key));

      // If audience is at or over the limit, don't add — just materialize and return
      if (Number.isFinite(maxDraftAudienceParticipants)
        && normalizedAudienceKeys.length >= maxDraftAudienceParticipants) {
        return normalizedAudienceKeys;
      }

      return [...normalizedAudienceKeys, nextParticipantKey];
    });
  }, [
    draftTemporaryParticipants,
    draftModel.provider,
    draftParticipants.participantCatIds,
    maxDraftAudienceParticipants,
    maxDraftGroupParticipants,
    setDraftAudienceKeys,
    setDraftTemporaryParticipants,
    state,
  ]);
  const draftParticipantKeys = [
    ...draftParticipants.participantCatIds.map((catId) => `cat:${catId}`),
    ...draftTemporaryParticipants.map((participant) => `temp:${participant.participantId}`),
  ];
  const onToggleDraftCatWithAudienceSync = useCallback((catId: string) => {
    const isRemoving = draftParticipants.participantCatIds.includes(catId);
    onToggleDraftCat(catId);

    if (!isRemoving) {
      // Adding: auto-add to audience if under limit
      const addedKey = `cat:${catId}`;
      setDraftAudienceKeys((current) => {
        const baseKeys = current ?? draftParticipantKeys;
        const normalized = baseKeys.filter((key, i, src) => src.indexOf(key) === i);
        if (Number.isFinite(maxDraftAudienceParticipants)
          && normalized.length >= maxDraftAudienceParticipants) {
          return normalized;
        }
        return [...normalized, addedKey];
      });
      return;
    }

    const removedParticipantKey = `cat:${catId}`;
    const nextParticipantKeys = draftParticipantKeys.filter((key) => key !== removedParticipantKey);
    setDraftAudienceKeys((current) =>
      reconcileDraftAudienceKeysAfterParticipantRemoval({
        draftAudienceKeys: current,
        previousParticipantKeys: draftParticipantKeys,
        nextParticipantKeys,
        removedParticipantKey,
        maxAudienceParticipants: maxDraftAudienceParticipants,
      }));
  }, [
    draftParticipantKeys,
    draftParticipants.participantCatIds,
    maxDraftAudienceParticipants,
    onToggleDraftCat,
    setDraftAudienceKeys,
  ]);
  const onRemoveDraftTemporaryParticipantWithAudienceSync = useCallback((participantId: string) => {
    const removedParticipantKey = `temp:${participantId}`;
    const nextParticipantKeys = draftParticipantKeys.filter((key) => key !== removedParticipantKey);
    onRemoveDraftTemporaryParticipant(participantId);
    setDraftAudienceKeys((current) =>
      reconcileDraftAudienceKeysAfterParticipantRemoval({
        draftAudienceKeys: current,
        previousParticipantKeys: draftParticipantKeys,
        nextParticipantKeys,
        removedParticipantKey,
        maxAudienceParticipants: maxDraftAudienceParticipants,
      }));
  }, [
    draftParticipantKeys,
    maxDraftAudienceParticipants,
    onRemoveDraftTemporaryParticipant,
    setDraftAudienceKeys,
  ]);
  const onAddDraftTemporaryParticipantWithAudienceSync = useCallback((
    participant: Parameters<typeof onAddDraftTemporaryParticipant>[0],
  ) => {
    const isNewLeadParticipant =
      showingNewChatDraft
      && newChatMode === 'group'
      && draftParticipants.participantCatIds.length === 0
      && draftTemporaryParticipants.length === 0;
    onAddDraftTemporaryParticipant(participant);
    if (isNewLeadParticipant && participant.provider.trim()) {
      setDraftModel({
        provider: participant.provider.trim(),
        model: participant.model?.trim() || null,
        instance: participant.instance?.trim() || null,
        modelSelection: participant.modelSelection ?? null,
      });
    }
    const addedKey = `temp:${participant.participantId ?? ''}`;
    if (!addedKey || addedKey === 'temp:') return;
    setDraftAudienceKeys((current) => {
      const baseKeys = current ?? draftParticipantKeys;
      const normalized = baseKeys.filter((key, i, src) => src.indexOf(key) === i);
      if (Number.isFinite(maxDraftAudienceParticipants)
        && normalized.length >= maxDraftAudienceParticipants) {
        return normalized;
      }
      return [...normalized, addedKey];
    });
  }, [
    draftParticipantKeys,
    maxDraftAudienceParticipants,
    newChatMode,
    onAddDraftTemporaryParticipant,
    draftParticipants.participantCatIds.length,
    draftTemporaryParticipants.length,
    setDraftAudienceKeys,
    setDraftModel,
    showingNewChatDraft,
  ]);
  const {
    onOpenChatsOverview,
    onSelect,
    onRenameChannel,
    onDeleteChannel,
    onRenameParallelChatGroup,
    onUngroupParallelChatGroup,
    onDeleteParallelChatGroup,
    onArchiveCat,
    onDeleteCat,
    onNavigateSettings,
    onDirectChatCat,
    onResetSetup,
    onStartNewChat,
    onStartNewGroupChat,
    onStartNewParallelChat,
  } = useAppNavigationActions({
    state,
    setState,
    navigate,
    setBusy,
    setFeedback,
    setComposerDraft,
    setAccountMenuOpen,
    setAddCatOpen,
    setAddCatTab,
    setPlusMenuOpen,
    setChannelPlusMenuOpen,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatModelOverrides,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    resetDraftParallelChatTargets,
    createInitialGroupParticipants: seedDraftGroupParticipants,
    setDraftFiles,
    setChannelFiles,
    confirm: appConfirm,
  });
  const liveIndicatorChannel = selectedChannel ?? selectedDirectLane ?? null;
  const liveIndicator = useLiveIndicator({
    channelId: liveIndicatorChannel?.id ?? null,
    busy,
    selectedChannel: liveIndicatorChannel,
    debugTraceEnabled: readyPayload?.chat.capabilities.debugLiveTrace === true,
  });
  const {
    onComposerKeyDown,
    onCancelPendingSend,
    onSendMessage,
    onStopMessage,
    onRetryMessage,
  } = useComposerSubmit({
    state,
    setState,
    navigate,
    currentPathname: location.pathname,
    composerDraft,
    setComposerDraft,
    showingNewChatDraft,
    showingMyCatDirectLane: draftRoute.isDirectLaneRoute,
    draftEntryKind,
    draftDefaultRecipientCatId: draftParticipants.routeDefaultRecipientCatId,
    draftParticipantCatIds: draftParticipants.participantCatIds,
    draftTemporaryParticipants,
    draftCwd,
    draftFiles,
    channelFiles,
    setDraftCwd,
    setDraftCatIds,
    setDraftTemporaryParticipants,
    setDraftHighlightedCatId,
    setDraftCatModelOverrides,
    setDraftFiles,
    setChannelFiles,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    draftModel,
    soloChannelModel,
    showingParallelChatDraft,
    draftParallelChatTargets,
    draftWorkflowShape,
    draftAudienceKeys,
    resetDraftParallelChatTargets,
    compareGroupId: state.status === 'ready' && selectedChannel
      ? state.payload.chat.parallelChatGroups.find((group) =>
          group.memberChannelIds.includes(selectedChannel.id),
        )?.id ?? null
      : null,
    compareSendScope,
    selectedChannel,
    busy,
    setBusy,
    setFeedback,
  });
  const {
    onAssignExistingCat,
    onCreateAndAssignCat,
    onCreateAndDraftCat,
    onRemoveAssignedCat,
    toggleDraftCat,
  } = useCatAssignmentActions({
    state,
    setState,
    catForm,
    setCatForm,
    setBusy,
    setFeedback,
    setAddCatOpen,
    setDraftCatIds,
  });
  const {
    onApprovalDecision,
    onChoiceSubmit,
    onOperatorAction,
  } = useGovernanceActions({
    state,
    setState,
    operatorState,
    setOperatorState,
    setBusy,
    setFeedback,
  });

  useProductChannelDocumentTitle('Cats Chat', routeChannelTitle);

  useEffect(() => {
    setBrowserLiveTraceEnabled(readyPayload?.chat.capabilities.debugLiveTrace === true);
  }, [readyPayload?.chat.capabilities.debugLiveTrace]);

  useOnGenericDraftRouteEntry(
    showingNewChatDraft && draftRoute.isGenericNewChatRoute,
    useCallback(() => {
      setDraftCatIds([]);
      setDraftTemporaryParticipants((current) =>
        resolveGenericDraftTemporaryParticipants(
          newChatMode,
          current,
          seedDraftGroupParticipants,
        ));
      setDraftHighlightedCatId(null);
      setDraftCatModelOverrides(new Map());
      setDraftWorkflowShape('sequential');
      setDraftAudienceKeys(null);
    }, [
      newChatMode,
      seedDraftGroupParticipants,
      setDraftCatIds,
      setDraftTemporaryParticipants,
      setDraftHighlightedCatId,
      setDraftCatModelOverrides,
      setDraftWorkflowShape,
      setDraftAudienceKeys,
    ]),
  );

  useEffect(() => {
    if (!showingNewChatDraft || newChatMode !== 'group') {
      return;
    }

    setDraftTemporaryParticipants((current) =>
      syncLeadDraftTemporaryParticipantWithTarget({
        participants: current,
        target: draftModel,
      }));
  }, [
    draftModel.instance,
    draftModel.model,
    draftModel.modelSelection,
    draftModel.provider,
    newChatMode,
    setDraftTemporaryParticipants,
    showingNewChatDraft,
  ]);

  useAppShellRouting({
    state,
    setState,
    navigate,
    busy,
    routeChannelId,
    routeChannelExists,
    selectedChannelId,
    selectedChannelViewId,
    selectedChannelEntryLifecycle,
    draftDefaultRecipientCatId: draftRoute.routeDefaultRecipientCatId,
    showingMyCatDirectLane: draftRoute.isDirectLaneRoute,
    routeDirectLaneSummary,
    readySelectedChannel,
  });

  const onDraftModelChange = useCallback((nextDraftModel: ModelSelectorValue): void => {
    setDraftModel(nextDraftModel);
    if (showingNewChatDraft && newChatMode === 'group') {
      setDraftTemporaryParticipants((current) =>
        syncLeadDraftTemporaryParticipantWithTarget({
          participants: current,
          target: nextDraftModel,
        }));
    }
  }, [newChatMode, setDraftTemporaryParticipants, showingNewChatDraft]);

  const onDraftParallelChatTargetChangeWithSharedDefault = useCallback((
    index: number,
    value: ModelSelectorValue,
  ): void => {
    onDraftParallelChatTargetChange(index, value);
    if (index === 0) {
      setDraftModel(value);
    }
  }, [onDraftParallelChatTargetChange, setDraftModel]);

  const onResumeChannel = useWorkspaceResumeChannel<AppShellPayload>({
    activateChatChannel,
    publishReadyPayload,
    setBusy,
    setFeedback,
  });

  const updatePayload = usePublishReadyPayload<AppShellPayload>(setState);

  const {
    companionMode,
    companionCat,
    onToggleCompanionMode,
    onCompanionWake,
    onCompanionSleep,
  } = useCompanionMode({
    routeMyCatId,
    state,
    updatePayload,
  });

  return (
    <ProductAppStateBoundary
      state={state}
      BootShell={BootShell}
      unavailableTitle="Chat unavailable"
      renderReady={(payload) => {
        const {
          surface,
          directLaneChannel,
          activeMyCatId,
          activeAssignedCats,
          assignedCatIds,
          bossCatName,
          bossCatAvatarColor,
          showBossCatAvatar,
          selectableCats,
          assignableCatCount,
          draftCatIdSet,
          showDirectLaneBoot,
          showAddCatPanel,
        } = deriveAppViewState({
          pathname: location.pathname,
          payload,
          draftDefaultRecipientCatId: draftRoute.routeDefaultRecipientCatId,
          showingGenericNewChatDraft: showingNewChatDraft && draftRoute.isGenericNewChatRoute,
          selectedChannel,
          selectedDirectLane,
          routeDirectLaneSummary,
          showingMyCatDirectLane: draftRoute.isDirectLaneRoute,
          addCatOpen,
          draftCatIds,
        });
        const visibleChatChannelId = resolveVisibleChatChannelId(
          selectedChannel,
          directLaneChannel,
        );

        function onSwitchProduct(nextSurface: PlatformSurfaceId): void {
          navigate(platformSurfaceRoutePrefix(nextSurface));
        }

        return (
          <ProductReadyShell
            payload={payload}
            sidebarOpen={sidebarOpen}
            sidebar={(
              <Sidebar
                payload={payload}
                sidebarOpen={sidebarOpen}
                accountMenuOpen={accountMenuOpen}
                overflowMenuOpenId={overflowMenuOpenId}
                busy={busy}
                surface={surface}
                shellSurface="chat"
                routeChannelId={routeChannelId}
                accountMenuRef={accountMenuRef}
                onToggleSidebar={onToggleSidebar}
                onCollapsedSidebarClick={onCollapsedSidebarClick}
                onOpenChatsOverview={onOpenChatsOverview}
                onStartNewChat={onStartNewChat}
                onStartNewGroupChat={onStartNewGroupChat}
                onStartNewParallelChat={onStartNewParallelChat}
                onSelect={onSelect}
                onDeleteChannel={onDeleteChannel}
                onRenameChannel={onRenameChannel}
                onRenameParallelChatGroup={onRenameParallelChatGroup}
                onUngroupParallelChatGroup={onUngroupParallelChatGroup}
                onDeleteParallelChatGroup={onDeleteParallelChatGroup}
                onArchiveCat={onArchiveCat}
                onAccountMenuToggle={() => setAccountMenuOpen(!accountMenuOpen)}
                onOverflowMenuToggle={setOverflowMenuOpenId}
                onNavigateSettings={onNavigateSettings}
                onSwitchProduct={onSwitchProduct}
                activeMyCatId={activeMyCatId}
                onDirectChatCat={onDirectChatCat}
              />
            )}
            settingsMode={settingsMode}
            feedback={feedback}
            busy={busy}
            appContent={(
              <AppRoutes
                payload={payload}
                routeChannelId={routeChannelId}
                selectedChannel={selectedChannel}
                directLaneChannel={directLaneChannel}
                showDirectLaneBoot={showDirectLaneBoot}
                feedback={feedback}
                busy={busy}
                chatSurfaceProps={{
                  operatorSnapshot: operatorState.snapshot,
                  operatorLoading:
                    operatorState.status === 'loading' && operatorState.snapshot === null,
                  operatorError: operatorState.status === 'error' ? operatorState.message : '',
                  composerDraft,
                  busy,
                  feedback,
                  greeting,
                  onSelect,
                  channelFiles,
                  channelPlusMenuOpen,
                  channelPlusMenuRef,
                  channelFileInputRef,
                  activeAssignedCats,
                  bossCatName,
                  bossCatAvatarColor,
                  showBossCatAvatar,
                  onComposerChange: setComposerDraft,
                  onComposerKeyDown,
                  onSendMessage,
                  onCancelPendingSend,
                  onStopMessage,
                  onRetryMessage,
                  onToggleChannelPlusMenu: toggleChannelPlusMenu,
                  onChannelFileSelect: openChannelFilePicker,
                  onChannelFilesChange: setChannelFiles,
                  onApprovalDecision,
                  onChoiceSubmit,
                  onResumeChannel: visibleChatChannelId
                    ? () => onResumeChannel(visibleChatChannelId)
                    : undefined,
                  onOperatorAction,
                  autoResize,
                  selectedModel:
                    selectedChannel?.composerMode === 'solo' ? soloChannelModel : undefined,
                  onModelChange:
                    selectedChannel?.composerMode === 'solo' ? setSoloChannelModel : undefined,
                  onDirectLaneModelChange: onDirectLaneModelSave,
                  compareGroup: selectedParallelChatGroup,
                  compareSendScope,
                  onCompareSendScopeChange: setCompareSendScope,
                  onRelayMessage: onRelayCompareMessage,
                  liveIndicator,
                  onUpdateChannelParticipant: visibleChatChannelId
                    ? (participantId, input) =>
                      onUpdateChannelParticipant(visibleChatChannelId, participantId, input)
                    : undefined,
                }}
                draftSurfaceProps={{
                  composerDraft,
                  busy,
                  greeting,
                  draftFiles,
                  draftCwd,
                  draftCatIds,
                  draftTemporaryParticipants,
                  plusMenuOpen,
                  plusMenuRef,
                  fileInputRef,
                  bossCatName,
                  bossCatAvatarColor,
                  onComposerChange: setComposerDraft,
                  onComposerKeyDown,
                  onSendMessage,
                  onCancelPendingSend,
                  onTogglePlusMenu: toggleDraftPlusMenu,
                  onFileSelect: openDraftFilePicker,
                  onPickFolder: openDraftFolderPicker,
                  onDraftFilesChange: setDraftFiles,
                  onDraftCwdClear: () => setDraftCwd(null),
                  onToggleDraftCat: onToggleDraftCatWithAudienceSync,
                  onAddDraftTemporaryParticipant: onAddDraftTemporaryParticipantWithAudienceSync,
                  onQuickAddDraftTemporaryParticipant,
                  onRemoveDraftTemporaryParticipant: onRemoveDraftTemporaryParticipantWithAudienceSync,
                  onUpdateDraftTemporaryParticipant: onUpdateDraftTemporaryParticipant,
                  autoResize,
                  draftDefaultRecipientCatId,
                  entryMode: newChatMode,
                  selectedModel: draftModel,
                  onModelChange: onDraftModelChange,
                  draftHighlightedCatId,
                  onHighlightDraftCat: setDraftHighlightedCatId,
                  draftCatModelOverrides,
                  onDraftCatModelOverride,
                  onDirectLaneModelChange: onDirectLaneModelSave,
                  parallelTargets: showingParallelChatDraft ? draftParallelChatTargets : undefined,
                  onParallelTargetChange: showingParallelChatDraft
                    ? onDraftParallelChatTargetChangeWithSharedDefault
                    : undefined,
                  onAddParallelTarget: showingParallelChatDraft ? onAddDraftParallelChatTarget : undefined,
                  onRemoveParallelTarget: showingParallelChatDraft ? onRemoveDraftParallelChatTarget : undefined,
                  draftWorkflowShape,
                  onToggleDraftWorkflowShape: () => setDraftWorkflowShape((prev) => prev === 'concurrent' ? 'sequential' : 'concurrent'),
                  draftAudienceKeys,
                  onSetAudienceKeys: setDraftAudienceKeys,
                }}
                addCatOpen={showAddCatPanel}
                onToggleAddCat={toggleAddCatPanel}
                addCatPanelProps={{
                  panelRef: addCatPanelRef,
                  selectableCats,
                  assignableCatCount,
                  addCatTab,
                  showingNewChatDraft: showingNewChatDraft && draftRoute.isGenericNewChatRoute,
                  draftCatIdSet,
                  assignedCatIds,
                  catForm,
                  onClose: () => setAddCatOpen(false),
                  onTabChange: setAddCatTab,
                  onAssignExistingCat,
                  onRemoveAssignedCat,
                  onToggleDraftCat: onToggleDraftCatWithAudienceSync,
                  onCatFormChange: setCatForm,
                  onCreateCat: (event) => {
                    if (showingNewChatDraft && draftRoute.isGenericNewChatRoute) {
                      void onCreateAndDraftCat(event);
                      return;
                    }
                    void onCreateAndAssignCat(event);
                  },
                }}
                folderBrowserProps={buildFolderBrowserContentProps({
                  folderBrowsePath,
                  folderBrowseCurrentPath,
                  folderBrowseParentPath,
                  folderBrowseEntries,
                  folderBrowseLoading,
                  folderBrowseError,
                  onPathChange: setFolderBrowsePath,
                  browseFolder,
                  selectCurrentFolder,
                })}
                onOpenDraftAddCat={openDraftAddCatPanel}
                onChangeDraftDefaultRecipient={changeDraftDefaultRecipient}
                companionMode={companionMode}
                companionCat={companionCat}
                onToggleCompanionMode={onToggleCompanionMode}
                onCompanionWake={onCompanionWake}
                onCompanionSleep={onCompanionSleep}
              />
            )}
            confirmDialog={appDialog}
            onPayloadUpdate={updatePayload}
            onFeedback={setFeedback}
            onBusy={setBusy}
            onResetSetup={onResetSetup}
            onConfirmClose={appHandleClose}
          />
        );
      }}
    />
  );
}
