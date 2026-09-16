import type { DesktopPrerequisite, ProviderSetupOutcome } from '../../packages/provider-setup/manager.js';
import { DESKTOP_PREREQUISITE_SUFFIXES, isDesktopPrerequisiteHelper } from './setupAudit.js';

/** Per-helper observations survive unrelated provider actions and passive reads. */
export class DesktopPrerequisiteChecks {
  private readonly results = new Map<string, ProviderSetupOutcome>();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(private readonly platform: 'windows' | 'macos' | 'linux') {}

  read(): DesktopPrerequisite[] {
    return DESKTOP_PREREQUISITE_SUFFIXES.map((suffix) => {
      const helperId = `${this.platform}-${suffix}`;
      return { helperId, checking: this.pending.has(helperId), result: this.results.get(helperId) ?? null };
    });
  }

  async run<T extends ProviderSetupOutcome>(helperId: string, run: () => Promise<T>): Promise<T> {
    if (!isDesktopPrerequisiteHelper(helperId)) return run();
    // A click may arrive during the startup check. Serialize that helper so an
    // old check cannot finish after installation and overwrite its new result.
    const previous = this.pending.get(helperId);
    const pending = (async () => {
      await previous?.catch(() => undefined);
      try {
        const result = await run();
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
