export const PRODUCT_PROVIDER_CATALOG_CHECKING_WARNING =
  'provider_registry.product_catalog_checking';
export const LAST_SAVED_PROVIDER_TARGETS_WARNING =
  'provider_registry.last_saved_targets';
export const PROVIDER_LOAD_FAILED_WARNING = 'provider_registry.load_failed';
export const PROVIDER_REFRESH_FAILED_WARNING = 'provider_registry.refresh_failed';

const PROVIDER_CACHED_REFRESH_FAILED_WARNING_PREFIX =
  'provider_registry.cached_refresh_failed:';

export function createProviderCachedRefreshFailedWarning(message: string): string {
  return `${PROVIDER_CACHED_REFRESH_FAILED_WARNING_PREFIX}${message}`;
}

export function readProviderCachedRefreshFailedWarning(
  warning: string,
): string | null {
  return warning.startsWith(PROVIDER_CACHED_REFRESH_FAILED_WARNING_PREFIX)
    ? warning.slice(PROVIDER_CACHED_REFRESH_FAILED_WARNING_PREFIX.length)
    : null;
}
