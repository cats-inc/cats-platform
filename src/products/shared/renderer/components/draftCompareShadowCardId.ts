import type { DraftParallelTarget } from '../draftChatUtils.js';

export function createDraftCompareShadowCardId(
  branchIndex: number,
  target: Pick<DraftParallelTarget, 'provider' | 'instance' | 'model'>,
): string {
  return `shadow-${branchIndex}-${target.provider}-${target.instance ?? ''}-${target.model ?? ''}`;
}
