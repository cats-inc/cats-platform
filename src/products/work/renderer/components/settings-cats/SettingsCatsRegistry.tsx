import {
  WorkspaceSettingsCatsRegistry,
  type SharedSettingsCatsRegistryProps,
} from '../../../../shared/renderer/components/settings-cats/SettingsCatsRegistry.js';
import { SettingsCatsDetailPanel } from './SettingsCatsDetailPanel';

export type SettingsCatsRegistryProps = SharedSettingsCatsRegistryProps;

export function SettingsCatsRegistry(props: SettingsCatsRegistryProps) {
  return (
    <WorkspaceSettingsCatsRegistry
      {...props}
      SettingsCatsDetailPanelComponent={SettingsCatsDetailPanel}
    />
  );
}
