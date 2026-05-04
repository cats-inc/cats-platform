import {
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';
import { localizeWorkspaceNavigationErrorMessage } from '../../../products/shared/renderer/hooks/workspaceNavigationErrorLabels.js';

type SettingsPreferenceTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

const LOCAL_FALLBACK_PATTERNS = [
  /^cats conversation behavior update returned \d+$/u,
  /^cats advanced draft controls update returned \d+$/u,
];

export function formatSettingsPreferenceMutationError(
  error: unknown,
  fallback: string,
  t: SettingsPreferenceTranslator,
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
