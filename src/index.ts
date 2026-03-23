#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { loadConfig } from './config.js';
import { createServer } from './app/server/index.js';
import {
  createAppStartupState,
  formatAppReadyMessage,
  formatAppStartupError,
  formatAppStoppedMessage,
  formatAppStoppingMessage,
  getAppHelpText,
  markAppReady,
  markAppStopped,
  markAppStopping,
  parseAppCliOptions,
  resolveAppStartupState,
  type AppShutdownReason,
} from './app/server/startup.js';
import { CatsRuntimeClient } from './platform/runtime/client.js';
import { FileChatStore } from './products/chat/state/store.js';

let startup = createAppStartupState();

async function main(): Promise<void> {
  const cliOptions = parseAppCliOptions(process.argv.slice(2));
  if (cliOptions.help) {
    process.stdout.write(`${getAppHelpText()}\n`);
    return;
  }

  startup = resolveAppStartupState(cliOptions, process.env);

  const config = loadConfig();
  const runtimeClient = new CatsRuntimeClient(config.runtimeBaseUrl, {
    apiKey: config.runtimeApiKey,
  });
  const chatStore = new FileChatStore(config.chatStatePath);
  const server = createServer({ config, runtimeClient, chatStore, startup });
  let shutdownPromise: Promise<void> | null = null;

  const writeLifecycle = (line: string | null) => {
    if (line) {
      process.stdout.write(line);
    }
  };

  const shutdown = (reason: AppShutdownReason): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    markAppStopping(startup, reason);
    writeLifecycle(formatAppStoppingMessage(startup, reason));

    shutdownPromise = new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        markAppStopped(startup, reason);
        writeLifecycle(formatAppStoppedMessage(startup, reason));
        resolve();
      });
    })
      .catch((error) => {
        process.stderr.write(
          `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
      })
      .finally(() => {
        process.exit(process.exitCode ?? 0);
      });

    return shutdownPromise;
  };

  const requestShutdown = (reason: AppShutdownReason) => {
    void shutdown(reason);
  };

  process.on('SIGINT', () => {
    requestShutdown('sigint');
  });
  process.on('SIGTERM', () => {
    requestShutdown('sigterm');
  });

  if (startup.mode === 'app-managed' && process.stdin.readable && !process.stdin.isTTY) {
    process.stdin.resume();
    process.stdin.on('end', () => {
      requestShutdown('stdin_closed');
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Cats app failed to resolve its listening address.');
  }

  const listeningAddress = {
    host: config.host,
    port: address.port,
    healthUrl: `http://${config.host}:${address.port}/health`,
  };
  markAppReady(startup, listeningAddress);
  writeLifecycle(
    formatAppReadyMessage(startup, listeningAddress),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(formatAppStartupError(startup, error));
    process.exitCode = 1;
    process.exit(1);
  });
}
