export interface SettingsCatsTelegramBindingScope {
  id: string;
  status: string;
  updatedAt: string;
}

export interface SettingsCatsTelegramSnapshot<TStatus, TDiagnostics> {
  status: TStatus;
  diagnostics: TDiagnostics;
}

export interface SettingsCatsTelegramFetchers<TStatus, TDiagnostics> {
  fetchStatus: () => Promise<TStatus>;
  fetchDiagnostics: () => Promise<TDiagnostics>;
}

export interface SettingsCatsTelegramLoadHandlers<TStatus, TDiagnostics> {
  onStart: () => void;
  onSuccess: (snapshot: SettingsCatsTelegramSnapshot<TStatus, TDiagnostics>) => void;
  onError: (message: string) => void;
  onFinish: () => void;
}

export interface SettingsCatsTelegramLoadRun {
  started: boolean;
  cancel: () => void;
  promise: Promise<void>;
}

export interface SettingsCatsTelegramAutoLoader<TStatus, TDiagnostics> {
  loadForScope: (
    scopeKey: string,
    fallbackErrorMessage: string,
    handlers: SettingsCatsTelegramLoadHandlers<TStatus, TDiagnostics>,
  ) => SettingsCatsTelegramLoadRun;
  resetScope: () => void;
}

function createNoopLoadRun(): SettingsCatsTelegramLoadRun {
  return {
    started: false,
    cancel: () => {},
    promise: Promise.resolve(),
  };
}

export function createSettingsCatsTelegramScopeKey(input: {
  bossCatId: string | null | undefined;
  botBindings?: SettingsCatsTelegramBindingScope[] | null;
}): string {
  const bindingSignature = [...(input.botBindings ?? [])]
    .map((binding) => `${binding.id}:${binding.status}:${binding.updatedAt}`)
    .sort()
    .join('|');
  return `${input.bossCatId ?? 'no-boss-cat'}::${bindingSignature}`;
}

export async function fetchSettingsCatsTelegramSnapshot<TStatus, TDiagnostics>(
  fetchers: SettingsCatsTelegramFetchers<TStatus, TDiagnostics>,
): Promise<SettingsCatsTelegramSnapshot<TStatus, TDiagnostics>> {
  const [status, diagnostics] = await Promise.all([
    fetchers.fetchStatus(),
    fetchers.fetchDiagnostics(),
  ]);
  return { status, diagnostics };
}

function startSettingsCatsTelegramLoad<TStatus, TDiagnostics>(
  fetchers: SettingsCatsTelegramFetchers<TStatus, TDiagnostics>,
  fallbackErrorMessage: string,
  handlers: SettingsCatsTelegramLoadHandlers<TStatus, TDiagnostics>,
): SettingsCatsTelegramLoadRun {
  let cancelled = false;
  handlers.onStart();

  const promise = fetchSettingsCatsTelegramSnapshot(fetchers)
    .then((snapshot) => {
      if (cancelled) {
        return;
      }
      handlers.onSuccess(snapshot);
    })
    .catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      handlers.onError(
        error instanceof Error ? error.message : fallbackErrorMessage,
      );
    })
    .finally(() => {
      if (!cancelled) {
        handlers.onFinish();
      }
    });

  return {
    started: true,
    cancel: () => {
      cancelled = true;
    },
    promise,
  };
}

export function createSettingsCatsTelegramAutoLoader<TStatus, TDiagnostics>(
  fetchers: SettingsCatsTelegramFetchers<TStatus, TDiagnostics>,
): SettingsCatsTelegramAutoLoader<TStatus, TDiagnostics> {
  let lastScopeKey: string | null = null;

  return {
    loadForScope(scopeKey, fallbackErrorMessage, handlers) {
      if (scopeKey === lastScopeKey) {
        return createNoopLoadRun();
      }

      lastScopeKey = scopeKey;
      return startSettingsCatsTelegramLoad(fetchers, fallbackErrorMessage, handlers);
    },

    resetScope() {
      lastScopeKey = null;
    },
  };
}

export function beginSettingsCatsTelegramScopeLoad<TStatus, TDiagnostics>(
  loader: SettingsCatsTelegramAutoLoader<TStatus, TDiagnostics>,
  scopeKey: string,
  fallbackErrorMessage: string,
  handlers: SettingsCatsTelegramLoadHandlers<TStatus, TDiagnostics>,
): SettingsCatsTelegramLoadRun {
  const loadRun = loader.loadForScope(scopeKey, fallbackErrorMessage, handlers);

  return {
    ...loadRun,
    cancel() {
      loadRun.cancel();
      loader.resetScope();
    },
  };
}
