#!/usr/bin/env node

import { createHash } from 'node:crypto';
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
import { installGlobalCrashHandlers } from './app/server/crashLog.js';
import { CatsRuntimeClient } from './platform/runtime/client.js';
import {
  ensurePlatformAuthSessionSecret,
  resolvePlatformAuthSessionSecretConfigDir,
} from './platform/auth/sessionSecretProvisioning.js';
import {
  createRuntimeClientDiagnosticRecord,
  createRuntimeClientDiagnosticSink,
  resolveRuntimeClientDiagnosticsPath,
} from './platform/runtime/clientDiagnostics.js';
import { FileChatStore } from './products/chat/state/store.js';
import { isDirectCliEntrypoint } from './shared/cliEntrypoint.js';
import { browserUrl, startCliInteraction } from './shared/cliInteraction.js';
import {
  flushProviderSnapshotPersistence,
  seedProviderSelectorFromSnapshot,
  warmProviderSelectorCache,
} from './server/routes/providers.js';
import { resolveProviderSnapshotPathFromChatState } from './shared/platformPaths.js';
import { installBundledApps } from './platform/apps/packageInstaller.js';

let startup = createAppStartupState();

/** Trusted in-process host composition; no extension is loaded from user requests. */
export async function startApp(extension: {
  ready?(context: {
    config: ReturnType<typeof loadConfig>;
    chatStore: FileChatStore;
    runtimeClient: CatsRuntimeClient;
    server: ReturnType<typeof createServer>;
  }): Promise<void>;
  shutdown?(): Promise<void>;
} = {}): Promise<void> {
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

  const authSessionSecret = await ensurePlatformAuthSessionSecret({
    platformConfigDir: resolvePlatformAuthSessionSecretConfigDir(process.env),
  });
  startupTrace.trace('auth.session_secret.resolved', {
    source: authSessionSecret.source,
    secretPath: authSessionSecret.secretPath,
  });
  const config = loadConfig({
    ...process.env,
    CATS_AUTH_SESSION_SECRET: authSessionSecret.secret,
  });
  startupTrace.trace('config.loaded', {
    host: config.host,
    port: config.port,
    runtimeBaseUrl: config.runtimeBaseUrl,
  });
  const runtimeClientDiagnosticSink = createRuntimeClientDiagnosticSink({
    persistPath: resolveRuntimeClientDiagnosticsPath(config.chatStatePath),
  });
  const runtimeClient = new CatsRuntimeClient(config.runtimeBaseUrl, {
    apiKey: config.runtimeApiKey,
    sessionCreateTimeoutMs: config.runtimeSessionCreateTimeoutMs,
    sessionCreateSlowWarningMs: config.runtimeSessionCreateSlowWarningMs,
    messageIdleTimeoutMs: config.runtimeMessageIdleTimeoutMs,
    onClientDiagnostic: (event) => {
      runtimeClientDiagnosticSink.emit(createRuntimeClientDiagnosticRecord(event));
    },
  });
  startupTrace.trace('runtime.client.created');
  const chatStore = new FileChatStore(config.chatStatePath);
  if (process.env.CATS_APP_BUNDLE_PATH?.trim()) {
    await installBundledApps(config.chatStatePath, process.env.CATS_APP_BUNDLE_PATH.trim());
  }
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
      { connectionIdentity: createHash('sha256').update(JSON.stringify([config.runtimeBaseUrl, config.runtimeApiKey])).digest('hex') },
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
  let stopInteraction = () => {};

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
    stopInteraction();
    writeLifecycle(formatAppStoppingMessage(startup, reason));

    const reportShutdownError = (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    };
    shutdownPromise = Promise.resolve()
      .then(async () => {
        try { await extension.shutdown?.(); } catch (error) { reportShutdownError(error); }
        try { await closeAppServerGracefully(server); } catch (error) { reportShutdownError(error); }
        // Flush any pending provider snapshot before exiting so a recent
        // successful refresh isn't lost when the debounce timer hadn't fired
        // yet. Best-effort: failures must not block the lifecycle event.
        await flushProviderSnapshotPersistence(runtimeClient).catch(() => {});
        markAppStopped(startup, reason);
        writeLifecycle(formatAppStoppedMessage(startup, reason));
      })
      .catch(reportShutdownError)
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

  // cats-one owns this private IPC channel. It requests cleanup instead of
  // process.kill(), which forcibly terminates Node children on Windows.
  if (process.send) {
    process.on('message', (message: unknown) => {
      if (message && typeof message === 'object'
          && 'type' in message && message.type === 'cats.shutdown') {
        requestShutdown('parent_requested');
      }
    });
    process.on('disconnect', () => requestShutdown('parent_disconnected'));
    // Disconnect can precede this handler while asynchronous startup work runs.
    if (!process.connected) {
      await shutdown('parent_disconnected');
      return;
    }
  }

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
  if (shutdownPromise) {
    await shutdownPromise;
    return;
  }
  if (!address || typeof address === 'string') {
    throw new Error('Cats app failed to resolve its listening address.');
  }

  const listeningAddress = {
    host: config.host,
    port: address.port,
    healthUrl: `http://${config.host}:${address.port}/health`,
  };
  try {
    if (extension.ready) {
      await server.startupRecovery;
      if (shutdownPromise) { await shutdownPromise; return; }
      await extension.ready({ config, chatStore, runtimeClient, server });
    }
  } catch (error) {
    process.stderr.write(formatAppStartupError(startup, error));
    process.exitCode = 1;
    await shutdown('startup_failed');
    return;
  }
  if (shutdownPromise) { await shutdownPromise; return; }
  markAppReady(startup, listeningAddress);
  startupTrace.trace('ready.message.emitted', {
    host: listeningAddress.host,
    port: listeningAddress.port,
  });
  writeLifecycle(
    formatAppReadyMessage(startup, listeningAddress),
  );
  stopInteraction = startCliInteraction({
    url: browserUrl(config.host, address.port),
    mode: startup.mode,
    readyOutput: startup.readyOutput,
    noOpen: cliOptions.noOpen,
    onQuit: requestShutdown,
  });
}

if (isDirectCliEntrypoint(import.meta.url, process.argv[1])) {
  installGlobalCrashHandlers();
  startApp().catch((error) => {
    createAppStartupTrace().trace('main.error', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.stderr.write(formatAppStartupError(startup, error));
    process.exitCode = 1;
    process.exit(1);
  });
}
