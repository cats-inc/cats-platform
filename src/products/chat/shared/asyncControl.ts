export interface AsyncKeyedGate {
  run<T>(key: string, operation: () => Promise<T>): Promise<T>;
}

export interface KeyedRequestCoalescer<T> {
  run(key: string, operation: () => Promise<T>): Promise<T>;
}

export function createAsyncKeyedGate(): AsyncKeyedGate {
  const queues = new Map<string, Promise<void>>();

  return {
    async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
      const previous = queues.get(key) ?? Promise.resolve();
      let release: () => void = () => {};
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      queues.set(key, current);

      await previous;
      try {
        return await operation();
      } finally {
        release();
        if (queues.get(key) === current) {
          queues.delete(key);
        }
      }
    },
  };
}

export function createKeyedRequestCoalescer<T>(): KeyedRequestCoalescer<T> {
  const inflight = new Map<string, Promise<T>>();

  return {
    run(key: string, operation: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing) {
        return existing;
      }

      const request = operation().finally(() => {
        if (inflight.get(key) === request) {
          inflight.delete(key);
        }
      });
      inflight.set(key, request);
      return request;
    },
  };
}
