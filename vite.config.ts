import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import {
  CATS_VITE_PROXY_PATHS,
  createCatsViteProxyOptions,
} from './src/platform/auth/viteProxy';

function readFirstDefined(
  env: Record<string, string | undefined>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
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

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  const appHost = readFirstDefined(env, ['CATS_HOST', 'CATS_INC_HOST']) || '127.0.0.1';
  const appPort = parsePort(readFirstDefined(env, ['CATS_PORT', 'CATS_INC_PORT']), 8181);
  const webHost = readFirstDefined(env, ['CATS_WEB_HOST']) || appHost;
  const devPort = parsePort(readFirstDefined(env, ['CATS_WEB_DEV_PORT']), 5173);
  const previewPort = parsePort(readFirstDefined(env, ['CATS_WEB_PREVIEW_PORT']), 4173);
  const proxyTarget = readFirstDefined(env, ['CATS_WEB_PROXY_TARGET'])
    || `http://${normalizeProxyHost(appHost)}:${appPort}`;
  const proxyOptions: ProxyOptions = createCatsViteProxyOptions(proxyTarget);

  return {
    plugins: [react()],
    server: {
      host: webHost,
      port: devPort,
      proxy: Object.fromEntries(
        CATS_VITE_PROXY_PATHS.map((proxyPath) => [proxyPath, proxyOptions]),
      ),
    },
    preview: {
      host: webHost,
      port: previewPort,
    },
    build: {
      outDir: 'build/renderer',
      rollupOptions: {
        input: {
          app: resolve(process.cwd(), 'index.html'),
          screenshotOverlay: resolve(process.cwd(), 'desktop/overlay/index.html'),
        },
      },
    },
  };
});
