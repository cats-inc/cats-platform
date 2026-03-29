import type { ChatApiRouteContext } from '../routeSupport.js';
import { matchRoute } from '../../../../shared/http.js';

function writeSseFrame(
  context: ChatApiRouteContext,
  event: string,
  data: Record<string, unknown>,
): void {
  const payload = JSON.stringify(data);
  context.response.write(`event: ${event}\ndata: ${payload}\n\n`);
}

export async function routeChatEventApi(
  context: ChatApiRouteContext,
): Promise<boolean> {
  const match = matchRoute(
    context.url.pathname,
    /^\/api\/events\/chat$/u,
  );
  if (!match) return false;

  if (context.method !== 'GET') {
    context.response.writeHead(405, { allow: 'GET' });
    context.response.end();
    return true;
  }

  const hub = context.dependencies.eventHub;
  if (!hub) {
    context.response.writeHead(503, { 'content-type': 'application/json' });
    context.response.end(JSON.stringify({ error: 'Event hub not available' }));
    return true;
  }

  context.response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  writeSseFrame(context, 'connected', { type: 'connected', timestamp: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    if (!context.response.writableEnded) {
      context.response.write(': ping\n\n');
    }
  }, 15_000);

  const unsubscribe = hub.subscribe((event) => {
    if (!context.response.writableEnded) {
      writeSseFrame(context, event.kind, {
        type: event.kind,
        channelId: event.channelId ?? null,
        catId: event.catId ?? null,
        timestamp: event.timestamp,
        detail: event.detail ?? null,
      });
    }
  });

  context.response.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  return true;
}
