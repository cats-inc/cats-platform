import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';

import { buildExecutionLabel } from '../../../../shared/executionLabel.js';
import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../../../shared/providerSelection.js';
import type { ChatCat } from '../../api/workspaceContracts.js';
import { isChatCat } from '../workspaceChatUtils.js';
import { CatAvatarRow } from './CatAvatarRow.js';
import { ProviderModelFields } from './ProviderModelFields.js';

export interface ModelSelectorValue {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

export interface ModelSelectorChipProps {
  label: string;
  onClick?: () => void;
}

export function ModelSelectorChip({ label, onClick }: ModelSelectorChipProps) {
  return (
    <button
      type="button"
      className="modelSelectorChip"
      disabled={!onClick}
      onClick={onClick}
      data-tooltip="Select model"
    >
      <span className="modelSelectorChipLabel">{label}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 4 5 6.5 7.5 4" />
      </svg>
    </button>
  );
}

export function buildModelSelectorLabel(value: ModelSelectorValue, catName?: string | null): string {
  const base = buildExecutionLabel(value.provider, value.instance, value.model);
  return catName ? `${catName} \u00b7 ${base}` : base;
}

export type ModelSelectorPanelMode = 'draft' | 'direct-lane';

interface ProviderModelFieldsProps {
  provider: string;
  instance: string;
  model: string;
  modelSelection?: ProviderModelSelection | null;
  onTargetChange: (target: ProviderTargetSelection) => void;
}

interface CatAvatarRowProps {
  cats: ChatCat[];
  bossCatId: string | null;
  selectedIds: string[];
  highlightedId: string | null;
  defaultRecipientCatId?: string | null;
  toggleable: boolean;
  showLeadBadge?: boolean;
  onToggle: (catId: string) => void;
  onHighlight: (catId: string) => void;
}

export interface WorkspaceModelSelectorPanelProps {
  mode: ModelSelectorPanelMode;
  cats: ChatCat[];
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
  ProviderModelFieldsComponent: ComponentType<ProviderModelFieldsProps>;
  CatAvatarRowComponent: ComponentType<CatAvatarRowProps>;
}

export function WorkspaceModelSelectorPanel({
  mode,
  cats,
  bossCatId,
  selectedCatIds,
  highlightedCatId,
  onToggleCat,
  onHighlightCat,
  defaultRecipientCatId,
  modelValue,
  onModelChange,
  fieldsDisabled,
  onClose,
  ProviderModelFieldsComponent,
  CatAvatarRowComponent,
}: WorkspaceModelSelectorPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  const chatCats = cats.filter((cat) => cat.status === 'active' && isChatCat(cat));

  function handleTargetChange(target: ProviderTargetSelection): void {
    onModelChange({
      provider: target.provider,
      model: target.model || null,
      instance: target.instance || null,
      modelSelection: target.modelSelection ?? null,
    });
  }

  return (
    <div className="modelSelectorPanel" ref={panelRef}>
      <div className="modelSelectorPanelHeader">
        <strong>AI Reply</strong>
        <button
          type="button"
          className="chromeButton"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <CatAvatarRowComponent
        cats={chatCats}
        bossCatId={bossCatId}
        selectedIds={selectedCatIds}
        highlightedId={highlightedCatId}
        defaultRecipientCatId={defaultRecipientCatId}
        toggleable={mode === 'draft'}
        showLeadBadge
        onToggle={onToggleCat ?? (() => {})}
        onHighlight={onHighlightCat ?? (() => {})}
      />
      <div
        className="modelSelectorPanelBody"
        style={fieldsDisabled ? { pointerEvents: 'none', opacity: 0.45 } : undefined}
      >
        <ProviderModelFieldsComponent
          provider={modelValue.provider}
          instance={modelValue.instance ?? ''}
          model={modelValue.model ?? ''}
          modelSelection={modelValue.modelSelection}
          onTargetChange={handleTargetChange}
        />
      </div>
    </div>
  );
}

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

export interface WorkspaceModelSelectorProps {
  value: ModelSelectorValue;
  onChange: (value: ModelSelectorValue) => void;
  ProviderModelFieldsComponent: ComponentType<ProviderModelFieldsProps>;
  CatAvatarRowComponent: ComponentType<CatAvatarRowProps>;
}

export function WorkspaceModelSelector({
  value,
  onChange,
  ProviderModelFieldsComponent,
  CatAvatarRowComponent,
}: WorkspaceModelSelectorProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <ModelSelectorChip
        label={buildModelSelectorLabel(value)}
        onClick={() => setPanelOpen(!panelOpen)}
      />
      {panelOpen ? (
        <WorkspaceModelSelectorPanel
          mode="draft"
          cats={[]}
          bossCatId={null}
          selectedCatIds={[]}
          highlightedCatId={null}
          modelValue={value}
          onModelChange={onChange}
          onClose={() => setPanelOpen(false)}
          ProviderModelFieldsComponent={ProviderModelFieldsComponent}
          CatAvatarRowComponent={CatAvatarRowComponent}
        />
      ) : null}
    </>
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
      ProviderModelFieldsComponent={ProviderModelFields}
      CatAvatarRowComponent={CatAvatarRow}
    />
  );
}
