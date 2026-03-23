import { useEffect, useState } from 'react';
import {
  getProviderDisplayName,
  listProductProviders,
  type ProductProviderDescriptor,
} from '../../../../shared/providerCatalog';
import { fetchProviders } from '../api';

export interface ModelSelectorValue {
  provider: string;
  model: string | null;
  instance: string | null;
}

interface ModelSelectorProps {
  value: ModelSelectorValue;
  onChange: (value: ModelSelectorValue) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [providers, setProviders] = useState<ProductProviderDescriptor[]>(
    () => listProductProviders(),
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchProviders()
      .then((next) => { if (!cancelled && next.length > 0) setProviders(next); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const currentLabel = getProviderDisplayName(value.provider)
    + (value.model ? ` · ${value.model}` : '');

  return (
    <div className="modelSelector" style={{ position: 'relative' }}>
      <button
        type="button"
        className="modelSelectorButton"
        onClick={() => setOpen(!open)}
        data-tooltip="Select model"
      >
        <span className="modelSelectorLabel">{currentLabel}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>
      {open ? (
        <div className="modelSelectorDropdown">
          {providers.map((p) => {
            const isSelected = p.id === value.provider;
            return (
              <button
                key={p.id}
                type="button"
                className={isSelected ? 'modelSelectorItem modelSelectorItemActive' : 'modelSelectorItem'}
                onClick={() => {
                  onChange({
                    provider: p.id,
                    model: p.defaultModel ?? null,
                    instance: p.defaultInstance ?? null,
                  });
                  setOpen(false);
                }}
              >
                {p.label}
                {p.defaultModel ? <span className="modelSelectorItemSub">{p.defaultModel}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
