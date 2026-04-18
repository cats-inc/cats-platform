import { useCallback, useState } from 'react';

export function resolveDraftHelperChipsDismissedState(input: {
  previouslyDismissed: boolean;
  dismissedByChipClick: boolean;
}): boolean {
  return input.previouslyDismissed || input.dismissedByChipClick;
}

export function shouldRenderDraftHelperChips(input: {
  availableChipCount: number;
  dismissed: boolean;
}): boolean {
  return input.availableChipCount > 0 && !input.dismissed;
}

export function useDraftHelperChipVisibility(input: {
  availableChipCount: number;
}): {
  showDraftHelperChips: boolean;
  dismissDraftHelperChips: () => void;
} {
  const [dismissed, setDismissed] = useState(false);
  const dismissDraftHelperChips = useCallback(() => {
    setDismissed((current) => resolveDraftHelperChipsDismissedState({
      previouslyDismissed: current,
      dismissedByChipClick: true,
    }));
  }, []);

  return {
    showDraftHelperChips: shouldRenderDraftHelperChips({
      availableChipCount: input.availableChipCount,
      dismissed,
    }),
    dismissDraftHelperChips,
  };
}
