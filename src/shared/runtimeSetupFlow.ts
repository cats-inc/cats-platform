import type { RuntimeSetupSummary } from './runtimeSetup.js';

export type PlatformSetupStep = 1 | 2 | 3 | 4;

export function shouldAutoScanRuntimeSetup(
  step: PlatformSetupStep,
  runtimeSetup: RuntimeSetupSummary,
  autoScanAttempted: boolean,
): boolean {
  return step === 3
    && autoScanAttempted === false
    && runtimeSetup.status === 'scan_required'
    && runtimeSetup.canRunManualScan;
}
