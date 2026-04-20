import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

import type { ResolvedServerDependencies } from './contracts.js';

const RUNTIME_SURFACE_ROUTE_MAP = new Map<string, string>([
  ['/runtime', '/'],
  ['/runtime/', '/'],
  ['/runtime/setup', '/setup'],
  ['/runtime/dashboard', '/dashboard'],
  ['/runtime/playground', '/playground'],
]);

const PLATFORM_SURFACE_ROUTE_MAP = new Map<string, string>([
  ['/', '/runtime'],
  ['/setup', '/runtime/setup'],
  ['/dashboard', '/runtime/dashboard'],
  ['/playground', '/runtime/playground'],
]);

const EXACT_RUNTIME_API_PATHS = new Set<string>([
  '/health',
  '/setup-state',
  '/setup-scan',
  '/setup-apply',
  '/browse',
  '/pool/status',
  '/discovery/status',
]);

const PREFIX_RUNTIME_API_PATHS = [
  '/sessions',
  '/diagnostics',
  '/providers',
  '/playground/workspace',
  '/browser',
  '/delivery',
  '/workspace',
  '/skills',
  '/wakeups',
  '/peers',
  '/peer',
  '/acp',
  '/mcp',
  '/management',
] as const;

const FORWARDED_REQUEST_HEADER_BLOCKLIST = new Set<string>([
  'accept-encoding',
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const FORWARDED_RESPONSE_HEADER_BLOCKLIST = new Set<string>([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const RUNTIME_PROXY_INJECTION_MARKER = 'data-cats-runtime-platform-proxy';

function buildRuntimeUrl(runtimeBaseUrl: string, pathname: string, search = ''): string {
  return `${runtimeBaseUrl.replace(/\/+$/u, '')}${pathname}${search}`;
}

function isRuntimeApiPath(pathname: string): boolean {
  if (pathname.startsWith('/runtime/') || pathname.startsWith('/api/')) {
    return false;
  }

  if (EXACT_RUNTIME_API_PATHS.has(pathname)) {
    return true;
  }

  return PREFIX_RUNTIME_API_PATHS.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}

function createForwardedHeaders(
  request: IncomingMessage,
  runtimeApiKey: string,
): Headers {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    const lowerKey = key.toLowerCase();
    if (FORWARDED_REQUEST_HEADER_BLOCKLIST.has(lowerKey) || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    headers.set(key, value);
  }

  if (!headers.has('authorization') && runtimeApiKey) {
    headers.set('authorization', `Bearer ${runtimeApiKey}`);
  }

  return headers;
}

function createForwardedResponseHeaders(upstream: Response): Record<string, string> {
  const headers: Record<string, string> = {};

  upstream.headers.forEach((value, key) => {
    if (FORWARDED_RESPONSE_HEADER_BLOCKLIST.has(key.toLowerCase())) {
      return;
    }
    headers[key] = value;
  });

  return headers;
}

async function fetchRuntimeUpstream(
  request: IncomingMessage,
  url: string,
  runtimeApiKey: string,
): Promise<Response> {
  const method = request.method ?? 'GET';
  const headers = createForwardedHeaders(request, runtimeApiKey);
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    redirect: 'manual',
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = request as unknown as NonNullable<RequestInit['body']>;
    init.duplex = 'half';
  }

  return fetch(url, init);
}

async function writeUpstreamResponse(
  response: ServerResponse,
  upstream: Response,
): Promise<void> {
  response.writeHead(upstream.status, createForwardedResponseHeaders(upstream));

  if (!upstream.body) {
    response.end();
    return;
  }

  for await (const chunk of Readable.fromWeb(upstream.body as never)) {
    response.write(chunk);
  }

  response.end();
}

function rewriteSurfaceLocation(
  location: string,
  runtimeBaseUrl: string,
): string {
  const directMatch = PLATFORM_SURFACE_ROUTE_MAP.get(location);
  if (directMatch) {
    return directMatch;
  }

  try {
    const runtimeOrigin = new URL(`${runtimeBaseUrl.replace(/\/+$/u, '')}/`);
    const resolved = new URL(location, runtimeOrigin);
    if (resolved.origin !== runtimeOrigin.origin) {
      return location;
    }

    const mappedPath = PLATFORM_SURFACE_ROUTE_MAP.get(resolved.pathname);
    if (!mappedPath) {
      return location;
    }

    return `${mappedPath}${resolved.search}`;
  } catch {
    return location;
  }
}

function buildRuntimeProxyInjectionScript(): string {
  const exactPaths = Array.from(EXACT_RUNTIME_API_PATHS);
  const prefixPaths = Array.from(PREFIX_RUNTIME_API_PATHS);
  const surfaceMap = Object.fromEntries(PLATFORM_SURFACE_ROUTE_MAP.entries());

  return [
    `<script ${RUNTIME_PROXY_INJECTION_MARKER}>`,
    '(function() {',
    "  'use strict';",
    '  if (window.__catsRuntimePlatformProxyInstalled) return;',
    '  window.__catsRuntimePlatformProxyInstalled = true;',
    "  window.__CATS_RUNTIME_API_BASE__ = '/runtime/api';",
    "  window.__CATS_RUNTIME_SURFACE_BASE__ = '/runtime';",
    `  var exactPaths = ${JSON.stringify(exactPaths)};`,
    `  var prefixPaths = ${JSON.stringify(prefixPaths)};`,
    `  var surfaceMap = ${JSON.stringify(surfaceMap)};`,
    '  function shouldProxyRuntimePath(pathname) {',
    "    if (!pathname || pathname.indexOf('/runtime/') === 0 || pathname.indexOf('/api/') === 0) {",
    '      return false;',
    '    }',
    '    if (exactPaths.indexOf(pathname) >= 0) {',
    '      return true;',
    '    }',
    '    for (var i = 0; i < prefixPaths.length; i++) {',
    '      var prefix = prefixPaths[i];',
    "      if (pathname === prefix || pathname.indexOf(prefix + '/') === 0) {",
    '        return true;',
    '      }',
    '    }',
    '    return false;',
    '  }',
    '  function rewriteRuntimeUrlString(raw) {',
    '    var resolved;',
    '    try {',
    '      resolved = new URL(raw, window.location.origin);',
    '    } catch {',
    '      return raw;',
    '    }',
    '    if (resolved.origin !== window.location.origin) {',
    '      return raw;',
    '    }',
    '    if (surfaceMap[resolved.pathname]) {',
    '      resolved.pathname = surfaceMap[resolved.pathname];',
    '      return resolved.toString();',
    '    }',
    '    if (!shouldProxyRuntimePath(resolved.pathname)) {',
    '      return raw;',
    '    }',
    "    resolved.pathname = '/runtime/api' + resolved.pathname;",
    '    return resolved.toString();',
    '  }',
    '  function rewriteRuntimeFetchInput(input) {',
    "    if (typeof Request === 'function' && input instanceof Request) {",
    '      var rewrittenRequestUrl = rewriteRuntimeUrlString(input.url);',
    '      if (rewrittenRequestUrl === input.url) {',
    '        return input;',
    '      }',
    '      return new Request(rewrittenRequestUrl, input);',
    '    }',
    "    if (typeof input === 'string' || input instanceof URL) {",
    '      return rewriteRuntimeUrlString(String(input));',
    '    }',
    '    return input;',
    '  }',
    "  if (typeof window.fetch === 'function') {",
    '    var nativeFetch = window.fetch.bind(window);',
    '    window.fetch = function(input, init) {',
    '      return nativeFetch(rewriteRuntimeFetchInput(input), init);',
    '    };',
    '  }',
    "  if (typeof window.EventSource === 'function') {",
    '    var NativeEventSource = window.EventSource;',
    '    var WrappedEventSource = function(url, config) {',
    '      return new NativeEventSource(rewriteRuntimeUrlString(String(url)), config);',
    '    };',
    '    WrappedEventSource.prototype = NativeEventSource.prototype;',
    '    WrappedEventSource.CONNECTING = NativeEventSource.CONNECTING;',
    '    WrappedEventSource.OPEN = NativeEventSource.OPEN;',
    '    WrappedEventSource.CLOSED = NativeEventSource.CLOSED;',
    '    window.EventSource = WrappedEventSource;',
    '  }',
    '})();',
    '</script>',
  ].join('\n');
}

function rewriteRuntimeSurfaceHtml(html: string): string {
  if (html.includes(RUNTIME_PROXY_INJECTION_MARKER)) {
    return html;
  }

  let rewritten = html;
  for (const [runtimePath, platformPath] of PLATFORM_SURFACE_ROUTE_MAP.entries()) {
    rewritten = rewritten.replaceAll(`href="${runtimePath}"`, `href="${platformPath}"`);
    rewritten = rewritten.replaceAll(`"href":"${runtimePath}"`, `"href":"${platformPath}"`);
  }

  return rewritten.replace(
    '</head>',
    `${buildRuntimeProxyInjectionScript()}\n</head>`,
  );
}

export async function handleRuntimeSurfaceRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  method: string,
  dependencies: ResolvedServerDependencies,
): Promise<boolean> {
  const runtimeSurfacePath = RUNTIME_SURFACE_ROUTE_MAP.get(url.pathname);
  if (!runtimeSurfacePath) {
    return false;
  }

  if (method !== 'GET') {
    sendMethodNotAllowed(response, ['GET']);
    return true;
  }

  try {
    const upstream = await fetchRuntimeUpstream(
      request,
      buildRuntimeUrl(dependencies.shared.config.runtimeBaseUrl, runtimeSurfacePath, url.search),
      dependencies.shared.config.runtimeApiKey,
    );

    if (upstream.status >= 300 && upstream.status < 400) {
      const forwardedHeaders = createForwardedResponseHeaders(upstream);
      const location = upstream.headers.get('location');
      if (location) {
        delete forwardedHeaders.location;
        delete forwardedHeaders.Location;
        forwardedHeaders.location = rewriteSurfaceLocation(
          location,
          dependencies.shared.config.runtimeBaseUrl,
        );
      }
      response.writeHead(upstream.status, forwardedHeaders);
      response.end();
      return true;
    }

    const body = Buffer.from(rewriteRuntimeSurfaceHtml(await upstream.text()), 'utf8');
    const forwardedHeaders = createForwardedResponseHeaders(upstream);
    delete forwardedHeaders['content-length'];
    response.writeHead(upstream.status, {
      ...forwardedHeaders,
      'content-type': forwardedHeaders['content-type'] || 'text/html; charset=utf-8',
      'content-length': body.byteLength.toString(),
    });
    response.end(body);
  } catch (error) {
    sendJson(response, 502, {
      error: {
        code: 'runtime_surface_unavailable',
        message: error instanceof Error ? error.message : 'cats-runtime is unreachable',
      },
    });
  }

  return true;
}

export async function handleRuntimeApiProxyRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  dependencies: ResolvedServerDependencies,
): Promise<boolean> {
  const prefix = '/runtime/api';
  if (!(url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
    return false;
  }

  const runtimePath = url.pathname.slice(prefix.length) || '/';

  try {
    const upstream = await fetchRuntimeUpstream(
      request,
      buildRuntimeUrl(dependencies.shared.config.runtimeBaseUrl, runtimePath, url.search),
      dependencies.shared.config.runtimeApiKey,
    );
    await writeUpstreamResponse(response, upstream);
  } catch (error) {
    sendJson(response, 502, {
      error: {
        code: 'runtime_proxy_unavailable',
        message: error instanceof Error ? error.message : 'cats-runtime is unreachable',
      },
    });
  }

  return true;
}
