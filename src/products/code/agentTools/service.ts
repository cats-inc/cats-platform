import type { IncomingMessage, ServerResponse } from 'node:http';

import type { CoreStore } from '../../../core/store.js';
import {
  handleMcpHttpRequest,
  mcpTextResult,
  type McpServerDefinition,
  type McpToolCallResult,
  type McpToolDefinition,
} from '../../../platform/mcp/jsonRpcServer.js';
import { McpSessionGrantStore, type McpSessionGrant } from '../../../platform/mcp/sessionGrants.js';
import { appendArtifactCanvasIntentActivity } from '../../shared/artifactCanvas/activity.js';
import {
  ARTIFACT_CANVAS_CLEAR_TOOL_DEFINITION,
  canvasSurfaceRouteRegistry,
  composeArtifactCanvasNavigateIntent,
  type CanvasSurfaceRef,
} from '../../shared/artifactCanvas/contracts.js';
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
import { materializeCodeArtifactDeclaration } from '../state/artifactMaterialization.js';
import {
  CODE_AGENT_TOOLS_MCP_PATH,
  CODE_AGENT_TOOLS_SERVER_NAME,
  CODE_AGENT_TOOLS_SERVER_VERSION,
  type CodeAgentToolGrantBinding,
} from './contracts.js';

export type CodeAgentToolGrant = McpSessionGrant<CodeAgentToolGrantBinding>;

export interface CodeAgentToolsServiceOptions {
  coreStore: Pick<CoreStore, 'updateCore'>;
  grants?: McpSessionGrantStore<CodeAgentToolGrantBinding>;
  policyConfig?: ArtifactCanvasPolicyConfig;
  renderIntentHub?: ArtifactCanvasRenderIntentHub;
  now?: () => Date;
}

export interface CodeAgentToolsService {
  grants: McpSessionGrantStore<CodeAgentToolGrantBinding>;
  /** Serve the MCP endpoint; returns false for any other path. */
  route(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

const DECLARE_TOOL: McpToolDefinition = {
  name: CODE_ARTIFACT_DECLARATION_TOOL.definition.name,
  description: CODE_ARTIFACT_DECLARATION_TOOL.definition.description,
  inputSchema: CODE_ARTIFACT_DECLARATION_TOOL.definition.inputSchema as unknown as Record<string, unknown>,
};

const CLEAR_TOOL: McpToolDefinition = {
  name: ARTIFACT_CANVAS_CLEAR_TOOL_DEFINITION.name,
  description: 'Close the preview canvas beside this Cats Code conversation.',
  inputSchema: ARTIFACT_CANVAS_CLEAR_TOOL_DEFINITION.inputSchema as unknown as Record<string, unknown>,
};

export function createCodeAgentToolsService(options: CodeAgentToolsServiceOptions): CodeAgentToolsService {
  const grants = options.grants ?? new McpSessionGrantStore<CodeAgentToolGrantBinding>(options.now);
  const now = options.now ?? (() => new Date());
  const policyConfig = options.policyConfig ?? DEFAULT_ARTIFACT_CANVAS_POLICY_CONFIG;
  const hub = options.renderIntentHub ?? getDefaultArtifactCanvasRenderIntentHub();

  const server: McpServerDefinition<CodeAgentToolGrant> = {
    name: CODE_AGENT_TOOLS_SERVER_NAME,
    version: CODE_AGENT_TOOLS_SERVER_VERSION,
    listTools: () => [DECLARE_TOOL, CLEAR_TOOL],
    async callTool(name, args, grant) {
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
    const targetUrl = canvasSurfaceRouteRegistry.parentUrl(surface);
    const policyVersion = buildArtifactCanvasPolicyVersion(policyConfig).policyVersion;
    const at = now();
    let activity!: ReturnType<typeof appendArtifactCanvasIntentActivity>;
    await options.coreStore.updateCore((core) => {
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
      }),
      now: at,
    });
    return mcpTextResult({ cleared: true, canvasPath: targetUrl });
  }

  return {
    grants,
    async route(request, response) {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      if (pathname !== CODE_AGENT_TOOLS_MCP_PATH) return false;
      await handleMcpHttpRequest(request, response, {
        server,
        authorize(token, method) {
          const grant = grants.resolve(token);
          if (!grant) return null;
          // CLIs connect while spawning, before the session id is known;
          // acting on the conversation needs the bound session.
          if (method === 'tools/call' && grant.state !== 'bound') return null;
          return grant;
        },
      });
      return true;
    },
  };
}
