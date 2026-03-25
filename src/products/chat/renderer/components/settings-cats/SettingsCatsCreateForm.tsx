import type { FormEvent } from 'react';

import { type CatFormState } from '../../chatUtils';
import { CatCreationFields } from '../CatCreationFields';

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
        <CatCreationFields
          name={catForm.name}
          onNameChange={(name) => onCatFormChange({ ...catForm, name })}
          provider={catForm.provider}
          instance={catForm.instance}
          model={catForm.model}
          modelSelection={catForm.modelSelection}
          onTargetChange={(target) =>
            onCatFormChange({
              ...catForm,
              provider: target.provider,
              instance: target.instance,
              model: target.model,
              modelSelection: target.modelSelection ?? null,
            })}
          namePlaceholder="Ops reviewer"
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
