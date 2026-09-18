export const PRODUCT_PROVIDER_ORDER = [
  'claude',
  'codex',
  'antigravity',
  'grok',
  'cline',
  'devin',
  'muse',
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
  // Offline fallback only: a runtime-served label wins via
  // resolveLiveProviderModelLabel. Kept in step with the runtime's curated
  // catalog so an offline shell does not name a version that has moved on.
  claude: [
    { value: 'opus', label: 'Opus 5 with 1M context', default: true },
    { value: 'fable', label: 'Fable 5.1' },
    { value: 'sonnet', label: 'Sonnet 5' },
    { value: 'haiku', label: 'Haiku 4.5' },
  ],
  codex: [
    { value: 'gpt-6-astra', label: 'gpt-6-astra', default: true },
    { value: 'gpt-5.6-sol', label: 'gpt-5.6-sol' },
    { value: 'gpt-5.6-terra', label: 'gpt-5.6-terra' },
    { value: 'gpt-5.6-luna', label: 'gpt-5.6-luna' },
    { value: 'gpt-5.5', label: 'gpt-5.5' },
  ],
  antigravity: [
    { value: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash' },
    { value: 'gemini-3.7-flash-low', label: 'Gemini 3.7 Flash' },
    { value: 'gemini-3.6-flash-low', label: 'Gemini 3.6 Flash' },
    { value: 'gemini-3.1-pro-low', label: 'Gemini 3.1 Pro' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Thinking)' },
    { value: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 (Thinking)' },
    { value: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
  ],
  grok: [
    { value: 'grok-4.6', label: 'Grok 4.6' },
    { value: 'grok-4.5', label: 'Grok 4.5' },
  ],
  cline: [
    { value: 'cline-default', label: 'Cline default', default: true },
  ],
  devin: [
    { value: 'adaptive', label: 'Adaptive' },
    { value: 'claude-fable-5-1-medium', label: 'Claude Fable 5.1 — Medium' },
    { value: 'gemini-3-8-flash-medium', label: 'Gemini 3.8 Flash — Medium' },
    { value: 'gpt-6-astra-medium', label: 'GPT-6 Astra — Medium' },
    { value: 'grok-4-6-medium', label: 'Grok 4.6 — Medium' },
    { value: 'nemotron-3-ultra-high', label: 'Nemotron 3 Ultra — High' },
  ],
  // Offline fallback only, kept in step with the runtime's curated Muse
  // catalog. The account default is deliberately not one of the -contributor
  // rows: those let Meta use the session for product improvement, which is an
  // opt-in an offline default must not make on the operator's behalf.
  muse: [
    { value: 'muse-default', label: 'Muse account default', default: true },
    { value: 'muse-spark-1.3', label: 'muse-spark-1.3' },
    { value: 'muse-spark-1.2', label: 'muse-spark-1.2' },
  ],
  copilot: [
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 Terra — Medium (default)', default: true },
    { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 — Medium' },
    { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — Medium' },
    { value: 'grok-4.6', label: 'Grok 4.6 — Medium' },
    { value: 'mai-code-1.1-flash', label: 'MAI-Code-1.1-Flash — Medium' },
    { value: 'kimi-k3', label: 'Kimi K3 — High' },
  ],
  opencode: [
    { value: 'opencode-go/union-alpha', label: 'Union Alpha Free' },
    { value: 'opencode-go/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
    { value: 'opencode-go/hy4-preview', label: 'Hy4 preview' },
    { value: 'opencode-go/glm-5.3-flash', label: 'GLM-5.3-Flash' },
    { value: 'opencode-go/qwen3.8-flash', label: 'Qwen3.8 Flash' },
    { value: 'opencode-go/minimax-m3', label: 'MiniMax-M3' },
  ],
  kilo: [
    { value: 'kilo/deepseek/deepseek-v4.1-flash', label: 'DeepSeek: DeepSeek V4.1 Flash' },
    { value: 'kilo/z-ai/glm-5.3-flash', label: 'Z.ai: GLM 5.3 Flash' },
    { value: 'kilo/moonshotai/kimi-k3', label: 'MoonshotAI: Kimi K3' },
    { value: 'kilo/minimax/minimax-m3', label: 'MiniMax: MiniMax M3' },
    { value: 'kilo/bytedance-seed/seed-2-1-turbo', label: 'ByteDance Seed: Seed 2.1 Turbo Thinking' },
    { value: 'kilo/google/gemini-3-pro-image', label: 'Google: Nano Banana Pro (Gemini 3 Pro Image) Thinking' },
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
    { value: 'grok-4.6[effort=high,fast=true]', label: 'Cursor Grok 4.6 — High Fast' },
    { value: 'composer-2.5[fast=true]', label: 'Composer 2.5 — Fast' },
    { value: 'claude-opus-5[thinking=true,context=300k,effort=high,fast=false]', label: 'Claude Opus 5 — 300K High Thinking' },
    { value: 'gpt-5.6-sol[context=272k,reasoning=medium,fast=false]', label: 'GPT-5.6 Sol — 272K Medium' },
    { value: 'gemini-3.8-flash[reasoning_effort=high]', label: 'Gemini 3.8 Flash — High' },
    { value: 'muse-spark-1.3[context=300k,effort=high]', label: 'Muse Spark 1.3 — 300K High' },
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

export const PRODUCT_PROVIDER_DEFAULT_MODEL_PLACEHOLDERS = {
  antigravity: 'antigravity-default',
  cline: 'cline-default',
  muse: 'muse-default',
} as const;
