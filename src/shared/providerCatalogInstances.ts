import type {
  ProductProviderId,
  ProductProviderInstanceDescriptor,
} from './providerCatalog.js';

export const PRODUCT_PROVIDER_INSTANCES: Record<ProductProviderId, ProductProviderInstanceDescriptor[]> = {
  claude: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
    { id: 'sdk', label: 'agent/sdk', target: 'agent/sdk', backend: 'agent' },
    { id: 'sonnet', label: 'api/sonnet', target: 'api/sonnet', backend: 'api' },
  ],
  codex: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
    { id: 'main', label: 'api/main', target: 'api/main', backend: 'api' },
  ],
  gemini: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
    { id: 'flash', label: 'api/flash', target: 'api/flash', backend: 'api' },
  ],
  cursor: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  copilot: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  opencode: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  kilo: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  goose: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  pi: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  auggie: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  junie: [
    { id: 'native', label: 'cli/native', target: 'cli/native', backend: 'cli', default: true },
  ],
  kiro: [
    { id: 'ubuntu', label: 'cli/ubuntu', target: 'cli/ubuntu', backend: 'cli', default: true },
  ],
  ollama: [
    { id: 'local', label: 'local/local', target: 'local/local', backend: 'local', default: true },
  ],
  openclaw: [
    { id: 'gateway', label: 'agent/gateway', target: 'agent/gateway', backend: 'agent', default: true },
  ],
};
