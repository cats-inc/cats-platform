import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import { localizeWorkspaceNavigationErrorMessage } from './workspaceNavigationErrorLabels.js';

type WorkspaceChatActionTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const LOCAL_FALLBACK_PATTERNS = [
  /^cats core state returned \d+$/u,
  /^cats core approvals returned \d+$/u,
  /^cats core approval returned \d+$/u,
  /^cats core operator action returned \d+$/u,
  /^cats channel messaging returned \d+$/u,
  /^cats channel cancel returned \d+$/u,
  /^parallel chat cancel returned \d+$/u,
];

export function localizeWorkspaceChatActionErrorMessage(
  message: string,
  t: WorkspaceChatActionTranslator,
): string | null {
  const navigationMessage = localizeWorkspaceNavigationErrorMessage(message, t);
  if (navigationMessage) {
    return navigationMessage;
  }

  if (message === 'The active chat is not part of this Parallel chat group.') {
    return t(messageKeys.chatComposerErrorActiveChatNotInParallelGroup);
  }

  return null;
}

export function formatWorkspaceChatActionError(
  error: unknown,
  fallback: string,
  t: WorkspaceChatActionTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  const localizedMessage = localizeWorkspaceChatActionErrorMessage(error.message, t);
  if (localizedMessage) {
    return localizedMessage;
  }
  return LOCAL_FALLBACK_PATTERNS.some((pattern) => pattern.test(error.message))
    ? fallback
    : error.message;
}
