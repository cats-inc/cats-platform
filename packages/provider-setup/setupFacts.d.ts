export const SETUP_PROVIDER_ORDER: string[];
export interface SetupRowFacts {
  title: string;
  summary: string;
  tags: Array<{ text: string; danger?: boolean }>;
  manual: string | null;
}
export function setupRowFacts(
  T: (en: string, zh: string) => string,
  id: string,
  context: {
    platform: string;
    tool?: { label?: string; kind?: string; pkg?: string | null; command?: string | null };
    neededBy?: string[];
    planned?: string[];
    ollamaInstalled?: boolean;
    /** SPEC-138: a change to a ready row instead of its install. */
    change?: 'upgrade' | 'force' | 'uninstall';
    requiresElevation?: boolean;
  },
): SetupRowFacts;
