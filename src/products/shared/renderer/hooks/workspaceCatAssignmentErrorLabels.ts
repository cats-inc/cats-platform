import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import { localizeSettingsCatsRegistryErrorMessage } from './settingsCatsRegistryErrorLabels.js';

type WorkspaceCatAssignmentTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const LOCAL_FALLBACK_PATTERNS = [
  /^cats chat cat creation returned \d+$/u,
  /^cats channel cat assignment returned \d+$/u,
  /^cats channel cat removal returned \d+$/u,
];

export function localizeWorkspaceCatAssignmentErrorMessage(
  message: string,
  t: WorkspaceCatAssignmentTranslator,
): string | null {
  const sharedCatMessage = localizeSettingsCatsRegistryErrorMessage(message, t);
  if (sharedCatMessage) {
    return sharedCatMessage;
  }

  if (message.startsWith('Channel not found:')) {
    return t(messageKeys.chatCatAssignmentErrorChannelNotFound);
  }

  if (message.startsWith('Channel cat assignment not found:')) {
    return t(messageKeys.chatCatAssignmentErrorAssignmentNotFound);
  }

  if (message === 'Direct messages can only contain their direct recipient Cat') {
    return t(messageKeys.chatCatAssignmentErrorDirectRecipientOnly);
  }

  const participantLimitMatch = message.match(/^Chat participant limit reached \(max (\d+)\)$/u);
  if (participantLimitMatch) {
    return t(messageKeys.chatCatAssignmentErrorParticipantLimitReached, {
      maxParticipants: participantLimitMatch[1],
    });
  }

  return null;
}

export function formatWorkspaceCatAssignmentMutationError(
  error: unknown,
  fallback: string,
  t: WorkspaceCatAssignmentTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  const localizedMessage = localizeWorkspaceCatAssignmentErrorMessage(error.message, t);
  if (localizedMessage) {
    return localizedMessage;
  }
  return LOCAL_FALLBACK_PATTERNS.some((pattern) => pattern.test(error.message))
    ? fallback
    : error.message;
}
