export { normalizeAppShellPayload } from './api/normalization.js';
export { expectJson, readErrorMessage } from './api/http.js';

export {
  fetchProviders,
  fetchProviderModels,
} from './api/providers.js';

export {
  fetchAppShell,
  refetchAfterMutation,
  updateChatOrchestrator,
  updateSelectedChannel,
  updateVerbosePreference,
} from './api/appShell.js';

export {
  fetchOperatorLoopSnapshot,
  type CoreApprovalDecisionInput,
  type CoreOperatorActionInput,
  writeCoreApprovalDecision,
  writeCoreOperatorAction,
} from './api/operator.js';

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
} from './api/chat.js';

export {
  type BrowseDirectoriesResult,
  type BrowseDirectoryEntry,
  browseDirectories,
  openFolderInExplorer,
} from './api/shell.js';

export {
  completeSetup,
  resetSetup,
} from './api/setup.js';

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
} from './api/telegram.js';

export {
  createCatMemory,
  deleteCatMemory,
  type DurableMemoryItem,
  listCatMemory,
} from './api/memory.js';
