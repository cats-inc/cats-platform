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
  /^channel message retry returned \d+$/u,
  /^parallel chat relay returned \d+$/u,
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

  if (message === 'The source chat is not part of this Parallel chat group.') {
    return t(messageKeys.chatComposerErrorSourceChatNotInParallelGroup);
  }

  if (
    message
    === 'One or more parallel branch inputs target a chat outside this Parallel chat group.'
  ) {
    return t(messageKeys.chatComposerErrorParallelBranchOutsideGroup);
  }

  if (message === 'No parallel chat targets were selected for this relay.') {
    return t(messageKeys.chatComposerErrorNoParallelRelayTargets);
  }

  if (message === 'Message not found.' || message.startsWith('Channel message not found:')) {
    return t(messageKeys.chatComposerErrorMessageNotFound);
  }

  if (message === 'Only user messages can be retried.') {
    return t(messageKeys.chatComposerErrorRetryInvalidSender);
  }

  if (message === 'Cannot retry while this room already has an active turn.') {
    return t(messageKeys.chatComposerErrorRetryInProgress);
  }

  if (message === 'Only the latest acknowledged user message can be retried.') {
    return t(messageKeys.chatComposerErrorRetryNotLatest);
  }

  if (
    message
    === 'Retry is only available for the latest failed acknowledged user message.'
  ) {
    return t(messageKeys.chatComposerErrorRetryNotAvailable);
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
