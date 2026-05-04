import {
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../../shared/i18n/index.js';
import { localizeWorkspaceNavigationErrorMessage } from './workspaceNavigationErrorLabels.js';

type WorkspaceExecutionTargetTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const LOCAL_FALLBACK_PATTERNS = [
  /^cats new chat defaults update returned \d+$/u,
  /^cats channel update returned \d+$/u,
];

export function formatWorkspaceExecutionTargetMutationError(
  error: unknown,
  fallback: string,
  t: WorkspaceExecutionTargetTranslator,
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
