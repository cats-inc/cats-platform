export interface DraftStarterSuggestion {
  id: string;
  prompt: string;
}

function sanitizeDraftStarterSuggestions(
  suggestions: ReadonlyArray<DraftStarterSuggestion | null | undefined> | null | undefined,
): DraftStarterSuggestion[] {
  return (suggestions ?? []).reduce<DraftStarterSuggestion[]>((acc, suggestion) => {
    const id = suggestion?.id?.trim() ?? '';
    const prompt = suggestion?.prompt?.trim() ?? '';
    if (!id || !prompt) {
      return acc;
    }
    acc.push({ id, prompt });
    return acc;
  }, []);
}

// Returns visible starter chips from the supplied list after trimming and blank removal.
// There is no static fallback: when no chips are supplied the composer stays silent,
// matching the renderer's "suppress draft helper chips unless an upstream source provides them"
// contract (see chatNewChatDraftSupport#resolvePayloadDraftAssist).
export function resolveVisibleDraftStarterSuggestions(input: {
  suggestions?: ReadonlyArray<DraftStarterSuggestion | null | undefined> | null;
}): DraftStarterSuggestion[] {
  return sanitizeDraftStarterSuggestions(input.suggestions);
}
