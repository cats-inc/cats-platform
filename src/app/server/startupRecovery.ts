import type { ResolvedServerDependencies } from './contracts.js';
import { reconcileChatWorkflowRecoveryOnStartup } from './chatWorkflowRecovery.js';
import { reconcileOrchestratorRecoveryOnStartup } from './orchestratorRecovery.js';
import { reconcilePollingOnStartup } from './polling.js';

export async function runStartupRecoveryPasses(
  passes: Array<() => Promise<unknown>>,
): Promise<void> {
  for (const pass of passes) {
    try {
      await pass();
    } catch {
      // Startup recovery is best-effort. Do not block later passes.
    }
  }
}

export async function runServerStartupRecoveryPasses(
  dependencies: ResolvedServerDependencies,
): Promise<void> {
  await runStartupRecoveryPasses([
    () => reconcilePollingOnStartup(dependencies),
    () => reconcileChatWorkflowRecoveryOnStartup(dependencies),
    () => reconcileOrchestratorRecoveryOnStartup(dependencies),
  ]);
}
