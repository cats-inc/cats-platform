import { loadConfig } from './config.js';
import { CatsRuntimeClient } from './runtime/client.js';
import { createServer } from './server.js';
import { FileWorkspaceStore } from './workspace/store.js';

const config = loadConfig();
const runtimeClient = new CatsRuntimeClient(config.runtimeBaseUrl, {
  apiKey: config.runtimeApiKey,
});
const workspaceStore = new FileWorkspaceStore(config.workspaceStatePath);

const server = createServer({ config, runtimeClient, workspaceStore });

server.listen(config.port, config.host, () => {
  console.log(
    `cats-inc listening on http://${config.host}:${config.port} ` +
      `(runtime: ${config.runtimeBaseUrl})`,
  );
});
