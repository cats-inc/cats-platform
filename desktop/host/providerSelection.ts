import { randomUUID } from 'node:crypto';

/** The connected Runtime owns both selection and operation admission. */
export interface SelectedProviderTarget {
  provider: string;
  backend: 'cli' | 'api' | 'local' | 'agent';
  instance: string;
}

export interface ProviderSelection {
  state: 'missing' | 'invalid' | 'empty' | 'selected';
  revision: string;
  targets: SelectedProviderTarget[];
  nativeSetupTargets: SelectedProviderTarget[];
  diskChanged: boolean;
  error: string | null;
}

export interface ProviderSelectionCatalogEntry extends SelectedProviderTarget {
  familyLabel: string;
  binaryName: string;
}

export const targetKey = (target: SelectedProviderTarget): string =>
  JSON.stringify([target.provider, target.backend, target.instance]);

// Shared Node/npm work is needed only by these bundled native installers.
export const NPM_PROVIDERS = new Set([
  'codex', 'copilot', 'opencode', 'kilo', 'auggie', 'pi', 'cline',
]);

export function nativeSetupTarget(provider: string): SelectedProviderTarget {
  if (provider === 'ollama') return { provider, backend: 'local', instance: 'local' };
  if (provider === 'devin') return { provider, backend: 'agent', instance: 'acp' };
  return { provider, backend: 'cli', instance: 'native' };
}

export function targetsForSetupHelper(helperId: string, selection: ProviderSelection): SelectedProviderTarget[] {
  if (selection.state !== 'selected') throw new Error('Select providers before running setup helpers.');
  const provider = /^(?:windows|macos|linux)-(.+)-(?:native|local-model)-installer$/u.exec(helperId)?.[1];
  let targets: SelectedProviderTarget[];
  if (provider) {
    const key = targetKey(nativeSetupTarget(provider));
    targets = (selection.nativeSetupTargets ?? []).filter((target) => targetKey(target) === key);
  } else if (/(?:node-host-installer|npm-prefix-helper)$/u.test(helperId)) {
    targets = (selection.nativeSetupTargets ?? []).filter((target) => target.backend === 'cli'
      && target.instance === 'native' && NPM_PROVIDERS.has(target.provider));
  } else if (helperId.endsWith('-github-cli-installer')) {
    targets = (selection.nativeSetupTargets ?? []).filter((target) => target.provider === 'copilot'
      && target.backend === 'cli' && target.instance === 'native');
  } else if (helperId === 'windows-vcredist-installer') {
    targets = (selection.nativeSetupTargets ?? []).filter((target) => target.backend === 'cli' && target.instance === 'native');
  } else {
    throw new Error('This helper has no selected-provider scope. Use individual provider helpers.');
  }
  if (!targets.length) throw new Error('This helper is outside the selected provider scope.');
  return targets;
}

interface SelectedSetupOperation<T> {
  baseUrl: string;
  helperId: string;
  run: () => Promise<T>;
  fetch?: typeof fetch;
}

const activeHelpers = new Set<Promise<unknown>>();
let helperPauseCount = 0;

/** Stop admitting helpers before Runtime is drained or restarted. */
export function pauseSelectedSetupHelpers(): { drained: Promise<void>; resume: () => void } {
  helperPauseCount++;
  let resumed = false;
  return {
    drained: Promise.allSettled([...activeHelpers]).then(() => undefined),
    resume: () => { if (!resumed) { resumed = true; helperPauseCount--; } },
  };
}

export async function withSelectedSetupTargets<T>(options: SelectedSetupOperation<T>): Promise<T> {
  if (helperPauseCount) throw new Error('Desktop is restarting or stopping. Wait before running setup helpers.');
  const operation = runSelectedSetupOperation(options);
  activeHelpers.add(operation);
  try { return await operation; } finally { activeHelpers.delete(operation); }
}

async function runSelectedSetupOperation<T>(options: SelectedSetupOperation<T>): Promise<T> {
  const request = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/+$/u, '');
  await retryPendingSetupOperationReleases();
  const state = await request(`${base}/setup-state`, { signal: AbortSignal.timeout(10_000) });
  if (!state.ok) throw new Error('Cannot read Runtime provider selection.');
  const { selection } = await state.json() as { selection: ProviderSelection };
  if (!selection) throw new Error('Runtime provider selection is unavailable.');
  const targets = targetsForSetupHelper(options.helperId, selection);
  const operations: string[] = [];
  try {
    for (const target of targets) {
      const operationId = randomUUID();
      operations.push(operationId);
      const response = await request(`${base}/setup-operations`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, expectedRevision: selection.revision, operationId }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Provider selection changed. Refresh before running this helper.');
    }
    return await options.run();
  } finally {
    for (const id of operations) pendingReleases.set(`${base}/setup-operations/${id}`, request);
    await retryPendingSetupOperationReleases();
  }
}

// Keep receipts when Runtime is briefly unreachable. Inventory refresh and the
// next save/helper retry cleanup, without discarding a completed helper result.
const pendingReleases = new Map<string, typeof fetch>();
export async function retryPendingSetupOperationReleases(): Promise<void> {
  await Promise.all([...pendingReleases].map(async ([url, request]) => {
    try {
      const response = await request(url, { method: 'DELETE', signal: AbortSignal.timeout(2_000) });
      if (response.ok) pendingReleases.delete(url);
    } catch { /* Keep the receipt for the next host interaction. */ }
  }));
}
