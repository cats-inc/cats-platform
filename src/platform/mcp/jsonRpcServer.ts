import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Minimal stateless MCP server over Streamable HTTP for Platform-hosted tools
 * (ADR-126 decision 7). It implements the methods provider CLIs use against a
 * tool server: initialize, ping, tools/list and tools/call. It never issues
 * `Mcp-Session-Id` and never streams. Apps host their own MCP servers and do
 * not use this module.
 */

export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const DEFAULT_MCP_MAX_BODY_BYTES = 1024 * 1024;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  /** Tool-level failures the agent should read and act on; not protocol errors. */
  isError?: boolean;
}

export interface McpServerDefinition<Context> {
  name: string;
  version: string;
  instructions?: string;
  listTools(context: Context): McpToolDefinition[];
  callTool(name: string, args: Record<string, unknown>, context: Context): Promise<McpToolCallResult>;
}

export interface McpHttpRequestOptions<Context> {
  server: McpServerDefinition<Context>;
  /** Resolve the caller's context from its bearer token, or `null` to refuse. */
  authorize(token: string, method: string): Context | null;
  maxBodyBytes?: number;
}

type JsonRpcId = string | number | null;

class McpRequestError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

export async function handleMcpHttpRequest<Context>(
  request: IncomingMessage,
  response: ServerResponse,
  options: McpHttpRequestOptions<Context>,
): Promise<void> {
  if (request.method !== 'POST') {
    sendHttp(response, 405, { Allow: 'POST' });
    return;
  }
  // Browsers always send Origin on cross-origin POSTs; tool clients never do.
  if (request.headers.origin !== undefined) {
    sendHttp(response, 403);
    return;
  }
  if (!isLoopbackAddress(request.socket.remoteAddress)) {
    sendHttp(response, 403);
    return;
  }
  const token = readBearerToken(request);
  if (!token) {
    sendHttp(response, 401, { 'WWW-Authenticate': 'Bearer' });
    return;
  }
  const protocolHeader = request.headers['mcp-protocol-version'];
  if (typeof protocolHeader === 'string'
    && !SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(protocolHeader as never)) {
    sendHttp(response, 400);
    return;
  }

  let body: string;
  try {
    body = await readBoundedBody(request, options.maxBodyBytes ?? DEFAULT_MCP_MAX_BODY_BYTES);
  } catch {
    // Answer first, then drop the connection instead of reading the rest.
    response.on('finish', () => request.destroy());
    sendHttp(response, 413, { Connection: 'close' });
    return;
  }

  let message: unknown;
  try {
    message = JSON.parse(body);
  } catch {
    sendJsonRpcError(response, null, -32700, 'Parse error');
    return;
  }
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    sendJsonRpcError(response, readId(message), -32600, 'Invalid request');
    return;
  }

  const context = options.authorize(token, message.method);
  if (context === null) {
    sendHttp(response, 401, { 'WWW-Authenticate': 'Bearer' });
    return;
  }
  // Notifications and client responses need no reply.
  if (!('id' in message)) {
    sendHttp(response, 202);
    return;
  }

  const id = readId(message);
  try {
    const result = await dispatch(options.server, message.method, message.params, context);
    sendJson(response, { jsonrpc: '2.0', id, result });
  } catch (error) {
    if (error instanceof McpRequestError) {
      sendJsonRpcError(response, id, error.code, error.message);
      return;
    }
    sendJsonRpcError(response, id, -32603, 'Internal error');
  }
}

async function dispatch<Context>(
  server: McpServerDefinition<Context>,
  method: string,
  params: unknown,
  context: Context,
): Promise<unknown> {
  switch (method) {
    case 'initialize': {
      const requested = isRecord(params) ? params.protocolVersion : undefined;
      const protocolVersion = typeof requested === 'string'
        && SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(requested as never)
        ? requested
        : SUPPORTED_MCP_PROTOCOL_VERSIONS[0];
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, version: server.version },
        ...(server.instructions ? { instructions: server.instructions } : {}),
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: server.listTools(context) };
    case 'tools/call': {
      if (!isRecord(params) || typeof params.name !== 'string') {
        throw new McpRequestError(-32602, 'tools/call requires a tool name');
      }
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isRecord(args)) {
        throw new McpRequestError(-32602, 'tools/call arguments must be an object');
      }
      if (!server.listTools(context).some((tool) => tool.name === params.name)) {
        throw new McpRequestError(-32602, `Unknown tool: ${params.name}`);
      }
      return server.callTool(params.name, args, context);
    }
    default:
      throw new McpRequestError(-32601, `Method not found: ${method}`);
  }
}

export function readBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/iu.exec(header.trim());
  return match ? match[1]! : null;
}

export function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** A text result the agent can read, with the same data as structured content. */
export function mcpTextResult(value: Record<string, unknown>, isError = false): McpToolCallResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  };
}

function readBoundedBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        request.removeAllListeners('data');
        request.pause();
        reject(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function readId(message: unknown): JsonRpcId {
  if (!isRecord(message)) return null;
  const { id } = message;
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sendJson(response: ServerResponse, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json',
  });
  response.end(body);
}

function sendJsonRpcError(response: ServerResponse, id: JsonRpcId, code: number, message: string): void {
  sendJson(response, { jsonrpc: '2.0', id, error: { code, message } });
}

function sendHttp(response: ServerResponse, status: number, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  response.end();
}
