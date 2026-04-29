import type {
  CatsAgentToolContribution,
  CatsInstalledAppRecord,
} from '../../shared/catsAppManifest.js';
import {
  DEFAULT_SUPERVISION_SCHEMA_VERSION,
  type SchemaRef,
  type SupervisedToolApproval,
  type SupervisedToolManifest,
  type SupervisedToolSideEffect,
} from '../supervision/contracts.js';
import type { SupervisedToolRegistry } from '../supervision/toolRegistry.js';

export interface CatsAppToolRegistration {
  appId: string;
  appDisplayName: string;
  packagePath: string;
  declaration: CatsAgentToolContribution;
  manifest: SupervisedToolManifest;
  runtimeBridge: CatsAgentToolContribution['runtimeBridge'] | null;
}

function isAppToolRegistrationEnabled(record: CatsInstalledAppRecord): boolean {
  return record.enabled
    && record.installState === 'enabled'
    && record.manifest.permissions.includes('agent.tools.register');
}

function schemaRefForTool(
  appId: string,
  toolName: string,
  role: 'input' | 'output',
): SchemaRef {
  return {
    id: `${toolName}.${role}`,
    version: '1.0',
    format: 'json_schema',
    uri: `cats-app://${appId}/tools/${toolName}/${role}-schema`,
  };
}

function sideEffectForTool(
  tool: CatsAgentToolContribution,
): SupervisedToolSideEffect {
  return tool.requiresApproval ? 'external_visible' : 'none';
}

function approvalForTool(tool: CatsAgentToolContribution): SupervisedToolApproval {
  return tool.requiresApproval ? 'always' : 'never';
}

export function toSupervisedToolManifestFromCatsAppTool(
  record: CatsInstalledAppRecord,
  tool: CatsAgentToolContribution,
): SupervisedToolManifest {
  const sideEffect = sideEffectForTool(tool);
  return {
    schemaVersion: DEFAULT_SUPERVISION_SCHEMA_VERSION,
    name: tool.name,
    manifestVersion: record.manifest.version,
    description: tool.description,
    sideEffect,
    preflight: sideEffect === 'none' ? 'available' : 'required',
    blocking: 'async',
    cancellation: 'cooperative',
    approval: approvalForTool(tool),
    evidence: 'summary',
    failureCodes: sideEffect === 'none' ? [] : ['E_PRECHECK_FAILED'],
    inputSchema: schemaRefForTool(record.id, tool.name, 'input'),
    outputSchema: schemaRefForTool(record.id, tool.name, 'output'),
  };
}

export function createCatsAppToolRegistrations(
  records: readonly CatsInstalledAppRecord[],
): CatsAppToolRegistration[] {
  return records
    .filter(isAppToolRegistrationEnabled)
    .flatMap((record) =>
      (record.manifest.contributions.tools ?? []).map((tool) => ({
        appId: record.id,
        appDisplayName: record.manifest.displayName,
        packagePath: record.packagePath,
        declaration: structuredClone(tool),
        manifest: toSupervisedToolManifestFromCatsAppTool(record, tool),
        runtimeBridge: tool.runtimeBridge ?? null,
      })))
    .sort((left, right) =>
      left.manifest.name.localeCompare(right.manifest.name)
      || left.appId.localeCompare(right.appId));
}

export function registerCatsAppTools(
  registry: SupervisedToolRegistry,
  records: readonly CatsInstalledAppRecord[],
): CatsAppToolRegistration[] {
  const registrations = createCatsAppToolRegistrations(records);
  for (const registration of registrations) {
    registry.register(registration.manifest);
  }
  return registrations;
}
