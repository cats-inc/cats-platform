export function ProviderRegistryRecovery(input: {
  providerRegistryHint: string;
  canRetryProviderRegistry: boolean;
  providerRegistrySetupHref: string | null;
  forceReloadProviderRegistry: () => void;
}) {
  const {
    providerRegistryHint,
    canRetryProviderRegistry,
    providerRegistrySetupHref,
    forceReloadProviderRegistry,
  } = input;

  return (
    <>
      <span className="fieldHint">
        {providerRegistryHint}
      </span>
      {canRetryProviderRegistry ? (
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
