export function mountSetupWizard(root: HTMLElement, bridge: unknown, options: {
  locale?: string;
  css?: string;
  catHead?: string;
  createChrome: typeof import('./setupChrome.js').mountSetupChrome;
  facts: typeof import('./setupFacts.js').setupRowFacts;
}): { ready: Promise<void>; destroy(): void };
