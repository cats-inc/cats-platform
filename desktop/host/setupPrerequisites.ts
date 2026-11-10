import type { DesktopPrerequisite, ProviderSetupOutcome } from '../../packages/provider-setup/providerSetupTypes.js';
import { DESKTOP_PREREQUISITE_SUFFIXES, isDesktopPrerequisiteHelper } from './setupAudit.js';

/** Explicit MSI reboot advice, separate from older PATH/session restart requests. */
export function isWindowsSystemRestart(helperId: string, value: unknown): boolean {
  if (!['windows-node-host-installer', 'windows-github-cli-installer', 'windows-vcredist-installer'].includes(helperId)
    || !value || typeof value !== 'object') return false;
  const result = value as { status?: unknown; restartRequired?: unknown; interruptions?: unknown };
  return result.status === 'restart_required' && result.restartRequired === true
    && Array.isArray(result.interruptions) && result.interruptions.some((entry) => entry?.kind === 'restart_required' && entry.requiresRestart === true);
}

/** Per-helper observations survive unrelated provider actions and passive reads. */
export class DesktopPrerequisiteChecks {
  private readonly results = new Map<string, ProviderSetupOutcome>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly systemRestarts = new Set<string>();

  constructor(private readonly platform: 'windows' | 'macos' | 'linux') {}

  systemRestartHelpers(): string[] { return [...this.systemRestarts]; }

  read(): DesktopPrerequisite[] {
    return DESKTOP_PREREQUISITE_SUFFIXES.map((suffix) => {
      const helperId = `${this.platform}-${suffix}`;
      return { helperId, checking: this.pending.has(helperId), result: this.results.get(helperId) ?? null };
    });
  }

  async run<T extends ProviderSetupOutcome>(helperId: string, run: () => Promise<T>): Promise<T> {
    const execute = async () => {
      const result = await run();
      if (this.platform === 'windows' && result.runState === 'completed' && isWindowsSystemRestart(helperId, result)) this.systemRestarts.add(helperId);
      return result;
    };
    if (!isDesktopPrerequisiteHelper(helperId)) return execute();
    // A click may arrive during the startup check. Serialize that helper so an
    // old check cannot finish after installation and overwrite its new result.
    const previous = this.pending.get(helperId);
    const pending = (async () => {
      await previous?.catch(() => undefined);
      try {
        const result = await execute();
        this.results.set(helperId, result);
        return result;
      } catch (error) {
        this.results.set(helperId, {
          runState: 'failed', status: 'failed', summary: error instanceof Error ? error.message : String(error),
          warnings: [], manualSteps: [], plannedActions: [],
        });
        throw error;
      }
    })();
    this.pending.set(helperId, pending);
    try { return await pending; }
    finally { if (this.pending.get(helperId) === pending) this.pending.delete(helperId); }
  }
}
