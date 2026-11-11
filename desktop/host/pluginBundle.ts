import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DesktopPluginPin {
  id: string;
  version: string;
  artifact: string;
  sha256: string;
}

function readPins(value: unknown): DesktopPluginPin[] {
  const lock = value as { schemaVersion?: number; plugins?: DesktopPluginPin[] };
  if (lock?.schemaVersion !== 1 || !Array.isArray(lock.plugins) || lock.plugins.length !== 1) {
    throw new Error('Invalid Desktop Plugin bundle.');
  }
  const pin = lock.plugins[0];
  if (!pin || pin.id !== 'agency-agents' || pin.version !== '0.1.0'
    || pin.artifact !== 'agency-agents-0.1.0.catsplugin'
    || pin.sha256 !== '26afae3f0c5f551cc3bbce267c82d574963c4c2f94f48f9e8d3dcb0aa0ca07a5') {
    throw new Error('Unsupported Desktop Plugin bundle.');
  }
  return lock.plugins;
}

function readArchive(root: string, pin: DesktopPluginPin): Buffer {
  const bytes = readFileSync(join(root, pin.artifact));
  if (bytes.length !== 40_832 || createHash('sha256').update(bytes).digest('hex') !== pin.sha256) {
    throw new Error('Desktop Plugin bundle SHA-256 mismatch.');
  }
  return bytes;
}

/** Capture exact bytes before replacing an existing packaging stage. */
export function collectDesktopPlugins(packageRoot: string, profile: 'release' | 'preview') {
  if (profile === 'release') return { plugins: [] as DesktopPluginPin[], files: new Map<string, Buffer>() };
  const plugins = readPins(JSON.parse(readFileSync(join(packageRoot, 'config', 'desktop-plugins.lock.json'), 'utf8')));
  return { plugins, files: new Map(plugins.map(pin => [pin.artifact, readArchive(join(packageRoot, 'vendor'), pin)])) };
}

/** Only a verified packaged preview bundle opts the ordinary profile into installation. */
export function readDesktopPluginArchive(packageRoot: string): string | undefined {
  const root = join(packageRoot, 'bundled-plugins');
  const manifest = join(root, 'bundle.json');
  if (!existsSync(manifest)) return undefined;
  const value = JSON.parse(readFileSync(manifest, 'utf8'));
  if (value.profile !== 'preview') return undefined;
  const [pin] = readPins(value);
  readArchive(root, pin!);
  return join(root, pin!.artifact);
}
