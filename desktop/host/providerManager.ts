import type { ProviderManagerSnapshot, ProviderSetupOutcome, ProviderTarget } from '../../packages/provider-setup/manager.js';
import type { DesktopSetupActionRecord, DesktopSetupHelperMode, DesktopSetupHelperSummary } from './contracts.js';
import { NPM_PROVIDERS, targetKey, targetsForSetupHelper } from './providerSelection.js';

export type ProviderManagerRuntime = ProviderManagerSnapshot['runtime'] & {
  scan: { revision: string; scannedAt?: string | null; providers: Array<ProviderTarget & { available: boolean; authStatus?: string }> } | null;
  state: { status: string; error: string | null; scanId?: string; scanCompleted?: number; scanTotal?: number };
};

interface Dependencies {
  platform: 'windows' | 'macos' | 'linux';
  request<T>(path: string, init?: RequestInit): Promise<T>;
  helpers(): Promise<DesktopSetupHelperSummary[]>;
  helper(helperId: string, mode: DesktopSetupHelperMode, dryRun: boolean, expectedRevision: string): Promise<DesktopSetupActionRecord>;
  changed(runtime: ProviderManagerRuntime): Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

const modes = { install: 'apply', upgrade: 'upgrade', repair: 'force', uninstall: 'uninstall', preview_uninstall: 'uninstall' } as const;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider action.');
  return value as Record<string, unknown>;
}
function targets(value: unknown, allowEndpoint = false): ProviderTarget[] {
  if (!Array.isArray(value)) throw new Error('Choose provider targets.');
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    const entry = record(item);
    if (typeof entry.provider !== 'string' || !entry.provider || typeof entry.instance !== 'string' || !entry.instance
      || !['cli', 'api', 'local', 'agent'].includes(String(entry.backend))) throw new Error('Invalid provider target.');
    const target: ProviderTarget = { provider: entry.provider, backend: entry.backend as ProviderTarget['backend'], instance: entry.instance };
    if (allowEndpoint && entry.endpoint !== undefined) {
      if (typeof entry.endpoint !== 'string') throw new Error('Endpoint must be a URL.');
      target.endpoint = entry.endpoint;
    }
    const key = targetKey(target);
    if (seen.has(key)) throw new Error('Duplicate provider target.');
    seen.add(key);
    return target;
  });
}
function body(value: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) };
}

/** Both renderers use this host-owned orchestration; reads are always passive. */
export class DesktopProviderManager {
  private operation: { targets: ProviderTarget[]; stage: string } | null = null;
  private outcomes: Record<string, ProviderSetupOutcome> = {};
  constructor(private readonly dependencies: Dependencies) {}

  async read(): Promise<ProviderManagerSnapshot> {
    const [runtime, helpers] = await Promise.all([
      this.dependencies.request<ProviderManagerRuntime>('/setup-state'), this.dependencies.helpers(),
    ]);
    return { runtime, helpers: helpers.filter((helper) => {
      try { return targetsForSetupHelper(helper.id, runtime.selection).length > 0; } catch { return false; }
    }), platform: this.dependencies.platform,
    operations: this.operation ? [{ ...this.operation }] : [], outcomes: { ...this.outcomes } };
  }

  private assertRevision(runtime: ProviderManagerRuntime, expected: unknown): asserts expected is string {
    if (typeof expected !== 'string' || expected !== runtime.selection.revision || runtime.selection.diskChanged) {
      throw new Error('Provider settings changed elsewhere. Refresh before continuing.');
    }
  }

  private async exclusive<T>(selected: ProviderTarget[], stage: string, run: () => Promise<T>): Promise<T> {
    if (this.operation) throw new Error('A provider operation is running. Wait for it to finish.');
    this.operation = { targets: selected, stage };
    try { return await run(); } finally { this.operation = null; }
  }

  async apply(value: unknown): Promise<ProviderManagerSnapshot> {
    const input = record(value);
    const desired = targets(input.targets, true);
    if (typeof input.expectedRevision !== 'string' || typeof input.detectAfter !== 'boolean') throw new Error('Invalid provider selection.');
    await this.exclusive(desired, 'Applying provider selection…', async () => {
      const reload = input.reload === true;
      const runtime = await this.dependencies.request<ProviderManagerRuntime>('/setup-state');
      if (!reload) this.assertRevision(runtime, input.expectedRevision);
      await this.dependencies.request(`/setup-selection${reload ? '/reload' : ''}`, {
        ...body({ targets: desired, expectedRevision: input.expectedRevision }), method: reload ? 'POST' : 'PUT',
      });
      const saved = await this.dependencies.request<ProviderManagerRuntime>('/setup-state');
      await this.dependencies.changed(saved);
      if (input.detectAfter && !reload && saved.selection.targets.length) {
        try { await this.detect(saved.selection.targets, saved.selection.revision); }
        catch (error) {
          // The successful save is authoritative even when its optional check fails.
          this.rememberFailure(saved.selection.targets, error, 'detection');
        }
      }
    });
    return this.read();
  }

  async run(value: unknown): Promise<ProviderManagerSnapshot> {
    const input = record(value);
    const selected = targets(input.targets);
    const action = String(input.action);
    if (action !== 'detect' && !Object.hasOwn(modes, action)) throw new Error('Unsupported provider action.');
    if (!selected.length || (action !== 'detect' && selected.length !== 1)) throw new Error('Choose exactly one provider for installation actions.');
    let preview: ProviderManagerSnapshot['preview'];
    await this.exclusive(selected, action === 'detect' ? 'Detecting…' : 'Preparing provider operation…', async () => {
      const runtime = await this.dependencies.request<ProviderManagerRuntime>('/setup-state');
      this.assertRevision(runtime, input.expectedRevision);
      if (selected.some((target) => !runtime.selection.targets.some((entry) => targetKey(entry) === targetKey(target)))) {
        throw new Error('Apply this provider selection before detecting or installing it.');
      }
      if (action === 'detect') { await this.detect(selected, input.expectedRevision); return; }
      const target = selected[0]!;
      const helperId = `${this.dependencies.platform}-${target.provider}-${target.provider === 'ollama' ? 'local-model' : 'native'}-installer`;
      const admitted = targetsForSetupHelper(helperId, runtime.selection);
      if (!admitted.some((entry) => targetKey(entry) === targetKey(target))) throw new Error('This target has no native Desktop installer.');
      const helper = (await this.dependencies.helpers()).find((entry) => entry.id === helperId && entry.available && entry.supported);
      const mode = modes[action as keyof typeof modes];
      if (!helper || (mode === 'apply' && !helper.supportsApply) || (mode === 'upgrade' && !helper.supportsUpgrade)
        || (mode === 'force' && !helper.supportsForce) || (mode === 'uninstall' && !helper.supportsUninstall)) {
        throw new Error('This installation action is not supported on this platform.');
      }
      if (['install', 'upgrade', 'repair'].includes(action) && target.backend === 'cli' && NPM_PROVIDERS.has(target.provider)) {
        await this.ensureNpmPrerequisites(input.expectedRevision);
      }
      this.operation!.stage = `${action === 'preview_uninstall' ? 'Checking removal paths for' : action === 'install' ? 'Installing' : action === 'upgrade' ? 'Updating' : action === 'repair' ? 'Repairing' : 'Uninstalling'} ${target.provider}…`;
      const result = await this.dependencies.helper(helperId, mode, action === 'preview_uninstall', input.expectedRevision);
      if (action === 'preview_uninstall') { preview = { target, result, revision: input.expectedRevision }; return; }
      this.outcomes[targetKey(target)] = { ...result, source: 'installer' };
      // The installer owns changes; exactly one Runtime check owns verification.
      try { await this.detect(selected, input.expectedRevision); }
      catch (error) {
        result.warnings = [...result.warnings, `Installation result retained; verification failed: ${error instanceof Error ? error.message : String(error)}`];
        this.outcomes[targetKey(target)] = { ...result, source: 'installer' };
      }
    }).catch((error: unknown) => { this.rememberFailure(selected, error, action === 'detect' ? 'detection' : 'installer'); throw error; });
    const snapshot = await this.read();
    return preview ? { ...snapshot, preview } : snapshot;
  }

  private rememberFailure(selected: ProviderTarget[], error: unknown, source: 'installer' | 'detection'): void {
    for (const target of selected) {
      if (source === 'detection' && this.outcomes[targetKey(target)]?.source === 'installer') continue;
      this.outcomes[targetKey(target)] = {
      source,
      status: 'failed', runState: 'failed', summary: error instanceof Error ? error.message : String(error),
      manualSteps: [], warnings: [], plannedActions: [],
    };
    }
  }

  private async ensureNpmPrerequisites(revision: string): Promise<void> {
    const helpers = await this.dependencies.helpers();
    for (const suffix of ['node-host-installer', 'npm-prefix-helper']) {
      const id = `${this.dependencies.platform}-${suffix}`;
      if (!helpers.some((entry) => entry.id === id && entry.available && entry.supported)) continue;
      this.operation!.stage = suffix === 'node-host-installer' ? 'Checking Node.js prerequisite…' : 'Checking npm prefix…';
      const checked = await this.dependencies.helper(id, 'check', false, revision);
      if (checked.runState === 'failed') throw new Error(checked.summary);
      if (checked.status === 'ready') continue;
      this.operation!.stage = suffix === 'node-host-installer' ? 'Installing Node.js prerequisite…' : 'Preparing npm prefix…';
      const installed = await this.dependencies.helper(id, 'apply', false, revision);
      if (installed.runState === 'failed' || installed.status === 'failed') {
        throw new Error([installed.summary, ...installed.manualSteps].join(' '));
      }
      // New helpers run in a fresh process; PATH-only changes need no Desktop
      // restart. Re-check readiness before admitting the provider installer.
      const verified = await this.dependencies.helper(id, 'check', false, revision);
      if (verified.runState === 'failed' || verified.status !== 'ready') {
        throw new Error([verified.summary, ...installed.manualSteps, ...verified.manualSteps].join(' '));
      }
    }
  }

  private async detect(selected: ProviderTarget[], revision: string): Promise<void> {
    for (const target of selected) if (this.outcomes[targetKey(target)]?.source === 'detection') delete this.outcomes[targetKey(target)];
    this.operation!.stage = `Detecting ${selected.length} selected provider${selected.length === 1 ? '' : 's'}…`;
    const started = await this.dependencies.request<{ scanId?: string }>('/setup-scan', body({
      targets: selected, expectedRevision: revision, manual: true, includeConnections: true,
    }));
    if (!started.scanId) throw new Error('The connected Runtime does not support tracked provider checks. Update Runtime before retrying.');
    const deadline = Date.now() + (this.dependencies.timeoutMs ?? 180_000);
    while (Date.now() < deadline) {
      const runtime = await this.dependencies.request<ProviderManagerRuntime>('/setup-state');
      this.assertRevision(runtime, revision);
      if (runtime.state.scanId !== started.scanId) throw new Error('Another provider check replaced this operation. Refresh and retry.');
      if (runtime.state.status === 'error') throw new Error(runtime.state.error || 'Provider detection failed.');
      if (runtime.state.status === 'ready') { await this.dependencies.changed(runtime); return; }
      if (runtime.state.status !== 'scanning') throw new Error('Provider detection was interrupted. Retry the check.');
      this.operation!.stage = `Detecting providers (${runtime.state.scanCompleted ?? 0}/${runtime.state.scanTotal ?? selected.length})…`;
      await (this.dependencies.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(500);
    }
    throw new Error('Provider detection is taking longer than expected. Its progress is still visible; wait before retrying.');
  }
}
