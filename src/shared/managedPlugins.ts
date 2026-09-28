export const AGENCY_PLUGIN = {
  id: 'agency-agents', version: '0.1.0', name: 'Agency Agents', license: 'MIT',
  source: 'https://github.com/msitarzewski/agency-agents/tree/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b',
  digest: '26afae3f0c5f551cc3bbce267c82d574963c4c2f94f48f9e8d3dcb0aa0ca07a5',
  skills: [
    { id: 'plugin:agency-agents/work/agency-code-reviewer', title: 'Agency Code Reviewer', entry: 'skills/work/agency-code-reviewer/SKILL.md' },
    { id: 'plugin:agency-agents/work/agency-ux-researcher', title: 'Agency UX Researcher', entry: 'skills/work/agency-ux-researcher/SKILL.md' },
  ],
} as const;
export interface PluginIdentity { hostId: string; id: string; version: string; digest: string; generation: number }
export interface PluginObservation {
  protocol: 1; runtimeId: string;
  plugin: (PluginIdentity & { enabled: boolean; leaseUntil: number }) | null;
  affectedSessions: string[];
  pendingRuns: Array<{ sessionId: string; runId: string; orphaned: boolean }>;
}
export interface PluginInventory {
  policyEnabled: boolean;
  revision: number;
  installed: boolean;
  desired: 'enabled' | 'disabled' | 'removed';
  phase: 'absent' | 'installed' | 'registering' | 'enabled' | 'fencing' | 'confirmation-required' | 'stop-pending' | 'disabled';
  observation: PluginObservation | null;
  error?: string;
  availableSkills: Array<{ id: string; title: string }>;
}
