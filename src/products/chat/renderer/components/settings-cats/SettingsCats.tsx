import type { Dispatch, SetStateAction } from 'react';

import type { AppShellPayload } from '../../../api/contracts.js';
import type { AppShellPayload as WorkspaceAppShellPayload } from '../../../../shared/api/workspaceContracts.js';
import {
  SettingsCats as SharedSettingsCats,
  type SettingsCatsProps,
  type SharedSettingsCatsProps,
} from '../../../../shared/renderer/components/settings-cats/SettingsCats.js';
import {
  useSettingsCatsRegistryActions,
  type BotFormState,
} from '../../hooks/useSettingsCatsRegistryActions.js';
import { SettingsCatsRegistry } from './SettingsCatsRegistry.js';

export interface ChatSettingsCatsProps extends Omit<
  SharedSettingsCatsProps<BotFormState>,
  'onPayloadUpdate' | 'useSettingsCatsRegistryActionsHook' | 'SettingsCatsRegistryComponent'
> {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

export { type SettingsCatsProps };

function useChatSettingsCatsRegistryActions(options: {
  expandedCatId: string | null;
  setExpandedCatId: Dispatch<SetStateAction<string | null>>;
  onBusy: (key: string) => void;
  onFeedback: (message: string) => void;
  onPayloadUpdate: (payload: WorkspaceAppShellPayload) => void;
  confirm?: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const { onPayloadUpdate, ...rest } = options;
  return useSettingsCatsRegistryActions({
    ...rest,
    onPayloadUpdate: (payload) => onPayloadUpdate(payload as WorkspaceAppShellPayload),
  });
}

export function SettingsCats(props: ChatSettingsCatsProps) {
  const { onPayloadUpdate, ...rest } = props;
  const sharedOnPayloadUpdate = (payload: WorkspaceAppShellPayload) => {
    onPayloadUpdate(payload as AppShellPayload);
  };

  return (
    <SharedSettingsCats
      {...rest}
      onPayloadUpdate={sharedOnPayloadUpdate}
      useSettingsCatsRegistryActionsHook={useChatSettingsCatsRegistryActions}
      SettingsCatsRegistryComponent={SettingsCatsRegistry}
    />
  );
}
