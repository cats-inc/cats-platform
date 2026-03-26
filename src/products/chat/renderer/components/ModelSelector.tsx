import { useEffect, useRef, useState } from 'react';
import {
  getProviderDisplayName,
  getProviderModels,
} from '../../../../shared/providerCatalog';
import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../../../shared/providerSelection';
import type { ChatCat } from '../../api/contracts';
import { catInitials, isChatCat } from '../chatUtils';
import { ProviderModelFields } from './ProviderModelFields';
import { CatAvatarRow } from './CatAvatarRow';

export interface ModelSelectorValue {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

// --- Chip ---

export interface ModelSelectorChipProps {
  label: string;
  onClick: () => void;
}

export function ModelSelectorChip({ label, onClick }: ModelSelectorChipProps) {
  return (
    <button
      type="button"
      className="modelSelectorChip"
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
  const modelLabel = value.model
    ? (getProviderModels(value.provider).find((m) => m.value === value.model)?.label ?? value.model)
        .replace(/\s*\(default\)\s*/iu, '')
    : null;
  const providerName = getProviderDisplayName(value.provider);
  const base = providerName + (modelLabel ? ` \u00b7 ${modelLabel}` : '');
  return catName ? `${catName} \u00b7 ${base}` : base;
}

// --- Panel ---

export type ModelSelectorPanelMode = 'draft' | 'direct-lane';

export interface ModelSelectorPanelProps {
  mode: ModelSelectorPanelMode;
  cats: ChatCat[];
  bossCatId: string | null;
  selectedCatIds: string[];
  highlightedCatId: string | null;
  leadCatId?: string | null;
  onToggleCat?: (catId: string) => void;
  onHighlightCat?: (catId: string) => void;
  modelValue: ModelSelectorValue;
  onModelChange: (value: ModelSelectorValue) => void;
  fieldsDisabled?: boolean;
  onClose: () => void;
}

export function ModelSelectorPanel({
  mode,
  cats,
  bossCatId,
  selectedCatIds,
  highlightedCatId,
  onToggleCat,
  onHighlightCat,
  leadCatId,
  modelValue,
  onModelChange,
  fieldsDisabled,
  onClose,
}: ModelSelectorPanelProps) {
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

  const chatCats = cats
    .filter((c) => c.status === 'active' && isChatCat(c));

  function handleTargetChange(target: ProviderTargetSelection): void {
    onModelChange({
      provider: target.provider,
      model: target.model || null,
      instance: target.instance || null,
      modelSelection: target.modelSelection ?? null,
    });
  }

  const headerLabel = 'Execution Target';

  return (
    <div className="modelSelectorPanel" ref={panelRef}>
      <div className="modelSelectorPanelHeader">
        <strong>{headerLabel}</strong>
        <button
          type="button"
          className="chromeButton"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
      </div>
      <CatAvatarRow
        cats={chatCats}
        bossCatId={bossCatId}
        selectedIds={selectedCatIds}
        highlightedId={highlightedCatId}
        leadCatId={leadCatId}
        toggleable={mode === 'draft'}
        showLeadBadge={mode === 'draft'}
        onToggle={onToggleCat ?? (() => {})}
        onHighlight={onHighlightCat ?? (() => {})}
      />
      <div
        className="modelSelectorPanelBody"
        style={fieldsDisabled ? { pointerEvents: 'none', opacity: 0.45 } : undefined}
      >
        <ProviderModelFields
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

// --- Legacy wrapper (backward compat) ---

interface ModelSelectorProps {
  value: ModelSelectorValue;
  onChange: (value: ModelSelectorValue) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <ModelSelectorChip
        label={buildModelSelectorLabel(value)}
        onClick={() => setPanelOpen(!panelOpen)}
      />
      {panelOpen ? (
        <ModelSelectorPanel
          mode="draft"
          cats={[]}
          bossCatId={null}
          selectedCatIds={[]}
          highlightedCatId={null}
          modelValue={value}
          onModelChange={onChange}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </>
  );
}
