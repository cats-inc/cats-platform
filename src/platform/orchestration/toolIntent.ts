import type { RoomRoutingMode } from '../../shared/roomRouting.js';
import { CHAT_MCP_PROFILE_ID } from '../../shared/catMcpProfiles.js';
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

const MCP_FACADE_TOOL_DESCRIPTIONS: Record<string, string> = {
  [MCP_FACADE_TOOLS.runtimeSummary]: 'Summarize runtime provider health and session posture.',
  [MCP_FACADE_TOOLS.listSessions]: 'List known runtime sessions for the current workspace.',
  [MCP_FACADE_TOOLS.observeSession]: 'Observe one runtime session state without mutating it.',
  [MCP_FACADE_TOOLS.auditWorkspace]: 'Audit workspace state exposed by the runtime facade.',
  [MCP_FACADE_TOOLS.auditDeliveryTarget]: 'Audit delivery target readiness for transports.',
};

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

function describeTools(tools: string[]): NonNullable<ToolIntentManifest['toolDescriptions']> {
  return tools.map((name) => ({
    name,
    description: MCP_FACADE_TOOL_DESCRIPTIONS[name] ?? `Use ${name}.`,
  }));
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
    && input.roomMode === 'direct_message'
    ? ['workspace.audit']
    : ['session.observe'];

  if (normalizedProfile === CHAT_MCP_PROFILE_ID) {
    return {
      profileId: normalizedProfile,
      allowedTools: eagerTools,
      toolDescriptions: describeTools(eagerTools),
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
    toolDescriptions: describeTools(eagerTools),
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
