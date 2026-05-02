export interface RuntimeExternalLinkSource {
  baseUrl: string;
  externalBaseUrl?: string | null;
}

export function resolveRuntimeExternalBaseUrl(runtime: RuntimeExternalLinkSource): string {
  const externalBaseUrl = runtime.externalBaseUrl?.trim();
  return (externalBaseUrl && externalBaseUrl.length > 0
    ? externalBaseUrl
    : runtime.baseUrl
  ).replace(/\/+$/u, '');
}

export function resolveRuntimeSetupExternalHref(runtime: RuntimeExternalLinkSource): string {
  return `${resolveRuntimeExternalBaseUrl(runtime)}/setup`;
}
