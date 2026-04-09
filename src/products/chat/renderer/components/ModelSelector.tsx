import {
  ModelSelectorChip,
  WorkspaceModelSelector,
  WorkspaceModelSelectorPanel,
  buildModelSelectorLabel,
  type ModelSelectorChipProps,
  type ModelSelectorPanelMode,
  type ModelSelectorValue,
} from '../../../shared/renderer/components/ModelSelector.js';
import { CatAvatarRow } from './CatAvatarRow.js';
import { ProviderModelFields } from './ProviderModelFields.js';

export {
  ModelSelectorChip,
  buildModelSelectorLabel,
};
export type {
  ModelSelectorChipProps,
  ModelSelectorPanelMode,
  ModelSelectorValue,
};

export interface ModelSelectorPanelProps {
  mode: ModelSelectorPanelMode;
  cats: Parameters<typeof WorkspaceModelSelectorPanel>[0]['cats'];
  bossCatId: string | null;
  selectedCatIds: string[];
  highlightedCatId: string | null;
  defaultRecipientCatId?: string | null;
  onToggleCat?: (catId: string) => void;
  onHighlightCat?: (catId: string) => void;
  modelValue: ModelSelectorValue;
  onModelChange: (value: ModelSelectorValue) => void;
  fieldsDisabled?: boolean;
  onClose: () => void;
}

export function ModelSelectorPanel(props: ModelSelectorPanelProps) {
  return (
    <WorkspaceModelSelectorPanel
      {...props}
      showLeadBadge={false}
      ProviderModelFieldsComponent={ProviderModelFields}
      CatAvatarRowComponent={CatAvatarRow}
    />
  );
}

export interface ModelSelectorProps {
  value: ModelSelectorValue;
  onChange: (value: ModelSelectorValue) => void;
}

export function ModelSelector(props: ModelSelectorProps) {
  return (
    <WorkspaceModelSelector
      {...props}
      showLeadBadge={false}
      ProviderModelFieldsComponent={ProviderModelFields}
      CatAvatarRowComponent={CatAvatarRow}
    />
  );
}
