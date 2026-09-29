import type { RuntimeSessionInvocationContext } from '../../../platform/runtime/client.js';
import {
  RuntimeEnricherPriority,
  registerRuntimeInvocationEnricher,
  type RuntimeInvocationEnricher,
} from '../../../platform/runtime/invocationEnrichment.js';

/**
 * Marks Code conversation invocations so the Code runtime-client wrapper can
 * attach the `cats` MCP server (ADR-126). The marker carries no secret; the
 * wrapper adds `mcpServers` inside the supervision boundary.
 */

export const CODE_AGENT_TOOLS_HOOK_ID = 'cats-code.agent-tools' as const;
export const CODE_AGENT_TOOLS_CONTEXT_METADATA_KEY = 'codeAgentTools' as const;

export interface CodeAgentToolsInvocationMarker {
  channelId: string;
  workspacePath: string | null;
}

export function createCodeAgentToolsInvocationEnricher(): RuntimeInvocationEnricher {
  return {
    id: CODE_AGENT_TOOLS_HOOK_ID,
    priority: RuntimeEnricherPriority.POST_PROCESS,
    enrich(channel, input) {
      if (channel.originSurface !== 'code' || !channel.id) return null;
      const marker: CodeAgentToolsInvocationMarker = {
        channelId: channel.id,
        workspacePath: channel.chatCwd ?? null,
      };
      return {
        context: {
          ...(input.context ?? {}),
          labels: [...new Set([...(input.context?.labels ?? []), 'product:code'])],
          metadata: {
            ...(input.context?.metadata ?? {}),
            [CODE_AGENT_TOOLS_CONTEXT_METADATA_KEY]: marker,
          },
        },
      };
    },
  };
}

export function registerCodeAgentToolsInvocationEnricher(): void {
  registerRuntimeInvocationEnricher(createCodeAgentToolsInvocationEnricher());
}

export function readCodeAgentToolsInvocationMarker(
  context: RuntimeSessionInvocationContext | undefined,
): CodeAgentToolsInvocationMarker | null {
  const value = context?.metadata?.[CODE_AGENT_TOOLS_CONTEXT_METADATA_KEY];
  if (!value || typeof value !== 'object') return null;
  const { channelId, workspacePath } = value as Record<string, unknown>;
  if (typeof channelId !== 'string' || !channelId) return null;
  return { channelId, workspacePath: typeof workspacePath === 'string' ? workspacePath : null };
}
