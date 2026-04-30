import { useEffect, useRef, type FormEvent } from 'react';

import { CatCreationFields } from '../../../../../design/components/CatCreationFields.js';
import { messageKeys } from '../../../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../../../app/renderer/i18n/index.js';
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
  autoFocusName?: boolean;
  collapsible?: boolean;
  expanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
  embedded?: boolean;
}

export function SettingsCatsCreateForm({
  busy,
  catForm,
  onCatFormChange,
  onCreateCat,
  atCatLimit,
  availableSurfaces,
  enabledSurfaces,
  autoFocusName,
  collapsible,
  expanded,
  onExpandChange,
  embedded,
}: SettingsCatsCreateFormProps) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);
  const isCollapsedCta = collapsible && !expanded;
  useEffect(() => {
    if (!autoFocusName || isCollapsedCta) return;
    const input = formRef.current?.querySelector<HTMLInputElement>('input.textInput');
    input?.focus();
    input?.select();
  }, [autoFocusName, isCollapsedCta]);

  if (isCollapsedCta) {
    return (
      <section className="contentCard catsCreateCta">
        <button
          className="catsCreateCtaButton"
          type="button"
          onClick={() => onExpandChange?.(true)}
          disabled={atCatLimit}
        >
          <span className="catsCreateCtaIcon" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </span>
          <span className="catsCreateCtaLabel">
            <strong>{t(messageKeys.sharedCatsCreateNewCat)}</strong>
            <span className="catsCreateCtaHint">
              {atCatLimit
                ? t(messageKeys.sharedCatsCreateCatLimitReached)
                : t(messageKeys.sharedCatsCreateAddNewCatHint)}
            </span>
          </span>
        </button>
      </section>
    );
  }

  const formBody = (
    <form
      ref={formRef}
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
        namePlaceholder={t(messageKeys.sharedCatsCreateCatNamePlaceholder)}
        autoFocusName={autoFocusName}
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
      <div className="catsCreateActions">
        {collapsible ? (
          <button
            type="button"
            className="secondaryButton"
            onClick={() => onExpandChange?.(false)}
          >
            {t(messageKeys.sharedCatsCreateCancel)}
          </button>
        ) : null}
        <button
          className="primaryButton"
          disabled={!catForm.name.trim() || !catForm.provider.trim() || !catForm.model.trim() || atCatLimit}
          type="submit"
        >
          {isCatBusy(busy, 'create')
            ? t(messageKeys.sharedCatsCreateSaving)
            : t(messageKeys.sharedCatsCreateSaveCat)}
        </button>
      </div>
    </form>
  );

  if (embedded) {
    return <div className="catsCreateEmbedded">{formBody}</div>;
  }

  return (
    <section className="contentCard contentCardForm catsCreateCard">
      <div className="contentCardHeader">
        <div>
          <p className="sectionLabel">{t(messageKeys.sharedCatsCreateCreateSection)}</p>
          <h2>{t(messageKeys.sharedCatsCreateNewCat)}</h2>
        </div>
        {collapsible ? (
          <button
            type="button"
            className="iconButton catsCreateClose"
            onClick={() => onExpandChange?.(false)}
            aria-label={t(messageKeys.sharedCatsCreateCancel)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
      </div>
      {formBody}
    </section>
  );
}
