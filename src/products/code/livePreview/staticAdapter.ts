import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, isAbsolute, join, relative, sep } from 'node:path';

import { STATIC_LIVE_PREVIEW_PROFILE, STATIC_LIVE_PREVIEW_READINESS_PATH } from './contracts.js';
import type {
  LivePreviewProcessAdapter,
  LivePreviewProcessExit,
  LivePreviewProcessHandle,
  LivePreviewProcessSpawnInput,
} from './processAdapter.js';

/**
 * SPEC-123 CAP-05 static preview: an in-process loopback file server leased by
 * the supervisor. It runs no workspace code on the host; agent-written scripts
 * run only inside the canvas iframe on this distinct loopback origin.
 */

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function createStaticLivePreviewAdapter(): LivePreviewProcessAdapter {
  return {
    async spawn(input) {
      if (input.commandProfileId !== STATIC_LIVE_PREVIEW_PROFILE.id) {
        throw new Error(`Static preview adapter cannot run profile ${input.commandProfileId}.`);
      }
      return startStaticPreviewServer(input);
    },
  };
}

/** Route the in-process static profile here and every other profile to `processAdapter`. */
export function createCodeLivePreviewProcessAdapter(
  processAdapter: LivePreviewProcessAdapter,
): LivePreviewProcessAdapter {
  const staticAdapter = createStaticLivePreviewAdapter();
  return {
    spawn(input) {
      return input.commandProfileId === STATIC_LIVE_PREVIEW_PROFILE.id
        ? staticAdapter.spawn(input)
        : processAdapter.spawn(input);
    },
  };
}

async function startStaticPreviewServer(
  input: LivePreviewProcessSpawnInput,
): Promise<LivePreviewProcessHandle> {
  const root = await realpath(input.cwd);
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error('Static preview root is not a directory.');
  }
  const origin = new URL(input.origin);
  const exitListeners: Array<(exit: LivePreviewProcessExit) => void> = [];
  const stderrListeners: Array<(chunk: string) => void> = [];
  const server = createServer((request, response) => {
    void serveStaticPreviewRequest(request, response, root, origin.host).catch((error: unknown) => {
      for (const listener of stderrListeners) {
        listener(`static preview error: ${error instanceof Error ? error.message : String(error)}\n`);
      }
      if (!response.headersSent) {
        response.writeHead(500).end();
      } else {
        response.destroy();
      }
    });
  });
  await listen(server, input.port, origin.hostname.replace(/^\[|\]$/gu, ''));
  let closed = false;
  server.on('close', () => {
    closed = true;
    for (const listener of exitListeners) listener({ code: 0, signal: null });
  });
  return {
    processId: null,
    onStdout() {},
    onStderr(listener) {
      stderrListeners.push(listener);
    },
    onExit(listener) {
      exitListeners.push(listener);
    },
    async stop() {
      if (closed) return;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function serveStaticPreviewRequest(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  expectedHost: string,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  // A mismatched Host header means DNS rebinding or a foreign caller.
  if (request.headers.host !== expectedHost) {
    response.writeHead(421).end();
    return;
  }
  const pathname = new URL(request.url ?? '/', `http://${expectedHost}`).pathname;
  if (pathname === STATIC_LIVE_PREVIEW_READINESS_PATH) {
    response.writeHead(204, { 'Cache-Control': 'no-store' }).end();
    return;
  }
  const segments = decodeSegments(pathname);
  // Dot-segments cover `..` as well as `.git`, `.env` and other hidden files.
  if (!segments || segments.some((segment) => segment.startsWith('.'))) {
    notFound(response);
    return;
  }
  const filePath = await resolveServedFile(root, segments);
  if (!filePath) {
    notFound(response);
    return;
  }
  const fileStat = await stat(filePath);
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': fileStat.size,
    'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath).on('error', reject).on('end', resolve).pipe(response);
  });
}

function decodeSegments(pathname: string): string[] | null {
  try {
    const segments = pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
    return segments.some((segment) => segment.includes('/') || segment.includes('\\') || segment.includes('\0'))
      ? null
      : segments;
  } catch {
    return null;
  }
}

/** Resolve through symlinks and refuse anything that leaves the lease root. */
async function resolveServedFile(root: string, segments: string[]): Promise<string | null> {
  let candidate = join(root, ...segments);
  try {
    let resolved = await realpath(candidate);
    if (!isInsideRoot(root, resolved)) return null;
    if ((await stat(resolved)).isDirectory()) {
      candidate = join(resolved, 'index.html');
      resolved = await realpath(candidate);
      if (!isInsideRoot(root, resolved)) return null;
    }
    return (await stat(resolved)).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

function isInsideRoot(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function notFound(response: ServerResponse): void {
  response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
}
