import type { CatsAppManifestValidationIssue } from '../../../shared/catsAppValidation.js';
import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';

type SettingsAppsTranslator = (
  key: MessageKey,
  values?: MessageInterpolationValues,
) => string;

function readDetailString(
  details: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = details?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function localizeSettingsAppsValidationIssue(
  issue: CatsAppManifestValidationIssue | undefined,
  t: SettingsAppsTranslator,
): string {
  if (!issue) {
    return t(messageKeys.settingsAppsValidationFailed);
  }

  if (issue.message === 'packagePath is required.') {
    return t(messageKeys.settingsAppsPackagePathRequired);
  }

  const missingPathMatch = issue.message.match(/^Package path does not exist: (.+)\.$/u);
  if (missingPathMatch) {
    return t(messageKeys.settingsAppsErrorPackagePathNotFound, {
      path: missingPathMatch[1],
    });
  }

  if (issue.message === 'Invalid cats.app.json JSON.') {
    return t(messageKeys.settingsAppsErrorInvalidManifestJson);
  }

  if (issue.message === 'Cannot read cats.app.json.') {
    return t(messageKeys.settingsAppsErrorCannotReadManifest);
  }

  if (issue.message === 'Cats app manifest must be an object.') {
    return t(messageKeys.settingsAppsErrorManifestInvalid);
  }

  if (issue.code === 'reserved_cats_app_id') {
    return t(messageKeys.settingsAppsErrorReservedAppId, {
      appId: readDetailString(issue.details, 'appId') ?? issue.path ?? '',
    });
  }

  if (issue.code === 'duplicate_cats_app_id') {
    return t(messageKeys.settingsAppsErrorDuplicateAppId, {
      appId: readDetailString(issue.details, 'appId') ?? issue.path ?? '',
    });
  }

  return t(
    issue.path
      ? messageKeys.settingsAppsErrorValidationIssueWithPath
      : messageKeys.settingsAppsErrorValidationIssue,
    {
      code: issue.code,
      path: issue.path ?? '',
    },
  );
}

export function localizeSettingsAppsErrorMessage(
  message: string,
  t: SettingsAppsTranslator,
): string | null {
  const notInstalledMatch = message.match(/^Cats app "(.+)" is not installed\.$/u);
  if (notInstalledMatch) {
    return t(messageKeys.settingsAppsErrorNotInstalled, {
      appId: notInstalledMatch[1],
    });
  }

  const notEnabledMatch = message.match(/^Cats app "(.+)" is not enabled\.$/u);
  if (notEnabledMatch) {
    return t(messageKeys.settingsAppsErrorNotEnabled, {
      appId: notEnabledMatch[1],
    });
  }

  return null;
}

export function formatSettingsAppsMutationError(
  error: unknown,
  fallback: string,
  t: SettingsAppsTranslator,
): string {
  if (!(error instanceof Error)) {
    return fallback;
  }
  return localizeSettingsAppsErrorMessage(error.message, t) ?? error.message;
}
