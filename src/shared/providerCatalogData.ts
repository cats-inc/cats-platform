export const PRODUCT_PROVIDER_ORDER = [
  'claude',
  'codex',
  'antigravity',
  'cursor',
  'copilot',
  'opencode',
  'kilo',
  'goose',
  'pi',
  'auggie',
  'junie',
  'kiro',
  'ollama',
  'openclaw',
] as const;

export const PRODUCT_PROVIDER_MODELS = {
  openclaw: [
    { value: 'openclaw-coder', label: 'openclaw-coder (default)', default: true },
  ],
  claude: [
    { value: 'opus', label: 'Opus 4.7 with 1M context', default: true },
    { value: 'sonnet', label: 'Sonnet 4.6' },
    { value: 'haiku', label: 'Haiku 4.5' },
  ],
  codex: [
    { value: 'gpt-5.4', label: 'gpt-5.4', default: true },
    { value: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
    { value: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
    { value: 'gpt-5.3-codex-spark', label: 'gpt-5.3-codex-spark' },
    { value: 'gpt-5.2-codex', label: 'gpt-5.2-codex' },
    { value: 'gpt-5.2', label: 'gpt-5.2' },
    { value: 'gpt-5.1-codex-max', label: 'gpt-5.1-codex-max' },
    { value: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini' },
  ],
  antigravity: [
    { value: 'antigravity-default', label: 'Antigravity default', default: true },
  ],
  copilot: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)', default: true },
    { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
    { value: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
  ],
  opencode: [
    { value: 'opencode-go/glm-5', label: 'glm-5 (default)', default: true },
    { value: 'opencode-go/kimi-k2.5', label: 'kimi k2.5' },
    { value: 'opencode-go/minimax-m2.5', label: 'minimax m2.5' },
  ],
  kilo: [
    { value: 'kilo/openai/gpt-5.4', label: 'gpt-5.4 (default)', default: true },
    { value: 'kilo/openai/gpt-5.4-mini', label: 'gpt-5.4-mini' },
    { value: 'kilo/anthropic/claude-opus-4.6', label: 'claude-opus-4.6' },
    { value: 'kilo/anthropic/claude-sonnet-4.6', label: 'claude-sonnet-4.6' },
    { value: 'kilo/google/gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview' },
    { value: 'kilo/z-ai/glm-5', label: 'glm-5' },
  ],
  auggie: [
    { value: 'gpt-5.4', label: 'gpt-5.4 (default)', default: true },
    { value: 'claude opus 4.6', label: 'claude opus 4.6' },
    { value: 'sonnet 4.6', label: 'sonnet 4.6' },
  ],
  pi: [
    { value: 'openai-codex/gpt-5.4', label: 'openai-codex gpt-5.4 (default)', default: true },
  ],
  junie: [
    { value: 'Gemini 3 Flash', label: 'Gemini 3 Flash (default)', default: true },
    { value: 'Claude Opus 4.6', label: 'Claude Opus 4.6' },
    { value: 'Claude Opus 4.7', label: 'Claude Opus 4.7' },
    { value: 'Claude Sonnet 4.6', label: 'Claude Sonnet 4.6' },
    { value: 'Gemini 3.1 Flash Lite', label: 'Gemini 3.1 Flash Lite' },
    { value: 'Gemini 3.1 Pro Preview', label: 'Gemini 3.1 Pro Preview' },
    { value: 'GPT-5', label: 'GPT-5' },
    { value: 'GPT-5.2', label: 'GPT-5.2' },
    { value: 'GPT-5.3-codex', label: 'GPT-5.3-codex' },
    { value: 'GPT-5.4', label: 'GPT-5.4' },
    { value: 'Grok 4.1 Fast Reasoning', label: 'Grok 4.1 Fast Reasoning' },
  ],
  cursor: [
    { value: 'auto', label: 'auto' },
    { value: 'composer-2-fast', label: 'Composer 2 Fast (default)', default: true },
    { value: 'gpt-5.4', label: 'gpt-5.4' },
    { value: 'claude-opus-4-6', label: 'claude 4.6 opus' },
    { value: 'gemini-3.1-pro', label: 'gemini 3.1 pro' },
  ],
  kiro: [
    { value: 'claude-sonnet-4.5', label: 'claude-sonnet-4.5 (default)', default: true },
    { value: 'deepseek-3.2', label: 'deepseek-3.2' },
    { value: 'minimax-m2.1', label: 'minimax-m2.1' },
  ],
  goose: [
    { value: 'openai/gpt-5-codex', label: 'openai/gpt-5-codex (default)', default: true },
    { value: 'openai/gpt-5', label: 'openai/gpt-5' },
  ],
  ollama: [
    { value: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b (default)', default: true },
  ],
} as const;
