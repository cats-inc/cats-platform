import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { access, appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, posix, win32 } from 'node:path';

import type { DesktopHostConfig } from './config.js';
import type { ManagedServiceName, ManagedServiceSnapshot } from './contracts.js';
import {
  waitForServiceReadiness,
  type AppHealthPayload,
  type RuntimeDiagnosticsHealthPayload,
} from './readiness.js';

export interface ManagedServiceSpec {
  name: ManagedServiceName;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  healthUrl: string;
  logPath: string;
}

interface ManagedServiceHandle {
  child: ChildProcessWithoutNullStreams | null;
  snapshot: ManagedServiceSnapshot;
  expectedExit: boolean;
}

interface ProcessSupervisorDependencies {
  spawn?: typeof spawn;
  now?: () => Date;
  platform?: NodeJS.Platform;
  waitForServiceReadiness?: typeof waitForServiceReadiness;
  onStateChange?: (snapshot: ManagedServiceSnapshot) => void;
}

interface ManagedServiceLifecyclePayload {
  event?: string;
  service?: string;
  phase?: string;
  ready?: boolean;
  error?: string;
}

const DEFAULT_APP_STARTUP_TIMEOUT_MS = 90_000;
const DEFAULT_WINDOWS_RUNTIME_STARTUP_TIMEOUT_MS = 60_000;
const RUNTIME_TEMPLATE_SEED_STATE_FILE_NAME = '.bundled-template-seeds.json';
const LEGACY_CURATED_TEMPLATE_SOURCE_HASHES = [
  '04519fcae77681ce2bf4bd231218163fca82611a0e95cf8c52f29c767ec72b7e',
  'c71d76e3a994f623c0b921c7f41b516e3cfd4ac81820d4ad65e2668ac0f7f31b',
  'c5cdbcf3f5ff72d38345fee84ed1973e9a2f5d2f043d1be607c776e7b72a4875',
  'c64eada9a5e52f7ebe7481f3db16bc11aca1b5e3a62bb1124f8cf5c1b0ec4752',
  'e79ed7703e1a61d0c1364f0248a9b795244ce899326e3910f135e68d7ca0b16e',
  '036e115a93c3eae0f8c559499fb27882d3584f872bcd15b2d5087b1689360ce9',
  '084c0cd9fa674cf9baa5f16b3d0c2272750d820a36a3a85333d7ae6651ea8030',
  '923fa9d179293ded5635f517fa2c14f87d9c644c163b2db1ec2f38f38d1dfe5e',
  '7b4a1ff8a3575b197b42433a5fefec5eb9fd001c84368625d6586ce7b88e618d',
  'd76e5557f8c7bf2ab5d3c1cec410d0bd4f8a811f383f7e9c42279a3e700e95d6',
  'aadb2b740389eacd215844b64a9a6a06a46c0ba833cfa64255af1cda7f699ba9',
  '8b7484427ef9638ef3f0d5a594ab1171e6ed66f5ceb1b5bd377e565877e3b0bf',
  '21c29f808c277c8f1192de2c75c5dd64027c29668c6ac5d7da68451a4d1788bb',
  'af7ca217713399c077c46dcfedf4ef6bb62d1337f31e64b8f49aff25289aeb5b',
  '85104967b99b1c4e006c781712237fade6a93c2598df1d5107a5706679617855',
  'b0cb21b068b127168b1e59a245ce5322bae6c3189880cfe82d4abc77a4fe8b83',
  '5f409b315aca5569568a05a0ecad3706cbb077bcfa316a2e3abeacb572305869',
  '749083d483fea9f0e38b138183b5cab3d56c289ebd3acddde9c059e02116fc81',
] as const;

interface RuntimeTemplateSeedMetadataEntry {
  sourceHash: string;
  updatedAt: string;
}

type RuntimeTemplateSeedMetadata = Record<string, RuntimeTemplateSeedMetadataEntry>;

const RUNTIME_TEMPLATE_SEEDS = [
  {
    sourceFileName: 'management.yaml.example',
    targetPathKey: 'runtimeManagementConfigPath',
    allowManagedRefresh: false,
  },
  {
    sourceFileName: 'curated-model-catalogs.yaml.example',
    targetPathKey: 'runtimeCuratedModelCatalogPath',
    allowManagedRefresh: true,
    legacyManagedSourceHashes: LEGACY_CURATED_TEMPLATE_SOURCE_HASHES,
  },
] as const;

function waitForTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createStartupDeadlinePromise(serviceName: ManagedServiceName, timeoutMs: number): {
  promise: Promise<never>;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    promise: new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${serviceName} startup after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

function writeTaggedOutput(
  stream: NodeJS.WriteStream,
  serviceName: ManagedServiceName,
  chunk: Buffer,
): void {
  const text = chunk.toString('utf8');
  const normalized = text.replace(/\r?\n$/u, '');
  if (!normalized) {
    return;
  }
  stream.write(`[${serviceName}] ${normalized}\n`);
}

function createInitialSnapshot(
  name: ManagedServiceName,
  healthUrl: string,
  logPath: string,
): ManagedServiceSnapshot {
  return {
    name,
    status: 'stopped',
    ready: false,
    pid: null,
    startedAt: null,
    healthUrl,
    error: null,
    exitCode: null,
    logPath,
    lastOutput: null,
    lastOutputAt: null,
  };
}

function parseManagedServiceLifecycleLine(
  serviceName: ManagedServiceName,
  line: string,
): ManagedServiceLifecyclePayload | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as ManagedServiceLifecyclePayload;
    if (typeof parsed.service !== 'string') {
      return null;
    }
    if (parsed.service !== serviceName) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getManagedServiceStartupTimeoutMs(
  serviceName: ManagedServiceName,
  readinessTimeoutMs: number,
  platform: NodeJS.Platform,
): number {
  if (serviceName === 'cats-platform') {
    return Math.max(readinessTimeoutMs, DEFAULT_APP_STARTUP_TIMEOUT_MS);
  }
  if (serviceName === 'cats-runtime' && platform === 'win32') {
    // Windows login startup can take longer while runtime discovery rehydrates sessions.
    return Math.max(readinessTimeoutMs, DEFAULT_WINDOWS_RUNTIME_STARTUP_TIMEOUT_MS);
  }
  return readinessTimeoutMs;
}

async function ensureLaunchAssets(config: DesktopHostConfig): Promise<void> {
  await access(config.paths.appEntryScript);
  await access(config.paths.runtimeEntryScript);
  await access(config.paths.preloadScript);
  await mkdir(dirname(config.paths.appStatePath), { recursive: true });
  await mkdir(config.paths.runtimeDataDir, { recursive: true });
  await mkdir(config.paths.runtimeSessionBaseDir, { recursive: true });
  await mkdir(dirname(config.paths.runtimeConfigPath), { recursive: true });
  await mkdir(config.paths.hostLogsDir, { recursive: true });
  await seedBundledRuntimeConfigTemplates(config);
}

function resolveRuntimeTemplateSeedStatePath(config: DesktopHostConfig): string {
  return join(dirname(config.paths.runtimeConfigPath), RUNTIME_TEMPLATE_SEED_STATE_FILE_NAME);
}

function computeTemplateSourceHash(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

async function readRuntimeTemplateSeedMetadata(
  config: DesktopHostConfig,
): Promise<RuntimeTemplateSeedMetadata> {
  const filePath = resolveRuntimeTemplateSeedStatePath(config);
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const metadata: RuntimeTemplateSeedMetadata = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }
      const entry = value as Record<string, unknown>;
      const sourceHash = typeof entry.sourceHash === 'string' ? entry.sourceHash.trim() : '';
      const updatedAt = typeof entry.updatedAt === 'string' ? entry.updatedAt.trim() : '';
      if (!sourceHash || !updatedAt) {
        continue;
      }
      metadata[key] = { sourceHash, updatedAt };
    }
    return metadata;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    return {};
  }
}

async function writeRuntimeTemplateSeedMetadata(
  config: DesktopHostConfig,
  metadata: RuntimeTemplateSeedMetadata,
): Promise<void> {
  const filePath = resolveRuntimeTemplateSeedStatePath(config);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

export function shouldRefreshManagedSeedTemplate(input: {
  allowManagedRefresh: boolean;
  currentHash: string;
  sourceHash: string;
  recordedSourceHash?: string | null;
  legacyManagedSourceHashes?: readonly string[];
}): boolean {
  if (!input.allowManagedRefresh || input.currentHash === input.sourceHash) {
    return false;
  }

  if (input.recordedSourceHash && input.currentHash === input.recordedSourceHash) {
    return true;
  }

  return Boolean(input.legacyManagedSourceHashes?.includes(input.currentHash));
}

export async function seedBundledRuntimeConfigTemplates(
  config: DesktopHostConfig,
): Promise<void> {
  if (!config.packaged) {
    return;
  }

  const seedMetadata = await readRuntimeTemplateSeedMetadata(config);
  let metadataChanged = false;

  for (const seed of RUNTIME_TEMPLATE_SEEDS) {
    const sourcePath = join(config.runtimePackageRoot, 'config', seed.sourceFileName);
    try {
      await access(sourcePath);
    } catch {
      continue;
    }

    const sourceRaw = await readFile(sourcePath, 'utf8');
    const sourceHash = computeTemplateSourceHash(sourceRaw);
    const targetPath = config.paths[seed.targetPathKey];
    try {
      await access(targetPath);
    } catch {
      await mkdir(dirname(targetPath), { recursive: true });
      try {
        await writeFile(targetPath, sourceRaw, { encoding: 'utf8', flag: 'wx' });
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) {
          throw error;
        }
      }
      seedMetadata[seed.sourceFileName] = {
        sourceHash,
        updatedAt: new Date().toISOString(),
      };
      metadataChanged = true;
      continue;
    }

    const currentRaw = await readFile(targetPath, 'utf8');
    const currentHash = computeTemplateSourceHash(currentRaw);
    const recordedSourceHash = seedMetadata[seed.sourceFileName]?.sourceHash ?? null;

    if (currentHash === sourceHash) {
      if (recordedSourceHash !== sourceHash) {
        seedMetadata[seed.sourceFileName] = {
          sourceHash,
          updatedAt: new Date().toISOString(),
        };
        metadataChanged = true;
      }
      continue;
    }

    if (!shouldRefreshManagedSeedTemplate({
      allowManagedRefresh: seed.allowManagedRefresh,
      currentHash,
      sourceHash,
      recordedSourceHash,
      legacyManagedSourceHashes: 'legacyManagedSourceHashes' in seed
        ? seed.legacyManagedSourceHashes
        : undefined,
    })) {
      continue;
    }

    await writeFile(targetPath, sourceRaw, 'utf8');
    seedMetadata[seed.sourceFileName] = {
      sourceHash,
      updatedAt: new Date().toISOString(),
    };
    metadataChanged = true;
  }

  if (metadataChanged) {
    await writeRuntimeTemplateSeedMetadata(config, seedMetadata);
  }
}

function buildPreviousLogPath(logPath: string): string {
  return `${logPath}.previous`;
}

export async function prepareManagedServiceLog(logPath: string): Promise<void> {
  await mkdir(dirname(logPath), { recursive: true });
  const previousLogPath = buildPreviousLogPath(logPath);
  await rm(previousLogPath, { force: true });
  try {
    await rename(logPath, previousLogPath);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
  await writeFile(logPath, '', 'utf8');
}

function resolvePathEnvKey(env: NodeJS.ProcessEnv): string {
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') {
      return key;
    }
  }
  return 'PATH';
}

function normalizePathEntries(
  entries: string[],
  platform: NodeJS.Platform,
): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    const dedupeKey = platform === 'win32'
      ? trimmed.toLowerCase()
      : trimmed;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalized.push(trimmed);
  }

  return normalized;
}

function readFirstNonEmptyLine(filePath: string): string | null {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean) || null;
  } catch {
    return null;
  }
}

function normalizeUnixPath(value: string): string {
  return value.replace(/\\/gu, '/');
}

function normalizeNvmVersion(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
  return /^v\d+(?:\.\d+){0,2}$/u.test(normalized) ? normalized : null;
}

function resolveUnixNvmDefaultVersion(nvmDir: string): string | null {
  const seen = new Set<string>();
  let current = 'default';

  while (current && !seen.has(current)) {
    seen.add(current);
    const directVersion = normalizeNvmVersion(current);
    if (directVersion) {
      return directVersion;
    }

    const next = readFirstNonEmptyLine(posix.join(nvmDir, 'alias', ...current.split('/')));
    if (!next) {
      return null;
    }

    current = next.replace(/^->\s*/u, '').trim();
  }

  return null;
}

function resolveUnixNvmPathEntries(
  env: NodeJS.ProcessEnv,
  home: string,
): string[] {
  const entries: string[] = [];
  const nvmBin = env.NVM_BIN?.trim() ? normalizeUnixPath(env.NVM_BIN.trim()) : '';
  if (nvmBin && existsSync(nvmBin)) {
    entries.push(nvmBin);
  }

  const normalizedHome = normalizeUnixPath(home);
  const nvmDir = env.NVM_DIR?.trim()
    ? normalizeUnixPath(env.NVM_DIR.trim())
    : posix.join(normalizedHome, '.nvm');
  const defaultVersion = resolveUnixNvmDefaultVersion(nvmDir);
  if (!defaultVersion) {
    return entries;
  }

  const defaultBin = posix.join(nvmDir, 'versions', 'node', defaultVersion, 'bin');
  if (existsSync(defaultBin)) {
    entries.push(defaultBin);
  }

  return entries;
}

function resolveManagedServicePathEntries(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  const pathKey = resolvePathEnvKey(env);
  const pathDelimiter = platform === 'win32' ? ';' : ':';
  const pathModule = platform === 'win32' ? win32 : posix;
  const existing = (env[pathKey] ?? '').split(pathDelimiter);
  const home = env.HOME?.trim() || env.USERPROFILE?.trim() || '';
  const normalizedHome = platform === 'win32' ? home : normalizeUnixPath(home);
  const homeScopedEntries = home
    ? [
        pathModule.join(normalizedHome, '.local', 'bin'),
        pathModule.join(normalizedHome, '.npm-global', 'bin'),
        pathModule.join(normalizedHome, 'bin'),
      ]
    : [];
  const nvmPathEntries = home && (platform === 'darwin' || platform === 'linux')
    ? resolveUnixNvmPathEntries(env, normalizedHome)
    : [];

  if (platform === 'darwin') {
    return normalizePathEntries([
      ...existing,
      ...nvmPathEntries,
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/local/sbin',
      ...homeScopedEntries,
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ], platform);
  }

  if (platform === 'linux') {
    return normalizePathEntries([
      ...existing,
      ...nvmPathEntries,
      '/usr/local/bin',
      '/usr/local/sbin',
      ...homeScopedEntries,
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ], platform);
  }

  return normalizePathEntries(existing, platform);
}

function createManagedServiceEnv(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv {
  const pathKey = resolvePathEnvKey(env);
  const pathDelimiter = platform === 'win32' ? ';' : ':';
  const nextEnv = { ...env };

  for (const key of Object.keys(nextEnv)) {
    if (key !== pathKey && key.toLowerCase() === 'path') {
      delete nextEnv[key];
    }
  }

  nextEnv[pathKey] = resolveManagedServicePathEntries(env, platform).join(pathDelimiter);
  return nextEnv;
}

export function buildManagedServiceSpecs(
  config: DesktopHostConfig,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): ManagedServiceSpec[] {
  const managedEnv = createManagedServiceEnv(env, platform);
  const pathModule = platform === 'win32' ? win32 : posix;

  return [
    {
      name: 'cats-runtime',
      command: process.execPath,
      args: [
        config.paths.runtimeEntryScript,
        '--startup-mode=app-managed',
        '--managed-by=cats-electron',
        '--ready-output=json',
      ],
      cwd: config.runtimePackageRoot,
      env: {
        ...managedEnv,
        ELECTRON_RUN_AS_NODE: '1',
        CATS_RUNTIME_DIR: config.paths.runtimeRootDir,
        CATS_RUNTIME_PACKAGE_ROOT: config.runtimePackageRoot,
        CATS_RUNTIME_HOST: config.runtimeHost,
        CATS_RUNTIME_PORT: String(config.runtimePort),
      },
      healthUrl: `${config.runtimeBaseUrl}/health`,
      logPath: join(config.paths.hostLogsDir, 'cats-runtime.log'),
    },
    {
      name: 'cats-platform',
      command: process.execPath,
      args: [
        config.paths.appEntryScript,
        '--startup-mode=app-managed',
        '--managed-by=cats-electron',
        '--ready-output=json',
      ],
      cwd: config.packageRoot,
      env: {
        ...managedEnv,
        ELECTRON_RUN_AS_NODE: '1',
        CATS_HOST: config.appHost,
        CATS_PORT: String(config.appPort),
        CATS_PLATFORM_DIR: config.paths.platformDir,
        CATS_DESKTOP_DIR: pathModule.dirname(config.paths.hostStatePath),
        CATS_RUNTIME_DIR: config.paths.runtimeRootDir,
        CATS_RUNTIME_BASE_URL: config.runtimeBaseUrl,
      },
      healthUrl: `${config.appBaseUrl}/health`,
      logPath: join(config.paths.hostLogsDir, 'cats.log'),
    },
  ];
}

export class ManagedServiceSupervisor {
  private readonly handles = new Map<ManagedServiceName, ManagedServiceHandle>();

  private readonly shutdownOrder: ManagedServiceName[];

  private readonly spawnImpl: typeof spawn;

  private readonly now: () => Date;

  private readonly waitForReadiness: typeof waitForServiceReadiness;

  private readonly onStateChange?: (snapshot: ManagedServiceSnapshot) => void;

  private readonly platform: NodeJS.Platform;

  private readonly logQueues = new Map<ManagedServiceName, Promise<void>>();

  constructor(
    private readonly config: DesktopHostConfig,
    private readonly dependencies: ProcessSupervisorDependencies = {},
  ) {
    this.platform = dependencies.platform ?? process.platform;
    const specs = buildManagedServiceSpecs(config, process.env, this.platform);
    this.spawnImpl = dependencies.spawn ?? spawn;
    this.now = dependencies.now ?? (() => new Date());
    this.waitForReadiness = dependencies.waitForServiceReadiness ?? waitForServiceReadiness;
    this.onStateChange = dependencies.onStateChange;
    this.shutdownOrder = specs.map((spec) => spec.name).reverse();

    for (const spec of specs) {
      this.handles.set(spec.name, {
        child: null,
        snapshot: createInitialSnapshot(spec.name, spec.healthUrl, spec.logPath),
        expectedExit: false,
      });
      this.logQueues.set(spec.name, Promise.resolve());
    }
  }

  getSnapshots(): ManagedServiceSnapshot[] {
    return Array.from(this.handles.values()).map((handle) => ({ ...handle.snapshot }));
  }

  async startAll(): Promise<void> {
    await ensureLaunchAssets(this.config);
    const specs = buildManagedServiceSpecs(this.config, process.env, this.platform);
    for (const spec of specs) {
      await this.startService(spec);
    }
  }

  async stopAll(): Promise<void> {
    for (const name of this.shutdownOrder) {
      await this.stopService(name);
    }
  }

  private updateSnapshot(name: ManagedServiceName, update: Partial<ManagedServiceSnapshot>): void {
    const handle = this.handles.get(name);
    if (!handle) {
      return;
    }
    handle.snapshot = {
      ...handle.snapshot,
      ...update,
    };
    this.onStateChange?.({ ...handle.snapshot });
  }

  private queueLogWrite(
    serviceName: ManagedServiceName,
    logPath: string,
    line: string,
  ): void {
    const previous = this.logQueues.get(serviceName) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await appendFile(logPath, line, 'utf8');
      });
    this.logQueues.set(serviceName, next.catch(() => undefined));
  }

  private recordServiceOutput(
    serviceName: ManagedServiceName,
    logPath: string,
    text: string,
    stream: 'stdout' | 'stderr',
  ): void {
    const lines = text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      return;
    }

    const timestamp = this.now().toISOString();
    for (const line of lines) {
      this.queueLogWrite(
        serviceName,
        logPath,
        `[${timestamp}] [${stream}] ${line}\n`,
      );
    }

    this.updateSnapshot(serviceName, {
      lastOutput: lines[lines.length - 1] ?? null,
      lastOutputAt: timestamp,
    });
  }

  private async startService(spec: ManagedServiceSpec): Promise<void> {
    const handle = this.handles.get(spec.name);
    if (!handle) {
      throw new Error(`Unknown managed service: ${spec.name}`);
    }
    if (handle.child && handle.child.exitCode === null && handle.child.signalCode === null) {
      return;
    }

    await (this.logQueues.get(spec.name) ?? Promise.resolve()).catch(() => undefined);
    await prepareManagedServiceLog(spec.logPath);

    handle.expectedExit = false;
    this.updateSnapshot(spec.name, {
      status: 'starting',
      ready: false,
      pid: null,
      startedAt: this.now().toISOString(),
      error: null,
      exitCode: null,
      logPath: spec.logPath,
      lastOutput: null,
      lastOutputAt: null,
    });
    this.queueLogWrite(
      spec.name,
      spec.logPath,
      `\n[${this.now().toISOString()}] [host] starting ${spec.name} (${spec.command} ${spec.args.join(' ')})\n`,
    );
    const startupMeasurementStartedAtMs = this.now().getTime();

    const envFingerprint = {
      ELECTRON_RUN_AS_NODE: spec.env.ELECTRON_RUN_AS_NODE,
      CATS_RUNTIME_DIR: spec.env.CATS_RUNTIME_DIR,
      CATS_RUNTIME_PACKAGE_ROOT: spec.env.CATS_RUNTIME_PACKAGE_ROOT,
      CATS_PLATFORM_DIR: spec.env.CATS_PLATFORM_DIR,
    };
    this.queueLogWrite(
      spec.name,
      spec.logPath,
      `[${this.now().toISOString()}] [host] spawning ${spec.name} with command=${spec.command} `
        + `args=[${spec.args.join(', ')}] cwd=${spec.cwd} envFingerprint=${JSON.stringify(envFingerprint)}\n`,
    );

    const child = this.spawnImpl(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;

    let resolveLifecycleReady: (() => void) | null = null;
    let rejectLifecycleReady: ((error: Error) => void) | null = null;
    const lifecycleReady = new Promise<void>((resolve, reject) => {
      resolveLifecycleReady = resolve;
      rejectLifecycleReady = reject;
    });

    handle.child = child;
    this.updateSnapshot(spec.name, {
      pid: child.pid ?? null,
    });
    this.queueLogWrite(
      spec.name,
      spec.logPath,
      `[${this.now().toISOString()}] [host] spawned ${spec.name} pid=${child.pid ?? 'unknown'} `
        + `after ${Math.max(0, this.now().getTime() - startupMeasurementStartedAtMs)}ms\n`,
    );

    let firstStdoutObserved = false;
    let firstStderrObserved = false;

    const recordFirstStream = (stream: 'stdout' | 'stderr') => {
      const firstObserved = stream === 'stdout' ? firstStdoutObserved : firstStderrObserved;
      if (firstObserved) {
        return;
      }
      if (stream === 'stdout') {
        firstStdoutObserved = true;
      } else {
        firstStderrObserved = true;
      }
      this.queueLogWrite(
        spec.name,
        spec.logPath,
        `[${this.now().toISOString()}] [host] first ${stream} from ${spec.name} `
          + `after ${Math.max(0, this.now().getTime() - startupMeasurementStartedAtMs)}ms\n`,
      );
    };

    child.stdout.on('data', (chunk) => {
      recordFirstStream('stdout');
      const text = (chunk as Buffer).toString('utf8');
      writeTaggedOutput(process.stdout, spec.name, chunk as Buffer);
      this.recordServiceOutput(spec.name, spec.logPath, text, 'stdout');

      for (const line of text.split(/\r?\n/u)) {
        const lifecycle = parseManagedServiceLifecycleLine(spec.name, line);
        if (!lifecycle) {
          continue;
        }
        if (lifecycle.ready === true && lifecycle.phase === 'ready') {
          this.updateSnapshot(spec.name, {
            status: 'ready',
            ready: true,
            error: null,
          });
          resolveLifecycleReady?.();
          continue;
        }
        if (typeof lifecycle.error === 'string' && lifecycle.error.trim().length > 0) {
          rejectLifecycleReady?.(new Error(lifecycle.error));
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      recordFirstStream('stderr');
      writeTaggedOutput(process.stderr, spec.name, chunk as Buffer);
      this.recordServiceOutput(spec.name, spec.logPath, (chunk as Buffer).toString('utf8'), 'stderr');
    });
    child.on('exit', (code, signal) => {
      const exitMessage = handle.expectedExit
        ? `${spec.name} exited after host shutdown.`
        : `${spec.name} exited before readiness (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`;
      this.queueLogWrite(
        spec.name,
        spec.logPath,
        `[${this.now().toISOString()}] [host] ${exitMessage}\n`,
      );
      this.updateSnapshot(spec.name, {
        status: handle.expectedExit ? 'stopped' : 'failed',
        ready: false,
        pid: null,
        exitCode: typeof code === 'number' ? code : null,
        error: handle.expectedExit ? null : exitMessage,
      });
      handle.child = null;
    });

    let exitBeforeReadyListener: ((code: number | null, signal: NodeJS.Signals | null) => void)
      | null = null;
    const exitBeforeReady = new Promise<never>((_resolve, reject) => {
      exitBeforeReadyListener = (code, signal) => {
        reject(new Error(
          `${spec.name} exited before readiness (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`,
        ));
      };
      child.once('exit', exitBeforeReadyListener);
    });

    const readinessPromise = spec.name === 'cats-platform'
      ? this.waitForReadiness<AppHealthPayload>(spec.healthUrl, {
        timeoutMs: this.config.readinessTimeoutMs,
        pollIntervalMs: this.config.readinessPollIntervalMs,
      })
      : this.waitForReadiness<RuntimeDiagnosticsHealthPayload>(spec.healthUrl, {
        timeoutMs: this.config.readinessTimeoutMs,
        pollIntervalMs: this.config.readinessPollIntervalMs,
      });
    const startupTimeoutMs = getManagedServiceStartupTimeoutMs(
      spec.name,
      this.config.readinessTimeoutMs,
      this.platform,
    );
    const startupDeadline = createStartupDeadlinePromise(spec.name, startupTimeoutMs);
    const readinessOutcomePromise = Promise.any([
      readinessPromise.then(() => 'health' as const),
      lifecycleReady.then(() => 'lifecycle' as const),
    ]);

    try {
      const readinessSource = await Promise.race([
        readinessOutcomePromise,
        exitBeforeReady,
        startupDeadline.promise,
      ]);
      this.queueLogWrite(
        spec.name,
        spec.logPath,
        `[${this.now().toISOString()}] [host] ${spec.name} ready via ${readinessSource} `
          + `after ${Math.max(0, this.now().getTime() - startupMeasurementStartedAtMs)}ms\n`,
      );
      this.updateSnapshot(spec.name, {
        status: 'ready',
        ready: true,
        error: null,
      });
    } catch (error) {
      this.updateSnapshot(spec.name, {
        status: 'failed',
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      startupDeadline.cancel();
      if (exitBeforeReadyListener) {
        child.off('exit', exitBeforeReadyListener);
      }
    }
  }

  private async stopService(name: ManagedServiceName): Promise<void> {
    const handle = this.handles.get(name);
    if (!handle?.child) {
      return;
    }

    const child = handle.child;
    handle.expectedExit = true;

    const waitForExit = new Promise<void>((resolve) => {
      child.once('exit', () => {
        resolve();
      });
    });

    if (child.stdin && !child.stdin.destroyed) {
      child.stdin.end();
    }

    await Promise.race([waitForExit, waitForTimeout(this.config.gracefulShutdownMs)]);

    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([waitForExit, waitForTimeout(this.config.gracefulShutdownMs)]);
    }

    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }

    await waitForExit;
  }
}
