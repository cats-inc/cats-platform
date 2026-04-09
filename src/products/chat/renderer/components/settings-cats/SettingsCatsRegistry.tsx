import type { AppShellPayload } from '../../../api/contracts.js';
import {
  SettingsCatsRegistry as SharedSettingsCatsRegistry,
  type SettingsCatsRegistryProps as SharedSettingsCatsRegistryProps,
} from '../../../../shared/renderer/components/settings-cats/SettingsCatsRegistry.js';

export interface SettingsCatsRegistryProps
  extends Omit<SharedSettingsCatsRegistryProps, 'payload' | 'onPayloadUpdate'> {
  payload: AppShellPayload;
  onPayloadUpdate?: (payload: AppShellPayload) => void;
}

export function SettingsCatsRegistry({
  onPayloadUpdate,
  ...props
}: SettingsCatsRegistryProps) {
  const sharedOnPayloadUpdate = onPayloadUpdate
    ? (payload: SharedSettingsCatsRegistryProps['payload']) =>
      onPayloadUpdate(payload as AppShellPayload)
    : undefined;

  return (
    <SharedSettingsCatsRegistry
      {...props}
      onPayloadUpdate={sharedOnPayloadUpdate}
    />
  );
}
