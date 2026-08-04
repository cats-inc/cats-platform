import React from 'react';
import { useI18n } from '../../app/renderer/i18n/useI18n.js';
import { AuthenticatedBrowserLink } from '../../app/renderer/auth/AuthenticatedBrowserLink.js';
import { messageKeys } from '../../shared/i18n/index.js';

export function ProviderRegistryRecovery(input: {
  providerRegistryHint: string;
  canRetryProviderRegistry: boolean;
  providerRegistrySetupHref: string | null;
  forceReloadProviderRegistry: () => void;
  hideRetry?: boolean;
}) {
  const { t } = useI18n();
  const [runtimeBrowserOpenFailed, setRuntimeBrowserOpenFailed] = React.useState(false);

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
            <AuthenticatedBrowserLink
              className="secondaryButton"
              href={providerRegistrySetupHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => setRuntimeBrowserOpenFailed(false)}
              onOpenError={() => setRuntimeBrowserOpenFailed(true)}
            >
              {t(messageKeys.sharedProviderModelFieldOpenRuntimeSetupLabel)}
            </AuthenticatedBrowserLink>
          ) : null}
        </div>
      ) : providerRegistrySetupHref ? (
        <div className="providerCatalogRecoveryActions">
          <AuthenticatedBrowserLink
            className="secondaryButton"
            href={providerRegistrySetupHref}
            target="_blank"
            rel="noreferrer"
            onClick={() => setRuntimeBrowserOpenFailed(false)}
            onOpenError={() => setRuntimeBrowserOpenFailed(true)}
          >
            {t(messageKeys.sharedProviderModelFieldOpenRuntimeSetupLabel)}
          </AuthenticatedBrowserLink>
        </div>
      ) : null}
      {runtimeBrowserOpenFailed ? (
        <span className="fieldHint" role="alert">
          {t(messageKeys.settingsRuntimeBrowserHandoffError)}
        </span>
      ) : null}
    </>
  );
}
