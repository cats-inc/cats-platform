import type { Server } from 'node:http';

export interface AppServerShutdownOptions {
  forceCloseDelayMs?: number;
}

type ClosableHttpServer = Pick<Server, 'close'> & Partial<Pick<Server, 'closeAllConnections' | 'closeIdleConnections'>>;

const DEFAULT_FORCE_CLOSE_DELAY_MS = 250;

export function closeAppServerGracefully(
  server: ClosableHttpServer,
  options: AppServerShutdownOptions = {},
): Promise<void> {
  const forceCloseDelayMs = options.forceCloseDelayMs ?? DEFAULT_FORCE_CLOSE_DELAY_MS;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let forceCloseTimer: NodeJS.Timeout | null = null;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (forceCloseTimer) {
        clearTimeout(forceCloseTimer);
      }
      callback();
    };

    server.close((error?: Error) => {
      if (error) {
        finish(() => reject(error));
        return;
      }
      finish(() => resolve());
    });

    // Close idle keep-alive sockets first so Ctrl+C does not hang behind
    // dormant HTTP clients.
    server.closeIdleConnections?.();

    if (!settled && typeof server.closeAllConnections === 'function') {
      forceCloseTimer = setTimeout(() => {
        server.closeAllConnections?.();
      }, forceCloseDelayMs);
      forceCloseTimer.unref?.();
    }
  });
}
