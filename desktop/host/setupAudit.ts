import { NPM_PROVIDERS, type ProviderSelection } from './providerSelection.js';

export interface DesktopSetupAuditAction { helperId: string }

export function resolveSelectedSetupAuditActions(
  selection: ProviderSelection | null,
  platform: NodeJS.Platform = process.platform,
): DesktopSetupAuditAction[] {
  const prefix = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : null;
  if (!prefix || selection?.state !== 'selected') return [];
  const actions: DesktopSetupAuditAction[] = [];
  if (selection.nativeSetupTargets.some((target) => target.backend === 'cli'
    && target.instance === 'native' && NPM_PROVIDERS.has(target.provider))) {
    actions.push({ helperId: `${prefix}-node-host-installer` });
  }
  if (selection.nativeSetupTargets.some((target) => target.provider === 'ollama'
    && target.backend === 'local' && target.instance === 'local')) {
    actions.push({ helperId: `${prefix}-ollama-local-model-installer` });
  }
  return actions;
}
