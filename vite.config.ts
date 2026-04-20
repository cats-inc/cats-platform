import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function readFirstDefined(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parsePort(rawValue: string | undefined, fallback: number): number {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeProxyHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') {
    return '127.0.0.1';
  }

  return host;
}

const appHost = readFirstDefined(['CATS_HOST', 'CATS_INC_HOST']) || '127.0.0.1';
const appPort = parsePort(readFirstDefined(['CATS_PORT', 'CATS_INC_PORT']), 8181);
const webHost = readFirstDefined(['CATS_WEB_HOST']) || appHost;
const devPort = parsePort(readFirstDefined(['CATS_WEB_DEV_PORT']), 5173);
const previewPort = parsePort(readFirstDefined(['CATS_WEB_PREVIEW_PORT']), 4173);
const proxyTarget = readFirstDefined(['CATS_WEB_PROXY_TARGET'])
  || `http://${normalizeProxyHost(appHost)}:${appPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: webHost,
    port: devPort,
    proxy: {
      '/api': proxyTarget,
      '/health': proxyTarget,
      '/runtime': proxyTarget,
    },
  },
  preview: {
    host: webHost,
    port: previewPort,
  },
  build: {
    outDir: 'build/renderer',
  },
});
