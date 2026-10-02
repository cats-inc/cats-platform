import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function resolveDesktopWindowIconPath(
  appPath: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const relativePath = platform === 'win32'
    ? ['assets', 'window-icon.ico']
    : platform === 'linux'
      ? ['assets', 'window-icon.png']
      : null;

  if (!relativePath) {
    return null;
  }

  const candidate = resolve(appPath, ...relativePath);
  return existsSync(candidate) ? candidate : null;
}
