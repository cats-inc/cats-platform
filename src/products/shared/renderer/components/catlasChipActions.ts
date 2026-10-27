import type { GuideCatAssistEntryChip, GuideCatAssistProduct } from '../../../../shared/guideCatAssist.js';
import { prefetchCrossSurfaceNavigationTarget } from '../crossSurfaceNavigationRegistry.js';

export interface SelectedRecommendation { scopeKey: string; basisIds: string[] }
let selected: SelectedRecommendation | null = null;
export function reportCatlasFeedback(scopeKey: string, basisIds: string[], event: 'accepted' | 'dismissed'): void {
  const ids = [...new Set(basisIds)];
  if (!ids.length) return;
  void fetch('/api/catlas-assist/signals', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scopeKey, basisIds: ids, event }), keepalive: true }).catch(() => {});
}
export function clearCatlasDraftSelection(): void { selected = null; }
export function captureCatlasDraftSelection(): SelectedRecommendation | null { return selected; }
export function acceptCatlasDraftSelection(selection: SelectedRecommendation | null): void {
  if (selection) reportCatlasFeedback(selection.scopeKey, selection.basisIds, 'accepted');
  if (selection === selected) selected = null;
}
export function selectCatlasChip(chip: GuideCatAssistEntryChip, scopeKey: string, input: {
  onComposerChange: (value: string) => void;
  onDraftSurfaceChange?: (surface: GuideCatAssistProduct) => void;
  navigate: (path: string) => void;
}): void {
  if (chip.action === 'open') {
    if (chip.href) {
      reportCatlasFeedback(scopeKey, chip.basis ?? [], 'accepted');
      input.navigate(chip.href);
    }
    return;
  }
  selected = chip.basis?.length ? { scopeKey, basisIds: [...chip.basis] } : null;
  input.onComposerChange(chip.prompt);
  void prefetchCrossSurfaceNavigationTarget(chip.surface);
  input.onDraftSurfaceChange?.(chip.surface);
}
