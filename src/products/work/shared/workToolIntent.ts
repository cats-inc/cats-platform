import type {
  ToolIntentManifest,
} from '../../../platform/orchestration/contracts.js';
import type { SupervisionToolScope } from '../../../platform/supervision/contracts.js';
import { filterToolSurface } from '../../../platform/supervision/toolRegistry.js';
import { WORK_MCP_PROFILE_ID } from '../../../shared/catMcpProfiles.js';
import {
  createPhaseScopedWorkToolManifests,
  filterPhaseScopedWorkToolManifests,
  type WorkToolCapabilityProfile,
  type WorkToolPhase,
} from './workToolSurface.js';

export { WORK_MCP_PROFILE_ID };

type ToolIntentContext = NonNullable<ToolIntentManifest['context']>;

export interface PhaseScopedWorkToolIntentInput {
  profileId?: string | null;
  phase: WorkToolPhase;
  capabilityProfile: WorkToolCapabilityProfile;
  policyToolScope: SupervisionToolScope;
  parentToolScope?: SupervisionToolScope;
  channelId?: string | null;
  catId?: string | null;
  participantKind?: ToolIntentContext['participantKind'];
  roomMode?: ToolIntentContext['roomMode'];
  transport?: ToolIntentContext['transport'];
  strict?: boolean;
}

export function resolvePhaseScopedWorkToolIntentManifest(
  input: PhaseScopedWorkToolIntentInput,
): ToolIntentManifest | null {
  const profileId = input.profileId?.trim() ?? '';
  if (profileId !== WORK_MCP_PROFILE_ID) {
    return null;
  }

  const manifests = filterToolSurface(
    filterPhaseScopedWorkToolManifests(createPhaseScopedWorkToolManifests(), {
      phase: input.phase,
      capabilityProfile: input.capabilityProfile,
    }),
    {
      parentToolScope: input.parentToolScope ?? input.policyToolScope,
      policyToolScope: input.policyToolScope,
    },
  );

  return {
    profileId,
    allowedTools: manifests.map((manifest) => manifest.name),
    requiredCapabilities: uniqueStrings([
      `work.phase.${input.phase}`,
      `work.capability.${input.capabilityProfile}`,
      `work.tool_scope.${input.policyToolScope}`,
    ]),
    lazyGroups: uniqueStrings([
      `work.${input.phase}`,
      ...(input.policyToolScope === 'read_only' ? [] : ['work.write']),
    ]),
    context: {
      ...(input.catId ? { catId: input.catId } : {}),
      ...(input.channelId ? { channelId: input.channelId } : {}),
      ...(input.participantKind ? { participantKind: input.participantKind } : {}),
      ...(input.roomMode ? { roomMode: input.roomMode } : {}),
      ...(input.transport !== undefined ? { transport: input.transport } : {}),
    },
    strict: input.strict ?? true,
  };
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}
