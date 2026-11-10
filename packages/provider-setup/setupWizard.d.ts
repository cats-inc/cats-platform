export function mountSetupWizard(root: HTMLElement, bridge: unknown, options: {
  locale?: string;
  css?: string;
  catHead?: string;
  createChrome: typeof import('./setupChrome.js').mountSetupChrome;
  facts: typeof import('./setupFacts.js').setupRowFacts;
  /** SPEC-137: Settings > Runtime's layout and behavior. */
  mode?: 'wizard' | 'settings';
  /** Settings: what the last check found, kept for the window's session. */
  settingsState?: unknown;
  onSettingsState?: (state: unknown) => void;
  /** Settings: a toast for a saved or failed selection (AGENTS.md, Settings UI Conventions). */
  onFeedback?: (message: string) => void;
}): { ready: Promise<void>; setLocale(locale: string): void; destroy(): void };
