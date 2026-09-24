import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

/** Acceptance storage identity only; this never grants development or release authority. */
export interface DesktopCandidateProfile {
  root: string;
  identity: string;
  appDataDir: string;
  userDataDir: string;
  homeDir: string;
  catsHomeDir: string;
  hostCwd: string;
  appCwd: string;
  runtimeCwd: string;
  appPort: number;
  runtimePort: number;
}

interface CandidateApp {
  getPath(name: string): string;
  setPath(name: string, value: string): void;
  setName(name: string): void;
  setAppUserModelId?(id: string): void;
  requestSingleInstanceLock(): boolean;
}

function canonicalPath(value: string): string {
  let ancestor = path.resolve(value);
  const missing: string[] = [];
  for (;;) {
    try {
      const resolved = realpathSync.native(ancestor);
      if (missing.length && !statSync(resolved).isDirectory()) {
        throw new Error('Candidate path ancestor must be a directory.');
      }
      return path.join(resolved, ...missing.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // A dangling link is not a safe missing directory to create later.
      try {
        if (lstatSync(ancestor).isSymbolicLink()) throw new Error('Candidate paths cannot use dangling links.');
      } catch (linkError) {
        if ((linkError as NodeJS.ErrnoException).code !== 'ENOENT') throw linkError;
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw new Error('Candidate path has no accessible ancestor.');
      missing.push(path.basename(ancestor));
      ancestor = parent;
    }
  }
}

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function within(root: string, value: string): boolean {
  const relative = path.relative(pathKey(root), pathKey(value));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..'
    && !relative.startsWith(`..${path.sep}`));
}

function readPort(env: NodeJS.ProcessEnv, desktopKey: string, serviceKey: string): number {
  const raw = env[desktopKey]?.trim() || env[serviceKey]?.trim();
  if (!raw || !/^\d+$/u.test(raw)) throw new Error(`Candidate launch requires explicit ${desktopKey}.`);
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || [8181, 3110].includes(port)) {
    throw new Error('Candidate ports must be valid non-default ports.');
  }
  if ([desktopKey, serviceKey].some((key) => env[key] !== undefined && env[key]?.trim() !== raw)) {
    throw new Error('Conflicting candidate listener overrides.');
  }
  return port;
}

function candidateEnvPaths(profile: DesktopCandidateProfile): Record<string, string> {
  const { root, homeDir, catsHomeDir } = profile;
  return {
    HOME: homeDir,
    USERPROFILE: homeDir,
    APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
    XDG_CONFIG_HOME: path.join(homeDir, '.config'),
    XDG_DATA_HOME: path.join(homeDir, '.local', 'share'),
    XDG_STATE_HOME: path.join(homeDir, '.local', 'state'),
    XDG_CACHE_HOME: path.join(homeDir, '.cache'),
    TEMP: path.join(root, 'tmp'),
    TMP: path.join(root, 'tmp'),
    TMPDIR: path.join(root, 'tmp'),
    CODEX_HOME: path.join(homeDir, '.codex'),
    CLAUDE_CONFIG_DIR: path.join(homeDir, '.claude'),
    CODEX_SESSIONS_DIR: path.join(homeDir, '.codex', 'sessions'),
    CLAUDE_PROJECTS_DIR: path.join(homeDir, '.claude', 'projects'),
    CLINE_SESSIONS_DIR: path.join(homeDir, '.cline', 'data', 'sessions'),
    GROK_SESSIONS_DIR: path.join(homeDir, '.grok', 'sessions'),
    GROK_HOME: path.join(homeDir, '.grok'),
    COPILOT_SESSIONS_DIR: path.join(homeDir, '.copilot', 'session-state'),
    AUGGIE_SESSIONS_DIR: path.join(homeDir, '.augment', 'sessions'),
    PI_SESSIONS_DIR: path.join(homeDir, '.pi', 'agent', 'sessions'),
    ANTIGRAVITY_SESSIONS_DIR: path.join(homeDir, '.gemini', 'antigravity-cli', 'conversations'),
    CURSOR_CHATS_DIR: path.join(homeDir, '.cursor', 'chats'),
    MUSE_SESSIONS_DIR: path.join(homeDir, '.local', 'share', 'muse', 'sessions'),
    CATS_PLATFORM_DIR: path.join(catsHomeDir, 'platform'),
    CATS_RUNTIME_DIR: path.join(catsHomeDir, 'runtime'),
    CATS_DESKTOP_DIR: path.join(catsHomeDir, 'desktop'),
    CATS_DESKTOP_PACKAGING_OUTPUT_ROOT: path.join(root, 'packaging'),
  };
}

export function assertDesktopCandidatePaths(profile: DesktopCandidateProfile): void {
  if (pathKey(canonicalPath(profile.root)) !== pathKey(profile.root)) {
    throw new Error('Candidate root changed after validation.');
  }
  for (const value of [profile.appDataDir, profile.userDataDir, profile.hostCwd,
    profile.appCwd, profile.runtimeCwd, path.join(profile.root, 'electron', 'crash-dumps'),
    ...[profile.hostCwd, profile.appCwd, profile.runtimeCwd,
      path.join(profile.catsHomeDir, 'desktop'), path.join(profile.catsHomeDir, 'platform', 'config'),
      path.join(profile.catsHomeDir, 'runtime', 'config')].map((directory) => path.join(directory, '.env')),
    path.join(profile.catsHomeDir, 'desktop', 'logs'),
    path.join(profile.catsHomeDir, 'desktop', 'state.json'),
    path.join(profile.catsHomeDir, 'platform', 'config'),
    path.join(profile.catsHomeDir, 'platform', 'state', 'chat-state.local.json'),
    path.join(profile.catsHomeDir, 'runtime', 'config', 'providers.yaml'),
    path.join(profile.catsHomeDir, 'runtime', 'data'),
    path.join(profile.catsHomeDir, 'runtime', 'sessions'),
    ...Object.values(candidateEnvPaths(profile))]) {
    if (!within(profile.root, canonicalPath(value))) throw new Error('Candidate data path escapes its root.');
  }
}

export function resolveDesktopCandidateProfile(input: {
  env: NodeJS.ProcessEnv;
  normalCatsHomeDir: string;
  normalElectronDirs: string[];
}): DesktopCandidateProfile | null {
  const raw = input.env.CATS_DESKTOP_CANDIDATE_ROOT;
  if (raw === undefined) return null;
  if (!raw.trim() || !path.isAbsolute(raw.trim())) throw new Error('Candidate root must be an absolute non-root path.');
  const root = canonicalPath(raw.trim());
  if (path.dirname(root) === root) throw new Error('Candidate root cannot be a filesystem root.');
  for (const normalPath of [input.normalCatsHomeDir, ...input.normalElectronDirs]) {
    const normal = canonicalPath(normalPath);
    if (within(root, normal) || within(normal, root)) throw new Error('Candidate root overlaps normal Cats or Electron data.');
  }
  for (const [desktopKey, serviceKey] of [
    ['CATS_DESKTOP_APP_HOST', 'CATS_HOST'], ['CATS_DESKTOP_RUNTIME_HOST', 'CATS_RUNTIME_HOST'],
  ]) {
    if ((input.env[desktopKey!] || input.env[serviceKey!])?.trim() !== '127.0.0.1'
      || [desktopKey!, serviceKey!].some((key) => input.env[key] !== undefined && input.env[key]?.trim() !== '127.0.0.1')) {
      throw new Error('Candidate listeners must explicitly bind 127.0.0.1.');
    }
  }
  const appPort = readPort(input.env, 'CATS_DESKTOP_APP_PORT', 'CATS_PORT');
  const runtimePort = readPort(input.env, 'CATS_DESKTOP_RUNTIME_PORT', 'CATS_RUNTIME_PORT');
  if (appPort === runtimePort) throw new Error('Candidate services require distinct ports.');
  const runtimeUrl = input.env.CATS_RUNTIME_BASE_URL?.trim();
  if (runtimeUrl && runtimeUrl !== `http://127.0.0.1:${runtimePort}`) {
    throw new Error('Candidate Runtime endpoint conflicts with its private listener.');
  }
  const profile: DesktopCandidateProfile = {
    root,
    identity: `io.catsinc.cats.candidate.${createHash('sha256').update(pathKey(root)).digest('hex').slice(0, 16)}`,
    appDataDir: path.join(root, 'electron', 'app-data'),
    userDataDir: path.join(root, 'electron', 'user-data'),
    homeDir: path.join(root, 'home'),
    catsHomeDir: path.join(root, 'cats'),
    hostCwd: path.join(root, 'cwd', 'desktop'),
    appCwd: path.join(root, 'cwd', 'platform'),
    runtimeCwd: path.join(root, 'cwd', 'runtime'),
    appPort,
    runtimePort,
  };
  for (const [key, expected] of Object.entries(candidateEnvPaths(profile))) {
    // A new home replaces the inherited OS/provider home. Explicit Cats storage
    // overrides, however, must not silently point at another profile.
    if (key.startsWith('CATS_') && input.env[key] !== undefined
      && (!path.isAbsolute(input.env[key]!) || pathKey(canonicalPath(input.env[key]!)) !== pathKey(expected))) {
      throw new Error(`Conflicting candidate data override: ${key}.`);
    }
  }
  for (const key of ['CATS_RUNTIME_ENV_FILE', 'CATS_RUNTIME_CATALOG_CONFIG_PATH', 'CATS_PROVIDER_CAPABILITY_BOOTSTRAP_CONFIG']) {
    const value = input.env[key]?.trim();
    if (value && (!path.isAbsolute(value) || !within(root, canonicalPath(value)))) {
      throw new Error(`Candidate configuration must stay inside its root: ${key}.`);
    }
  }
  assertDesktopCandidatePaths(profile);
  return profile;
}

export function createDesktopCandidateEnv(profile: DesktopCandidateProfile, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  assertDesktopCandidatePaths(profile);
  const result: NodeJS.ProcessEnv = { ...env, ...candidateEnvPaths(profile),
    CATS_DESKTOP_CANDIDATE_ROOT: profile.root,
    CATS_DESKTOP_APP_HOST: '127.0.0.1', CATS_HOST: '127.0.0.1',
    CATS_DESKTOP_RUNTIME_HOST: '127.0.0.1', CATS_RUNTIME_HOST: '127.0.0.1',
    CATS_DESKTOP_APP_PORT: String(profile.appPort), CATS_PORT: String(profile.appPort),
    CATS_DESKTOP_RUNTIME_PORT: String(profile.runtimePort), CATS_RUNTIME_PORT: String(profile.runtimePort),
    CATS_RUNTIME_BASE_URL: `http://127.0.0.1:${profile.runtimePort}`,
    CATS_RUNTIME_NATIVE_DISCOVERY_INTERVAL_MS: '0',
    CATS_DESKTOP_MOBILE_PAIRING_ENABLED: 'false',
    CATS_DESKTOP_UPDATE_CHECK_ON_STARTUP: 'false',
    CATS_DESKTOP_FORCE_QUIT_ON_CLOSE: 'true',
  };
  // Let the candidate Platform provision its own cookie signing secret.
  delete result.CATS_AUTH_SESSION_SECRET;
  // This is a file override, unlike the history directories above.
  result.KIRO_DB_PATH = path.join(profile.homeDir, process.platform === 'win32' ? 'AppData/Local' :
    process.platform === 'darwin' ? 'Library/Application Support' : '.local/share', 'kiro-cli', 'data.sqlite3');
  return result;
}

/** All path/identity changes happen synchronously before Electron takes its lock. */
export function initializeDesktopLaunch(app: CandidateApp, input: {
  env: NodeJS.ProcessEnv;
  normalCatsHomeDir: string;
  normalUserDataDir: string;
  loadNormalEnvFiles(): unknown;
  changeCwd(cwd: string): void;
}): { candidate: DesktopCandidateProfile | null; gotLock: boolean } {
  const candidate = resolveDesktopCandidateProfile({
    env: input.env,
    normalCatsHomeDir: input.normalCatsHomeDir,
    normalElectronDirs: [input.normalUserDataDir, app.getPath('appData'), app.getPath('userData'), app.getPath('sessionData')],
  });
  if (candidate) {
    const env = createDesktopCandidateEnv(candidate, input.env);
    for (const directory of new Set([candidate.appDataDir, candidate.userDataDir, candidate.hostCwd,
      candidate.appCwd, candidate.runtimeCwd, path.join(candidate.root, 'electron', 'crash-dumps'),
      path.join(candidate.catsHomeDir, 'desktop', 'logs'), ...Object.values(candidateEnvPaths(candidate))])) {
      mkdirSync(directory, { recursive: true });
    }
    assertDesktopCandidatePaths(candidate);
    app.setName(`Cats Candidate ${candidate.identity.split('.').at(-1)}`);
    app.setPath('appData', candidate.appDataDir);
    app.setPath('userData', candidate.userDataDir);
    app.setPath('sessionData', candidate.userDataDir);
    app.setPath('home', candidate.homeDir);
    app.setPath('temp', env.TEMP!);
    app.setPath('logs', path.join(candidate.catsHomeDir, 'desktop', 'logs'));
    app.setPath('crashDumps', path.join(candidate.root, 'electron', 'crash-dumps'));
    if (process.platform === 'win32') app.setAppUserModelId?.(candidate.identity);
    delete input.env.CATS_AUTH_SESSION_SECRET;
    // Electron paths above own host storage. Keep the original OS/provider home
    // environment in the host so app.relaunch() validates against the same
    // normal roots. Managed sidecars receive the fully isolated environment.
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith('CATS_') || ['TEMP', 'TMP', 'TMPDIR'].includes(key)) input.env[key] = value;
    }
    input.changeCwd(candidate.hostCwd);
  } else {
    input.loadNormalEnvFiles();
  }
  const gotLock = app.requestSingleInstanceLock();
  if (gotLock && !candidate) app.setPath('userData', input.normalUserDataDir);
  return { candidate, gotLock };
}

/** Preflight only: the sidecars still must successfully bind their own sockets. */
export async function assertDesktopCandidatePortsAvailable(profile: DesktopCandidateProfile): Promise<void> {
  for (const port of [profile.appPort, profile.runtimePort]) {
    await assertDesktopCandidatePortAvailable(port);
  }
}

export async function assertDesktopCandidatePortAvailable(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Candidate port ${port} is unavailable.`)));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close((error) => error ? reject(error) : resolve()));
  });
}

export function assertDesktopCandidateActionAllowed(profile: DesktopCandidateProfile | null | undefined, action: string): void {
  if (profile && ['setup-helper', 'resume_setup', 'provider-install', 'packaging', 'update', 'mobile-pairing'].includes(action)) {
    throw new Error(`This action is unavailable in a candidate profile: ${action}.`);
  }
}
