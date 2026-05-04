import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';

type WorkspaceNavigationTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const LOCAL_FALLBACK_PATTERNS = [
  /^cats chat rename returned \d+$/u,
  /^cats chat deletion returned \d+$/u,
  /^parallel chat rename returned \d+$/u,
  /^parallel chat ungroup returned \d+$/u,
  /^parallel chat deletion returned \d+$/u,
];

export function localizeWorkspaceNavigationErrorMessage(
  message: string,
  t: WorkspaceNavigationTranslator,
): string | null {
  if (message.startsWith('Chat not found:')) {
    return t(messageKeys.sharedWorkspaceNavigationErrorChatNotFound);
  }

  if (message.startsWith('Channel not found:') || message === 'Channel not found.') {
    return t(messageKeys.sharedWorkspaceNavigationErrorChannelNotFound);
  }

  if (message.startsWith('Parallel chat group not found:')) {
    return t(messageKeys.sharedWorkspaceNavigationErrorParallelChatGroupNotFound);
  }

  if (message === 'Title must not be empty.') {
    return t(messageKeys.sharedWorkspaceNavigationErrorTitleRequired);
  }

  if (message === 'Parallel chat title must not be empty.') {
    return t(messageKeys.sharedWorkspaceNavigationErrorParallelChatTitleRequired);
  }

  return null;
}

export function formatWorkspaceNavigationMutationError(
  error: unknown,
  fallback: string,
  t: WorkspaceNavigationTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  const localizedMessage = localizeWorkspaceNavigationErrorMessage(error.message, t);
  if (localizedMessage) {
    return localizedMessage;
  }
  return LOCAL_FALLBACK_PATTERNS.some((pattern) => pattern.test(error.message))
    ? fallback
    : error.message;
}
