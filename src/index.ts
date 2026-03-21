import { loadConfig } from './config.js';
import { createServer } from './app/server/index.js';
import { CatsRuntimeClient } from './platform/runtime/client.js';
import { FileChatStore } from './products/chat/workspace/store.js';

const config = loadConfig();
const runtimeClient = new CatsRuntimeClient(config.runtimeBaseUrl, {
  apiKey: config.runtimeApiKey,
});
const chatStore = new FileChatStore(config.chatStatePath);

const server = createServer({ config, runtimeClient, chatStore });

server.listen(config.port, config.host, () => {
  console.log(
    `cats listening on http://${config.host}:${config.port} ` +
      `(runtime: ${config.runtimeBaseUrl})`,
  );
});
