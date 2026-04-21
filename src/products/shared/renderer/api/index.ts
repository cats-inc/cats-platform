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
  resetChannelContinuity,
  updateChatOrchestrator,
  updateChannelPendingExecutionTarget,
  updateAdvancedDraftControlsPreference,
  updateConversationBehaviorPreference,
  updateFolderBrowsePreference,
  updateNewChatDefaultsPreference,
  updateSelectedChannel,
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
  createChatChannel,
  createParallelChatGroup,
  createGlobalCat,
  deleteChatChannel,
  deleteParallelChatGroup,
  renameChatChannel,
  renameParallelChatGroup,
  deleteGlobalCat,
  encodeAttachmentFiles,
  relayParallelChatMessage,
  removeCatFromChannelApi,
  retryChatMessage,
  sendParallelChatMessage,
  sendChatMessage,
  ungroupParallelChatGroup,
  updateCatProfile,
  updateChannelParticipantApi,
  uploadChannelAttachments,
} from './chat.js';

export {
  type BrowseDirectoriesResult,
  type BrowseDirectoryEntry,
  type InspectPathResult,
  browseDirectories,
  inspectPath,
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
