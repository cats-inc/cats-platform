/** Observed catalog labels replace an exact target's previous rows atomically. */
export interface ProviderModelLabelEntry { id: string; label?: string | null; default?: boolean }
/** `basisId` names a catalog basis other than the first (Runtime SPEC-045); its labels are kept apart. */
export interface ProviderModelLabelScope { target?: string; catalogRevision?: string; context?: string; basisId?: string | null }
interface LabelSnapshot { provider: string; target: string; basisId: string | null; revision?: string; rows: ProviderModelLabelEntry[] }
const live = new Map<string, LabelSnapshot>();
let context = '';
let version = 0;
const listeners = new Set<() => void>();
export function providerModelLabelVersion(): number { return version; }
export function subscribeProviderModelLabels(listener: () => void): () => void {
  listeners.add(listener); return () => {listeners.delete(listener);};
}
function changed(): void { version += 1; for (const listener of listeners) listener(); }

export function setProviderModelLabelContext(next: string): void {
  if (next !== context) { live.clear(); informational.clear(); context = next; changed(); }
}

export function recordLiveProviderModelLabels(provider: string, models: ReadonlyArray<ProviderModelLabelEntry>, scope: ProviderModelLabelScope = {}): void {
  if (scope.context !== undefined && scope.context !== context) return;
  const target = scope.target?.trim() ?? '';
  const basisId = scope.basisId?.trim() || null;
  live.set(JSON.stringify([provider.trim(), target, basisId]), { provider: provider.trim(), target, basisId,
    revision: scope.catalogRevision, rows: models.filter(row => row.id && row.label?.trim()).map(row => ({ ...row })) });
  changed();
}

function observed(provider: string, target?: string | null, basisId?: string | null): LabelSnapshot | undefined {
  const candidates = [...live.values()].filter(value => value.provider === provider.trim()
    && value.basisId === (basisId?.trim() || null)
    && (!target || value.target === target || value.target.endsWith(`/${target}`)));
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Only Runtime-observed choices can initialize executable draft selections. */
export function readObservedProviderModels(provider: string, target?: string | null): ProviderModelLabelEntry[] {
  return observed(provider, target)?.rows.map(row => ({ ...row })) ?? [];
}

interface InformationalScope { provider: string; backend: string; transport?: string; basisId?: string; models: ProviderModelLabelEntry[] }
const informational = new Map<string, InformationalScope>();
export function replaceInformationalProviderLabels(scopes: InformationalScope[], expectedContext = context): void {
  if (expectedContext !== context) return;
  informational.clear();
  // Several bases of one target are separate scopes; none overwrites another.
  for (const scope of scopes) {
    informational.set(JSON.stringify([scope.provider, scope.backend, scope.transport, scope.basisId ?? null]), structuredClone(scope));
  }
  changed();
}

export function resolveLiveProviderModelLabel(provider: string, model: string, target?: string | null, basisId?: string | null): string | null {
  const current = observed(provider, target, basisId);
  // A complete observed scope owns removals too; an offline label cannot resurrect a removed row.
  if (current) return current.rows.find(row => row.id === model)?.label ?? null;
  const backend = target?.includes('/') ? target.split('/')[0] : undefined;
  const scopes = [...informational.values()].filter(scope => scope.provider === provider && (!backend || scope.backend === backend));
  const labels = scopes.flatMap(scope => scope.models.filter(row => row.id === model).map(row => row.label)).filter(Boolean);
  return labels.length && new Set(labels).size === 1 ? labels[0]! : null;
}

export function clearLiveProviderModelLabels(): void { live.clear(); informational.clear(); changed(); }
