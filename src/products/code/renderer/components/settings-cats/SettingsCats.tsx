import { SettingsCats as SharedSettingsCats, type SettingsCatsProps, type SharedSettingsCatsProps } from '../../../../shared/renderer/components/settings-cats/SettingsCats.js';
import { useSettingsCatsRegistryActions } from '../../hooks/useSettingsCatsRegistryActions.js';
import type { BotFormState } from '../../hooks/useSettingsCatsRegistryActions.js';
import { SettingsCatsRegistry } from './SettingsCatsRegistry.js';

export interface CodeSettingsCatsProps extends Omit<
  SharedSettingsCatsProps<BotFormState>,
  'useSettingsCatsRegistryActionsHook' | 'SettingsCatsRegistryComponent'
> {}

export { type SettingsCatsProps };

export function SettingsCats(props: CodeSettingsCatsProps) {
  return (
    <SharedSettingsCats
      {...props}
      useSettingsCatsRegistryActionsHook={useSettingsCatsRegistryActions}
      SettingsCatsRegistryComponent={SettingsCatsRegistry}
    />
  );
}
