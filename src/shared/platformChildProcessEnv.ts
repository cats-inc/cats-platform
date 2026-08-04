// These credentials belong to the Cats host/platform, not to user-authored
// projects launched by Cats Code. `tests/platform-child-process-env.test.ts`
// keeps this list aligned with the credential entries documented in
// `.env.example`, so a new documented credential fails the suite until it is
// listed here rather than silently reaching a user project.
export const PLATFORM_OWNED_CREDENTIAL_ENV_KEYS = [
  'CATS_AUTH_SESSION_SECRET',
  'CATS_RUNTIME_API_KEY',
  'CATS_TELEGRAM_BOT_TOKEN',
  'CATS_TELEGRAM_WEBHOOK_SECRET',
  'CATS_NGROK_AUTHTOKEN',
  'NGROK_AUTHTOKEN',
] as const;

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
