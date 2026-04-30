import React from 'react';
import { useI18n } from '../../app/renderer/i18n/useI18n.js';
import { messageKeys } from '../../shared/i18n/index.js';

export function ProviderRegistryRecovery(input: {
  providerRegistryHint: string;
  canRetryProviderRegistry: boolean;
  providerRegistrySetupHref: string | null;
  forceReloadProviderRegistry: () => void;
  hideRetry?: boolean;
}) {
  const { t } = useI18n();

  const {
    providerRegistryHint,
    canRetryProviderRegistry,
    providerRegistrySetupHref,
    forceReloadProviderRegistry,
    hideRetry = false,
  } = input;

  const showRetry = canRetryProviderRegistry && !hideRetry;

  return (
    <>
      <span className="fieldHint">
        {providerRegistryHint}
      </span>
      {showRetry ? (
        <div className="providerCatalogRecoveryActions">
          <button
            className="secondaryButton"
            type="button"
            onClick={() => forceReloadProviderRegistry()}
          >
            {t(messageKeys.sharedCommonRetry)}
          </button>
          {providerRegistrySetupHref ? (
            <a
              className="secondaryButton"
              href={providerRegistrySetupHref}
              target="_blank"
              rel="noreferrer"
            >
              {t(messageKeys.sharedProviderModelFieldOpenRuntimeSetupLabel)}
            </a>
          ) : null}
        </div>
      ) : providerRegistrySetupHref ? (
        <div className="providerCatalogRecoveryActions">
          <a
            className="secondaryButton"
            href={providerRegistrySetupHref}
            target="_blank"
            rel="noreferrer"
            >
              {t(messageKeys.sharedProviderModelFieldOpenRuntimeSetupLabel)}
            </a>
        </div>
      ) : null}
    </>
  );
}
