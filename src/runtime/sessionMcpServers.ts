/**
 * cats-runtime session MCP servers (cats-runtime SPEC-035): descriptors a host
 * sends so a Runtime-spawned provider CLI connects to its MCP servers, and the
 * delivery report Runtime returns. Descriptors carry secrets; callers must not
 * place them in context metadata, Core records or evidence.
 */

export type RuntimeSessionMcpServerAuth =
  | { kind: 'bearer_env'; token: string }
  | { kind: 'none' };

export interface RuntimeSessionMcpServer {
  name: string;
  transport: 'http';
  url: string;
  auth: RuntimeSessionMcpServerAuth;
}

export type RuntimeSessionMcpDeliveryStatus = 'delivered' | 'unsupported' | 'failed';
export type RuntimeSessionMcpServerConnection = 'connected' | 'failed' | 'unknown';

export interface RuntimeSessionMcpDeliveryReport {
  status: RuntimeSessionMcpDeliveryStatus;
  servers: { name: string; connection: RuntimeSessionMcpServerConnection }[];
}

const DELIVERY_STATUSES = new Set<string>(['delivered', 'unsupported', 'failed']);
const CONNECTIONS = new Set<string>(['connected', 'failed', 'unknown']);

export function readRuntimeSessionMcpDeliveryReport(
  value: unknown,
): RuntimeSessionMcpDeliveryReport | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.status !== 'string' || !DELIVERY_STATUSES.has(record.status)) return undefined;
  const servers = Array.isArray(record.servers)
    ? record.servers.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const { name, connection } = entry as Record<string, unknown>;
      if (typeof name !== 'string') return [];
      return [{
        name,
        connection: typeof connection === 'string' && CONNECTIONS.has(connection)
          ? connection as RuntimeSessionMcpServerConnection
          : 'unknown' as const,
      }];
    })
    : [];
  return { status: record.status as RuntimeSessionMcpDeliveryStatus, servers };
}

/** The leading Runtime-sourced `mcp_servers` progress event of a send stream. */
export function readRuntimeMcpServersProgressEvent(
  event: Record<string, unknown>,
): RuntimeSessionMcpDeliveryReport | undefined {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object') return undefined;
  const record = metadata as Record<string, unknown>;
  if (record.kind !== 'mcp_servers' || record.source !== 'runtime') return undefined;
  return readRuntimeSessionMcpDeliveryReport(record.mcpServers);
}
