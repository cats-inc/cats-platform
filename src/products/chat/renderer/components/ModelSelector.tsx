import { useEffect, useRef, useState } from 'react';
import {
  getProviderDisplayName,
  getProviderModels,
} from '../../../../shared/providerCatalog';
import type {
  ProviderModelSelection,
  ProviderTargetSelection,
} from '../../../../shared/providerSelection';
import { ProviderModelFields } from './ProviderModelFields';

export interface ModelSelectorValue {
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
}

interface ModelSelectorProps {
  value: ModelSelectorValue;
  onChange: (value: ModelSelectorValue) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    function onClickOutside(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [panelOpen]);

  const modelLabel = value.model
    ? (getProviderModels(value.provider).find((m) => m.value === value.model)?.label ?? value.model)
        .replace(/\s*\(default\)\s*/iu, '')
    : null;
  const providerName = getProviderDisplayName(value.provider).replace(/-CLI$/u, '');
  const currentLabel = providerName + (modelLabel ? ` \u00b7 ${modelLabel}` : '');

  function handleTargetChange(target: ProviderTargetSelection): void {
    onChange({
      provider: target.provider,
      model: target.model || null,
      instance: target.instance || null,
      modelSelection: target.modelSelection ?? null,
    });
  }

  return (
    <>
      <button
        type="button"
        className="modelSelectorChip"
        onClick={() => setPanelOpen(!panelOpen)}
        data-tooltip="Select model"
      >
        <span className="modelSelectorChipLabel">{currentLabel}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>
      {panelOpen ? (
        <div className="modelSelectorPanel" ref={panelRef}>
          <div className="modelSelectorPanelHeader">
            <strong>Execution Target</strong>
            <button
              type="button"
              className="chromeButton"
              onClick={() => setPanelOpen(false)}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
          <div className="modelSelectorPanelBody">
            <ProviderModelFields
              provider={value.provider}
              instance={value.instance ?? ''}
              model={value.model ?? ''}
              modelSelection={value.modelSelection}
              onTargetChange={handleTargetChange}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
