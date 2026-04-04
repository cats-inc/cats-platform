export interface GuardedTrayLifecycle<TState> {
  update(state: TState): void;
  dispose(): void;
  isDisposed(): boolean;
}

interface CreateGuardedTrayLifecycleOptions<TState> {
  apply: (state: TState) => void;
  destroy: () => void;
}

export function createGuardedTrayLifecycle<TState>(
  options: CreateGuardedTrayLifecycleOptions<TState>,
): GuardedTrayLifecycle<TState> {
  let disposed = false;

  return {
    update(state) {
      if (disposed) {
        return;
      }
      options.apply(state);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      options.destroy();
    },
    isDisposed() {
      return disposed;
    },
  };
}
