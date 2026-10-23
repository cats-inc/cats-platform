import { messageKeys, type MessageKey, type MessageInterpolationValues } from '../../../shared/i18n/index.js';
import { PLATFORM_DATA_RESET_CONFIRMATION } from '../../../shared/platformDataResetRequest.js';

export function buildPlatformDataResetConfirmation(
  t: (key: MessageKey, values?: MessageInterpolationValues) => string,
  runtimeAvailable: boolean,
  onRuntimeChange: (checked: boolean) => void,
) {
  return {
    title: t(messageKeys.settingsDataResetAllDataTitle),
    message: t(messageKeys.settingsDataResetConfirmationDescription),
    confirmLabel: t(messageKeys.settingsDataResetConfirmLabel),
    defaultAction: 'cancel' as const,
    requiredText: { value: PLATFORM_DATA_RESET_CONFIRMATION,
      label: t(messageKeys.settingsDataResetConfirmationLabel, { confirmation: PLATFORM_DATA_RESET_CONFIRMATION }) },
    checkbox: { label: t(messageKeys.settingsDataResetRuntimeLabel),
      description: t(runtimeAvailable ? messageKeys.settingsDataResetRuntimeDescription : messageKeys.settingsDataResetRuntimeUnavailable),
      disabled: !runtimeAvailable, onChange: onRuntimeChange },
  };
}
