import React from 'react';

export function ProviderRegistryRecovery(input: {
  providerRegistryHint: string;
  canRetryProviderRegistry: boolean;
  providerRegistrySetupHref: string | null;
  forceReloadProviderRegistry: () => void;
  hideRetry?: boolean;
}) {
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
            Retry
          </button>
          {providerRegistrySetupHref ? (
            <a
              className="secondaryButton"
              href={providerRegistrySetupHref}
              target="_blank"
              rel="noreferrer"
            >
              Open Cats Runtime setup
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
            Open Cats Runtime setup
          </a>
        </div>
      ) : null}
    </>
  );
}
