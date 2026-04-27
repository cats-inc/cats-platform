#!/usr/bin/env node

import { loadConfig } from './config.js';
import { loadProjectEnvFiles } from './shared/loadProjectEnvFile.js';
import { createServer } from './app/server/index.js';
import { createAppStartupTrace } from './app/server/startupTrace.js';
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
import { closeAppServerGracefully } from './app/server/shutdown.js';
import { CatsRuntimeClient } from './platform/runtime/client.js';
import { FileChatStore } from './products/chat/state/store.js';
import { isDirectCliEntrypoint } from './shared/cliEntrypoint.js';
import {
  flushProviderSnapshotPersistence,
  seedProviderSelectorFromSnapshot,
  warmProviderSelectorCache,
} from './server/routes/providers.js';
import { resolveProviderSnapshotPathFromChatState } from './shared/platformPaths.js';

let startup = createAppStartupState();

async function main(): Promise<void> {
  loadProjectEnvFiles();
  const startupTrace = createAppStartupTrace();
  startupTrace.trace('main.entered', {
    argv: process.argv.slice(2),
  });
  const cliOptions = parseAppCliOptions(process.argv.slice(2));
  if (cliOptions.help) {
    process.stdout.write(`${getAppHelpText()}\n`);
    return;
  }

  startup = resolveAppStartupState(cliOptions, process.env);
  startupTrace.trace('startup.resolved', {
    mode: startup.mode,
    managedBy: startup.managedBy ?? null,
    readyOutput: startup.readyOutput,
  });

  const config = loadConfig();
  startupTrace.trace('config.loaded', {
    host: config.host,
    port: config.port,
    runtimeBaseUrl: config.runtimeBaseUrl,
  });
  const runtimeClient = new CatsRuntimeClient(config.runtimeBaseUrl, {
    apiKey: config.runtimeApiKey,
  });
  startupTrace.trace('runtime.client.created');
  const chatStore = new FileChatStore(config.chatStatePath);
  startupTrace.trace('chat.store.created', {
    chatStatePath: config.chatStatePath,
  });
  const server = createServer({
    shared: { config, runtimeClient, startup },
    chat: { chatStore },
  });
  startupTrace.trace('server.created');

  // Seed provider/catalog caches from disk before we start accepting requests
  // so the first /api/providers (or /api/providers/:id/models*) call lands on
  // the snapshot SWR path instead of paying the cold-runtime diagnostics
  // timeout.
  try {
    await seedProviderSelectorFromSnapshot(
      runtimeClient,
      resolveProviderSnapshotPathFromChatState(config.chatStatePath),
    );
    startupTrace.trace('provider.selector.snapshot.seeded');
  } catch (error) {
    startupTrace.trace('provider.selector.snapshot.seed_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Kick off the runtime warm-up *before* server.listen so a first-launch user
  // request — which lands without a disk snapshot — joins the inflight probe
  // instead of triggering its own. With a snapshot, this just refreshes the
  // SWR baseline in the background. Errors are swallowed: the on-demand
  // request path will retry as usual.
  void warmProviderSelectorCache(runtimeClient).catch(() => {});
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

    shutdownPromise = closeAppServerGracefully(server)
      .then(async () => {
        // Flush any pending provider snapshot before exiting so a recent
        // successful refresh isn't lost when the debounce timer hadn't fired
        // yet. Best-effort: failures must not block the lifecycle event.
        await flushProviderSnapshotPersistence(runtimeClient).catch(() => {});
        markAppStopped(startup, reason);
        writeLifecycle(formatAppStoppedMessage(startup, reason));
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

  startupTrace.trace('server.listen.begin', {
    host: config.host,
    port: config.port,
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  startupTrace.trace('server.listen.ready', {
    host: config.host,
    port: config.port,
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
  startupTrace.trace('ready.message.emitted', {
    host: listeningAddress.host,
    port: listeningAddress.port,
  });
  writeLifecycle(
    formatAppReadyMessage(startup, listeningAddress),
  );
}

if (isDirectCliEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    createAppStartupTrace().trace('main.error', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.stderr.write(formatAppStartupError(startup, error));
    process.exitCode = 1;
    process.exit(1);
  });
}
