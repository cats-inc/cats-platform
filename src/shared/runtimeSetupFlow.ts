import type { RuntimeSetupSummary } from './runtimeSetup.js';

export type SuiteSetupStep = 1 | 2 | 3 | 4;

export function shouldAutoScanRuntimeSetup(
  step: SuiteSetupStep,
  runtimeSetup: RuntimeSetupSummary,
  autoScanAttempted: boolean,
): boolean {
  return step === 3
    && autoScanAttempted === false
    && runtimeSetup.status === 'scan_required'
    && runtimeSetup.canRunManualScan;
}
