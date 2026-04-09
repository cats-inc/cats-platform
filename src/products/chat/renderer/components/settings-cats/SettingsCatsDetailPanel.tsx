import type { AppShellPayload } from '../../../api/contracts.js';
import type { AppShellPayload as WorkspaceAppShellPayload } from '../../../../shared/api/workspaceContracts.js';
import {
  SettingsCatsDetailPanel as SharedSettingsCatsDetailPanel,
  type SettingsCatsDetailPanelProps as SharedSettingsCatsDetailPanelProps,
} from '../../../../shared/renderer/components/settings-cats/SettingsCatsDetailPanel.js';

export interface SettingsCatsDetailPanelProps
  extends Omit<SharedSettingsCatsDetailPanelProps, 'onPayloadUpdate'> {
  onPayloadUpdate?: (payload: AppShellPayload) => void;
}

export function SettingsCatsDetailPanel({
  onPayloadUpdate,
  ...props
}: SettingsCatsDetailPanelProps) {
  const sharedOnPayloadUpdate = onPayloadUpdate
    ? (payload: WorkspaceAppShellPayload) =>
      onPayloadUpdate(payload as AppShellPayload)
    : undefined;

  return (
    <SharedSettingsCatsDetailPanel
      {...props}
      onPayloadUpdate={sharedOnPayloadUpdate}
    />
  );
}
