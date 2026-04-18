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
