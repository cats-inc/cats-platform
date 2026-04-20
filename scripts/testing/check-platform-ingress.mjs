#!/usr/bin/env node
/**
 * Verify platform-owned browser ingress against a Cats base URL.
 *
 * Usage:
 *   node scripts/testing/check-platform-ingress.mjs
 *   node scripts/testing/check-platform-ingress.mjs --base-url http://192.168.1.25:8181
 *   node scripts/testing/check-platform-ingress.mjs --base-url https://example.ts.net
 */
import process from 'node:process';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8181';

function usage() {
  return [
    'Usage: node scripts/testing/check-platform-ingress.mjs [--base-url <url>]',
    '',
    'Checks:',
    '  - GET /health',
    '  - GET /api/platform/ingress',
    '  - GET /runtime',
    '  - GET /runtime/setup',
    '  - GET /runtime/dashboard?bootstrap=1',
    '  - GET /runtime/api/health',
    '',
    'Notes:',
    '  - runtime API health accepts 200 or 503 so the proxy path can be verified',
    '    without forcing a healthy upstream runtime.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  let baseUrl = DEFAULT_BASE_URL;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (argument === '--base-url') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --base-url');
      }
      baseUrl = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return {
    baseUrl,
    help,
  };
}

function normalizeBaseUrl(rawBaseUrl) {
  const url = new URL(rawBaseUrl);
  url.pathname = url.pathname.replace(/\/+$/u, '');
  url.search = '';
  url.hash = '';
  const normalized = url.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function resolveUrl(baseUrl, pathname) {
  return new URL(pathname, `${baseUrl}/`).toString();
}

function expectStatus(response, allowedStatuses, label) {
  if (!allowedStatuses.includes(response.status)) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
}

function expectContentType(response, pattern, label) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!pattern.test(contentType)) {
    throw new Error(`${label} returned unexpected content-type: ${contentType || '<empty>'}`);
  }
}

function normalizeRuntimeRootPath(pathname) {
  const normalized = pathname.trim() || '/runtime';
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function formatUrlSection(label, urls) {
  if (!urls.length) {
    return `${label}: none`;
  }
  return `${label}: ${urls.join(', ')}`;
}

export function formatPlatformIngressReport(result) {
  const { baseUrl, ingress, checks } = result;
  const lines = [
    `Base URL: ${baseUrl}`,
    `Binding: ${ingress.binding.mode} (${ingress.binding.host}:${ingress.binding.port})`,
    `LAN reachable: ${ingress.binding.canReachFromLan ? 'yes' : 'no'}`,
    formatUrlSection('Local URLs', ingress.urls.localUrls),
    formatUrlSection('LAN URLs', ingress.urls.lanUrls),
    formatUrlSection('Overlay URLs', ingress.urls.overlayUrls ?? []),
    `Runtime ingress root: ${ingress.runtimeIngress.rootPath}`,
    `Runtime ingress API: ${ingress.runtimeIngress.apiBasePath}`,
    'Checks:',
    ...checks.map((check) => {
      const detail = check.location ? ` -> ${check.location}` : '';
      return `- ${check.label}: HTTP ${check.status}${detail}`;
    }),
    'Notes:',
    ...ingress.notes.map((note) => `- ${note}`),
  ];
  return lines.join('\n');
}

export async function probePlatformIngress(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);

  const ingressResponse = await fetchImpl(resolveUrl(baseUrl, '/api/platform/ingress'));
  expectStatus(ingressResponse, [200], 'GET /api/platform/ingress');
  expectContentType(ingressResponse, /application\/json/u, 'GET /api/platform/ingress');
  const ingress = await ingressResponse.json();

  const runtimeRootPath = normalizeRuntimeRootPath(ingress.runtimeIngress?.rootPath ?? '/runtime');
  const runtimeApiBasePath = normalizeRuntimeRootPath(ingress.runtimeIngress?.apiBasePath ?? '/runtime/api');
  const setupPath = `${runtimeRootPath}/setup`;
  const dashboardBootstrapPath = `${runtimeRootPath}/dashboard?bootstrap=1`;
  const runtimeHealthPath = `${runtimeApiBasePath}/health`;

  const checks = [];

  const healthResponse = await fetchImpl(resolveUrl(baseUrl, '/health'));
  expectStatus(healthResponse, [200], 'GET /health');
  checks.push({
    label: 'GET /health',
    status: healthResponse.status,
  });

  checks.push({
    label: 'GET /api/platform/ingress',
    status: ingressResponse.status,
  });

  const runtimeRootResponse = await fetchImpl(resolveUrl(baseUrl, runtimeRootPath));
  expectStatus(runtimeRootResponse, [200], `GET ${runtimeRootPath}`);
  expectContentType(runtimeRootResponse, /text\/html/u, `GET ${runtimeRootPath}`);
  checks.push({
    label: `GET ${runtimeRootPath}`,
    status: runtimeRootResponse.status,
  });

  const runtimeSetupResponse = await fetchImpl(resolveUrl(baseUrl, setupPath));
  expectStatus(runtimeSetupResponse, [200], `GET ${setupPath}`);
  expectContentType(runtimeSetupResponse, /text\/html/u, `GET ${setupPath}`);
  checks.push({
    label: `GET ${setupPath}`,
    status: runtimeSetupResponse.status,
  });

  const runtimeDashboardResponse = await fetchImpl(resolveUrl(baseUrl, dashboardBootstrapPath), {
    redirect: 'manual',
  });
  expectStatus(runtimeDashboardResponse, [200, 302], `GET ${dashboardBootstrapPath}`);
  const runtimeDashboardLocation = runtimeDashboardResponse.headers.get('location');
  if (runtimeDashboardResponse.status === 302) {
    if (runtimeDashboardLocation !== setupPath) {
      throw new Error(
        `GET ${dashboardBootstrapPath} redirected to unexpected location: ${runtimeDashboardLocation ?? '<empty>'}`,
      );
    }
  }
  checks.push({
    label: `GET ${dashboardBootstrapPath}`,
    status: runtimeDashboardResponse.status,
    location: runtimeDashboardLocation ?? '',
  });

  const runtimeHealthResponse = await fetchImpl(resolveUrl(baseUrl, runtimeHealthPath));
  expectStatus(runtimeHealthResponse, [200, 503], `GET ${runtimeHealthPath}`);
  expectContentType(runtimeHealthResponse, /application\/json/u, `GET ${runtimeHealthPath}`);
  checks.push({
    label: `GET ${runtimeHealthPath}`,
    status: runtimeHealthResponse.status,
  });

  return {
    baseUrl,
    ingress,
    checks,
  };
}

export async function runPlatformIngressSmoke(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const { baseUrl, help } = parseArgs(argv);

  if (help) {
    stdout.write(`${usage()}\n`);
    return null;
  }

  const result = await probePlatformIngress({
    baseUrl,
    fetchImpl: options.fetchImpl,
  });
  stdout.write(`${formatPlatformIngressReport(result)}\n`);
  return result;
}

function isDirectExecution(metaUrl) {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return new URL(`file://${entry.replace(/\\/gu, '/')}`).href === metaUrl;
}

if (isDirectExecution(import.meta.url)) {
  try {
    await runPlatformIngressSmoke();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
