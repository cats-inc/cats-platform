export interface SetupRun {
  id: number;
  kind: string;
  label: string;
  command: string;
  startedAt: string;
  endedAt: string | null;
  status: string | null;
  version?: string | null;
  planned?: string[];
  applied?: string[];
  warnings?: string[];
  manual?: string[];
  error: string | null;
  tookMs?: number | null;
}
export interface CodexInitialization {
  status: 'ready' | 'required' | 'unavailable' | 'not_applicable';
}
export interface SetupWizardBridge {
  facts(): Promise<unknown>;
  runHelper(helperId: string, mode: 'check' | 'apply' | 'upgrade' | 'force' | 'uninstall', options?: { dryRun?: boolean }): Promise<unknown>;
  cancelChecks(): Promise<void>;
  runs(): Promise<SetupRun[]>;
  onRun(listener: (run: SetupRun) => void): () => void;
  startRun(input: { command: string }): Promise<number>;
  finishRun(id: number, result: { status?: string; error?: string; applied?: string[] }): Promise<void>;
  openTerminal(provider: string): Promise<{ opened: boolean; command: string | null }>;
  checkCodexInitialization(instance?: string): Promise<CodexInitialization>;
  openCodexInitialization(instance?: string): Promise<{ opened: boolean; command: string | null }>;
  ollamaModels(): Promise<string[]>;
  pullOllamaModel(name: string): Promise<{ stopped: boolean }>;
  cancelOllamaPull(): Promise<void>;
  onOllamaProgress(listener: (progress: { name: string; status: string; percent: number | null }) => void): () => void;
  saveState(state: unknown): Promise<void>;
  returnToPage(page: number): Promise<void>;
  relaunch(state: unknown): Promise<void>;
}
export interface SetupStepItem {
  n: number;
  title: string;
  note: string;
  state: 'done' | 'current' | 'future';
  skipped?: boolean;
  enabled?: boolean;
}
export interface SetupFailureReason {
  title: string;
  body: string;
  raw?: string | null;
  extras?: Array<[string, string]>;
  severity?: 'error' | 'warning' | 'info';
  repair?: { label: string; run(): void } | null;
}
export interface SetupChrome {
  pane: HTMLElement;
  foot: HTMLElement;
  icons: Record<'check' | 'cross' | 'wait' | 'dash' | 'chev', string>;
  browserOnly: boolean;
  setLocale(locale: string): void;
  setSteps(steps: SetupStepItem[]): void;
  setNote(primary: string, secondary: string): void;
  setBusy(busy: boolean): void;
  setElapsedFrom(value: number | null): void;
  beginWork(): void;
  setPriorChanges(count: number): void;
  tick(): void;
  copyText(text: string): Promise<boolean>;
  isDetailsOpen(): boolean;
  openDetails(reason: SetupFailureReason, trigger?: HTMLElement | null): void;
  closeDetails(focus?: boolean): void;
  logTotals(): { checks: number; changes: number };
  runs(): SetupRun[];
  destroy(): void;
}
export function mountSetupChrome(root: HTMLElement, bridge: unknown, options?: {
  locale?: string;
  css?: string;
  catHead?: string;
  browserOnly?: boolean;
  /** SPEC-138: no rail, and the log at the foot of a Settings section. */
  layout?: 'wizard' | 'settings';
  isBusy?: () => boolean;
  onStep?: (page: number) => void;
  onDetailsClosed?: () => void;
  onRun?: (run: SetupRun | null) => void;
}): SetupChrome;
