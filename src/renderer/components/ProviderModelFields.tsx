import {
  getDefaultModel,
  getProviderDisplayName,
  getProviderModels,
  PAL_PROVIDER_ORDER,
} from '../../shared/providerCatalog';

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
  const providerModels = getProviderModels(provider);

  return (
    <>
      <label className="fieldLabel">
        <span>Provider</span>
        <select
          className="textInput"
          value={provider}
          onChange={(event) => {
            const nextProvider = event.target.value;
            onProviderChange(nextProvider, getDefaultModel(nextProvider));
          }}
        >
          {PAL_PROVIDER_ORDER.map((option) => (
            <option key={option} value={option}>
              {getProviderDisplayName(option)}
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
          {providerModels.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
