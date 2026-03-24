export { normalizeAppShellPayload } from './apiNormalization.js';
export { expectJson, readErrorMessage } from './apiShared.js';

export {
  fetchProviders,
  fetchProviderModels,
} from './apiProviders.js';

export {
  fetchAppShell,
  refetchAfterMutation,
  updateChatOrchestrator,
  updateSelectedChannel,
  updateVerbosePreference,
} from './apiAppShell.js';

export {
  fetchOperatorLoopSnapshot,
  type CoreApprovalDecisionInput,
  type CoreOperatorActionInput,
  writeCoreApprovalDecision,
  writeCoreOperatorAction,
} from './apiOperator.js';

export {
  activateChatChannel,
  assignCatToChannelApi,
  createChatChannel,
  createGlobalCat,
  deleteChatChannel,
  deleteGlobalCat,
  removeCatFromChannelApi,
  sendChatMessage,
  updateCatProfile,
  uploadChannelAttachments,
} from './apiChat.js';

export {
  type BrowseDirectoriesResult,
  type BrowseDirectoryEntry,
  browseDirectories,
  openFolderInExplorer,
} from './apiShell.js';

export {
  completeSetup,
  resetSetup,
} from './apiSetup.js';

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
} from './apiTelegram.js';

export {
  createCatMemory,
  deleteCatMemory,
  type DurableMemoryItem,
  listCatMemory,
} from './apiMemory.js';
