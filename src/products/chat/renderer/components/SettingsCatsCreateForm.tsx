import type { FormEvent } from 'react';

import { type CatFormState } from '../chatUtils';
import { ProviderModelFields } from './ProviderModelFields';

export interface SettingsCatsCreateFormProps {
  busy: string;
  catForm: CatFormState;
  onCatFormChange: (value: CatFormState) => void;
  onCreateCat: (event: FormEvent<HTMLFormElement>) => void;
}

export function SettingsCatsCreateForm({
  busy,
  catForm,
  onCatFormChange,
  onCreateCat,
}: SettingsCatsCreateFormProps) {
  return (
    <section className="contentCard contentCardForm">
      <div className="contentCardHeader">
        <div>
          <p className="sectionLabel">Create</p>
          <h2>New cat</h2>
        </div>
      </div>
      <form
        className="stackForm"
        onSubmit={(event) => void onCreateCat(event)}
      >
        <label className="fieldLabel">
          <span>Name</span>
          <input
            className="textInput"
            value={catForm.name}
            onChange={(event) => onCatFormChange({ ...catForm, name: event.target.value })}
            placeholder="Ops reviewer"
          />
        </label>
        <ProviderModelFields
          provider={catForm.provider}
          instance={catForm.instance}
          model={catForm.model}
          onTargetChange={(target) =>
            onCatFormChange({
              ...catForm,
              provider: target.provider,
              instance: target.instance,
              model: target.model,
            })}
        />
        <button
          className="primaryButton"
          disabled={!catForm.name.trim() || !catForm.provider.trim() || !catForm.model.trim()}
          type="submit"
        >
          {busy === 'cat:create' ? 'Saving...' : 'Save Cat'}
        </button>
      </form>
    </section>
  );
}
