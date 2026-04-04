export type DraftStarterSuggestionMode =
  | 'solo'
  | 'cat_led'
  | 'group'
  | 'direct'
  | 'parallel';

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

function withCatName(
  template: string,
  catName: string | null | undefined,
  fallback: string,
): string {
  const name = catName?.trim() || fallback;
  return template.replaceAll('{cat}', name);
}

export function resolveDraftStarterSuggestions(input: {
  mode: DraftStarterSuggestionMode;
  leadCatName?: string | null;
}): DraftStarterSuggestion[] {
  switch (input.mode) {
    case 'direct':
      return [
        {
          id: 'direct-update',
          prompt: withCatName(
            'Ask {cat} for a focused update or recommendation on this task.',
            input.leadCatName,
            'this Cat',
          ),
        },
        {
          id: 'direct-next-step',
          prompt: withCatName(
            'Give {cat} a concrete task and ask for the next step.',
            input.leadCatName,
            'this Cat',
          ),
        },
        {
          id: 'direct-iterate',
          prompt: withCatName(
            'Use this lane to iterate quickly with {cat} on one problem.',
            input.leadCatName,
            'this Cat',
          ),
        },
      ];
    case 'cat_led':
      return [
        {
          id: 'cat-led-first-pass',
          prompt: withCatName(
            'Ask {cat} to take the first pass, then tighten the plan together.',
            input.leadCatName,
            'this Cat',
          ),
        },
        {
          id: 'cat-led-review',
          prompt: withCatName(
            'Have {cat} review an idea and suggest the next concrete moves.',
            input.leadCatName,
            'this Cat',
          ),
        },
        {
          id: 'cat-led-brief',
          prompt: withCatName(
            'Let {cat} turn a rough brief into a clear action plan.',
            input.leadCatName,
            'this Cat',
          ),
        },
      ];
    case 'group':
      return [
        {
          id: 'group-roles',
          prompt: 'Brief the group, split roles, and ask for a coordinated plan.',
        },
        {
          id: 'group-compare',
          prompt: 'Have the group compare options and surface the tradeoffs.',
        },
        {
          id: 'group-next-steps',
          prompt: 'Ask the group to propose next steps and who should own each one.',
        },
      ];
    case 'parallel':
      return [
        {
          id: 'parallel-compare',
          prompt: 'Compare how different models would approach the same task.',
        },
        {
          id: 'parallel-options',
          prompt: 'Ask for multiple approaches, then decide which direction to keep.',
        },
        {
          id: 'parallel-tradeoffs',
          prompt: 'Run one prompt across models and compare quality, speed, and tradeoffs.',
        },
      ];
    case 'solo':
    default:
      return [
        {
          id: 'solo-plan',
          prompt: 'Plan today\'s priorities and turn them into next actions.',
        },
        {
          id: 'solo-draft',
          prompt: 'Draft a message, post, or document from a rough idea.',
        },
        {
          id: 'solo-decide',
          prompt: 'Review a problem and propose two or three ways to tackle it.',
        },
      ];
  }
}

export function resolveVisibleDraftStarterSuggestions(input: {
  mode: DraftStarterSuggestionMode;
  leadCatName?: string | null;
  suggestions?: ReadonlyArray<DraftStarterSuggestion | null | undefined> | null;
}): DraftStarterSuggestion[] {
  const providedSuggestions = sanitizeDraftStarterSuggestions(input.suggestions);
  if (providedSuggestions.length > 0) {
    return providedSuggestions;
  }
  return resolveDraftStarterSuggestions({
    mode: input.mode,
    leadCatName: input.leadCatName,
  });
}
