import { mcpTextResult, type McpToolCallResult } from '../../../platform/mcp/jsonRpcServer.js';
import type { ArtifactCanvasNavigateIntent } from '../../shared/artifactCanvas/contracts.js';
import type { ArtifactCanvasRenderIntentHub } from '../../shared/artifactCanvas/renderIntent.js';

/** Call only after the artifact, Activity and lease attachment are committed. */
export async function confirmCanvasPresentation(
  intent: ArtifactCanvasNavigateIntent,
  payload: Record<string, unknown>,
  hub: ArtifactCanvasRenderIntentHub,
): Promise<McpToolCallResult> {
  const confirmation = await hub.publishAndWaitForRender({ intent });
  if (confirmation.status === 'rendered') {
    return mcpTextResult({ ...payload, status: 'shown', confirmation: 'viewer_loaded' });
  }
  const errors = {
    not_delivered: {
      code: 'canvas_not_open',
      message: 'The artifact is ready, but no renderer is viewing this conversation. The canvas was not opened.',
    },
    timed_out: {
      code: 'canvas_render_timeout',
      message: 'The artifact is ready, but the renderer did not confirm loading it. Do not claim that the canvas opened.',
    },
    failed: {
      code: 'canvas_render_failed',
      message: 'The artifact is ready, but the canvas viewer could not load it.',
    },
  } as const;
  return mcpTextResult({ ...payload, status: 'not_shown', error: errors[confirmation.status] }, true);
}
