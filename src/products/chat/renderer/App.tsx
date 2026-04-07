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
  ConcurrentChatRelayCommandKind,
  NewChatEntryKind,
} from '../api/contracts';
import { ConfirmDialog, useConfirmDialog } from '../../../design/components/ConfirmDialog';
import {
  CHAT_PREFIX,
  isNewChatPath,
  readNewChatLeadCatId,
  readNewChatMode,
} from '../shared/channelPaths';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import {
  PRODUCT_PROVIDER_ORDER,
  getDefaultModel,
  getDefaultProviderInstance,
  getProviderDisplayName,
} from '../../../shared/providerCatalog';
import { sameProviderModelSelection } from '../../../shared/providerSelection';
import { platformSurfaceRoutePrefix } from '../../../core/platformSurface.js';
import {
  BootShell,
  type DraftTemporaryParticipant,
  emptyCatForm,
  pickGreeting,
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
  activateChatChannel,
  fetchAppShell,
  relayConcurrentChatMessage,
  updateCatProfile,
  updateChannelPendingExecutionTarget,
  updateNewChatDefaultsPreference,
} from './api';
import type { ModelSelectorValue } from './components/ModelSelector';
import {
  Sidebar,
} from './components/Sidebar';
import './styles.css';

function createDefaultModelSelectorValue(): ModelSelectorValue {
  return {
    provider: 'claude',
    model: getDefaultModel('claude') || null,
    instance: getDefaultProviderInstance('claude'),
    modelSelection: null,
  };
}

function toModelSelectorValue(
  defaults: AppShellPayload['chat']['newChatDefaults'] | null | undefined,
): ModelSelectorValue {
  if (!defaults) {
    return createDefaultModelSelectorValue();
  }

  const provider = defaults.provider?.trim() || 'claude';
  return {
    provider,
    model: defaults.model ?? (getDefaultModel(provider) || null),
    instance: defaults.instance ?? getDefaultProviderInstance(provider),
    modelSelection: defaults.modelSelection ?? null,
  };
}

function createModelSelectorValueForProvider(provider: string): ModelSelectorValue {
  return {
    provider,
    model: getDefaultModel(provider) || null,
    instance: getDefaultProviderInstance(provider),
    modelSelection: null,
  };
}

function createInitialCompareTargets(baseTarget: ModelSelectorValue): ModelSelectorValue[] {
  const fallbackProvider = PRODUCT_PROVIDER_ORDER.find((provider) => provider !== baseTarget.provider)
    ?? 'codex';

  return [
    baseTarget,
    createModelSelectorValueForProvider(fallbackProvider),
  ];
}

function createInitialGroupParticipants(baseProvider: string): DraftTemporaryParticipant[] {
  const secondProvider = PRODUCT_PROVIDER_ORDER.find((p) => p !== baseProvider) ?? 'codex';
  return [baseProvider, secondProvider].map((provider) => ({
    participantId: globalThis.crypto?.randomUUID?.() ?? `temp-${provider}-${Date.now()}`,
    name: getProviderDisplayName(provider),
    provider,
    instance: getDefaultProviderInstance(provider) ?? undefined,
    model: getDefaultModel(provider) || undefined,
    modelSelection: null,
  }));
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

function sameModelSelectorValue(
  left: ModelSelectorValue,
  right: ModelSelectorValue,
): boolean {
  return left.provider === right.provider
    && (left.instance ?? null) === (right.instance ?? null)
    && (left.model ?? null) === (right.model ?? null)
    && sameProviderModelSelection(left.modelSelection, right.modelSelection);
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
  const draftLeadCatId = routeMyCatId ?? readNewChatLeadCatId(location.search);
  const draftRoute = resolveDraftRouteContext({
    draftLeadCatId,
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
    draftLeadCatId: draftRoute.routeLeadCatId,
    draftCatIds,
  });
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [channelFiles, setChannelFiles] = useState<File[]>([]);
  const draftEntryKind: NewChatEntryKind = draftRoute.isDirectLaneRoute
    ? 'direct'
    : newChatMode === 'group'
      || draftRoute.isLeadScopedNewChatRoute
      || draftParticipants.hasParticipants
      || draftTemporaryParticipants.length > 0
      ? 'group'
      : 'solo';
  const [draftModel, setDraftModel] = useState<ModelSelectorValue>(createDefaultModelSelectorValue);
  const [draftConcurrentTargets, setDraftConcurrentTargets] = useState<ModelSelectorValue[]>(
    () => createInitialCompareTargets(createDefaultModelSelectorValue()),
  );
  const [soloChannelModel, setSoloChannelModel] = useState<ModelSelectorValue>(createDefaultModelSelectorValue);
  const [compareSendScope, setCompareSendScope] = useState<'all_members' | 'active_only'>(
    'all_members',
  );
  const [draftHighlightedCatId, setDraftHighlightedCatId] = useState<string | null>(null);
  const [draftCatModelOverrides, setDraftCatModelOverrides] = useState<Map<string, ModelSelectorValue>>(new Map);
  const wasGenericNewChatRoute = useRef(false);
  const latestNewChatDefaultsSaveId = useRef(0);
  const pendingNewChatDefaultsSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNewChatDefaultsSaveAbort = useRef<AbortController | null>(null);
  const latestSoloChannelModelSaveId = useRef(0);
  const pendingSoloChannelModelSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSoloChannelModelSaveAbort = useRef<AbortController | null>(null);
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
            && ch.leadCatId === catId,
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
            && ch.leadCatId === catId,
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
  }, []);

  const onAddDraftTemporaryParticipant = useCallback((participant: Omit<DraftTemporaryParticipant, 'participantId'> & {
    participantId?: string | null;
  }) => {
    setDraftTemporaryParticipants((prev) => [
      ...prev,
      {
        ...participant,
        participantId: participant.participantId?.trim()
          || window.crypto.randomUUID(),
      },
    ]);
  }, []);

  const onRemoveDraftTemporaryParticipant = useCallback((participantId: string) => {
    setDraftTemporaryParticipants((prev) =>
      prev.filter((participant) => participant.participantId !== participantId));
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

  const onDraftCatModelOverride = useCallback((catId: string, value: ModelSelectorValue) => {
    setDraftCatModelOverrides((prev) => {
      const copy = new Map(prev);
      copy.set(catId, value);
      return copy;
    });
  }, []);
  const resetDraftConcurrentTargets = useCallback(() => {
    setDraftConcurrentTargets(createInitialCompareTargets(draftModel));
  }, [
    draftModel.instance,
    draftModel.model,
    draftModel.modelSelection,
    draftModel.provider,
  ]);
  const seedDraftGroupParticipants = useCallback(
    () => createInitialGroupParticipants(draftModel.provider),
    [draftModel.provider],
  );

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
    changeDraftLeadCat,
  } = useAppDraftUiActions({
    addCatOpen,
    channelPlusMenuOpen,
    plusMenuOpen,
    draftCwd,
    draftLeadCatId: draftRoute.routeLeadCatId,
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
    onOpenChatsOverview,
    onSelect,
    onRenameChannel,
    onDeleteChannel,
    onRenameConcurrentGroup,
    onUngroupConcurrentGroup,
    onDeleteConcurrentGroup,
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
    resetDraftConcurrentTargets,
    createInitialGroupParticipants: seedDraftGroupParticipants,
    setDraftFiles,
    setChannelFiles,
    confirm: appConfirm,
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
    draftLeadCatId: draftRoute.routeLeadCatId,
    showingMyCatDirectLane: draftRoute.isDirectLaneRoute,
  });
  const {
    operatorState,
    setOperatorState,
  } = useOperatorLoop(readyPayload, operatorRefreshKey);
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
    draftLeadCatId: draftParticipants.routeLeadCatId,
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
    draftConcurrentTargets,
    resetDraftConcurrentTargets,
    compareGroupId: state.status === 'ready' && selectedChannel
      ? state.payload.chat.concurrentGroups.find((group) =>
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

  useEffect(() => {
    if (!readyChat) {
      return;
    }

    const nextDraftModel = toModelSelectorValue(readyChat.newChatDefaults);
    setDraftModel((currentDraftModel) =>
      sameModelSelectorValue(currentDraftModel, nextDraftModel)
        ? currentDraftModel
        : nextDraftModel);
  }, [
    readyChat?.newChatDefaults.instance,
    readyChat?.newChatDefaults.model,
    readyChat?.newChatDefaults.modelSelection,
    readyChat?.newChatDefaults.provider,
  ]);

  useEffect(() => {
    return () => {
      if (pendingNewChatDefaultsSaveTimeout.current) {
        clearTimeout(pendingNewChatDefaultsSaveTimeout.current);
        pendingNewChatDefaultsSaveTimeout.current = null;
      }
      pendingNewChatDefaultsSaveAbort.current?.abort();
      pendingNewChatDefaultsSaveAbort.current = null;
      if (pendingSoloChannelModelSaveTimeout.current) {
        clearTimeout(pendingSoloChannelModelSaveTimeout.current);
        pendingSoloChannelModelSaveTimeout.current = null;
      }
      pendingSoloChannelModelSaveAbort.current?.abort();
      pendingSoloChannelModelSaveAbort.current = null;
    };
  }, []);

  useEffect(() => {
    if (!readyChat || !readySelectedChannel || readySelectedChannel.composerMode !== 'solo') {
      return;
    }

    setSoloChannelModel({
      provider:
        readySelectedChannel.pendingProvider
        ?? readyChat.globalOrchestrator.executionTarget.provider,
      model:
        readySelectedChannel.pendingModel
        ?? readyChat.globalOrchestrator.executionTarget.model
        ?? null,
      instance:
        readySelectedChannel.pendingInstance
        ?? readyChat.globalOrchestrator.executionTarget.instance
        ?? null,
      modelSelection:
        readySelectedChannel.pendingModelSelection
        ?? readyChat.globalOrchestrator.executionModelSelection
        ?? null,
    });
  }, [
    readySelectedChannel?.id,
    readySelectedChannel?.composerMode,
    readySelectedChannel?.pendingProvider,
    readySelectedChannel?.pendingModel,
    readySelectedChannel?.pendingInstance,
    readySelectedChannel?.pendingModelSelection,
    readyChat?.globalOrchestrator.executionTarget.provider,
    readyChat?.globalOrchestrator.executionTarget.model,
    readyChat?.globalOrchestrator.executionTarget.instance,
    readyChat?.globalOrchestrator.executionModelSelection,
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
    draftLeadCatId: draftRoute.routeLeadCatId,
    showingMyCatDirectLane: draftRoute.isDirectLaneRoute,
    routeDirectLaneSummary,
    readySelectedChannel,
  });

  useEffect(() => {
    if (!readySelectedChannel || readySelectedChannel.composerMode !== 'solo') {
      return;
    }

    const pending = readySelectedChannel as {
      pendingProvider?: string | null;
      pendingModel?: string | null;
      pendingInstance?: string | null;
    };
    if (pending.pendingProvider) {
      setSoloChannelModel({
        provider: pending.pendingProvider,
        model: pending.pendingModel ?? null,
        instance: pending.pendingInstance ?? null,
        modelSelection: readySelectedChannel.pendingModelSelection ?? null,
      });
    }
  }, [readySelectedChannel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (state.status !== 'ready') {
      return;
    }

    const persistedDraftModel = toModelSelectorValue(state.payload.chat.newChatDefaults);
    if (sameModelSelectorValue(draftModel, persistedDraftModel)) {
      return;
    }

    if (pendingNewChatDefaultsSaveTimeout.current) {
      clearTimeout(pendingNewChatDefaultsSaveTimeout.current);
      pendingNewChatDefaultsSaveTimeout.current = null;
    }
    pendingNewChatDefaultsSaveAbort.current?.abort();

    const saveId = latestNewChatDefaultsSaveId.current + 1;
    latestNewChatDefaultsSaveId.current = saveId;
    const controller = new AbortController();
    pendingNewChatDefaultsSaveAbort.current = controller;
    const nextDraftModel = {
      provider: draftModel.provider,
      instance: draftModel.instance,
      model: draftModel.model,
      modelSelection: draftModel.modelSelection,
    };

    pendingNewChatDefaultsSaveTimeout.current = setTimeout(() => {
      pendingNewChatDefaultsSaveTimeout.current = null;

      void updateNewChatDefaultsPreference(nextDraftModel, controller.signal)
        .then((payload) => {
          if (controller.signal.aborted || latestNewChatDefaultsSaveId.current !== saveId) {
            return;
          }
          pendingNewChatDefaultsSaveAbort.current = null;
          startTransition(() => setState({ status: 'ready', payload }));
        })
        .catch((error) => {
          if (controller.signal.aborted || latestNewChatDefaultsSaveId.current !== saveId) {
            return;
          }
          pendingNewChatDefaultsSaveAbort.current = null;
          setFeedback(
            error instanceof Error
              ? error.message
              : 'Failed to save new chat model defaults.',
          );
        });
    }, 150);

    return () => {
      if (pendingNewChatDefaultsSaveTimeout.current) {
        clearTimeout(pendingNewChatDefaultsSaveTimeout.current);
        pendingNewChatDefaultsSaveTimeout.current = null;
      }
      controller.abort();
    };
  }, [
    draftModel.instance,
    draftModel.model,
    draftModel.modelSelection,
    draftModel.provider,
    setFeedback,
    state.status,
    state.status === 'ready' ? state.payload.chat.newChatDefaults.instance : null,
    state.status === 'ready' ? state.payload.chat.newChatDefaults.model : null,
    state.status === 'ready' ? state.payload.chat.newChatDefaults.modelSelection : null,
    state.status === 'ready' ? state.payload.chat.newChatDefaults.provider : null,
  ]);

  useEffect(() => {
    if (state.status !== 'ready' || !readyChat || !readySelectedChannel || readySelectedChannel.composerMode !== 'solo') {
      return;
    }

    const persistedSoloModel: ModelSelectorValue = {
      provider:
        readySelectedChannel.pendingProvider
        ?? readyChat.globalOrchestrator.executionTarget.provider,
      model:
        readySelectedChannel.pendingModel
        ?? readyChat.globalOrchestrator.executionTarget.model
        ?? null,
      instance:
        readySelectedChannel.pendingInstance
        ?? readyChat.globalOrchestrator.executionTarget.instance
        ?? null,
      modelSelection:
        readySelectedChannel.pendingModelSelection
        ?? readyChat.globalOrchestrator.executionModelSelection
        ?? null,
    };

    if (sameModelSelectorValue(soloChannelModel, persistedSoloModel)) {
      return;
    }

    if (pendingSoloChannelModelSaveTimeout.current) {
      clearTimeout(pendingSoloChannelModelSaveTimeout.current);
      pendingSoloChannelModelSaveTimeout.current = null;
    }
    pendingSoloChannelModelSaveAbort.current?.abort();

    const channelId = readySelectedChannel.id;
    const saveId = latestSoloChannelModelSaveId.current + 1;
    latestSoloChannelModelSaveId.current = saveId;
    const controller = new AbortController();
    pendingSoloChannelModelSaveAbort.current = controller;
    const nextSoloModel = {
      pendingProvider: soloChannelModel.provider,
      pendingModel: soloChannelModel.model,
      pendingInstance: soloChannelModel.instance,
      pendingModelSelection: soloChannelModel.modelSelection,
    };

    pendingSoloChannelModelSaveTimeout.current = setTimeout(() => {
      pendingSoloChannelModelSaveTimeout.current = null;

      void updateChannelPendingExecutionTarget(channelId, nextSoloModel, controller.signal)
        .then((payload) => {
          if (controller.signal.aborted || latestSoloChannelModelSaveId.current !== saveId) {
            return;
          }
          pendingSoloChannelModelSaveAbort.current = null;
          startTransition(() => setState({ status: 'ready', payload }));
        })
        .catch((error) => {
          if (controller.signal.aborted || latestSoloChannelModelSaveId.current !== saveId) {
            return;
          }
          pendingSoloChannelModelSaveAbort.current = null;
          setFeedback(
            error instanceof Error
              ? error.message
              : 'Failed to save this chat AI reply settings.',
          );
        });
    }, 150);

    return () => {
      if (pendingSoloChannelModelSaveTimeout.current) {
        clearTimeout(pendingSoloChannelModelSaveTimeout.current);
        pendingSoloChannelModelSaveTimeout.current = null;
      }
      controller.abort();
    };
  }, [
    readyChat,
    readySelectedChannel,
    setFeedback,
    soloChannelModel.instance,
    soloChannelModel.model,
    soloChannelModel.modelSelection,
    soloChannelModel.provider,
    state.status,
  ]);

  const selectedConcurrentGroup = readyPayload && selectedChannel
    ? readyPayload.chat.concurrentGroups.find((group) =>
        group.memberChannelIds.includes(selectedChannel.id),
      ) ?? null
    : null;

  useEffect(() => {
    setCompareSendScope('all_members');
  }, [selectedConcurrentGroup?.id]);

  const onDraftConcurrentTargetChange = useCallback((index: number, value: ModelSelectorValue) => {
    setDraftConcurrentTargets((prev) =>
      prev.map((target, currentIndex) => (currentIndex === index ? value : target)),
    );
  }, []);

  const onAddDraftConcurrentTarget = useCallback(() => {
    setDraftConcurrentTargets((prev) => [
      ...prev,
      createNextCompareTarget(prev, draftModel),
    ]);
  }, [
    draftModel.instance,
    draftModel.model,
    draftModel.modelSelection,
    draftModel.provider,
  ]);

  const onRemoveDraftConcurrentTarget = useCallback((index: number) => {
    setDraftConcurrentTargets((prev) => {
      if (prev.length <= 2) {
        return prev;
      }

      return prev.filter((_, currentIndex) => currentIndex !== index);
    });
  }, []);

  const onRelayCompareMessage = useCallback(async (
    messageId: string,
    command: ConcurrentChatRelayCommandKind,
  ): Promise<void> => {
    if (!selectedChannel || !selectedConcurrentGroup) {
      return;
    }

    setBusy('concurrent:relay');
    setFeedback('');
    try {
      const dispatch = await relayConcurrentChatMessage(selectedConcurrentGroup.id, {
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
    selectedConcurrentGroup,
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
    draftLeadCatId: draftRoute.routeLeadCatId,
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
        onRenameConcurrentGroup={onRenameConcurrentGroup}
        onUngroupConcurrentGroup={onUngroupConcurrentGroup}
        onDeleteConcurrentGroup={onDeleteConcurrentGroup}
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
              compareGroup: selectedConcurrentGroup,
              compareSendScope,
              onCompareSendScopeChange: setCompareSendScope,
              onRelayMessage: onRelayCompareMessage,
              liveIndicator,
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
              autoResize,
              draftLeadCatId,
              entryMode: newChatMode,
              selectedModel: draftModel,
              onModelChange: onDraftModelChange,
              draftHighlightedCatId,
              onHighlightDraftCat: setDraftHighlightedCatId,
              draftCatModelOverrides,
              onDraftCatModelOverride,
              onDirectLaneModelChange: onDirectLaneModelSave,
              parallelTargets: showingParallelChatDraft ? draftConcurrentTargets : undefined,
              onParallelTargetChange: showingParallelChatDraft ? onDraftConcurrentTargetChange : undefined,
              onAddParallelTarget: showingParallelChatDraft ? onAddDraftConcurrentTarget : undefined,
              onRemoveParallelTarget: showingParallelChatDraft ? onRemoveDraftConcurrentTarget : undefined,
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
            onChangeDraftLeadCat={changeDraftLeadCat}
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
