import type { ChatCat } from '../../api/contracts';
import { ProviderModelFields } from './ProviderModelFields';
import { CatAvatarRow } from './CatAvatarRow';
import {
  WorkspaceModelSelector,
  WorkspaceModelSelectorPanel,
  buildModelSelectorLabel,
  ModelSelectorChip,
  type ModelSelectorChipProps,
  type ModelSelectorPanelMode,
  type ModelSelectorValue,
  type WorkspaceModelSelectorPanelProps,
} from '../../../shared/renderer/components/ModelSelector.js';

export { ModelSelectorChip, buildModelSelectorLabel };
export type { ModelSelectorChipProps, ModelSelectorPanelMode, ModelSelectorValue };

export interface ModelSelectorPanelProps extends Omit<
  WorkspaceModelSelectorPanelProps,
  'ProviderModelFieldsComponent' | 'CatAvatarRowComponent' | 'cats'
> {
  cats: ChatCat[];
}

export function ModelSelectorPanel(props: ModelSelectorPanelProps) {
  return (
    <WorkspaceModelSelectorPanel
      {...props}
      ProviderModelFieldsComponent={ProviderModelFields}
      CatAvatarRowComponent={CatAvatarRow}
    />
  );
}

interface ModelSelectorProps {
  value: ModelSelectorValue;
  onChange: (value: ModelSelectorValue) => void;
}

export function ModelSelector(props: ModelSelectorProps) {
  return (
    <WorkspaceModelSelector
      {...props}
      ProviderModelFieldsComponent={ProviderModelFields}
      CatAvatarRowComponent={CatAvatarRow}
    />
  );
}
