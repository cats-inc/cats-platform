import { resolveGuideCatAssistBaseline } from '../../src/shared/guideCatAssistBaselines.js';
import type { GuideCatAssistSurfaceReadModel } from '../../src/shared/guideCatAssist.js';
export function builtinAssist(surface: string): GuideCatAssistSurfaceReadModel {
  const bundle = resolveGuideCatAssistBaseline(surface);
  return { bundle, scopeKey: bundle.bundleId, renderSource: 'deterministic', cacheHit: false,
    missing: true, stale: false, refreshEligible: false, surfaceDisabled: false, lastFailure: null };
}

export function builtinChipKeys(surface: string, index: number) {
  const chip = resolveGuideCatAssistBaseline(surface).content.entryChips[index];
  if (chip.action !== 'prefill') throw new Error('Expected a builtin prefill');
  return { labelKey: chip.labelKey, promptKey: chip.promptKey };
}
