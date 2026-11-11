import type { CoreStore } from '../../../core/store.js';
import {
  mcpTextResult,
  type McpToolCallResult,
  type McpToolDefinition,
} from '../../../platform/mcp/jsonRpcServer.js';
import {
  createHostToolServer,
  type HostToolGrant,
  type HostToolProvider,
  type HostToolServer,
} from '../../../platform/mcp/hostTools.js';
import type { McpSessionGrantStore } from '../../../platform/mcp/sessionGrants.js';
import { appendArtifactCanvasIntentActivity } from '../../shared/artifactCanvas/activity.js';
import {
  ARTIFACT_CANVAS_CLEAR_TOOL_DEFINITION,
  canvasSurfaceRouteRegistry,
  composeArtifactCanvasNavigateIntent,
  type CanvasSurfaceRef,
} from '../../shared/artifactCanvas/contracts.js';
import { resolveCanvasRouteOptions } from '../../shared/artifactCanvas/conversationRoute.js';
import {
  DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG,
  buildArtifactCanvasPolicyVersion,
  type ArtifactCanvasPolicyConfig,
} from '../../shared/artifactCanvas/iframePolicy.js';
import {
  createArtifactCanvasIntentId,
  getDefaultArtifactCanvasRenderIntentHub,
  type ArtifactCanvasRenderIntentHub,
} from '../../shared/artifactCanvas/renderIntent.js';
import {
  CODE_ARTIFACT_DECLARATION_TOOL,
  CodeArtifactDeclarationError,
} from '../shared/artifactDeclaration.js';
import type { CodeConversationPreviews } from '../livePreview/conversationPreviews.js';
import type { LivePreviewSupervisor } from '../livePreview/supervisor.js';
import { materializeCodeArtifactDeclaration } from '../state/artifactMaterialization.js';
import {
  GET_PREVIEW_STATUS_TOOL,
  START_DEV_PREVIEW_TOOL,
  STOP_PREVIEW_TOOL,
  runGetPreviewStatus,
  runStartDevPreview,
  runStopPreview,
} from './devPreview.js';
import { CODE_AGENT_PREVIEW_POLICY } from './policy.js';
import { runShowInCanvas, SHOW_IN_CANVAS_TOOL } from './showInCanvas.js';
import type { CodeAgentToolGrantBinding } from './contracts.js';

export type CodeAgentToolGrant = HostToolGrant;

export interface CodeAgentToolsServiceOptions {
  coreStore: Pick<CoreStore, 'updateCore'>;
  /** Starts static previews for `show_in_canvas(path)`; absent means unavailable. */
  livePreviewSupervisor?: LivePreviewSupervisor | null;
  /** Settings > Code "Cats may run preview servers"; absent means off (CAP-08). */
  previewServersEnabled?: () => Promise<boolean>;
  /** Per-conversation leases shared with the Code canvas controls (CAP-13/14). */
  conversationPreviews?: CodeConversationPreviews;
  policyConfig?: ArtifactCanvasPolicyConfig;
  renderIntentHub?: ArtifactCanvasRenderIntentHub;
  now?: () => Date;
}

export const CODE_AGENT_TOOLS_PROVIDER_ID = 'cats-code.agent-tools' as const;

const DECLARE_TOOL: McpToolDefinition = {
  name: CODE_ARTIFACT_DECLARATION_TOOL.definition.name,
  description: CODE_ARTIFACT_DECLARATION_TOOL.definition.description,
  inputSchema: CODE_ARTIFACT_DECLARATION_TOOL.definition.inputSchema as unknown as Record<string, unknown>,
};

const CLEAR_TOOL: McpToolDefinition = {
  name: ARTIFACT_CANVAS_CLEAR_TOOL_DEFINITION.name,
  description: 'Close the preview canvas beside this conversation.',
  inputSchema: ARTIFACT_CANVAS_CLEAR_TOOL_DEFINITION.inputSchema as unknown as Record<string, unknown>,
};

/**
 * Code's tools on the host's `cats` server (ADR-126, SPEC-123), listed from the `code` level up
 * (SPEC-141 FR-8; Work includes Code, ADR-149 D5).
 */
export function createCodeAgentToolsProvider(options: CodeAgentToolsServiceOptions): HostToolProvider {
  const now = options.now ?? (() => new Date());
  const policyConfig = options.policyConfig ?? DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG;
  const hub = options.renderIntentHub ?? getDefaultArtifactCanvasRenderIntentHub();
  const staticLeases = options.conversationPreviews?.staticLeases ?? new Map<string, { previewId: string; root: string }>();
  const devLeases = options.conversationPreviews?.devLeases ?? new Map<string, string>();
  const previewServersEnabled = options.previewServersEnabled ?? (async () => false);

  const provider: HostToolProvider = {
    id: CODE_AGENT_TOOLS_PROVIDER_ID,
    level: 'code',
    instructions: CODE_AGENT_PREVIEW_POLICY,
    tools: [
      SHOW_IN_CANVAS_TOOL,
      START_DEV_PREVIEW_TOOL,
      GET_PREVIEW_STATUS_TOOL,
      STOP_PREVIEW_TOOL,
      DECLARE_TOOL,
      CLEAR_TOOL,
    ],
    clearForReset() {
      options.conversationPreviews?.clearForReset();
      staticLeases.clear();
      devLeases.clear();
    },
    async callTool(name, args, grant) {
      const supervisor = options.livePreviewSupervisor ?? null;
      if (name === START_DEV_PREVIEW_TOOL.name) {
        return runStartDevPreview(args, {
          binding: grant.binding,
          supervisor,
          devLeases,
          staticLeases,
          previewServersEnabled,
          updateCore: (mutator) => options.coreStore.updateCore(mutator),
          policyConfig,
          hub,
          now,
        });
      }
      if (name === GET_PREVIEW_STATUS_TOOL.name) {
        return runGetPreviewStatus(args, { binding: grant.binding, supervisor });
      }
      if (name === STOP_PREVIEW_TOOL.name) {
        return runStopPreview(args, { binding: grant.binding, supervisor, devLeases, staticLeases });
      }
      if (name === SHOW_IN_CANVAS_TOOL.name) {
        return runShowInCanvas(args, {
          binding: grant.binding,
          runtimeSessionId: grant.runtimeSessionId,
          updateCore: (mutator) => options.coreStore.updateCore(mutator),
          supervisor: options.livePreviewSupervisor ?? null,
          staticLeases,
          policyConfig,
          hub,
          now,
        });
      }
      if (name === DECLARE_TOOL.name) return declareArtifact(args, grant);
      if (name === CLEAR_TOOL.name) return clearCanvas(grant);
      return mcpTextResult({ error: { code: 'unknown_tool', message: `Unknown tool: ${name}` } }, true);
    },
  };

  async function declareArtifact(
    args: Record<string, unknown>,
    grant: CodeAgentToolGrant,
  ): Promise<McpToolCallResult> {
    try {
      const input = CODE_ARTIFACT_DECLARATION_TOOL.normalizeInput(args);
      const declaration = CODE_ARTIFACT_DECLARATION_TOOL.createDeclaration(input, {
        kind: 'agent',
        actorId: grant.binding.actorId,
        runtimeSessionId: grant.runtimeSessionId,
      }, {
        conversationId: grant.binding.conversationId,
        workspacePath: grant.binding.workspacePath,
      });
      let materialized!: ReturnType<typeof materializeCodeArtifactDeclaration>;
      await options.coreStore.updateCore((core) => {
        materialized = materializeCodeArtifactDeclaration(core, declaration, now());
        return materialized.core;
      });
      return mcpTextResult({
        artifactId: materialized.artifact.id,
        created: materialized.created,
        disposition: materialized.disposition,
      });
    } catch (error) {
      if (error instanceof CodeArtifactDeclarationError) {
        return mcpTextResult({ error: { code: error.code, message: error.message } }, true);
      }
      throw error;
    }
  }

  async function clearCanvas(grant: CodeAgentToolGrant): Promise<McpToolCallResult> {
    const surface: CanvasSurfaceRef = { kind: 'code_conversation', surfaceId: grant.binding.channelId };
    const policyVersion = buildArtifactCanvasPolicyVersion(policyConfig).policyVersion;
    const at = now();
    let activity!: ReturnType<typeof appendArtifactCanvasIntentActivity>;
    let route: ReturnType<typeof resolveCanvasRouteOptions> = {};
    let targetUrl = '';
    await options.coreStore.updateCore((core) => {
      // The conversation's own route, on Code or on Work (SPEC-141 FR-9).
      route = resolveCanvasRouteOptions(core, surface);
      targetUrl = canvasSurfaceRouteRegistry.parentUrl(surface, route);
      activity = appendArtifactCanvasIntentActivity({
        core,
        kind: 'artifact_canvas_clear_intent',
        surface,
        actorId: grant.binding.actorId,
        targetUrl,
        policyVersion,
        now: at,
      });
      return activity.core;
    });
    hub.publish({
      intent: composeArtifactCanvasNavigateIntent({
        intentId: createArtifactCanvasIntentId(),
        activityId: activity.activity.id,
        surface,
        artifactId: null,
        presentationRequested: null,
        policyVersion,
        triggeredAt: at.toISOString(),
        route,
      }),
      now: at,
    });
    return mcpTextResult({ cleared: true, canvasPath: targetUrl });
  }

  return provider;
}

/** A host server with only Code's tools, as Code's tests and tools use it. */
export function createCodeAgentToolsService(
  options: CodeAgentToolsServiceOptions & { grants?: McpSessionGrantStore<CodeAgentToolGrantBinding> },
): HostToolServer {
  const server = createHostToolServer({ grants: options.grants, now: options.now });
  server.register(createCodeAgentToolsProvider(options));
  return server;
}
