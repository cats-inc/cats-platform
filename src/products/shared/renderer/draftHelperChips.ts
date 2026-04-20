import { useCallback, useState } from 'react';

export type DraftHelperChipsState = {
  dismissed: boolean;
  lastResetKey: string | null;
};

export function createDraftHelperChipsState(resetKey: string | null): DraftHelperChipsState {
  return { dismissed: false, lastResetKey: resetKey };
}

// New draft scope (different chip set, different mode, or component remount) resets the
// dismissed flag so a fresh draft surfaces chips again. Same key => identity preserved so
// React skips the extra render.
export function syncDraftHelperChipsResetKey(
  state: DraftHelperChipsState,
  resetKey: string | null,
): DraftHelperChipsState {
  if (state.lastResetKey === resetKey) {
    return state;
  }
  return createDraftHelperChipsState(resetKey);
}

export function dismissDraftHelperChipsState(
  state: DraftHelperChipsState,
): DraftHelperChipsState {
  if (state.dismissed) {
    return state;
  }
  return { ...state, dismissed: true };
}

export function shouldRenderDraftHelperChips(input: {
  availableChipCount: number;
  dismissed: boolean;
}): boolean {
  return input.availableChipCount > 0 && !input.dismissed;
}

// Callers pass this fingerprint as the hook's reset key. We encode id, prompt, and label
// because a bundle refresh can reuse the same chip ids while rewriting the copy — keying
// on ids alone would keep a dismissed row hidden even though the content changed.
// Serialize via JSON.stringify over fixed-order tuples so chip copy containing delimiter
// characters cannot collide with a different chip set under naive string joining.
export function fingerprintDraftHelperChips(chips: ReadonlyArray<{
  id: string;
  prompt: string;
  label?: string | null;
}>): string | null {
  if (chips.length === 0) {
    return null;
  }
  return JSON.stringify(
    chips.map((chip) => [chip.id, chip.prompt, chip.label ?? null]),
  );
}

/** Decides whether the composer's helperRegion should render runtime
 * starter suggestions, the product-supplied fallback chip list, or
 * nothing. Pure so it can be unit-tested without React, and so the
 * "runtime wins over fallback" invariant is anchored on the runtime
 * SOURCE (`runtimeChipCount > 0`) rather than the rendered visibility
 * (`showDraftHelperChips`). Tying it to the rendered visibility caused
 * a regression where dismissing a runtime chip — which flips
 * `showDraftHelperChips` to false — would re-surface the
 * chat-product fallback chip in its place, instead of letting the
 * helperRegion go quiet. */
export function resolveDraftHelperRegionVisibility(input: {
  isDirectLaneContext: boolean;
  showDraftHelperChips: boolean;
  runtimeChipCount: number;
  fallbackChipCount: number;
}): {
  runtimeChipsRendered: boolean;
  fallbackChipsRendered: boolean;
} {
  if (input.isDirectLaneContext) {
    return { runtimeChipsRendered: false, fallbackChipsRendered: false };
  }
  const hasRuntimeChipSource = input.runtimeChipCount > 0;
  return {
    runtimeChipsRendered: input.showDraftHelperChips && hasRuntimeChipSource,
    // Once the runtime ever supplied chips for this draft, the fallback
    // stays suppressed even if the user dismisses the runtime list. The
    // fallback only appears when there is genuinely no runtime chip
    // source to hand off to.
    fallbackChipsRendered: !hasRuntimeChipSource && input.fallbackChipCount > 0,
  };
}

export function useDraftHelperChipVisibility(input: {
  availableChipCount: number;
  resetKey: string | null;
}): {
  showDraftHelperChips: boolean;
  dismissDraftHelperChips: () => void;
} {
  const [state, setState] = useState<DraftHelperChipsState>(() =>
    createDraftHelperChipsState(input.resetKey),
  );
  if (state.lastResetKey !== input.resetKey) {
    setState((prev) => syncDraftHelperChipsResetKey(prev, input.resetKey));
  }
  const dismissDraftHelperChips = useCallback(() => {
    setState(dismissDraftHelperChipsState);
  }, []);
  return {
    showDraftHelperChips: shouldRenderDraftHelperChips({
      availableChipCount: input.availableChipCount,
      dismissed: state.dismissed,
    }),
    dismissDraftHelperChips,
  };
}
