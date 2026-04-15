import type { FormEvent } from 'react';

import { CatCreationFields } from '../../../../../design/components/CatCreationFields.js';
import {
  fetchAdvancedProviderModels,
  fetchProviderModels,
  fetchProviderRegistry,
} from '../../api/index.js';
import { type CatFormState } from '../../workspaceChatUtils.js';
import {
  isCatBusy,
  type WorkspaceBusyState,
} from '../../../../../shared/workspaceBusy.js';

export interface SettingsCatsCreateFormProps {
  busy: WorkspaceBusyState;
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
          fetchProviderRegistry={fetchProviderRegistry}
          fetchProviderModels={fetchProviderModels}
          fetchAdvancedProviderModels={fetchAdvancedProviderModels}
        />
        <button
          className="primaryButton"
          disabled={!catForm.name.trim() || !catForm.provider.trim() || !catForm.model.trim() || atCatLimit}
          type="submit"
        >
          {isCatBusy(busy, 'create') ? 'Saving...' : 'Save Cat'}
        </button>
      </form>
    </section>
  );
}
