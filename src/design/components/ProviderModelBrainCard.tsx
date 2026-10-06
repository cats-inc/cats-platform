import React from 'react';
import { useI18n } from '../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../shared/i18n/index.js';

import {
  ProviderModelFields,
  type ProviderModelFieldsProps,
} from './ProviderModelFields.js';
import {
  SettingsSectionHeader,
  SettingsSubSection,
} from './settings/index.js';

interface ProviderModelBrainCardProps extends ProviderModelFieldsProps {
  title?: string;
  className?: string;
}

export function ProviderModelBrainCard({
  title,
  className = 'catsSubCard',
  ...fieldsProps
}: ProviderModelBrainCardProps) {
  const { t } = useI18n();
  const resolvedTitle = title ?? t(messageKeys.sharedProviderModelBrainCardTitle);

  return (
    <SettingsSubSection
      className={className}
      header={<SettingsSectionHeader title={resolvedTitle} nested />}
    >
      <ProviderModelFields
        {...fieldsProps}
      />
    </SettingsSubSection>
  );
}
