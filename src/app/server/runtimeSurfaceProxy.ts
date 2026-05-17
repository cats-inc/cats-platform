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

const SETUP_MUTATION_RUNTIME_API_PATHS = new Set<string>([
  '/setup-scan',
  '/setup-apply',
]);
const DEFAULT_RUNTIME_SETUP_SCAN_PROXY_TIMEOUT_MS = 120_000;
const DEFAULT_RUNTIME_SETUP_APPLY_PROXY_TIMEOUT_MS = 30_000;

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

interface ClientAbortScope {
  signal: AbortSignal;
  dispose: () => void;
}

interface RuntimeProxyTimeoutScope {
  signal: AbortSignal;
  timedOut: () => boolean;
}

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

  if (runtimeApiKey) {
    headers.set('authorization', `Bearer ${runtimeApiKey}`);
  }

  return headers;
}

function resolvePositiveTimeoutMs(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function resolveRuntimeSetupProxyTimeoutMs(
  runtimePath: string,
  dependencies: ResolvedServerDependencies,
): number | null {
  const config = dependencies.shared.config;
  if (runtimePath === '/setup-scan') {
    return resolvePositiveTimeoutMs(
      config.runtimeSetupScanProxyTimeoutMs ?? config.runtimeSetupProxyTimeoutMs,
      DEFAULT_RUNTIME_SETUP_SCAN_PROXY_TIMEOUT_MS,
    );
  }

  if (runtimePath === '/setup-apply') {
    return resolvePositiveTimeoutMs(
      config.runtimeSetupApplyProxyTimeoutMs ?? config.runtimeSetupProxyTimeoutMs,
      DEFAULT_RUNTIME_SETUP_APPLY_PROXY_TIMEOUT_MS,
    );
  }

  return null;
}

function createClientAbortScope(
  request: IncomingMessage,
  response: ServerResponse,
): ClientAbortScope {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  request.once('aborted', abort);
  response.once('close', abort);

  return {
    signal: controller.signal,
    dispose: () => {
      request.off('aborted', abort);
      response.off('close', abort);
    },
  };
}

function createRuntimeProxyTimeoutScope(
  clientSignal: AbortSignal,
  timeoutMs: number | null,
): RuntimeProxyTimeoutScope {
  if (timeoutMs === null) {
    return {
      signal: clientSignal,
      timedOut: () => false,
    };
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    signal: AbortSignal.any([clientSignal, timeoutSignal]),
    timedOut: () => timeoutSignal.aborted && !clientSignal.aborted,
  };
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
  signal?: AbortSignal,
): Promise<Response> {
  const method = request.method ?? 'GET';
  const headers = createForwardedHeaders(request, runtimeApiKey);
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    redirect: 'manual',
    signal,
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
    '  window.__CATS_RUNTIME_PROXY_MODE__ = true;',
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
    '  var csrfHeaderName = \'x-cats-csrf-token\';',
    '  var csrfToken = null;',
    '  var csrfTokenRequest = null;',
    '  function fetchMethod(input, init) {',
    '    if (init && init.method) return String(init.method).toUpperCase();',
    "    if (typeof Request === 'function' && input instanceof Request) return input.method.toUpperCase();",
    "    return 'GET';",
    '  }',
    '  function fetchUrl(input) {',
    "    if (typeof Request === 'function' && input instanceof Request) return input.url;",
    '    return String(input);',
    '  }',
    '  function isRuntimeProxyMutation(input, init) {',
    "    var method = fetchMethod(input, init);",
    "    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return false;",
    '    try {',
    '      var resolved = new URL(fetchUrl(input), window.location.origin);',
    "      return resolved.origin === window.location.origin && resolved.pathname.indexOf('/runtime/api/') === 0;",
    '    } catch {',
    '      return false;',
    '    }',
    '  }',
    '  function headersToEntries(source) {',
    '    if (!source) return [];',
    '    if (typeof Headers === \'function\' && source instanceof Headers) {',
    '      var entries = [];',
    '      source.forEach(function(value, key) { entries.push([key, value]); });',
    '      return entries;',
    '    }',
    '    if (Array.isArray(source)) return source;',
    '    return Object.keys(source).map(function(key) { return [key, source[key]]; });',
    '  }',
    '  function mergedFetchHeaders(input, init) {',
    '    var headers = new Headers();',
    "    if (typeof Request === 'function' && input instanceof Request) {",
    '      input.headers.forEach(function(value, key) { headers.set(key, value); });',
    '    }',
    '    headersToEntries(init && init.headers).forEach(function(entry) { headers.set(entry[0], entry[1]); });',
    '    return headers;',
    '  }',
    '  function headerEntries(input, init) {',
    '    var entries = [];',
    '    mergedFetchHeaders(input, init).forEach(function(value, key) { entries.push([key, value]); });',
    '    return entries;',
    '  }',
    '  function hasFetchHeader(input, init, name) {',
    '    var lowered = name.toLowerCase();',
    '    return headerEntries(input, init).some(function(entry) { return String(entry[0]).toLowerCase() === lowered; });',
    '  }',
    '  function hasBearerAuth(input, init) {',
    '    return headerEntries(input, init).some(function(entry) {',
    "      return String(entry[0]).toLowerCase() === 'authorization' && /^bearer\\s/i.test(String(entry[1]));",
    '    });',
    '  }',
    '  function withCsrfHeader(input, init, token) {',
    '    var headers = mergedFetchHeaders(input, init);',
    '    headers.set(csrfHeaderName, token);',
    '    return { input: input, init: Object.assign({}, init || {}, { headers: headers }) };',
    '  }',
    '  function clearCsrfToken() {',
    '    csrfToken = null;',
    '    csrfTokenRequest = null;',
    '  }',
    '  function readCsrfToken(nativeFetch, forceRefresh) {',
    '    if (!forceRefresh && csrfToken) return Promise.resolve(csrfToken);',
    '    if (!forceRefresh && csrfTokenRequest) return csrfTokenRequest;',
    '    if (forceRefresh) clearCsrfToken();',
    "    csrfTokenRequest = nativeFetch('/api/auth/status', {",
    "      headers: { Accept: 'application/json' },",
    "      credentials: 'same-origin',",
    '    }).then(function(response) {',
    '      if (!response.ok) return null;',
    '      return response.json();',
    '    }).then(function(payload) {',
    "      var token = payload && typeof payload.csrfToken === 'string' ? payload.csrfToken.trim() : '';",
    '      csrfToken = token || null;',
    '      return csrfToken;',
    '    }).catch(function() {',
    '      return null;',
    '    }).finally(function() {',
    '      csrfTokenRequest = null;',
    '    });',
    '    return csrfTokenRequest;',
    '  }',
    '  function isCsrfMismatchResponse(response) {',
    '    if (response.status !== 403) return Promise.resolve(false);',
    '    return response.clone().json().then(function(payload) {',
    "      return Boolean(payload && payload.error && payload.error.code === 'E_CSRF_MISMATCH');",
    '    }).catch(function() { return false; });',
    '  }',
    '  function cloneFetchInputForRetry(input) {',
    "    if (typeof Request === 'function' && input instanceof Request) return input.clone();",
    '    return input;',
    '  }',
    "  if (typeof window.fetch === 'function') {",
    '    var nativeFetch = window.fetch.bind(window);',
    '    window.fetch = function(input, init) {',
    '      var rewrittenInput = rewriteRuntimeFetchInput(input);',
    '      if (!isRuntimeProxyMutation(rewrittenInput, init)',
    '        || hasFetchHeader(rewrittenInput, init, csrfHeaderName)',
    '        || hasBearerAuth(rewrittenInput, init)) {',
    '        return nativeFetch(rewrittenInput, init);',
    '      }',
    '      return readCsrfToken(nativeFetch).then(function(token) {',
    '        if (!token) return nativeFetch(rewrittenInput, init);',
    '        var retryInput = cloneFetchInputForRetry(rewrittenInput);',
    '        var request = withCsrfHeader(rewrittenInput, init, token);',
    '        return nativeFetch(request.input, request.init).then(function(response) {',
    '          return isCsrfMismatchResponse(response).then(function(isCsrfMismatch) {',
    '            if (!isCsrfMismatch) return response;',
    '            clearCsrfToken();',
    '            return readCsrfToken(nativeFetch, true).then(function(nextToken) {',
    '              if (!nextToken || nextToken === token) return response;',
    '              var retryRequest = withCsrfHeader(retryInput, init, nextToken);',
    '              return nativeFetch(retryRequest.input, retryRequest.init).catch(function(error) {',
    "                if (typeof console !== 'undefined' && typeof console.warn === 'function') {",
    "                  console.warn('Cats runtime CSRF retry failed; returning original 403 response.', error);",
    '                }',
    '                return response;',
    '              });',
    '            });',
    '          });',
    '        });',
    '      });',
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

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function rewriteRuntimeSurfaceHtml(html: string): string {
  if (html.includes(RUNTIME_PROXY_INJECTION_MARKER)) {
    return html;
  }

  let rewritten = html;
  for (const [runtimePath, platformPath] of PLATFORM_SURFACE_ROUTE_MAP.entries()) {
    if (runtimePath === '/') {
      continue;
    }
    const escapedRuntimePath = escapeRegExp(runtimePath);
    const hrefAttributePattern = new RegExp(
      `href=(["'])${escapedRuntimePath}((?:[?#][^"']*)?)\\1`,
      'gu',
    );
    rewritten = rewritten.replace(
      hrefAttributePattern,
      (_match, quote: string, tail: string) => `href=${quote}${platformPath}${tail}${quote}`,
    );
    const hrefJsonPattern = new RegExp(
      `"href":"${escapedRuntimePath}((?:[?#][^"]*)?)"`,
      'gu',
    );
    rewritten = rewritten.replace(
      hrefJsonPattern,
      (_match, tail: string) => `"href":"${platformPath}${tail}"`,
    );
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

  const abortScope = createClientAbortScope(request, response);
  try {
    const upstream = await fetchRuntimeUpstream(
      request,
      buildRuntimeUrl(dependencies.shared.config.runtimeBaseUrl, runtimeSurfacePath, url.search),
      dependencies.shared.config.runtimeApiKey,
      abortScope.signal,
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
    if (abortScope.signal.aborted || response.destroyed || response.writableEnded) {
      return true;
    }
    sendJson(response, 502, {
      error: {
        code: 'runtime_surface_unavailable',
        message: error instanceof Error ? error.message : 'cats-runtime is unreachable',
      },
    });
  } finally {
    abortScope.dispose();
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

  if (!isRuntimeApiPath(runtimePath)) {
    sendJson(response, 404, {
      error: {
        code: 'runtime_proxy_path_not_allowed',
        message: `Runtime API path is not exposed through /runtime/api: ${runtimePath}`,
      },
    });
    return true;
  }

  const abortScope = createClientAbortScope(request, response);
  const timeoutScope = createRuntimeProxyTimeoutScope(
    abortScope.signal,
    SETUP_MUTATION_RUNTIME_API_PATHS.has(runtimePath)
      ? resolveRuntimeSetupProxyTimeoutMs(runtimePath, dependencies)
      : null,
  );
  try {
    const upstream = await fetchRuntimeUpstream(
      request,
      buildRuntimeUrl(dependencies.shared.config.runtimeBaseUrl, runtimePath, url.search),
      dependencies.shared.config.runtimeApiKey,
      timeoutScope.signal,
    );
    await writeUpstreamResponse(response, upstream);
  } catch (error) {
    if (abortScope.signal.aborted || response.destroyed || response.writableEnded) {
      return true;
    }
    if (timeoutScope.timedOut()) {
      sendJson(response, 504, {
        error: {
          code: 'runtime_proxy_timeout',
          message: `Timed out forwarding runtime setup request: ${runtimePath}`,
        },
      });
      return true;
    }
    sendJson(response, 502, {
      error: {
        code: 'runtime_proxy_unavailable',
        message: error instanceof Error ? error.message : 'cats-runtime is unreachable',
      },
    });
  } finally {
    abortScope.dispose();
  }

  return true;
}
