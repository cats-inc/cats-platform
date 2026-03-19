import { useEffect, useRef, useState } from 'react';
import {
  createStaticProviderModelCatalog,
  getProviderDisplayName,
  listProductProviders,
  type ProductProviderDescriptor,
  type ProductProviderInstanceDescriptor,
  type ProviderModelCatalog,
} from '../../shared/providerCatalog';
import {
  resolveCatalogTargetSelection,
  resolveSelectedProviderInstance,
  type ProviderTargetSelection,
} from '../../shared/providerSelection';
import { fetchProviderModels, fetchProviders } from '../api';

interface ProviderModelFieldsProps {
  provider: string;
  instance: string;
  model: string;
  onTargetChange: (target: ProviderTargetSelection) => void;
}

function createFallbackProvider(provider: string): ProductProviderDescriptor {
  return {
    id: provider as ProductProviderDescriptor['id'],
    label: getProviderDisplayName(provider),
    defaultModel: null,
    defaultInstance: null,
    defaultBackend: null,
    instances: [],
    modelsPath: `/api/providers/${provider}/models`,
  };
}

export function ProviderModelFields({
  provider,
  instance,
  model,
  onTargetChange,
}: ProviderModelFieldsProps) {
  const [providers, setProviders] = useState<ProductProviderDescriptor[]>(() => listProductProviders());
  const [catalog, setCatalog] = useState<ProviderModelCatalog>(() =>
    createStaticProviderModelCatalog(provider),
  );
  const manualModelTargetKey = useRef<string | null>(null);
  const previousTargetKey = useRef<string>('');

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

  const providerOptions = providers.some((option) => option.id === provider)
    ? providers
    : [createFallbackProvider(provider), ...providers];
  const selectedProvider =
    providerOptions.find((option) => option.id === provider) ?? createFallbackProvider(provider);
  const resolvedInstance = resolveSelectedProviderInstance(selectedProvider, instance);
  const targetKey = `${provider}::${resolvedInstance}`;

  useEffect(() => {
    if (previousTargetKey.current !== targetKey) {
      previousTargetKey.current = targetKey;
      manualModelTargetKey.current = null;
    }
    if (resolvedInstance !== instance) {
      onTargetChange({ provider, instance: resolvedInstance, model });
    }
  }, [instance, model, onTargetChange, provider, resolvedInstance, targetKey]);

  useEffect(() => {
    let cancelled = false;

    setCatalog(createStaticProviderModelCatalog(provider, {
      instance: resolvedInstance || null,
    }));

    void fetchProviderModels(provider, resolvedInstance || null)
      .then((nextCatalog) => {
        if (!cancelled) {
          setCatalog(nextCatalog);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalog(createStaticProviderModelCatalog(provider, {
            instance: resolvedInstance || null,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provider, resolvedInstance]);

  useEffect(() => {
    if (catalog.models.length === 0) {
      return;
    }

    const nextTarget = resolveCatalogTargetSelection({
      target: {
        provider,
        instance: resolvedInstance,
        model,
      },
      catalog,
      preserveCurrentModel: manualModelTargetKey.current === targetKey,
    });

    if (
      nextTarget.instance !== instance
      || nextTarget.model !== model
    ) {
      onTargetChange(nextTarget);
    }
  }, [catalog, instance, model, onTargetChange, provider, resolvedInstance, targetKey]);

  const instanceOptions = selectedProvider.instances.some((option) => option.id === resolvedInstance)
    ? selectedProvider.instances
    : resolvedInstance
      ? [{
          id: resolvedInstance,
          label: resolvedInstance,
          target: resolvedInstance,
          backend: null,
        }, ...selectedProvider.instances]
      : selectedProvider.instances;

  return (
    <>
      <label className="fieldLabel">
        <span>Provider</span>
        <select
          className="textInput"
          value={provider}
          onChange={(event) => {
            const nextProvider = providerOptions.find((option) => option.id === event.target.value)
              ?? createFallbackProvider(event.target.value);
            const nextInstance = resolveSelectedProviderInstance(nextProvider, '');
            manualModelTargetKey.current = null;
            onTargetChange({
              provider: nextProvider.id,
              instance: nextInstance,
              model: '',
            });
          }}
        >
          {providerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {instanceOptions.length > 1 ? (
        <label className="fieldLabel">
          <span>Instance</span>
          <select
            className="textInput"
            value={resolvedInstance}
            onChange={(event) => {
              manualModelTargetKey.current = null;
              onTargetChange({
                provider,
                instance: event.target.value,
                model: '',
              });
            }}
          >
            {instanceOptions.map((option: ProductProviderInstanceDescriptor) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="fieldLabel">
        <span>Model</span>
        <select
          className="textInput"
          value={model}
          onChange={(event) => {
            manualModelTargetKey.current = targetKey;
            onTargetChange({
              provider,
              instance: resolvedInstance,
              model: event.target.value,
            });
          }}
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
