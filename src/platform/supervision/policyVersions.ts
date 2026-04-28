import type { SupervisionPolicy } from './contracts.js';

export const SUPERVISION_POLICY_BUNDLE_VERSION = 'supervision-policy@2' as const;

export const SUPERVISION_POLICY_DIAL_VERSIONS: Partial<Record<keyof SupervisionPolicy, string>> = {
  autonomy: 'autonomy@2',
  toolScope: 'tool-scope@2',
  approvalThreshold: 'approval-threshold@1',
} as const;
