import type { ProviderSelection } from './providerSelection.js';

export const DESKTOP_PREREQUISITE_SUFFIXES = [
  'node-host-installer', 'npm-prefix-helper', 'github-cli-installer',
] as const;

export function isDesktopPrerequisiteHelper(helperId: string): boolean {
  return /^(windows|macos|linux)-(node-host-installer|npm-prefix-helper|github-cli-installer)$/u.test(helperId);
}

export interface DesktopSetupAuditAction { helperId: string }

export function resolveSelectedSetupAuditActions(
  selection: ProviderSelection | null,
  platform: NodeJS.Platform = process.platform,
): DesktopSetupAuditAction[] {
  const prefix = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : platform === 'linux' ? 'linux' : null;
  if (!prefix) return [];
  // Desktop serves clean consumer machines. Host prerequisites are separate
  // from Runtime's provider allowlist; these are read-only checks, never installs.
  const actions: DesktopSetupAuditAction[] = DESKTOP_PREREQUISITE_SUFFIXES
    .map((suffix) => ({ helperId: `${prefix}-${suffix}` }));
  if (selection?.state === 'selected' && selection.nativeSetupTargets.some((target) => target.provider === 'ollama'
    && target.backend === 'local' && target.instance === 'local')) {
    actions.push({ helperId: `${prefix}-ollama-local-model-installer` });
  }
  return actions;
}
