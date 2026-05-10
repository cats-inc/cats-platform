import type { ResolvedServerDependencies } from './contracts.js';
import { reconcileChatWorkflowRecoveryOnStartup } from './chatWorkflowRecovery.js';
import { reconcileOrchestratorRecoveryOnStartup } from './orchestratorRecovery.js';
import { reconcilePollingOnStartup } from './polling.js';
import {
  resolvePlatformAuthReadiness,
  startPlatformAuthRepairMode,
} from '../../platform/auth/index.js';

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
    () => reconcileAuthRepairOnStartup(dependencies),
    () => reconcilePollingOnStartup(dependencies),
    () => dependencies.chat.telegramCommandSurfaceSync.reconcile(),
    () => reconcileChatWorkflowRecoveryOnStartup(dependencies),
    () => reconcileOrchestratorRecoveryOnStartup(dependencies),
  ]);
}

export async function reconcileAuthRepairOnStartup(
  dependencies: Pick<ResolvedServerDependencies, 'shared'>,
): Promise<void> {
  const core = await dependencies.shared.coreStore.readCore();
  const authStateStatus = await dependencies.shared.authStore.readStateStatus();
  const readiness = resolvePlatformAuthReadiness({
    setupCompleteAt: core.setupCompleteAt,
    authStateStatus,
  });
  const repair = await startPlatformAuthRepairMode({
    readiness,
    sessionSecret: dependencies.shared.config.auth.sessionSecret,
    recoveryTokenPath: dependencies.shared.config.auth.recoveryTokenPath,
    now: dependencies.shared.now?.() ?? new Date(),
  });
  if (!repair) {
    return;
  }
  await dependencies.shared.setAuthRecoveryTokenState?.(repair.tokenState);
  process.stderr.write(`[cats-platform-auth] ${JSON.stringify(repair.structuredLog)}\n`);
}
