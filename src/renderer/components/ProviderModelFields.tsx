import { useEffect, useState } from 'react';
import {
  createStaticProviderModelCatalog,
  getDefaultModel,
  getProviderDisplayName,
  listProductProviders,
  type ProductProviderDescriptor,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog';
import { fetchProviderModels, fetchProviders } from '../api';

interface ProviderModelFieldsProps {
  provider: string;
  model: string;
  onProviderChange: (provider: string, defaultModel: string) => void;
  onModelChange: (model: string) => void;
}

export function ProviderModelFields({
  provider,
  model,
  onProviderChange,
  onModelChange,
}: ProviderModelFieldsProps) {
  const [providers, setProviders] = useState<ProductProviderDescriptor[]>(() => listProductProviders());
  const [catalog, setCatalog] = useState<ProviderModelCatalog>(() =>
    createStaticProviderModelCatalog(provider),
  );

  useEffect(() => {
    let cancelled = false;

    void fetchProviders()
      .then((nextProviders) => {
        if (!cancelled && nextProviders.length > 0) {
          setProviders(nextProviders);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setCatalog(createStaticProviderModelCatalog(provider));

    void fetchProviderModels(provider)
      .then((nextCatalog) => {
        if (!cancelled) {
          setCatalog(nextCatalog);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalog(createStaticProviderModelCatalog(provider));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  useEffect(() => {
    if (catalog.models.length === 0) {
      return;
    }

    const hasCurrentModel = catalog.models.some((option) => option.id === model);
    if (hasCurrentModel) {
      return;
    }

    const nextModel = catalog.models.find((option) => option.default)?.id || catalog.models[0]?.id;
    if (nextModel) {
      onModelChange(nextModel);
    }
  }, [catalog, model, onModelChange]);

  const providerOptions = providers.some((option) => option.id === provider)
    ? providers
    : [
      {
        id: provider as ProductProviderDescriptor['id'],
        label: getProviderDisplayName(provider),
        defaultModel: getDefaultModel(provider) || null,
        modelsPath: `/api/providers/${provider}/models`,
      },
      ...providers,
    ];

  return (
    <>
      <label className="fieldLabel">
        <span>Provider</span>
        <select
          className="textInput"
          value={provider}
          onChange={(event) => {
            const nextProvider = event.target.value;
            const defaultModel = providerOptions.find((option) => option.id === nextProvider)?.defaultModel
              || getDefaultModel(nextProvider);
            onProviderChange(nextProvider, defaultModel || '');
          }}
        >
          {providerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="fieldLabel">
        <span>Model</span>
        <select
          className="textInput"
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
        >
          {catalog.models.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
