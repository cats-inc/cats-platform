import type { FormEvent } from 'react';

import { type CatFormState } from '../../chatUtils';
import { CatCreationFields } from '../CatCreationFields';

export interface SettingsCatsCreateFormProps {
  busy: string;
  catForm: CatFormState;
  onCatFormChange: (value: CatFormState) => void;
  onCreateCat: (event: FormEvent<HTMLFormElement>) => void;
  atCatLimit?: boolean;
  availableSurfaces?: string[];
  enabledSurfaces?: string[];
}

export function SettingsCatsCreateForm({
  busy,
  catForm,
  onCatFormChange,
  onCreateCat,
  atCatLimit,
  availableSurfaces,
  enabledSurfaces,
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
          makeBoss={catForm.makeBoss}
          onMakeBossChange={(makeBoss) => onCatFormChange({ ...catForm, makeBoss })}
          products={catForm.products}
          onProductsChange={(products) => onCatFormChange({ ...catForm, products })}
          availableSurfaces={availableSurfaces}
          enabledSurfaces={enabledSurfaces}
        />
        <button
          className="primaryButton"
          disabled={!catForm.name.trim() || !catForm.provider.trim() || !catForm.model.trim() || atCatLimit}
          type="submit"
        >
          {busy === 'cat:create' ? 'Saving...' : 'Save Cat'}
        </button>
      </form>
    </section>
  );
}
