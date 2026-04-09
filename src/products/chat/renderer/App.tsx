import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router-dom';

import type {
  AppShellPayload,
  ParallelChatRelayCommandKind,
  NewChatEntryKind,
} from '../api/contracts';
import { ConfirmDialog, useConfirmDialog } from '../../../design/components/ConfirmDialog';
import {
  CHAT_PREFIX,
  isNewChatPath,
  readNewChatDefaultRecipientCatId,
  readNewChatMode,
} from '../shared/channelPaths';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import {
  PRODUCT_PROVIDER_ORDER,
  getProviderDisplayName,
} from '../../../shared/providerCatalog';
import { platformSurfaceRoutePrefix } from '../../../core/platformSurface.js';
import {
  BootShell,
  createDraftTemporaryParticipant,
  pickGreeting,
  createInitialGroupParticipants,
  type DraftTemporaryParticipant,
  emptyCatForm,
  resolveGenericDraftTemporaryParticipants,
  type CatFormState,
} from './chatUtils';
import { AppRoutes } from './AppRoutes';
import { PlatformSettingsRoutes } from '../../../app/renderer/settings/PlatformSettingsRoutes.js';
import { deriveAppRouteState, deriveAppViewState, type AppLoadState } from './appViewState';
import {
  resolveDraftParticipantSelection,
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
import { useChatEvents } from './hooks/useChatEvents';
import {
  createDefaultModelSelectorValue,
  createModelSelectorValueForProvider,
  useWorkspaceModelSelectionState,
} from '../../shared/renderer/hooks/useWorkspaceModelSelectionState.js';
import {
  activateChatChannel,
  fetchAppShell,
  relayParallelChatMessage,
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

function createInitialCompareTargets(baseTarget: ModelSelectorValue): ModelSelectorValue[] {
  const fallbackProvider = PRODUCT_PROVIDER_ORDER.find((provider) => provider !== baseTarget.provider)
    ?? 'codex';

  return [
    baseTarget,
    createModelSelectorValueForProvider(fallbackProvider),
  ];
}

function createNextCompareTarget(
  currentTargets: ModelSelectorValue[],
  fallbackTarget: ModelSelectorValue,
): ModelSelectorValue {
  const nextProvider = PRODUCT_PROVIDER_ORDER.find((provider) =>
    !currentTargets.some((target) => target.provider === provider),
  ) ?? PRODUCT_PROVIDER_ORDER.find((provider) => provider !== fallbackTarget.provider)
    ?? fallbackTarget.provider;

  return createModelSelectorValueForProvider(nextProvider);
}

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

  const [state, setState] = useState<AppLoadState>({ status: 'loading' });
  const [composerDraft, setComposerDraft] = useState('');
  const [catForm, setCatForm] = useState<CatFormState>(emptyCatForm);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [addCatTab, setAddCatTab] = useState<'existing' | 'new'>('existing');
  const [greeting] = useState(pickGreeting);
  const [draftCwd, setDraftCwd] = useState<string | null>(null);
  const [draftCatIds, setDraftCatIds] = useState<string[]>([]);
  const [draftTemporaryParticipants, setDraftTemporaryParticipants] = useState<DraftTemporaryParticipant[]>([]);
  const draftParticipants = resolveDraftParticipantSelection({
    draftDefaultRecipientCatId: draftRoute.routeDefaultRecipientCatId,
    draftCatIds,
  });
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [channelFiles, setChannelFiles] = useState<File[]>([]);
  const draftEntryKind: NewChatEntryKind = draftRoute.isDirectLaneRoute
    ? 'direct'
    : newChatMode === 'group'
      || draftRoute.isRecipientScopedNewChatRoute
      || draftParticipants.hasParticipants
      || draftTemporaryParticipants.length > 0
      ? 'group'
      : 'solo';
  const [draftParallelChatTargets, setDraftParallelChatTargets] = useState<ModelSelectorValue[]>(
    () => createInitialCompareTargets(createDefaultModelSelectorValue()),
  );
  const [compareSendScope, setCompareSendScope] = useState<'all_members' | 'active_only'>(
    'all_members',
  );
  const [draftHighlightedCatId, setDraftHighlightedCatId] = useState<string | null>(null);
  const [draftCatModelOverrides, setDraftCatModelOverrides] = useState<Map<string, ModelSelectorValue>>(new Map);
  const maxDraftGroupParticipants = state.status === 'ready'
    ? state.payload.chat.capabilities.maxCats ?? Number.POSITIVE_INFINITY
    : Number.POSITIVE_INFINITY;
  const wasGenericNewChatRoute = useRef(false);
  const [companionMode, setCompanionMode] = useState(false);
  const previousMyCatIdRef = useRef(routeMyCatId);
  useEffect(() => {
    if (previousMyCatIdRef.current !== routeMyCatId) {
      previousMyCatIdRef.current = routeMyCatId;
      setCompanionMode(false);
    }
  }, [routeMyCatId]);
  const companionCat = companionMode && routeMyCatId && state.status === 'ready'
    ? state.payload.chat.cats.find((cat) => cat.id === routeMyCatId) ?? null
    : null;
  const onToggleCompanionMode = useCallback(() => {
    setCompanionMode((prev) => !prev);
  }, []);
  const onCompanionWake = useCallback((catId: string) => {
    const channel = state.status === 'ready'
      ? state.payload.chat.channels.find(
          (ch) =>
            ch.channelKind === 'direct_lane'
            && ch.defaultRecipientCatId === catId,
        )
      : null;
    if (channel) {
      void activateChatChannel(channel.id).then(() => {
        void fetchAppShell().then((payload) => {
          if (payload) updatePayload(payload);
        });
      });
    }
  }, [state]);
  const onCompanionSleep = useCallback((catId: string) => {
    // Request deactivation by re-fetching after a brief pause to let the
    // session settle. Full session-discipline (reset/compact) will be exposed
    // through dedicated session-continuity API routes in a follow-up.
    const channel = state.status === 'ready'
      ? state.payload.chat.channels.find(
          (ch) =>
            ch.channelKind === 'direct_lane'
            && ch.defaultRecipientCatId === catId,
        )
      : null;
    if (channel) {
      void fetch(`/api/channels/${encodeURIComponent(channel.id)}/deactivate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }).catch(() => {
        // Best-effort; session may already be inactive.
      }).then(() => {
        void fetchAppShell().then((payload) => {
          if (payload) updatePayload(payload);
        });
      });
    }
  }, [state]);

  // SSE live updates — refresh UI on transport and room events
  const refreshAppShell = useCallback(() => {
    void fetchAppShell().then((payload) => {
      if (payload) updatePayload(payload);
    });
  }, []);
  useChatEvents({
    onRoomUpdated: refreshAppShell,
    onRecentsChanged: refreshAppShell,
    onUnreadChanged: refreshAppShell,
    onTransportIngress: refreshAppShell,
  }, state.status === 'ready');

  const { dialog: appDialog, confirm: appConfirm, handleClose: appHandleClose } = useConfirmDialog();

  const onToggleDraftCat = useCallback((catId: string) => {
    setDraftCatIds((prev) => {
      const isRemoving = prev.includes(catId);
      if (!isRemoving && prev.length + draftTemporaryParticipants.length >= maxDraftGroupParticipants) {
        return prev;
      }
      const next = isRemoving ? prev.filter((id) => id !== catId) : [...prev, catId];
      if (isRemoving) {
        setDraftHighlightedCatId((current) =>
          current === catId ? (next.length > 0 ? next[0] : null) : current);
        setDraftCatModelOverrides((overrides) => {
          const copy = new Map(overrides);
          copy.delete(catId);
          return copy;
        });
      } else {
        setDraftHighlightedCatId(catId);
      }
      return next;
    });
  }, [draftTemporaryParticipants.length, maxDraftGroupParticipants]);

  const onAddDraftTemporaryParticipant = useCallback((participant: Omit<DraftTemporaryParticipant, 'participantId'> & {
    participantId?: string | null;
  }) => {
    setDraftTemporaryParticipants((prev) => {
      if (draftParticipants.participantCatIds.length + prev.length >= maxDraftGroupParticipants) {
        return prev;
      }
      const takenNames = [
        ...draftParticipants.participantCatIds.map((catId) =>
          (state.status === 'ready'
            ? state.payload.chat.cats.find((cat) => cat.id === catId)?.name
            : null) ?? ''),
        ...prev.map((candidate) => candidate.name),
      ].filter((name) => name.trim().length > 0);
      return [
        ...prev,
        createDraftTemporaryParticipant({
          ...participant,
          takenNames,
          randomUUID: () => window.crypto.randomUUID(),
        }),
      ];
    });
  }, [draftParticipants.participantCatIds, maxDraftGroupParticipants, state]);

  const onRemoveDraftTemporaryParticipant = useCallback((participantId: string) => {
    setDraftTemporaryParticipants((prev) =>
      prev.filter((participant) => participant.participantId !== participantId));
  }, []);

  const onUpdateDraftTemporaryParticipant = useCallback((
    participantId: string,
    input: { name?: string | null; roleHint?: string | null },
  ) => {
    setDraftTemporaryParticipants((prev) =>
      prev.map((participant) =>
        participant.participantId === participantId
          ? {
              ...participant,
              ...(input.name !== undefined ? { name: input.name?.trim() || participant.name } : {}),
              ...(input.roleHint !== undefined
                ? { roleHint: input.roleHint?.trim() || undefined }
                : {}),
            }
          : participant),
    );
  }, []);

  const onDirectLaneModelSave = useCallback(async (catId: string, value: ModelSelectorValue) => {
    try {
      const result = await updateCatProfile(catId, {
        provider: value.provider,
        instance: value.instance,
        model: value.model,
        modelSelection: value.modelSelection,
      });
      startTransition(() => setState({ status: 'ready', payload: result }));
    } catch {
      // Silent fail — the panel shows current state from payload
    }
  }, [setState]);

  const onUpdateChannelParticipant = useCallback(async (
    channelId: string,
    participantId: string,
    input: { name?: string; roleHint?: string | null },
  ) => {
    setBusy(`channel:participant:update:${participantId}`);
    try {
      const payload = await updateChannelParticipantApi(channelId, participantId, input);
      startTransition(() => {
        setState({ status: 'ready', payload });
        setFeedback('');
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to update participant.');
    } finally {
      setBusy('');
    }
  }, [setBusy, setFeedback, setState]);

  const onDraftCatModelOverride = useCallback((catId: string, value: ModelSelectorValue) => {
    setDraftCatModelOverrides((prev) => {
      const copy = new Map(prev);
      copy.set(catId, value);
      return copy;
    });
  }, []);

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
  const resetDraftParallelChatTargets = useCallback(() => {
    setDraftParallelChatTargets(createInitialCompareTargets(draftModel));
  }, [
    draftModel.instance,
    draftModel.model,
    draftModel.modelSelection,
    draftModel.provider,
  ]);
  const seedDraftGroupParticipants = useCallback(
    () => createInitialGroupParticipants(draftModel.provider, maxDraftGroupParticipants),
    [draftModel.provider, maxDraftGroupParticipants],
  );
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
  });
  const {
    onComposerKeyDown,
    onCancelPendingSend,
    onSendMessage,
    onStopMessage,
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
    draftModel,
    soloChannelModel,
    showingParallelChatDraft,
    draftParallelChatTargets,
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

  useEffect(() => {
    document.title = routeChannelTitle
      ? `${routeChannelTitle.trim() === 'Untitled chat' ? 'New chat' : routeChannelTitle} - Cats Chat`
      : 'Cats Chat';
  }, [routeChannelTitle]);

  useEffect(() => {
    const isGenericNewChatRoute = showingNewChatDraft && draftRoute.isGenericNewChatRoute;
    const justEnteredGenericNewChatRoute = isGenericNewChatRoute && !wasGenericNewChatRoute.current;
    wasGenericNewChatRoute.current = isGenericNewChatRoute;
    if (!justEnteredGenericNewChatRoute) {
      return;
    }

    setDraftCatIds([]);
    setDraftTemporaryParticipants((current) =>
      resolveGenericDraftTemporaryParticipants(
        newChatMode,
        current,
        seedDraftGroupParticipants,
      ));
    setDraftHighlightedCatId(null);
    setDraftCatModelOverrides(new Map());
  }, [
    draftRoute.isGenericNewChatRoute,
    newChatMode,
    seedDraftGroupParticipants,
    setDraftCatIds,
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
  }, []);

  const onResumeChannel = useCallback(async (channelId: string): Promise<void> => {
    setBusy('channel:resume');
    setFeedback('');
    try {
      const activation = await activateChatChannel(channelId);
      startTransition(() => setState({ status: 'ready', payload: activation.appShell }));
      const errors = activation.results.filter((result) => result.status === 'error');
      if (errors.length > 0) {
        setFeedback(
          errors
            .map((result) => result.error || `Failed to resume ${result.targetName}.`)
            .join(' '),
        );
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to resume chat session.');
    } finally {
      setBusy('');
    }
  }, []);

  const selectedParallelChatGroup = readyPayload && selectedChannel
    ? readyPayload.chat.parallelChatGroups.find((group) =>
        group.memberChannelIds.includes(selectedChannel.id),
      ) ?? null
    : null;

  useEffect(() => {
    setCompareSendScope('all_members');
  }, [selectedParallelChatGroup?.id]);

  const onDraftParallelChatTargetChange = useCallback((index: number, value: ModelSelectorValue) => {
    setDraftParallelChatTargets((prev) =>
      prev.map((target, currentIndex) => (currentIndex === index ? value : target)),
    );
  }, []);

  const onAddDraftParallelChatTarget = useCallback(() => {
    setDraftParallelChatTargets((prev) => [
      ...prev,
      createNextCompareTarget(prev, draftModel),
    ]);
  }, [
    draftModel.instance,
    draftModel.model,
    draftModel.modelSelection,
    draftModel.provider,
  ]);

  const onRemoveDraftParallelChatTarget = useCallback((index: number) => {
    setDraftParallelChatTargets((prev) => {
      if (prev.length <= 2) {
        return prev;
      }

      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }, []);

  const onRelayCompareMessage = useCallback(async (
    messageId: string,
    command: ParallelChatRelayCommandKind,
  ): Promise<void> => {
    if (!selectedChannel || !selectedParallelChatGroup) {
      return;
    }

    setBusy('parallelChat:relay');
    setFeedback('');
    try {
      const dispatch = await relayParallelChatMessage(selectedParallelChatGroup.id, {
        activeChannelId: selectedChannel.id,
        sourceChannelId: selectedChannel.id,
        sourceMessageId: messageId,
        command,
        targetPolicy: 'all_others',
      });
      startTransition(() => setState({ status: 'ready', payload: dispatch.appShell }));

      const failures = dispatch.results.filter((result) => result.status === 'error');
      if (failures.length > 0) {
        setFeedback(
          failures
            .map((result) => result.error || `Relay failed for ${result.channelId}.`)
            .join(' '),
        );
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to relay compare message.');
    } finally {
      setBusy('');
    }
  }, [
    selectedChannel,
    selectedParallelChatGroup,
    setBusy,
    setFeedback,
    setState,
  ]);

  function updatePayload(payload: AppShellPayload): void {
    startTransition(() => setState({ status: 'ready', payload }));
  }

  if (state.status === 'loading') {
    return <BootShell />;
  }

  if (state.status === 'error') {
    return (
      <div className="screen screenCentered">
        <div className="errorPanel">
          <p className="eyebrow">Renderer Error</p>
          <h1>Chat unavailable</h1>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  const { payload } = state;
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
  const visibleChatChannelId = selectedChannel?.id ?? directLaneChannel?.id ?? null;

  function onSwitchProduct(nextSurface: PlatformSurfaceId): void {
    navigate(platformSurfaceRoutePrefix(nextSurface));
  }

  return (
    <div
      className={
        sidebarOpen
          ? 'screen claudeShell'
          : 'screen claudeShell claudeShellSidebarCollapsed'
      }
    >
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

      <main className="canvas">
        {settingsMode ? (
          <PlatformSettingsRoutes
            payload={payload}
            onPayloadUpdate={updatePayload}
            feedback={feedback}
            busy={busy}
            onFeedback={setFeedback}
            onBusy={setBusy}
            onResetSetup={onResetSetup}
          />
        ) : (
          <AppRoutes
            payload={payload}
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
              onToggleDraftCat: onToggleDraftCat,
              onAddDraftTemporaryParticipant: onAddDraftTemporaryParticipant,
              onRemoveDraftTemporaryParticipant: onRemoveDraftTemporaryParticipant,
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
              onParallelTargetChange: showingParallelChatDraft ? onDraftParallelChatTargetChange : undefined,
              onAddParallelTarget: showingParallelChatDraft ? onAddDraftParallelChatTarget : undefined,
              onRemoveParallelTarget: showingParallelChatDraft ? onRemoveDraftParallelChatTarget : undefined,
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
              onToggleDraftCat: onToggleDraftCat,
              onCatFormChange: setCatForm,
              onCreateCat: (event) => {
                if (showingNewChatDraft && draftRoute.isGenericNewChatRoute) {
                  void onCreateAndDraftCat(event);
                  return;
                }
                void onCreateAndAssignCat(event);
              },
            }}
            folderBrowserProps={{
              folderBrowsePath,
              folderBrowseCurrentPath: folderBrowseCurrentPath ?? '',
              folderBrowseParentPath: folderBrowseParentPath ?? '',
              folderBrowseEntries,
              folderBrowseLoading,
              folderBrowseError,
              onPathChange: setFolderBrowsePath,
              onBrowse: (path) => {
                void browseFolder(path);
              },
              onSelect: selectCurrentFolder,
            }}
            onOpenDraftAddCat={openDraftAddCatPanel}
            onChangeDraftDefaultRecipient={changeDraftDefaultRecipient}
            companionMode={companionMode}
            companionCat={companionCat}
            onToggleCompanionMode={onToggleCompanionMode}
            onCompanionWake={onCompanionWake}
            onCompanionSleep={onCompanionSleep}
          />
        )}
      </main>
      <ConfirmDialog dialog={appDialog} onClose={appHandleClose} />
    </div>
  );
}
