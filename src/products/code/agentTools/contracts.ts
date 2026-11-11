/**
 * Cats Code agent tools (SPEC-123): the Platform-hosted `cats` MCP server that
 * Runtime configures into Code conversation sessions (ADR-126).
 */

import type { HostToolGrantBinding } from '../../../platform/mcp/hostTools.js';

export {
  HOST_TOOLS_MCP_PATH as CODE_AGENT_TOOLS_MCP_PATH,
  HOST_TOOLS_SERVER_NAME as CODE_AGENT_TOOLS_SERVER_NAME,
} from '../../../platform/mcp/hostTools.js';

/**
 * What a session grant is bound to; everything a tool call may act on. Since SPEC-142 the grant
 * is the host server's, and Code's tools are one provider on it.
 */
export type CodeAgentToolGrantBinding = HostToolGrantBinding;
