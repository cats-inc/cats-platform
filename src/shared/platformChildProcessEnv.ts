// These credentials belong to the Cats host/platform, not to user-authored
// projects launched by Cats Code. Keep this list aligned with platform-owned
// credentials documented in `.env.example`.
const PLATFORM_OWNED_CREDENTIAL_ENV_KEYS: readonly string[] = Object.freeze([
  'CATS_AUTH_SESSION_SECRET',
  'CATS_RUNTIME_API_KEY',
  'CATS_TELEGRAM_BOT_TOKEN',
  'CATS_TELEGRAM_WEBHOOK_SECRET',
  'CATS_NGROK_AUTHTOKEN',
  'NGROK_AUTHTOKEN',
]);

export function createPlatformChildProcessEnv(
  overrides: NodeJS.ProcessEnv = {},
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const childEnv = {
    ...baseEnv,
    ...overrides,
  };
  for (const key of PLATFORM_OWNED_CREDENTIAL_ENV_KEYS) {
    delete childEnv[key];
  }
  return childEnv;
}
