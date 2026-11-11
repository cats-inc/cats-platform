import {
  RuntimeEnricherPriority,
  registerRuntimeInvocationEnricher,
  type RuntimeInvocationEnricher,
} from '../runtime/invocationEnrichment.js';
import { productScopeIncludes, readProductScope } from '../../shared/productScope.js';
import { HOST_TOOLS_CONTEXT_METADATA_KEY, type HostToolsInvocationMarker } from './hostTools.js';
import { hasShellExecutionPermission } from './shellPermission.js';

/**
 * Marks every conversation's invocations with its level, so the host tools wrapper can attach
 * the `cats` server with the tools that level lists (SPEC-142 FR-1, A3). Direct lanes are marked
 * too: the read rule lists them at `chat` whatever they store. The marker carries no secret; the
 * wrapper adds `mcpServers` inside the supervision boundary.
 */

export const HOST_TOOLS_HOOK_ID = 'cats-platform.host-tools' as const;
/** The dispatch's target participant, which the marker and the grant carry. */
export const TARGET_PARTICIPANT_METADATA_KEY = 'targetParticipantId' as const;
/** Whether the owner started this turn on Desktop or mobile, set by the chat dispatch on each send. */
export const TURN_OWNER_STARTED_METADATA_KEY = 'turnOwnerStarted' as const;

export function createHostToolsInvocationEnricher(): RuntimeInvocationEnricher {
  return {
    id: HOST_TOOLS_HOOK_ID,
    priority: RuntimeEnricherPriority.POST_PROCESS,
    enrich(channel, input) {
      if (!channel.id) {
        // No conversation, no marker: void one an earlier step may have left. The enrichment
        // merge never deletes a key, so the marker is overwritten with null, which reads as none.
        if (!input.context?.metadata || !(HOST_TOOLS_CONTEXT_METADATA_KEY in input.context.metadata)) return null;
        return { context: { ...input.context, metadata: { ...input.context.metadata, [HOST_TOOLS_CONTEXT_METADATA_KEY]: null } } };
      }
      const level = readProductScope(channel);
      const participantId = input.context?.metadata?.[TARGET_PARTICIPANT_METADATA_KEY];
      const marker: HostToolsInvocationMarker = {
        channelId: channel.id,
        workspacePath: channel.chatCwd ?? channel.repoPath ?? null,
        shellExecution: hasShellExecutionPermission({
          workspaceAccess: channel.runtimeWorkspaceAccess,
          permissionMode: channel.runtimePermissionMode,
          executionPolicy: channel.runtimeExecutionPolicy ?? null,
        }),
        level,
        participantId: typeof participantId === 'string' && participantId ? participantId : null,
        // Only a turn the owner started may propose (an allow-list, so anything else fails closed).
        proposalsAllowed: input.context?.metadata?.[TURN_OWNER_STARTED_METADATA_KEY] === true,
      };
      const labels = input.context?.labels ?? [];
      return {
        context: {
          ...(input.context ?? {}),
          // Code's label follows Code's tools (SPEC-141 FR-8; Work includes Code, ADR-149 D5).
          labels: productScopeIncludes(level, 'code') ? [...new Set([...labels, 'product:code'])] : [...labels],
          metadata: {
            ...(input.context?.metadata ?? {}),
            [HOST_TOOLS_CONTEXT_METADATA_KEY]: marker,
          },
        },
      };
    },
  };
}

export function registerHostToolsInvocationEnricher(): void {
  registerRuntimeInvocationEnricher(createHostToolsInvocationEnricher());
}
