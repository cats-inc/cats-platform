import {
  SettingsCatsCanvas as SharedSettingsCatsCanvas,
  type SettingsCatsCanvasProps,
  type SharedSettingsCatsCanvasProps,
} from '../../../../shared/renderer/components/settings-cats/SettingsCats.js';
import { useSettingsCatsRegistryActions } from '../../hooks/useSettingsCatsRegistryActions.js';
import type { BotFormState } from '../../hooks/useSettingsCatsRegistryActions.js';
import { SettingsCatsRegistry } from './SettingsCatsRegistry.js';

export interface CodeSettingsCatsProps extends Omit<
  SharedSettingsCatsCanvasProps<BotFormState>,
  'useSettingsCatsRegistryActionsHook' | 'SettingsCatsRegistryComponent'
> {}

export { type SettingsCatsCanvasProps };

export function SettingsCats(props: CodeSettingsCatsProps) {
  return (
    <SharedSettingsCatsCanvas
      {...props}
      useSettingsCatsRegistryActionsHook={useSettingsCatsRegistryActions}
      SettingsCatsRegistryComponent={SettingsCatsRegistry}
    />
  );
}
