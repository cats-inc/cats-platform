export interface ProviderModelOption {
  value: string;
  label: string;
}

export const PAL_PROVIDER_ORDER = [
  'claude',
  'codex',
  'gemini',
  'cursor',
  'copilot',
  'opencode',
  'goose',
  'pi',
  'auggie',
  'junie',
  'kiro',
  'ollama',
] as const;

export type PalProviderId = (typeof PAL_PROVIDER_ORDER)[number];

export const PAL_PROVIDER_MODELS: Record<PalProviderId, ProviderModelOption[]> = {
  claude: [
    { value: 'claude-opus-4-6', label: 'opus 4.6 (default)' },
    { value: 'claude-sonnet-4-6', label: 'sonnet 4.6' },
    { value: 'claude-haiku-4-5', label: 'haiku 4.5' },
  ],
  codex: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)' },
    { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
    { value: 'gpt-5.2-codex', label: 'gpt-5.2-codex' },
  ],
  gemini: [
    { value: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview (default)' },
    { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
    { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
  ],
  copilot: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)' },
    { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
    { value: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
  ],
  opencode: [
    { value: 'opencode-go/glm-5', label: 'glm-5 (default)' },
    { value: 'opencode-go/kimi-k2.5', label: 'kimi k2.5' },
    { value: 'opencode-go/minimax-m2.5', label: 'minimax m2.5' },
  ],
  auggie: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)' },
    { value: 'claude opus 4.6', label: 'claude opus 4.6' },
    { value: 'sonnet 4.6', label: 'sonnet 4.6' },
  ],
  pi: [
    { value: 'openai-codex/gpt-5.4', label: 'openai-codex gpt-5.4 (default)' },
  ],
  junie: [
    { value: 'gpt', label: 'gpt (default)' },
    { value: 'gpt-codex', label: 'gpt-codex' },
    { value: 'sonnet', label: 'sonnet' },
  ],
  cursor: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)' },
    { value: 'claude-opus-4-6', label: 'claude 4.6 opus' },
    { value: 'gemini-3.1-pro', label: 'gemini 3.1 pro' },
  ],
  kiro: [
    { value: 'claude-sonnet-4.5', label: 'claude-sonnet-4.5 (default)' },
    { value: 'deepseek-3.2', label: 'deepseek-3.2' },
    { value: 'minimax-m2.1', label: 'minimax-m2.1' },
  ],
  goose: [
    { value: 'openai/gpt-5-codex', label: 'openai/gpt-5-codex (default)' },
    { value: 'openai/gpt-5', label: 'openai/gpt-5' },
  ],
  ollama: [
    { value: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b (default)' },
  ],
};

export function getProviderDisplayName(provider: string): string {
  if (provider === 'ollama') return 'Ollama';
  const name = provider.charAt(0).toUpperCase() + provider.slice(1);
  return `${name}-CLI`;
}

export function getProviderModels(provider: string): ProviderModelOption[] {
  return PAL_PROVIDER_MODELS[provider as PalProviderId] ?? [];
}

export function getDefaultModel(provider: string): string {
  return getProviderModels(provider)[0]?.value ?? '';
}
