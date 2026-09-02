/**
 * Live provider model labels, recorded as catalogs load.
 *
 * `providerCatalogData.ts` carries a static label table so a target can still
 * be named before any catalog has loaded, and offline. That table also used to
 * be the only place a Claude version number appeared, because the runtime's
 * alias labels did not carry one -- so it hardcoded "Opus 4.7 with 1M context"
 * and went stale the moment the vendor shipped Opus 5, while the picker beside
 * it showed the current name from the runtime.
 *
 * The runtime owns which version an alias points at, so its label wins whenever
 * one has been seen. This registry is the seam: the renderer records labels as
 * it loads catalogs, and the label formatters in `src/shared/` read them
 * without importing renderer code, which would drag browser-only modules into
 * the server bundle.
 */

export interface ProviderModelLabelEntry {
  id: string;
  label?: string | null;
}

const liveProviderModelLabels = new Map<string, string>();

function labelKey(provider: string, model: string): string {
  return `${provider.trim().toLowerCase()}::${model.trim().toLowerCase()}`;
}

/**
 * Records the labels from one loaded provider catalog. Entries without a usable
 * label are skipped rather than stored blank, so a sparse catalog cannot erase
 * a name the static table can still supply.
 */
export function recordLiveProviderModelLabels(
  provider: string,
  models: ReadonlyArray<ProviderModelLabelEntry>,
): void {
  const normalizedProvider = provider.trim();
  if (!normalizedProvider) {
    return;
  }
  for (const model of models) {
    const id = model.id?.trim();
    const label = model.label?.trim();
    if (!id || !label) {
      continue;
    }
    liveProviderModelLabels.set(labelKey(normalizedProvider, id), label);
  }
}

export function resolveLiveProviderModelLabel(
  provider: string,
  model: string,
): string | null {
  if (!provider.trim() || !model.trim()) {
    return null;
  }
  return liveProviderModelLabels.get(labelKey(provider, model)) ?? null;
}

export function clearLiveProviderModelLabels(): void {
  liveProviderModelLabels.clear();
}
