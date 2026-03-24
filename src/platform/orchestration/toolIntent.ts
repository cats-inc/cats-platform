import type { RoomRoutingMode } from '../../shared/roomRouting.js';
import type {
  OrchestratorTransportContext,
  ToolIntentManifest,
} from './contracts.js';

interface ResolveToolIntentInput {
  profileId: string | null | undefined;
  participantKind: 'orchestrator' | 'cat';
  channelId: string;
  catId?: string | null;
  roomMode: RoomRoutingMode;
  transport: OrchestratorTransportContext;
}

const MCP_FACADE_TOOLS = {
  runtimeSummary: 'runtime_summary',
  listSessions: 'list_sessions',
  observeSession: 'observe_session',
  auditWorkspace: 'audit_workspace',
  auditDeliveryTarget: 'audit_delivery_target',
} as const;

export const ORCHESTRATOR_RUNTIME_MCP_TOOLS = [
  MCP_FACADE_TOOLS.runtimeSummary,
  MCP_FACADE_TOOLS.listSessions,
  MCP_FACADE_TOOLS.observeSession,
  MCP_FACADE_TOOLS.auditWorkspace,
  MCP_FACADE_TOOLS.auditDeliveryTarget,
] as const;

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export function resolveToolIntentManifest(
  input: ResolveToolIntentInput,
): ToolIntentManifest | null {
  const normalizedProfile = input.profileId?.trim() || '';
  if (!normalizedProfile) {
    return null;
  }

  const eagerTools = [
    MCP_FACADE_TOOLS.runtimeSummary,
    MCP_FACADE_TOOLS.listSessions,
    MCP_FACADE_TOOLS.observeSession,
  ];
  const lazyGroups = input.transport === 'web'
    ? ['workspace.audit', 'delivery.audit']
    : ['session.observe'];
  const requiredCapabilities = input.participantKind === 'cat'
    && input.roomMode === 'direct_cat_chat'
    ? ['workspace.audit']
    : ['session.observe'];

  if (normalizedProfile === 'chat-memory') {
    return {
      profileId: normalizedProfile,
      allowedTools: eagerTools,
      requiredCapabilities: uniqueStrings(requiredCapabilities),
      lazyGroups: uniqueStrings(lazyGroups),
      context: {
        ...(input.catId ? { catId: input.catId } : {}),
        channelId: input.channelId,
        participantKind: input.participantKind,
        roomMode: input.roomMode,
        transport: input.transport,
      },
      strict: false,
    };
  }

  return {
    profileId: normalizedProfile,
    allowedTools: eagerTools,
    requiredCapabilities: ['session.observe'],
    lazyGroups: [
      'workspace.audit',
      'delivery.audit',
    ],
    context: {
      ...(input.catId ? { catId: input.catId } : {}),
      channelId: input.channelId,
      participantKind: input.participantKind,
      roomMode: input.roomMode,
      transport: input.transport,
    },
    strict: false,
  };
}
