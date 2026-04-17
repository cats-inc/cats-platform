import {
  SettingsCatsCanvas as SharedSettingsCatsCanvas,
  type SettingsCatsCanvasProps,
  type SharedSettingsCatsCanvasProps,
} from '../../../../shared/renderer/components/settings-cats/SettingsCats.js';
import { useSettingsCatsRegistryActions } from '../../hooks/useSettingsCatsRegistryActions.js';
import { SettingsCatsRegistry } from './SettingsCatsRegistry.js';

export interface WorkSettingsCatsProps extends Omit<
  SharedSettingsCatsCanvasProps,
  'useSettingsCatsRegistryActionsHook' | 'SettingsCatsRegistryComponent'
> {}

export { type SettingsCatsCanvasProps };

export function SettingsCats(props: WorkSettingsCatsProps) {
  return (
    <SharedSettingsCatsCanvas
      {...props}
      useSettingsCatsRegistryActionsHook={useSettingsCatsRegistryActions}
      SettingsCatsRegistryComponent={SettingsCatsRegistry}
    />
  );
}
