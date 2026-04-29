import type { DesktopHostConfig } from './config.js';

export interface DesktopSetupAuditAction {
  helperId: string;
  extraArguments?: string[];
}

export function resolveDefaultSetupAuditAction(
  config: Pick<DesktopHostConfig, 'setupAudit'>,
  platform: NodeJS.Platform = process.platform,
): DesktopSetupAuditAction | null {
  switch (platform) {
    case 'win32': {
      const extraArguments = ['-IncludeLocalModels:$true'];
      if (!config.setupAudit.parallel) {
        extraArguments.push('-Parallel:$false');
      }
      return {
        helperId: 'windows-install-readiness-audit',
        extraArguments,
      };
    }
    case 'darwin': {
      const extraArguments = ['--include-local-models'];
      if (!config.setupAudit.parallel) {
        extraArguments.push('--serial');
      }
      return {
        helperId: 'macos-install-readiness-audit',
        extraArguments,
      };
    }
    case 'linux': {
      const extraArguments = ['--include-local-models'];
      if (!config.setupAudit.parallel) {
        extraArguments.push('--serial');
      }
      return {
        helperId: 'linux-install-readiness-audit',
        extraArguments,
      };
    }
    default:
      return null;
  }
}
