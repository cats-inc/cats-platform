import { mkdir, mkdtemp, readFile, rename, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { APP_SDK_VERSION, PLATFORM_VERSION, decodeAppPackage, parseAppLock, resolveAppLock, type AppPin } from '#cats-app-package';
import { validateRendererAppPackage } from '../../app-sdk/packageValidation.js';
import type { CatsAppManifestV1 } from '../../shared/catsAppManifest.js';
import { resolveCatsAppPackageInstallDir, resolveCatsAppStoragePathsFromChatState } from './paths.js';
import { FileCatsAppRegistry } from './registry.js';
import type { AppComponentHost } from './componentHost.js';

export function validateRendererPackage(bytes: Uint8Array, pin: Pick<AppPin, 'id' | 'version' | 'sha256'>) {
  return validateRendererAppPackage(bytes, { pin, platformVersion: PLATFORM_VERSION, appSdkVersion: APP_SDK_VERSION });
}

const installQueues = new Map<string, Promise<unknown>>();

export async function installRendererPackage(options: {
  chatStatePath: string; bytes: Uint8Array; pin: Pick<AppPin, 'id' | 'version' | 'sha256'>;
  source: 'desktop-bundle' | 'local-package'; enable?: boolean;
  componentHost?: AppComponentHost;
}) {
  const paths = resolveCatsAppStoragePathsFromChatState(options.chatStatePath);
  const key = paths.registryPath.toLowerCase();
  const pending = (installQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const decoded = validateRendererPackage(options.bytes, options.pin);
    if (decoded.manifest.components && !options.componentHost) throw new Error('Executable Apps require a Desktop component host.');
    const registry = new FileCatsAppRegistry({ registryPath: paths.registryPath });
    const previous = (await registry.readState()).apps.find((app) => app.id === decoded.manifest.id);
    // Desktop updates respect an explicit disable/uninstall. The owner's local install is explicit.
    if (options.source === 'desktop-bundle' && previous?.installState === 'uninstalled') return previous;
    const target = resolveCatsAppPackageInstallDir(paths, decoded.manifest.id, decoded.manifest.version);
    const manifest: CatsAppManifestV1 = {
      ...decoded.manifest,
      trustTier: options.source === 'desktop-bundle' ? 'system' : 'local-user',
    };
    await mkdir(path.dirname(target), { recursive: true });
    let exists = false;
    try {
      const targetStat = await lstat(target);
      if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) throw new Error('Unsafe package install directory.');
      exists = true;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (exists) {
      const installed = JSON.parse(await readFile(path.join(target, '.package.json'), 'utf8')) as { sha256?: string };
      if (installed.sha256 !== decoded.sha256) throw new Error('The same app version already exists with a different digest. Publish a new version.');
      // Re-check the immutable archive on every activation, not just its metadata file.
      const archive = await readFile(path.join(target, 'payload.catsapp'));
      decodeAppPackage(archive, options.pin);
    } else {
      // No executable hooks or extraction of arbitrary paths. Keep failed staging recoverable.
      const stage = await mkdtemp(path.join(path.dirname(target), '.staging-'));
      await writeFile(path.join(stage, 'payload.catsapp'), options.bytes, { flag: 'wx' });
      await writeFile(path.join(stage, 'cats.app.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      await writeFile(path.join(stage, '.package.json'), `${JSON.stringify({ sha256: decoded.sha256, source: options.source })}\n`);
      if (manifest.components) {
        for (const file of decoded.files) {
          const filePath = path.join(stage, 'files', file.path);
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, file.data, { flag: 'wx' });
        }
      }
      await rename(stage, target);
    }
    const enabled = options.source === 'desktop-bundle' && previous
      ? previous.enabled && previous.installState === 'enabled' : options.enable === true;
    const input = { manifest, packagePath: target, packageSha256: decoded.sha256,
      packageSource: options.source, enabled, installState: enabled ? 'enabled' as const : 'disabled' as const };
    return manifest.components ? options.componentHost!.install(input) : registry.installApp(input);
  });
  installQueues.set(key, pending);
  try { return await pending; }
  finally { if (installQueues.get(key) === pending) installQueues.delete(key); }
}

export async function installBundledApps(chatStatePath: string, lockPath: string, componentHost?: AppComponentHost): Promise<void> {
  const selection = parseAppLock(JSON.parse(await readFile(lockPath, 'utf8')));
  if (selection.apps.some((app) => app.artifact !== `${app.id}-${app.version}.catsapp`)) {
    throw new Error('A Desktop bundle must use adjacent local archives; network/path traversal inputs are forbidden at startup.');
  }
  const apps = await resolveAppLock(lockPath);
  // Validate the entire selection before changing active registry entries.
  for (const app of apps) {
    const decoded = validateRendererPackage(app.bytes, app);
    if (decoded.manifest.components && !componentHost) throw new Error('Executable Apps require a Desktop component host.');
  }
  for (const app of apps) await installRendererPackage({ chatStatePath, bytes: app.bytes, pin: app, source: 'desktop-bundle', enable: true, componentHost });
}
