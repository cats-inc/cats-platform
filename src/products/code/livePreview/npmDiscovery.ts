import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * Find npm's JavaScript entry (`npm-cli.js`) so a dev server can run as
 * `<node> npm-cli.js run <script>` without a shell (SPEC-123 CAP-07, PLAN-116
 * D3). `npm` itself is a `.cmd` shim on Windows, which needs a shell, and
 * packaged Desktop bundles no npm, so this looks for the user's installation:
 * - `npm_execpath`, when Platform itself was started through npm;
 * - beside the host runtime (a Node installation's own npm);
 * - every PATH directory, in the Windows layout (`<dir>/node_modules/npm`) and
 *   the POSIX prefix layout (`<dir>/../lib/node_modules/npm`).
 * The host runs the entry on its own runtime (`process.execPath`, as Node).
 */

export interface NpmDiscoveryEnvironment {
  env: NodeJS.ProcessEnv;
  execPath: string;
  platform: NodeJS.Platform;
  exists(filePath: string): boolean;
  realpath(filePath: string): string;
}

const NPM_CLI_SEGMENTS = ['node_modules', 'npm', 'bin', 'npm-cli.js'];

export function findNpmCli(environment: NpmDiscoveryEnvironment = currentEnvironment()): string | null {
  const pathModule = environment.platform === 'win32' ? path.win32 : path.posix;
  const candidates: string[] = [];
  const execPath = environment.env.npm_execpath;
  if (execPath && pathModule.basename(execPath) === 'npm-cli.js') candidates.push(execPath);
  const directories = [
    pathModule.dirname(environment.execPath),
    ...(environment.env.PATH ?? environment.env.Path ?? '').split(pathModule.delimiter),
  ].filter(Boolean);
  for (const directory of directories) {
    candidates.push(pathModule.join(directory, ...NPM_CLI_SEGMENTS));
    candidates.push(pathModule.join(directory, '..', 'lib', ...NPM_CLI_SEGMENTS));
  }
  for (const candidate of candidates) {
    if (!environment.exists(candidate)) continue;
    try {
      return environment.realpath(candidate);
    } catch {
      return candidate;
    }
  }
  return null;
}

function currentEnvironment(): NpmDiscoveryEnvironment {
  return {
    env: process.env,
    execPath: process.execPath,
    platform: process.platform,
    exists: existsSync,
    realpath: realpathSync,
  };
}
