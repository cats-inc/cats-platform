import {
  useCallback,
  useEffect,
  useMemo,
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
  readNewChatPreset,
} from '../shared/channelPaths';
import type { PlatformSurfaceId } from '../../../shared/platform-contract.js';
import { isSettingsPath } from '../../../shared/settingsRoute.js';
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
import { resolveActiveChannelAudienceState } from './composerMessageMetadata.js';
import { AppRoutes } from './AppRoutes';
import { deriveAppRouteState, deriveAppViewState, type AppLoadState } from './appViewState';
import {
  resolveDraftRouteContext,
} from './draftParticipants';
import { createNextCompareTarget } from './hooks/useParallelChatDraft.js';
import { isAdvancedDraftControlsEnabled } from '../../shared/advancedDraftControls.js';
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
import { useDirectLaneCompanionMode } from './hooks/useDirectLaneCompanionMode';
import { useChatAppShellRefresh } from './hooks/useChatAppShellRefresh';
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
  useWorkspaceResetChannelContinuity,
  useWorkspaceResumeChannel,
} from '../../shared/renderer/hooks/useWorkspaceAppShellChannelActions.js';
import {
  useWorkspaceExecutionTargetState,
} from '../../shared/renderer/hooks/useWorkspaceExecutionTargetState.js';
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
  buildCrossSurfaceNavigationMatchPath,
  peekCrossSurfaceNavigationSnapshot,
} from '../../shared/renderer/crossSurfaceNavigationHandoff.js';
import {
  activateChatChannel,
  fetchAppShell,
  resetChannelContinuity,
  updateCatProfile,
  updateChannelParticipantApi,
  updateChannelPendingExecutionTarget,
  updateNewChatDefaultsPreference,
} from './api';
import type { ExecutionTargetValue } from '../../shared/renderer/components/ExecutionTarget.js';
import {
  Sidebar,
} from './components/Sidebar';
import './styles.css';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const settingsMode = isSettingsPath(location.pathname);
  const channelMatch = useMatch(`${CHAT_PREFIX}/chats/:channelId`);
  const myCatMatch = useMatch(`${CHAT_PREFIX}/my-cats/:catId`);
  const routeChannelId = channelMatch?.params.channelId ?? null;
  const routeMyCatId = myCatMatch?.params.catId ?? null;
  const showingNewChatDraft = isNewChatPath(location.pathname);
  const newChatPreset = showingNewChatDraft ? readNewChatPreset(location.search) : 'default';
  const showingParallelChatDraft = newChatPreset === 'parallel';
  const draftDefaultRecipientCatId = routeMyCatId ?? readNewChatDefaultRecipientCatId(location.search);
  const draftRoute = resolveDraftRouteContext({
    draftDefaultRecipientCatId,
    showingMyCatDirectLane: Boolean(routeMyCatId),
  });
  const [draftSurface, setDraftSurface] = useState<PlatformSurfaceId>('chat');
  const draftSurfaceResetKey = useMemo(
    () => [
      newChatPreset,
      draftRoute.isDirectLaneRoute ? 'direct' : 'public',
      draftDefaultRecipientCatId ?? 'none',
    ].join(':'),
    [draftDefaultRecipientCatId, draftRoute.isDirectLaneRoute, newChatPreset],
  );
  const currentNavigationPath = useMemo(
    () => buildCrossSurfaceNavigationMatchPath(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const initialWarmPayload = useMemo(
    () => peekCrossSurfaceNavigationSnapshot<AppShellPayload>({
      surface: 'chat',
      path: currentNavigationPath,
    }),
    [currentNavigationPath],
  );

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
    initialState: initialWarmPayload
      ? { status: 'ready', payload: initialWarmPayload }
      : { status: 'loading' },
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
  const [activeWorkflowShape, setActiveWorkflowShape] = useState<'sequential' | 'concurrent'>('sequential');
  const [activeAudienceKeys, setActiveAudienceKeys] = useState<string[] | null>(null);
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
    draftCatExecutionTargetOverrides,
    setDraftCatExecutionTargetOverrides,
    draftParticipants,
    onToggleDraftCat,
    onAddDraftTemporaryParticipant,
    onRemoveDraftTemporaryParticipant,
    onUpdateDraftTemporaryParticipant,
    onDraftCatExecutionTargetOverride,
  } = useDraftParticipantState({
    state,
    draftDefaultRecipientCatId: draftRoute.routeDefaultRecipientCatId,
    maxDraftGroupParticipants,
  });
  const draftEntryKind: NewChatEntryKind = draftRoute.isDirectLaneRoute
    ? 'direct'
    : newChatPreset === 'group'
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
    surface: 'chat',
    directLaneCatId: routeMyCatId,
    initialPreferences:
      state.status === 'ready'
        ? state.payload.chat.folderBrowsePreferences
        : undefined,
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
    draftExecutionTarget,
    setDraftExecutionTarget,
    soloChannelExecutionTarget,
    setSoloChannelExecutionTarget,
  } = useWorkspaceExecutionTargetState({
    state,
    readyChat,
    readySelectedChannel,
    setState,
    setFeedback,
    updateNewChatDefaultsPreference,
    updateChannelPendingExecutionTarget,
  });
  const {
    draftParallelBranches,
    draftParallelChatTargets,
    draftParallelBranchAudienceKeys,
    draftParallelBranchWorkflowShapes,
    compareSendScope,
    setCompareSendScope,
    selectedParallelChatGroup,
    resetDraftParallelChatTargets,
    onDraftParallelChatTargetChange,
    onAddDraftParallelChatTarget,
    onRemoveDraftParallelChatTarget,
    onSetDraftParallelBranchAudienceKeys,
    onToggleDraftParallelBranchWorkflowShape,
    onRelayCompareMessage,
  } = useParallelChatDraft({
    readyPayload,
    selectedChannel,
    draftExecutionTarget,
    setState,
    setBusy,
    setFeedback,
    seedCompareTarget: showingParallelChatDraft,
  });
  const advancedDraftControlsEnabled = isAdvancedDraftControlsEnabled(
    readyPayload?.chat.advancedDraftControls ?? null,
    'chat',
  );
  const hasVisibleParallelDraftTargets = draftParallelChatTargets.length > 1;
  const latestActiveUserMessage = selectedChannel?.messages
    ? [...selectedChannel.messages].reverse().find((message) => message.senderKind === 'user') ?? null
    : null;
  const latestActiveUserRecipientIdsKey = Array.isArray(
    latestActiveUserMessage?.metadata?.recipientParticipantIds,
  )
    ? latestActiveUserMessage.metadata.recipientParticipantIds
      .filter((value): value is string => typeof value === 'string')
      .join('|')
    : '';
  const latestActiveUserWorkflowShape = typeof latestActiveUserMessage?.metadata?.workflowShape === 'string'
    ? latestActiveUserMessage.metadata.workflowShape
    : '';
  const activeAudienceParticipantIdsKey = (
    selectedChannel?.assignedParticipants?.length
      ? selectedChannel.assignedParticipants
      : selectedChannel?.assignedCats ?? []
  )
    .filter((participant) => participant.status === 'active')
    .map((participant) => participant.participantId)
    .join('|');

  useEffect(() => {
    setDraftSurface('chat');
  }, [draftSurfaceResetKey]);

  useEffect(() => {
    const nextAudienceState = resolveActiveChannelAudienceState({
      selectedChannel,
      maxAudienceParticipants: maxDraftAudienceParticipants,
    });
    setActiveWorkflowShape(nextAudienceState?.workflowShape ?? 'sequential');
    setActiveAudienceKeys(nextAudienceState?.audienceKeys ?? null);
  }, [
    activeAudienceParticipantIdsKey,
    latestActiveUserMessage?.id,
    latestActiveUserRecipientIdsKey,
    latestActiveUserWorkflowShape,
    maxDraftAudienceParticipants,
    selectedChannel?.id,
  ]);

  const seedDraftGroupParticipants = useCallback(
    () => createInitialGroupParticipants(draftExecutionTarget, maxDraftGroupParticipants),
    [
      draftExecutionTarget.instance,
      draftExecutionTarget.model,
      draftExecutionTarget.modelSelection,
      draftExecutionTarget.provider,
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
            provider: draftExecutionTarget.provider,
            instance: draftExecutionTarget.instance,
            model: draftExecutionTarget.model,
            modelSelection: draftExecutionTarget.modelSelection,
            takenNames: [...visibleCatNames, ...current.map((participant) => participant.name)],
            randomUUID: () =>
              globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`,
          })
        : createNextGroupTemporaryParticipant({
            baseProvider: draftExecutionTarget.provider,
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
    draftExecutionTarget.provider,
    draftParticipants.participantCatIds,
    maxDraftAudienceParticipants,
    maxDraftGroupParticipants,
    setDraftAudienceKeys,
    setDraftTemporaryParticipants,
    state,
  ]);
  const draftParticipantKeys = useMemo(
    () => [
      ...draftParticipants.participantCatIds.map((catId) => `cat:${catId}`),
      ...draftTemporaryParticipants.map((participant) => `temp:${participant.participantId}`),
    ],
    [draftParticipants.participantCatIds, draftTemporaryParticipants],
  );
  const appendAudienceKeyWithinLimit = useCallback((
    currentKeys: readonly string[],
    nextKey: string,
  ): string[] => {
    const normalized = currentKeys.filter((key, index, source) =>
      source.indexOf(key) === index);
    if (normalized.includes(nextKey)) {
      return normalized;
    }
    if (Number.isFinite(maxDraftAudienceParticipants)
      && normalized.length >= maxDraftAudienceParticipants) {
      return normalized;
    }
    return [...normalized, nextKey];
  }, [maxDraftAudienceParticipants]);
  const resolveParallelAudienceSeed = useCallback((): string[] => {
    const primaryBranchAudience = draftParallelBranchAudienceKeys[0];
    if (primaryBranchAudience && primaryBranchAudience.length > 0) {
      return [...primaryBranchAudience];
    }
    if (draftAudienceKeys && draftAudienceKeys.length > 0) {
      return [...draftAudienceKeys];
    }
    if (!Number.isFinite(maxDraftAudienceParticipants)) {
      return [...draftParticipantKeys];
    }
    return draftParticipantKeys.slice(0, maxDraftAudienceParticipants);
  }, [
    draftAudienceKeys,
    draftParallelBranchAudienceKeys,
    draftParticipantKeys,
    maxDraftAudienceParticipants,
  ]);
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
    if (draftParallelChatTargets.length >= 2) {
      draftParallelBranchAudienceKeys.forEach((branchAudienceKeys, index) => {
        if (!branchAudienceKeys.includes(removedParticipantKey)) {
          return;
        }
        onSetDraftParallelBranchAudienceKeys(index, reconcileDraftAudienceKeysAfterParticipantRemoval({
          draftAudienceKeys: branchAudienceKeys,
          previousParticipantKeys: draftParticipantKeys,
          nextParticipantKeys,
          removedParticipantKey,
          maxAudienceParticipants: maxDraftAudienceParticipants,
        }) ?? []);
      });
    }
  }, [
    draftParticipantKeys,
    draftParticipants.participantCatIds,
    draftParallelBranchAudienceKeys,
    draftParallelChatTargets.length,
    maxDraftAudienceParticipants,
    onToggleDraftCat,
    onSetDraftParallelBranchAudienceKeys,
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
    if (draftParallelChatTargets.length >= 2) {
      draftParallelBranchAudienceKeys.forEach((branchAudienceKeys, index) => {
        if (!branchAudienceKeys.includes(removedParticipantKey)) {
          return;
        }
        onSetDraftParallelBranchAudienceKeys(index, reconcileDraftAudienceKeysAfterParticipantRemoval({
          draftAudienceKeys: branchAudienceKeys,
          previousParticipantKeys: draftParticipantKeys,
          nextParticipantKeys,
          removedParticipantKey,
          maxAudienceParticipants: maxDraftAudienceParticipants,
        }) ?? []);
      });
    }
  }, [
    draftParticipantKeys,
    draftParallelBranchAudienceKeys,
    draftParallelChatTargets.length,
    maxDraftAudienceParticipants,
    onRemoveDraftTemporaryParticipant,
    onSetDraftParallelBranchAudienceKeys,
    setDraftAudienceKeys,
  ]);
  const onAddDraftTemporaryParticipantWithAudienceSync = useCallback((
    participant: Parameters<typeof onAddDraftTemporaryParticipant>[0],
  ) => {
    const isNewLeadParticipant =
      showingNewChatDraft
      && newChatPreset === 'group'
      && draftParticipants.participantCatIds.length === 0
      && draftTemporaryParticipants.length === 0;
    onAddDraftTemporaryParticipant(participant);
    if (isNewLeadParticipant && participant.provider.trim()) {
      setDraftExecutionTarget({
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
    newChatPreset,
    onAddDraftTemporaryParticipant,
    draftParticipants.participantCatIds.length,
    draftTemporaryParticipants.length,
    setDraftAudienceKeys,
    setDraftExecutionTarget,
    showingNewChatDraft,
  ]);
  const onQuickAddDraftTemporaryParticipantToBranch = useCallback((branchIndex: number | null = null) => {
    if (state.status !== 'ready') {
      return;
    }

    const isBranchScoped = branchIndex !== null && draftParallelChatTargets.length >= 2;

    if (isBranchScoped) {
      // Parallel branch: each branch is its own sub-chat, so
      // maxChatParticipants caps branch membership. The shared pool
      // can legitimately grow past that total when multiple branches
      // each hold their own members — the pool-wide cap does not
      // apply here.
      const branchMembers = draftParallelBranchAudienceKeys[branchIndex] ?? [];
      if (Number.isFinite(maxDraftGroupParticipants)
        && branchMembers.length >= maxDraftGroupParticipants) {
        return;
      }
    } else if (
      draftParticipants.participantCatIds.length + draftTemporaryParticipants.length >= maxDraftGroupParticipants
    ) {
      return;
    }

    // Build the temp synchronously so its id is available for the
    // branch-audience update below. Creating it inside
    // setDraftTemporaryParticipants((current) => ...) defers
    // execution to React's commit phase, which runs after this
    // callback returns — at which point any closure variable set
    // inside would still be null when we read it.
    const visibleCatNames = draftParticipants.participantCatIds
      .map((catId) => state.payload.chat.cats.find((cat) => cat.id === catId)?.name ?? '')
      .filter((name) => name.trim().length > 0);
    const takenNames = [
      ...visibleCatNames,
      ...draftTemporaryParticipants.map((participant) => participant.name),
    ];
    const nextParticipant = draftTemporaryParticipants.length === 0
      && draftParticipants.participantCatIds.length === 0
      ? createDraftTemporaryParticipant({
          provider: draftExecutionTarget.provider,
          instance: draftExecutionTarget.instance,
          model: draftExecutionTarget.model,
          modelSelection: draftExecutionTarget.modelSelection,
          takenNames,
          randomUUID: () =>
            globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`,
        })
      : createNextGroupTemporaryParticipant({
          baseProvider: draftExecutionTarget.provider,
          existingParticipants: draftTemporaryParticipants,
          takenNames,
          randomUUID: () =>
            globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`,
        });
    const nextParticipantKey = `temp:${nextParticipant.participantId}`;

    setDraftTemporaryParticipants((current) => [...current, nextParticipant]);

    if (isBranchScoped) {
      // Branch membership list — dedupe + append. Bypasses
      // appendAudienceKeyWithinLimit because that helper caps at
      // maxDraftAudienceParticipants, which is the chip-selection cap,
      // not the per-branch membership cap (maxDraftGroupParticipants).
      const currentBranchKeys = draftParallelBranchAudienceKeys[branchIndex] ?? [];
      const dedupedKeys = currentBranchKeys.filter((key, index, source) =>
        source.indexOf(key) === index);
      const nextBranchKeys = dedupedKeys.includes(nextParticipantKey)
        ? dedupedKeys
        : [...dedupedKeys, nextParticipantKey];
      onSetDraftParallelBranchAudienceKeys(branchIndex, nextBranchKeys);
      return;
    }

    setDraftAudienceKeys((current) => {
      const visibleCatKeys = draftParticipants.participantCatIds.map((catId) => `cat:${catId}`);
      const currentParticipantKeys = [
        ...visibleCatKeys,
        ...draftTemporaryParticipants.map((participant) => `temp:${participant.participantId}`),
      ];
      const baseAudienceKeys = current ?? currentParticipantKeys;
      const normalizedAudienceKeys = baseAudienceKeys.filter((key, index, source) =>
        source.indexOf(key) === index && currentParticipantKeys.includes(key));

      if (Number.isFinite(maxDraftAudienceParticipants)
        && normalizedAudienceKeys.length >= maxDraftAudienceParticipants) {
        return normalizedAudienceKeys;
      }

      return [...normalizedAudienceKeys, nextParticipantKey];
    });
  }, [
    appendAudienceKeyWithinLimit,
    draftParallelBranchAudienceKeys,
    draftParallelChatTargets.length,
    draftTemporaryParticipants,
    draftExecutionTarget.instance,
    draftExecutionTarget.model,
    draftExecutionTarget.modelSelection,
    draftExecutionTarget.provider,
    draftParticipants.participantCatIds,
    maxDraftAudienceParticipants,
    maxDraftGroupParticipants,
    onSetDraftParallelBranchAudienceKeys,
    setDraftAudienceKeys,
    setDraftTemporaryParticipants,
    state,
  ]);
  const onDraftParallelBranchGroupAddButtonClick = useCallback((branchIndex: number): void => {
    if (state.status !== 'ready') return;

    // Empty-draft bootstrap: no cats and no temps anywhere — seed the
    // global pool with 2 participants and attribute them to this
    // branch.
    if (draftParticipants.participantCatIds.length === 0 && draftTemporaryParticipants.length === 0) {
      const seededParticipants = seedDraftGroupParticipants();
      const seededKeys = seededParticipants.map((participant) => `temp:${participant.participantId}`);
      setDraftTemporaryParticipants((current) => current.length === 0 ? seededParticipants : current);
      onSetDraftParallelBranchAudienceKeys(branchIndex, seededKeys);
      return;
    }

    // Branch bootstrap: pool is non-empty but THIS branch is empty.
    // The first +collaborate click on an empty shadow should jump
    // straight to 2 members so the roster becomes visible (roster
    // hides itself at length <= 1). Matches the lead-row bootstrap.
    const currentBranchKeys = draftParallelBranchAudienceKeys[branchIndex] ?? [];
    if (currentBranchKeys.length === 0) {
      const branchTarget = draftParallelChatTargets[branchIndex] ?? draftExecutionTarget;
      const visibleCatNames = draftParticipants.participantCatIds
        .map((catId) => state.payload.chat.cats.find((cat) => cat.id === catId)?.name ?? '')
        .filter((name) => name.trim().length > 0);
      const randomUUID = () =>
        globalThis.crypto?.randomUUID?.() ?? `participant-${Date.now()}`;
      const firstTemp = createDraftTemporaryParticipant({
        provider: branchTarget.provider,
        instance: branchTarget.instance,
        model: branchTarget.model,
        modelSelection: branchTarget.modelSelection,
        takenNames: [
          ...visibleCatNames,
          ...draftTemporaryParticipants.map((participant) => participant.name),
        ],
        randomUUID,
      });
      const poolAfterFirst = [...draftTemporaryParticipants, firstTemp];
      const secondTemp = createNextGroupTemporaryParticipant({
        baseProvider: branchTarget.provider,
        existingParticipants: poolAfterFirst,
        takenNames: [
          ...visibleCatNames,
          ...poolAfterFirst.map((participant) => participant.name),
        ],
        randomUUID,
      });
      setDraftTemporaryParticipants((current) => [...current, firstTemp, secondTemp]);
      onSetDraftParallelBranchAudienceKeys(branchIndex, [
        `temp:${firstTemp.participantId}`,
        `temp:${secondTemp.participantId}`,
      ]);
      return;
    }

    onQuickAddDraftTemporaryParticipantToBranch(branchIndex);
  }, [
    draftExecutionTarget,
    draftParallelBranchAudienceKeys,
    draftParallelChatTargets,
    draftParticipants.participantCatIds,
    draftTemporaryParticipants,
    onQuickAddDraftTemporaryParticipantToBranch,
    onSetDraftParallelBranchAudienceKeys,
    seedDraftGroupParticipants,
    setDraftTemporaryParticipants,
    state,
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
    onCreateNewCat,
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
    setDraftCatExecutionTargetOverrides,
    setDraftSurface,
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
    currentPath: `${location.pathname}${location.search}`,
    draftSurface,
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
    setDraftCatExecutionTargetOverrides,
    setDraftFiles,
    setChannelFiles,
    setDraftWorkflowShape,
    setDraftAudienceKeys,
    draftExecutionTarget,
    setDraftExecutionTarget,
    soloChannelExecutionTarget,
    setSoloChannelExecutionTarget,
    showingParallelChatDraft,
    draftParallelBranches,
    draftParallelChatTargets,
    draftWorkflowShape,
    draftAudienceKeys,
    draftParallelBranchAudienceKeys,
    draftParallelBranchWorkflowShapes,
    activeWorkflowShape,
    activeAudienceKeys,
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
          newChatPreset,
          current,
          seedDraftGroupParticipants,
        ));
      setDraftHighlightedCatId(null);
      setDraftCatExecutionTargetOverrides(new Map());
      setDraftWorkflowShape('sequential');
      setDraftAudienceKeys(null);
    }, [
      newChatPreset,
      seedDraftGroupParticipants,
      setDraftCatIds,
      setDraftTemporaryParticipants,
      setDraftHighlightedCatId,
      setDraftCatExecutionTargetOverrides,
      setDraftWorkflowShape,
      setDraftAudienceKeys,
    ]),
    newChatPreset,
  );

  useEffect(() => {
    if (!showingNewChatDraft || newChatPreset !== 'group') {
      return;
    }

    setDraftTemporaryParticipants((current) =>
      syncLeadDraftTemporaryParticipantWithTarget({
        participants: current,
        target: draftExecutionTarget,
      }));
  }, [
    draftExecutionTarget.instance,
    draftExecutionTarget.model,
    draftExecutionTarget.modelSelection,
    draftExecutionTarget.provider,
    newChatPreset,
    setDraftTemporaryParticipants,
    showingNewChatDraft,
  ]);

  useAppShellRouting({
    state,
    setState,
    navigate,
    busy,
    surface: 'chat',
    currentPath: currentNavigationPath,
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

  const onDraftExecutionTargetChange = useCallback((nextDraftExecutionTarget: ExecutionTargetValue): void => {
    setDraftExecutionTarget(nextDraftExecutionTarget);
    if (showingNewChatDraft && newChatPreset === 'group') {
      setDraftTemporaryParticipants((current) =>
        syncLeadDraftTemporaryParticipantWithTarget({
          participants: current,
          target: nextDraftExecutionTarget,
        }));
    }
  }, [newChatPreset, setDraftTemporaryParticipants, showingNewChatDraft]);

  const onDraftParallelChatTargetChangeWithSharedDefault = useCallback((
    index: number,
    value: ExecutionTargetValue,
  ): void => {
    onDraftParallelChatTargetChange(index, value);
    if (index === 0) {
      setDraftExecutionTarget(value);
    }
  }, [onDraftParallelChatTargetChange, setDraftExecutionTarget]);
  const onDraftGroupAddButtonClick = useCallback((): void => {
    if ((newChatPreset === 'default' || newChatPreset === 'parallel')
      && draftParticipants.participantCatIds.length === 0
      && draftTemporaryParticipants.length === 0) {
      const seededParticipants = resolveGenericDraftTemporaryParticipants(
        'group',
        [],
        seedDraftGroupParticipants,
      );
      setDraftTemporaryParticipants((current) => current.length === 0 ? seededParticipants : current);
      if (hasVisibleParallelDraftTargets) {
        onSetDraftParallelBranchAudienceKeys(
          0,
          seededParticipants.map((participant) => `temp:${participant.participantId}`),
        );
      } else {
        setDraftAudienceKeys(null);
      }
      return;
    }

    if (hasVisibleParallelDraftTargets) {
      onQuickAddDraftTemporaryParticipantToBranch(0);
      return;
    }

    onQuickAddDraftTemporaryParticipant();
  }, [
    draftParticipants.participantCatIds.length,
    draftTemporaryParticipants.length,
    hasVisibleParallelDraftTargets,
    newChatPreset,
    onQuickAddDraftTemporaryParticipant,
    onQuickAddDraftTemporaryParticipantToBranch,
    onSetDraftParallelBranchAudienceKeys,
    seedDraftGroupParticipants,
    setDraftAudienceKeys,
    setDraftTemporaryParticipants,
  ]);
  const onDraftParallelAddButtonClick = useCallback((): void => {
    if (state.status !== 'ready') return;

    const seedWorkflowShape = draftParallelBranchWorkflowShapes[0] ?? draftWorkflowShape;

    // +compare only appends a parallel target — it never creates a
    // temp or seeds a branch audience. Each shadow row starts solo
    // (target-derived chip) and must earn its members via the
    // branch's own +collaborate, which is the only entrypoint that
    // consumes a pool slot (maxChatParticipants). Seeding the lead
    // audience on first transition stays free because it only
    // references existing participants.
    if (!hasVisibleParallelDraftTargets) {
      const leadAudienceSeed = resolveParallelAudienceSeed();
      onSetDraftParallelBranchAudienceKeys(0, leadAudienceSeed);
    }
    onAddDraftParallelChatTarget({
      seedAudienceKeys: [],
      seedWorkflowShape,
    });
  }, [
    draftParallelBranchWorkflowShapes,
    draftWorkflowShape,
    hasVisibleParallelDraftTargets,
    onAddDraftParallelChatTarget,
    onSetDraftParallelBranchAudienceKeys,
    resolveParallelAudienceSeed,
    state,
  ]);

  const onResumeChannel = useWorkspaceResumeChannel<AppShellPayload>({
    activateChatChannel,
    publishReadyPayload,
    setBusy,
    setFeedback,
  });
  const onStartFreshChannel = useWorkspaceResetChannelContinuity<AppShellPayload>({
    resetChannelContinuity,
    publishReadyPayload,
    setBusy,
    setFeedback,
  });

  const updatePayload = usePublishReadyPayload<AppShellPayload>(setState);
  const setPayloadImmediate = useCallback((payload: AppShellPayload): void => {
    setState({ status: 'ready', payload });
  }, [setState]);
  const { refreshAppShell } = useChatAppShellRefresh({
    state,
    updatePayload,
    setPayloadImmediate,
  });

  const {
    companionMode,
    companionCat,
    onToggleCompanionMode,
    onCompanionWake,
    onCompanionSleep,
  } = useDirectLaneCompanionMode({
    routeMyCatId,
    state,
    refreshAppShell,
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
                onCreateNewCat={onCreateNewCat}
                onSwitchProduct={onSwitchProduct}
                activeMyCatId={activeMyCatId}
                onDirectChatCat={onDirectChatCat}
              />
            )}
            settingsMode={settingsMode}
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
                  onStartFresh:
                    visibleChatChannelId && selectedChannel?.composerMode === 'solo'
                      ? () => onStartFreshChannel(visibleChatChannelId)
                      : undefined,
                  onOperatorAction,
                  autoResize,
                  selectedExecutionTarget:
                    selectedChannel?.composerMode === 'solo' ? soloChannelExecutionTarget : undefined,
                  onExecutionTargetChange:
                    selectedChannel?.composerMode === 'solo' ? setSoloChannelExecutionTarget : undefined,
                  onDirectLaneExecutionTargetChange: onDirectLaneModelSave,
                  activeWorkflowShape,
                  onToggleActiveWorkflowShape: () =>
                    setActiveWorkflowShape((prev) =>
                      prev === 'concurrent' ? 'sequential' : 'concurrent'),
                  activeAudienceKeys,
                  onSetActiveAudienceKeys: setActiveAudienceKeys,
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
                  draftSurface,
                  onDraftSurfaceChange: setDraftSurface,
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
                  onQuickAddDraftTemporaryParticipant: onDraftGroupAddButtonClick,
                  onRemoveDraftTemporaryParticipant: onRemoveDraftTemporaryParticipantWithAudienceSync,
                  onUpdateDraftTemporaryParticipant: onUpdateDraftTemporaryParticipant,
                  autoResize,
                  draftDefaultRecipientCatId,
                  entryPreset: newChatPreset,
                  selectedExecutionTarget: draftExecutionTarget,
                  onExecutionTargetChange: onDraftExecutionTargetChange,
                  draftHighlightedCatId,
                  onHighlightDraftCat: setDraftHighlightedCatId,
                  draftCatExecutionTargetOverrides,
                  onDraftCatExecutionTargetOverride,
                  onDirectLaneExecutionTargetChange: onDirectLaneModelSave,
                  parallelTargets:
                    draftRoute.isGenericNewChatRoute
                      && hasVisibleParallelDraftTargets
                      ? draftParallelChatTargets
                      : undefined,
                  onParallelTargetChange: showingParallelChatDraft
                    || hasVisibleParallelDraftTargets
                    ? onDraftParallelChatTargetChangeWithSharedDefault
                    : undefined,
                  onAddParallelTarget:
                    draftRoute.isGenericNewChatRoute
                      && (advancedDraftControlsEnabled || hasVisibleParallelDraftTargets)
                      ? onDraftParallelAddButtonClick
                      : undefined,
                  onRemoveParallelTarget:
                    showingParallelChatDraft || hasVisibleParallelDraftTargets
                      ? onRemoveDraftParallelChatTarget
                      : undefined,
                  showDraftParallelAddButton:
                    draftRoute.isGenericNewChatRoute
                    && (advancedDraftControlsEnabled || hasVisibleParallelDraftTargets),
                  draftWorkflowShape,
                  onToggleDraftWorkflowShape: () => setDraftWorkflowShape((prev) => prev === 'concurrent' ? 'sequential' : 'concurrent'),
                  draftAudienceKeys,
                  onSetAudienceKeys: setDraftAudienceKeys,
                  parallelBranchAudienceKeys:
                    draftRoute.isGenericNewChatRoute
                      && hasVisibleParallelDraftTargets
                      ? draftParallelBranchAudienceKeys
                      : undefined,
                  parallelBranchWorkflowShapes:
                    draftRoute.isGenericNewChatRoute
                      && hasVisibleParallelDraftTargets
                      ? draftParallelBranchWorkflowShapes
                      : undefined,
                  onSetParallelBranchAudienceKeys:
                    draftRoute.isGenericNewChatRoute
                      && hasVisibleParallelDraftTargets
                      ? onSetDraftParallelBranchAudienceKeys
                      : undefined,
                  onToggleParallelBranchWorkflowShape:
                    draftRoute.isGenericNewChatRoute
                      && hasVisibleParallelDraftTargets
                      ? onToggleDraftParallelBranchWorkflowShape
                      : undefined,
                  onQuickAddParallelBranchTemporaryParticipant:
                    advancedDraftControlsEnabled
                      && draftRoute.isGenericNewChatRoute
                      && hasVisibleParallelDraftTargets
                      ? onDraftParallelBranchGroupAddButtonClick
                      : undefined,
                  showDraftGroupAddButton:
                    advancedDraftControlsEnabled
                    && draftRoute.isGenericNewChatRoute
                    && newChatPreset !== 'group',
                  hideDraftGroupHint:
                    advancedDraftControlsEnabled
                    && draftRoute.isGenericNewChatRoute
                    && newChatPreset !== 'group',
                  hideDraftParallelHint:
                    advancedDraftControlsEnabled
                    && draftRoute.isGenericNewChatRoute
                    && newChatPreset !== 'parallel',
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
