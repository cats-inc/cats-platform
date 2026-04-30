import type {
  ProviderAdvancedCatalogControl,
  ProviderAdvancedControlValue,
} from '../../shared/providerCatalog.js';
import { useI18n } from '../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../shared/i18n/index.js';
import {
  hasExplicitDefaultEnumOption,
  listApplicableControlValueOptions,
  resolveDisplayedEnumControlValue,
  serializeControlInputValue,
} from './providerModelFieldsSupport.js';

export function ProviderModelFieldControls(input: {
  controlOptions: ProviderAdvancedCatalogControl[];
  selectedCatalogEntryId: string;
  controlValues: Record<string, ProviderAdvancedControlValue>;
  onControlChange: (control: ProviderAdvancedCatalogControl, rawValue: string) => void;
}) {
  const {
    controlOptions,
    selectedCatalogEntryId,
    controlValues,
    onControlChange,
  } = input;
  const { t } = useI18n();

  return controlOptions.map((control) => {
    const value = controlValues[control.key];
    if (control.kind === 'boolean') {
      return (
        <label className="fieldLabel providerControlField" key={control.key}>
          <span>{control.label}</span>
          <select
            className="textInput"
            value={serializeControlInputValue(value)}
            onChange={(event) => onControlChange(control, event.target.value)}
          >
            <option value="">
              {t(messageKeys.sharedProviderModelControlDefault)}
            </option>
            <option value="true">{t(messageKeys.sharedProviderModelControlEnabled)}</option>
            <option value="false">{t(messageKeys.sharedProviderModelControlDisabled)}</option>
          </select>
          {control.description ? (
            <span className="fieldHint">{control.description}</span>
          ) : null}
        </label>
      );
    }

    if (control.kind === 'enum' && control.values && control.values.length > 0) {
      const controlValueOptions = listApplicableControlValueOptions(
        control,
        selectedCatalogEntryId,
      );
      const showSyntheticDefaultOption = !hasExplicitDefaultEnumOption(
        control,
        selectedCatalogEntryId,
      );
      const displayedValue = resolveDisplayedEnumControlValue(
        control,
        selectedCatalogEntryId,
        value,
      );
      return (
        <label className="fieldLabel providerControlField" key={control.key}>
          <span>{control.label}</span>
          <select
            className="textInput"
            value={displayedValue}
            onChange={(event) => onControlChange(control, event.target.value)}
          >
            {showSyntheticDefaultOption
              ? <option value="">{t(messageKeys.sharedProviderModelControlDefault)}</option>
              : null}
            {controlValueOptions.map((option, index) => (
              <option
                key={`${control.key}-${String(option.value)}-${index}`}
                value={String(option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
          {control.description ? (
            <span className="fieldHint">{control.description}</span>
          ) : null}
        </label>
      );
    }

    return (
      <label className="fieldLabel providerControlField" key={control.key}>
        <span>{control.label}</span>
        <input
          className="textInput"
          type={control.kind === 'number' ? 'number' : 'text'}
          value={serializeControlInputValue(value)}
          min={control.kind === 'number' ? control.minimum : undefined}
          max={control.kind === 'number' ? control.maximum : undefined}
          step={control.kind === 'number' ? control.step ?? 1 : undefined}
          placeholder={t(messageKeys.sharedProviderModelControlOptionalPlaceholder)}
          onChange={(event) => onControlChange(control, event.target.value)}
        />
        {control.description ? (
          <span className="fieldHint">{control.description}</span>
        ) : null}
      </label>
    );
  });
}
