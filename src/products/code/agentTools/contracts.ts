/**
 * Cats Code agent tools (SPEC-123): the Platform-hosted `cats` MCP server that
 * Runtime configures into Code conversation sessions (ADR-126).
 */

export const CODE_AGENT_TOOLS_MCP_PATH = '/api/code/agent-tools/mcp';
export const CODE_AGENT_TOOLS_SERVER_NAME = 'cats';
export const CODE_AGENT_TOOLS_SERVER_VERSION = '1.0.0';

/** What a session grant is bound to; everything a tool call may act on. */
export interface CodeAgentToolGrantBinding {
  /** Chat channel id; also the `code_conversation` canvas surface id. */
  channelId: string;
  /** Core conversation id (`conversation-channel-<channelId>`). */
  conversationId: string;
  workspacePath: string | null;
  /** The Cat actor the grant was issued for. */
  actorId: string | null;
}
