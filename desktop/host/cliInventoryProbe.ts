import {
  DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS,
  type DesktopCliInventory,
  type DesktopCliInventoryEntry,
  type DesktopProviderSetupLocalProviderId,
} from './contracts.js';

// Shape we read from cats-runtime's GET /setup-state response. We avoid
// importing the full RuntimeSetupReadModel type from src/ because the desktop
// host tsconfig is rooted under desktop/host/ and cannot reach src/.
export interface RuntimeCliInventoryProbe {
  scan: {
    scannedAt?: string | null;
    providers: Array<{ provider: string; available: boolean }>;
  } | null;
}

// Mapping: desktop's local-provider id -> the runtime KNOWN_PROVIDERS id.
// They mostly line up but a few desktop ids carry a suffix (e.g. claude_code,
// cursor_agent) that runtime doesn't use.
const DESKTOP_TO_RUNTIME_PROVIDER: Record<DesktopProviderSetupLocalProviderId, string | null> = {
  claude_code: 'claude',
  cursor_agent: 'cursor',
  codex: 'codex',
  gemini: 'gemini',
  copilot: 'copilot',
  opencode: 'opencode',
  kilo: 'kilo',
  kiro: 'kiro',
  goose: 'goose',
  junie: 'junie',
  auggie: 'auggie',
  pi: 'pi',
  // Ollama is a local model, not in runtime KNOWN_PROVIDERS — runtime never
  // reports it via setup-state. Desktop tracks it separately via the local
  // model installer helper, but the bootstrap CLI gate doesn't depend on it.
  ollama: null,
};

const PROVIDER_LABEL: Record<DesktopProviderSetupLocalProviderId, string> = {
  claude_code: 'Claude',
  cursor_agent: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini',
  copilot: 'Copilot',
  opencode: 'Opencode',
  kilo: 'Kilo',
  kiro: 'Kiro',
  goose: 'Goose',
  junie: 'Junie',
  auggie: 'Auggie',
  pi: 'Pi',
  ollama: 'Ollama',
};

const NATIVE_INSTALLER_SUFFIX = '-native-installer';
const LOCAL_MODEL_INSTALLER_SUFFIX = '-local-model-installer';

const PROVIDER_TO_HELPER_SUFFIX: Record<DesktopProviderSetupLocalProviderId, string> = {
  claude_code: 'claude' + NATIVE_INSTALLER_SUFFIX,
  cursor_agent: 'cursor' + NATIVE_INSTALLER_SUFFIX,
  codex: 'codex' + NATIVE_INSTALLER_SUFFIX,
  gemini: 'gemini' + NATIVE_INSTALLER_SUFFIX,
  copilot: 'copilot' + NATIVE_INSTALLER_SUFFIX,
  opencode: 'opencode' + NATIVE_INSTALLER_SUFFIX,
  kilo: 'kilo' + NATIVE_INSTALLER_SUFFIX,
  kiro: 'kiro' + NATIVE_INSTALLER_SUFFIX,
  goose: 'goose' + NATIVE_INSTALLER_SUFFIX,
  junie: 'junie' + NATIVE_INSTALLER_SUFFIX,
  auggie: 'auggie' + NATIVE_INSTALLER_SUFFIX,
  pi: 'pi' + NATIVE_INSTALLER_SUFFIX,
  ollama: 'ollama' + LOCAL_MODEL_INSTALLER_SUFFIX,
};

function platformToHelperPrefix(platform: NodeJS.Platform): string | null {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return null;
}

export function buildDesktopCliInventoryFromRuntime(
  probe: RuntimeCliInventoryProbe | null,
  platform: NodeJS.Platform = process.platform,
): DesktopCliInventory {
  const helperPrefix = platformToHelperPrefix(platform);
  // Runtime provider id -> available (binary on PATH).
  const runtimeAvailability = new Map<string, boolean>();
  let scannedAt: string | null = null;
  if (probe?.scan) {
    scannedAt = probe.scan.scannedAt ?? null;
    for (const provider of probe.scan.providers) {
      runtimeAvailability.set(provider.provider, provider.available === true);
    }
  }

  const candidates: DesktopCliInventoryEntry[] = DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS.map((providerId) => {
    const suffix = PROVIDER_TO_HELPER_SUFFIX[providerId];
    const helperId = helperPrefix ? `${helperPrefix}-${suffix}` : '';
    const runtimeProvider = DESKTOP_TO_RUNTIME_PROVIDER[providerId];
    const installed = runtimeProvider !== null
      ? runtimeAvailability.get(runtimeProvider) === true
      : false;
    return {
      helperId,
      providerId,
      label: PROVIDER_LABEL[providerId],
      installed,
      available: helperId !== '',
      supported: helperPrefix !== null,
    };
  });
  const installed = candidates
    .filter((entry) => entry.installed)
    .map((entry) => entry.helperId);
  return {
    source: probe?.scan ? 'runtime' : 'unknown',
    installed,
    total: installed.length,
    candidates,
    scannedAt,
  };
}
