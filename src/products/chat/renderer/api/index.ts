export { normalizeAppShellPayload } from './normalization.js';
export { expectJson, readErrorMessage } from './http.js';

export {
  fetchAdvancedProviderModels,
  fetchProviderRegistry,
  fetchProviderModels,
} from './providers.js';

export {
  fetchAppShell,
  refetchAfterMutation,
  updateChatOrchestrator,
  updateChannelPendingExecutionTarget,
  updateConcurrentPresentationModePreference,
  updateLiveProgressDetailsPreference,
  updateNewChatDefaultsPreference,
  updateSelectedChannel,
  updateVerbosePreference,
} from './appShell.js';

export {
  fetchOperatorLoopSnapshot,
  type CoreApprovalDecisionInput,
  type CoreOperatorActionInput,
  writeCoreApprovalDecision,
  writeCoreOperatorAction,
} from './operator.js';

export {
  activateChatChannel,
  assignCatToChannelApi,
  cancelChatChannel,
  cancelParallelChatGroup,
  createParallelChatGroup,
  createChatChannel,
  createGlobalCat,
  deleteParallelChatGroup,
  deleteChatChannel,
  encodeAttachmentFiles,
  renameChatChannel,
  renameParallelChatGroup,
  deleteGlobalCat,
  relayParallelChatMessage,
  removeCatFromChannelApi,
  retryChatMessage,
  sendParallelChatMessage,
  sendChatMessage,
  ungroupParallelChatGroup,
  updateChannelParticipantApi,
  updateCatProfile,
  uploadChannelAttachments,
} from './chat.js';

export {
  type BrowseDirectoriesResult,
  type BrowseDirectoryEntry,
  browseDirectories,
  openFolderInExplorer,
} from './shell.js';

export {
  completeSetup,
  resetSetup,
} from './setup.js';

export {
  createBotBindingApi,
  deleteBotBindingApi,
  fetchTelegramTransportDiagnostics,
  fetchTelegramTransportStatus,
  reconnectTelegramPolling,
  type TelegramTransportBindingDiagnostics,
  type TelegramTransportDiagnostics,
  type TelegramTransportPollingStatus,
  type TelegramTransportReceiptSummary,
  type TelegramTransportRoomRouting,
  type TelegramTransportStatus,
  updateBotBindingApi,
} from './telegram.js';

export {
  createCatMemory,
  deleteCatMemory,
  type DurableMemoryItem,
  listCatMemory,
} from './memory.js';

export {
  createCompanionMemory,
  createCompanionSource,
  deleteCompanionMemory,
  deleteCompanionSource,
  getCompanionBoxSummary,
  getCompanionResponseProfile,
  listCompanionDerived,
  listCompanionMemory,
  listCompanionSources,
  updateCompanionResponseProfile,
  updateCompanionSource,
} from './companion.js';
