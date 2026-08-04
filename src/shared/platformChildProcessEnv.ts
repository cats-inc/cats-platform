const PLATFORM_AUTH_SESSION_SECRET_ENV_KEY = 'CATS_AUTH_SESSION_SECRET';

export function createPlatformChildProcessEnv(
  overrides: NodeJS.ProcessEnv = {},
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const childEnv = {
    ...baseEnv,
    ...overrides,
  };
  delete childEnv[PLATFORM_AUTH_SESSION_SECRET_ENV_KEY];
  return childEnv;
}
