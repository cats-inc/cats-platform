export const PROVIDER_READ_RETRY_MS = 2_000;
export const PROVIDER_READ_MAX_RETRY_MS = 30_000;

/** One read at a time, with bounded recovery and no background-tab polling. */
export function startProviderReadLoop(
  read: () => Promise<boolean>,
  refreshMs = 30_000,
): () => void {
  let stopped = false;
  let pending = false;
  let failures = 0;
  let nextReadAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const activeWindow = typeof window === 'undefined' ? undefined : window;
  const activeDocument = typeof document === 'undefined' ? undefined : document;
  const visible = (): boolean => activeDocument?.visibilityState !== 'hidden';

  function schedule(): void {
    clearTimeout(timer);
    timer = undefined;
    if (stopped || pending || !visible()) return;
    timer = setTimeout(() => { void run(); }, Math.max(0, nextReadAt - Date.now()));
  }

  async function run(initial = false): Promise<void> {
    if (stopped || pending || (!initial && !visible())) return;
    clearTimeout(timer);
    pending = true;
    let succeeded = false;
    try {
      succeeded = await read();
    } catch {
      // Recovery never requires UI input; errors remain at the read boundary.
    } finally {
      pending = false;
      failures = succeeded ? 0 : failures + 1;
      const delay = succeeded ? refreshMs : Math.min(
        PROVIDER_READ_MAX_RETRY_MS,
        PROVIDER_READ_RETRY_MS * 2 ** Math.min(failures - 1, 4),
      );
      nextReadAt = Date.now() + delay;
      schedule();
    }
  }

  activeWindow?.addEventListener('focus', schedule);
  activeWindow?.addEventListener('online', schedule);
  activeDocument?.addEventListener('visibilitychange', schedule);
  void run(true);

  return () => {
    stopped = true;
    clearTimeout(timer);
    activeWindow?.removeEventListener('focus', schedule);
    activeWindow?.removeEventListener('online', schedule);
    activeDocument?.removeEventListener('visibilitychange', schedule);
  };
}
