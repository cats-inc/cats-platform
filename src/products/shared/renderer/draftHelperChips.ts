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
export function fingerprintDraftHelperChips(chips: ReadonlyArray<{
  id: string;
  prompt: string;
  label?: string | null;
}>): string | null {
  if (chips.length === 0) {
    return null;
  }
  return chips
    .map((chip) => `${chip.id}::${chip.prompt}::${chip.label ?? ''}`)
    .join('||');
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
