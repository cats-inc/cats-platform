import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RuntimeClient, RuntimeSendMessageInput, RuntimeSessionResumeInput } from '../../runtime/client.js';
import type { SessionCapabilitiesSnapshot } from '../../shared/providerInteractions.js';
import { handleMcpHttpRequest, type McpToolCallResult } from '../mcp/jsonRpcServer.js';
import { McpSessionGrantStore } from '../mcp/sessionGrants.js';
import { DesktopControlHelperError, type DesktopControlHelperClient } from './helper.js';
import { evaluateDesktopControlPolicy } from './policy.js';
import {
  DESKTOP_CONTROL_ERROR_CODES, DESKTOP_CONTROL_INSTRUCTIONS, DESKTOP_CONTROL_SERVER_NAME, DESKTOP_CONTROL_TOOLS,
  DesktopControlToolError, parseClick, parseClipboardWrite, parseInvokeElement, parseKey, parseNoArgs, parseOpenApp,
  parseReadUi, parseRequestAppAccess, parseScreenshot, parseScroll, parseTypeText, type DesktopControlErrorCode,
} from './tools.js';

/**
 * SPEC-133: the `cats-desktop` session MCP. A Runtime client proxy attaches the descriptor to
 * sends in conversations that qualify (DC-04); the endpoint serves tools only during a turn the
 * owner sent locally (DC-05) and only for apps the owner granted in Cats (DC-08, DC-09). The
 * first input action of a turn holds control until the turn ends (DC-11). Screenshots, UI text,
 * typed text and clipboard content are never stored or logged (DC-17).
 */

export const DESKTOP_CONTROL_MCP_PATH = '/api/internal/desktop-control/mcp';
const GRANT_WAIT_MS = 60_000;
const TURN_TTL_MS = 30 * 60_000;
const MAX_SESSIONS = 200;
const MAX_PENDING_PER_CHANNEL = 5;
const REQUEST_TTL_MS = 10 * 60_000;
const STOPPED_MESSAGE = 'The owner stopped desktop control; ask for access again.';
const SNAPSHOT_TTL_MS = 60_000;
const MAX_SNAPSHOTS = 20;
/** The helper keeps its last 8 UI reads, so older element ids cannot be resolved anyway. */
const MAX_READS = 8;
const OPERATOR_QUIET_MS = 3_000;

export interface DesktopControlSettings { enabled: boolean; conversations: string[] }
export interface DesktopControlTurnResolution { channelId: string; ownerPresent: boolean }

export interface DesktopControlServiceOptions {
  /** null when this Platform server cannot reach a desktop helper (DC-01). */
  helper: DesktopControlHelperClient | null;
  unavailableReason: string | null;
  endpoint(): string | null;
  readSettings(): Promise<DesktopControlSettings>;
  writeSettings(next: DesktopControlSettings): Promise<void>;
  resolveTurn(sessionId: string, input: RuntimeSendMessageInput): Promise<DesktopControlTurnResolution | null>;
  capabilities(sessionId: string): Promise<SessionCapabilitiesSnapshot | null>;
  now?(): number;
  /** How long request_app_access waits for the owner; tests shorten it. */
  grantWaitMs?: number;
}

interface GrantedApp { appId: string; path: string; publisher: string | null; aumid: string | null; name: string; tier: 'full' | 'observe_only' }
interface Candidate { path: string; publisher: string | null; productName: string; displayName: string; category: string; aumid: string | null }
interface Bounds { x: number; y: number; width: number; height: number }
interface Snapshot { windowId: string; hwnd: number; bounds: Bounds; scale: number; width: number; height: number; capturedAt: number }
interface Session {
  token: string;
  channelId: string;
  turn: { active: boolean; expiresAt: number } | null;
  apps: Map<string, GrantedApp>;
  windows: Map<string, number>;
  windowIdsByHwnd: Map<number, string>;
  reads: number;
  snapshots: Map<string, Snapshot>;
  /** read_ui id prefix to the helper read it came from. */
  uiReads: Map<string, { windowId: string; hwnd: number; readId: number }>;
  /** The app the current turn holds control of (DC-11). */
  holding: string | null;
  /** Input ops this session has in the helper right now. */
  inputs: number;
  /** Advanced by Stop and revoke; a call that started before either answers `stopped`. */
  generation: number;
}
interface GrantRequest {
  requestId: string;
  channelId: string;
  sessionId: string;
  query: string;
  candidate: Candidate;
  reason: string;
  createdAt: string;
  decided: Promise<'allow' | 'deny'>;
  settle(decision: 'allow' | 'deny'): void;
}

export type DesktopControlConversationStatus = 'unavailable' | 'off' | 'not_injected' | 'injected' | 'active_turn' | 'holding';

export interface DesktopControlState {
  available: boolean;
  reason: string | null;
  enabled: boolean;
  conversations: string[];
  conversation?: {
    channelId: string;
    enabled: boolean;
    status: DesktopControlConversationStatus;
    reason: string | null;
    grants: Array<Omit<GrantedApp, 'appId'>>;
    pendingRequests: Array<{ requestId: string; query: string; name: string; path: string; publisher: string | null;
      tier: 'full' | 'observe_only'; reason: string; createdAt: string }>;
  };
}

const opaque = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;

function toolError(code: DesktopControlErrorCode, message: string): McpToolCallResult {
  return { isError: true, content: [{ type: 'text', text: `${code}: ${message}` }], structuredContent: { error: { code, message } } };
}

function toolResult(value: Record<string, unknown>, summary: string): McpToolCallResult {
  return { content: [{ type: 'text', text: summary }], structuredContent: value };
}

/** Helper codes that are also tool codes pass through; the helper-only ones map per SPEC-133. */
function mapHelperError(error: unknown): DesktopControlToolError {
  if (error instanceof DesktopControlToolError) return error;
  if (!(error instanceof DesktopControlHelperError)) return new DesktopControlToolError('unavailable', 'Desktop control failed.');
  const code: DesktopControlErrorCode = error.code === 'window_gone' ? 'window_changed'
    : error.code === 'not_found' ? 'not_granted'
      : (DESKTOP_CONTROL_ERROR_CODES as readonly string[]).includes(error.code) ? error.code as DesktopControlErrorCode
        : 'unavailable';
  return new DesktopControlToolError(code, error.message);
}

export function createDesktopControlService(options: DesktopControlServiceOptions) {
  const now = options.now ?? Date.now;
  const grants = new McpSessionGrantStore<{ sessionId: string }>();
  const sessions = new Map<string, Session>();
  const requests = new Map<string, GrantRequest>();
  const stoppedChannels = new Set<string>();
  const lastReason = new Map<string, string>();
  let closed = false;

  const unavailable = () => options.helper === null ? options.unavailableReason ?? 'unavailable'
    : options.helper.unavailableReason();

  function descriptor(endpoint: string, token: string) {
    return { name: DESKTOP_CONTROL_SERVER_NAME, transport: 'http' as const, url: endpoint, auth: { kind: 'bearer_env' as const, token } };
  }

  function denyPending(predicate: (request: GrantRequest) => boolean) {
    for (const request of [...requests.values()]) if (predicate(request)) request.settle('deny');
  }

  /** The helper's cancel is global, so only a session with input in the helper may send it. */
  function cancelInput(session: Session) {
    if (session.inputs > 0) options.helper?.call('cancel', {}, 5_000).catch(() => undefined);
  }

  function revoke(sessionId: string) {
    const session = sessions.get(sessionId);
    if (!session) return;
    cancelInput(session);
    session.holding = null;
    session.generation += 1;
    grants.revoke(session.token);
    sessions.delete(sessionId);
    denyPending((request) => request.sessionId === sessionId);
  }

  function revokeChannel(channelId: string) {
    for (const [id, session] of [...sessions]) if (session.channelId === channelId) revoke(id);
    denyPending((request) => request.channelId === channelId);
  }

  /** Decide whether this send carries the descriptor, and whether its turn may use the tools. */
  async function qualify(sessionId: string, input: RuntimeSendMessageInput):
    Promise<{ channelId: string; ownerPresent: boolean } | { channelId: string | null; reason: string }> {
    const resolved = await options.resolveTurn(sessionId, input).catch(() => null);
    if (!resolved) return { channelId: null, reason: 'not_a_chat_turn' };
    if (unavailable()) return { channelId: resolved.channelId, reason: unavailable()! };
    const settings = await options.readSettings();
    if (!settings.enabled) return { channelId: resolved.channelId, reason: 'off' };
    if (!settings.conversations.includes(resolved.channelId)) return { channelId: resolved.channelId, reason: 'conversation_off' };
    const verdict = evaluateDesktopControlPolicy(await options.capabilities(sessionId).catch(() => null));
    if (!verdict.ok) return { channelId: resolved.channelId, reason: verdict.reason };
    return resolved;
  }

  function wrapClient<Client extends RuntimeClient>(client: Client): Client {
    return new Proxy(client, {
      get(target, property) {
        if (property === 'sendMessage') return async (sessionId: string, content: string, input?: RuntimeSendMessageInput) => {
          const endpoint = options.endpoint();
          if (closed || !endpoint || !input) return target.sendMessage(sessionId, content, input);
          const verdict = await qualify(sessionId, input);
          if (!('ownerPresent' in verdict)) {
            if (verdict.channelId) lastReason.set(verdict.channelId, verdict.reason);
            const tracked = sessions.has(sessionId);
            revoke(sessionId);
            // Drop a descriptor Runtime may still hold from an earlier qualifying send.
            return target.sendMessage(sessionId, content, tracked ? { ...input, mcpServers: input.mcpServers ?? [] } : input);
          }
          lastReason.delete(verdict.channelId);
          let session = sessions.get(sessionId);
          if (!session || session.channelId !== verdict.channelId) {
            revoke(sessionId);
            if (sessions.size >= MAX_SESSIONS) return target.sendMessage(sessionId, content, input);
            const issued = grants.issue({ sessionId });
            grants.bind(issued.token, sessionId);
            session = { token: issued.token, channelId: verdict.channelId, turn: null, apps: new Map(), windows: new Map(),
              windowIdsByHwnd: new Map(), reads: 0, snapshots: new Map(), uiReads: new Map(), holding: null, inputs: 0, generation: 0 };
            sessions.set(sessionId, session);
          }
          const turn = verdict.ownerPresent ? { active: true, expiresAt: now() + TURN_TTL_MS } : null;
          session.turn = turn;
          session.holding = null;
          const current = session;
          try {
            return await target.sendMessage(sessionId, content, { ...input,
              mcpServers: [...(input.mcpServers ?? []), descriptor(endpoint, session.token)],
              instructions: [input.instructions, DESKTOP_CONTROL_INSTRUCTIONS].filter(Boolean).join('\n\n') });
          } finally {
            if (turn) turn.active = false;
            // DC-11: the end of the turn releases control, and input it left running (a cancelled turn) stops.
            if (current.turn === turn) {
              cancelInput(current);
              current.holding = null;
            }
          }
        };
        if (property === 'resumeSession' && target.resumeSession) return async (sessionId: string, input?: RuntimeSessionResumeInput) => {
          const session = sessions.get(sessionId); const endpoint = options.endpoint();
          if (!session || !endpoint || input?.mcpServers?.some((server) => server.name === DESKTOP_CONTROL_SERVER_NAME)) {
            return target.resumeSession!(sessionId, input);
          }
          return target.resumeSession!(sessionId, { ...input, mcpServers: [...(input?.mcpServers ?? []), descriptor(endpoint, session.token)] });
        };
        if (property === 'cancelSession' || property === 'closeSession' || property === 'deleteSession') return async (sessionId: string) => {
          revoke(sessionId);
          return target[property](sessionId);
        };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  function requireTurn(session: Session) {
    if (closed) throw new DesktopControlToolError('unavailable', 'Desktop control is closed.');
    if (!session.turn?.active || session.turn.expiresAt <= now()) {
      throw new DesktopControlToolError('not_owner_present', 'Desktop tools work only in a turn the owner sent from Cats on this computer.');
    }
    const reason = unavailable();
    if (reason) throw new DesktopControlToolError('unavailable', `Desktop control is unavailable (${reason}).`);
  }

  async function requireUnlocked() {
    const state = await options.helper!.call<{ locked: boolean; operatorIdleMs: number }>('state', {}, 5_000);
    if (state.locked) throw new DesktopControlToolError('locked', 'The screen is locked.');
    return state;
  }

  /** Shared input rules (R5): a granted window in a full-tier app, and an owner who is not using the computer. */
  async function inputTarget(session: Session, windowId: string, operatorIdleMs: number, generation: number) {
    const target = await grantedWindow(session, windowId);
    if (target.app.tier === 'observe_only') {
      throw new DesktopControlToolError('observe_only', `${target.app.name} is granted for observing only.`);
    }
    if (operatorIdleMs >= 0 && operatorIdleMs < OPERATOR_QUIET_MS) {
      throw new DesktopControlToolError('operator_active', 'The owner is using the computer right now.');
    }
    // A Stop while the window was being checked sends nothing.
    if (session.generation !== generation) throw new DesktopControlToolError('stopped', STOPPED_MESSAGE);
    session.holding = target.app.name;
    return target;
  }

  /** Converts screenshot pixels to screen pixels with the snapshot's own bounds and scale. */
  function snapshotPoint(session: Session, snapshotId: string, x: number, y: number) {
    const snapshot = session.snapshots.get(snapshotId);
    if (!snapshot || now() - snapshot.capturedAt > SNAPSHOT_TTL_MS) {
      throw new DesktopControlToolError('stale_snapshot', 'That screenshot is unknown or older than 60 seconds; take a new one.');
    }
    if (x >= snapshot.width || y >= snapshot.height) {
      throw new DesktopControlToolError('stale_snapshot', 'That point is outside the screenshot; take a new one.');
    }
    return { snapshot, x: snapshot.bounds.x + Math.round(x / snapshot.scale), y: snapshot.bounds.y + Math.round(y / snapshot.scale) };
  }

  async function sendInput(session: Session, op: string, params: Record<string, unknown>, timeoutMs: number) {
    session.inputs += 1;
    try {
      await options.helper!.call(op, params, timeoutMs);
    } finally {
      session.inputs -= 1;
    }
  }

  function remember<K, V>(map: Map<K, V>, key: K, value: V, max: number) {
    map.set(key, value);
    while (map.size > max) map.delete(map.keys().next().value as K);
  }

  async function grantedWindow(session: Session, windowId: string): Promise<{ hwnd: number; app: GrantedApp }> {
    const hwnd = session.windows.get(windowId);
    if (hwnd === undefined) throw new DesktopControlToolError('window_changed', 'Unknown windowId; call list_windows again.');
    const listed = await listGranted(session);
    const window = listed.find((row) => row.hwnd === hwnd);
    if (!window) throw new DesktopControlToolError('window_changed', 'That window is gone or no longer granted; call list_windows again.');
    return { hwnd, app: window.app };
  }

  async function listGranted(session: Session) {
    const apps = [...session.apps.values()];
    if (!apps.length) return [];
    const { windows } = await options.helper!.call<{ windows: Array<{ hwnd: number; path: string; title: string;
      bounds: unknown; minimized: boolean; foreground: boolean }> }>('list_windows', { paths: apps.map((app) => app.path) });
    return windows.flatMap((window) => {
      const app = apps.find((row) => row.path.toLowerCase() === window.path.toLowerCase());
      return app ? [{ ...window, app }] : [];
    });
  }

  /** A grant request the owner answers in Cats; it expires unanswered after REQUEST_TTL_MS. */
  function openRequest(sessionId: string, session: Session, query: string, candidate: Candidate, reason: string,
    tier: GrantedApp['tier']): GrantRequest {
    const requestId = opaque('grant');
    let resolveDecision!: (decision: 'allow' | 'deny') => void;
    const decided = new Promise<'allow' | 'deny'>((resolve) => { resolveDecision = resolve; });
    const expiry = setTimeout(() => request.settle('deny'), REQUEST_TTL_MS);
    expiry.unref();
    const request: GrantRequest = {
      requestId, channelId: session.channelId, sessionId, query, candidate, reason,
      createdAt: new Date(now()).toISOString(), decided,
      settle(decision) {
        if (!requests.delete(requestId)) return;
        clearTimeout(expiry);
        if (decision === 'allow' && sessions.get(sessionId) === session) {
          const appId = opaque('app');
          session.apps.set(appId, { appId, path: candidate.path, publisher: candidate.publisher, aumid: candidate.aumid,
            name: candidate.displayName, tier });
          stoppedChannels.delete(session.channelId);
        }
        resolveDecision(decision);
      },
    };
    requests.set(requestId, request);
    return request;
  }

  async function requestAccess(sessionId: string, session: Session, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const { apps, reason } = parseRequestAppAccess(args);
    const { matches } = await options.helper!.call<{ matches: Array<{ query: string; candidates: Candidate[] }> }>(
      'resolve_apps', { queries: apps }, 30_000);
    const results: Array<Record<string, unknown>> = [];
    const waits: Array<Promise<void>> = [];
    for (const query of apps) {
      const candidates = matches.find((match) => match.query === query)?.candidates ?? [];
      const candidate = candidates.find((row) => row.category !== 'excluded') ?? candidates[0];
      if (!candidate) { results.push({ query, status: 'not_found' }); continue; }
      const tier = candidate.category === 'observe_only' ? 'observe_only' as const : 'full' as const;
      const describe = (appId?: string) => ({ ...(appId ? { appId } : {}), name: candidate.displayName, path: candidate.path,
        publisher: candidate.publisher, tier });
      if (candidate.category === 'excluded') { results.push({ query, status: 'excluded', app: describe() }); continue; }
      const existing = [...session.apps.values()].find((app) => app.path.toLowerCase() === candidate.path.toLowerCase()
        && app.publisher === candidate.publisher);
      if (existing) { results.push({ query, status: 'granted', app: describe(existing.appId) }); continue; }
      // Asking again for an app that already waits for the owner joins that request.
      let request = [...requests.values()].find((row) => row.sessionId === sessionId
        && row.candidate.path.toLowerCase() === candidate.path.toLowerCase() && row.candidate.publisher === candidate.publisher);
      if (!request) {
        if ([...requests.values()].filter((row) => row.channelId === session.channelId).length >= MAX_PENDING_PER_CHANNEL) {
          results.push({ query, status: 'denied', app: describe() }); continue;
        }
        request = openRequest(sessionId, session, query, candidate, reason, tier);
      }
      const row: Record<string, unknown> = { query, status: 'pending', app: describe() };
      results.push(row);
      waits.push(request.decided.then((decision) => {
        const app = [...session.apps.values()].find((granted) => granted.path === candidate.path);
        row.status = decision === 'allow' && app ? 'granted' : 'denied';
        if (app) row.app = describe(app.appId);
      }));
    }
    if (waits.length) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([Promise.all(waits), new Promise<void>((resolve) => { timer = setTimeout(resolve, options.grantWaitMs ?? GRANT_WAIT_MS); timer.unref(); })]);
      if (timer) clearTimeout(timer);
    }
    const granted = results.filter((row) => row.status === 'granted').length;
    return toolResult({ results }, `${granted} of ${results.length} app(s) granted.`);
  }

  async function runTool(name: string, args: Record<string, unknown>, sessionId: string, session: Session,
    operatorIdleMs: number, generation: number): Promise<McpToolCallResult> {
    switch (name) {
      case 'request_app_access':
        return await requestAccess(sessionId, session, args);
      case 'list_windows': {
        parseNoArgs(args);
        const windows = (await listGranted(session)).slice(0, 50).map((window) => {
          let windowId = session.windowIdsByHwnd.get(window.hwnd);
          if (!windowId) {
            windowId = opaque('win');
            session.windowIdsByHwnd.set(window.hwnd, windowId);
            session.windows.set(windowId, window.hwnd);
          }
          return { windowId, appId: window.app.appId, title: window.title, bounds: window.bounds,
            minimized: window.minimized, foreground: window.foreground };
        });
        return toolResult({ windows }, `${windows.length} window(s).`);
      }
      case 'screenshot_window': {
        const { windowId, maxEdge } = parseScreenshot(args);
        const { hwnd } = await grantedWindow(session, windowId);
        const shot = await options.helper!.call<{ pngBase64: string; width: number; height: number; scale: number; bounds: Bounds }>(
          'capture_window', { hwnd, maxEdge }, 30_000);
        const capturedAt = now();
        const value = { snapshotId: opaque('snap'), windowId, width: shot.width, height: shot.height, scale: shot.scale,
          capturedAt: new Date(capturedAt).toISOString() };
        remember(session.snapshots, value.snapshotId, { windowId, hwnd, bounds: shot.bounds, scale: shot.scale,
          width: shot.width, height: shot.height, capturedAt }, MAX_SNAPSHOTS);
        return { content: [{ type: 'image', data: shot.pngBase64, mimeType: 'image/png' },
          { type: 'text', text: `Screenshot ${shot.width}x${shot.height}.` }], structuredContent: value };
      }
      case 'read_ui': {
        const { windowId, maxNodes } = parseReadUi(args);
        const { hwnd } = await grantedWindow(session, windowId);
        const ui = await options.helper!.call<{ readId: number; nodes: Array<Record<string, unknown>>; truncated: boolean }>(
          'read_ui', { hwnd, maxNodes }, 30_000);
        const prefix = `ui${++session.reads}`;
        remember(session.uiReads, prefix, { windowId, hwnd, readId: ui.readId }, MAX_READS);
        const nodes = ui.nodes.map((node) => ({ ...node, elementId: `${prefix}.${String(node.elementId)}`,
          parentId: node.parentId === null ? null : `${prefix}.${String(node.parentId)}` }));
        return toolResult({ windowId, nodes, truncated: ui.truncated }, `${nodes.length} element(s)${ui.truncated ? ', truncated' : ''}.`);
      }
      case 'open_app': {
        const { appId } = parseOpenApp(args);
        const app = session.apps.get(appId);
        if (!app) throw new DesktopControlToolError('not_granted', 'That app is not granted; call request_app_access.');
        await options.helper!.call('open_app', { path: app.path, ...(app.aumid ? { aumid: app.aumid } : {}) });
        return toolResult({ opened: true }, `Opened ${app.name}.`);
      }
      case 'click':
      case 'scroll': {
        const parsed = name === 'click' ? parseClick(args) : parseScroll(args);
        const point = snapshotPoint(session, parsed.snapshotId, parsed.x, parsed.y);
        const { hwnd, app } = await inputTarget(session, point.snapshot.windowId, operatorIdleMs, generation);
        // The capture-time bounds make the helper refuse a window that moved since the screenshot.
        const rest = 'button' in parsed ? { button: parsed.button, count: parsed.count }
          : { direction: parsed.direction, amount: parsed.amount };
        await sendInput(session, name, { hwnd, bounds: point.snapshot.bounds, x: point.x, y: point.y, ...rest }, 30_000);
        return toolResult({ done: true }, `${name === 'click' ? 'Clicked' : 'Scrolled'} in ${app.name}.`);
      }
      case 'invoke_element': {
        const { elementId, action } = parseInvokeElement(args);
        const dot = elementId.indexOf('.');
        const read = dot > 0 ? session.uiReads.get(elementId.slice(0, dot)) : undefined;
        if (!read) throw new DesktopControlToolError('window_changed', 'Unknown or old elementId; call read_ui again.');
        const { hwnd, app } = await inputTarget(session, read.windowId, operatorIdleMs, generation);
        await sendInput(session, 'invoke', { hwnd, readId: read.readId, elementId: elementId.slice(dot + 1), action }, 30_000);
        return toolResult({ done: true }, `${action} done in ${app.name}.`);
      }
      case 'type_text': {
        const { windowId, text } = parseTypeText(args);
        const { hwnd, app } = await inputTarget(session, windowId, operatorIdleMs, generation);
        await sendInput(session, 'type', { hwnd, text }, 180_000);
        return toolResult({ done: true }, `Typed ${text.length} character(s) in ${app.name}.`);
      }
      case 'key': {
        const { windowId, keys } = parseKey(args);
        const { hwnd, app } = await inputTarget(session, windowId, operatorIdleMs, generation);
        await sendInput(session, 'key', { hwnd, keys }, 30_000);
        return toolResult({ done: true }, `Pressed ${keys} in ${app.name}.`);
      }
      case 'clipboard_read': {
        parseNoArgs(args);
        const { text } = await options.helper!.call<{ text: string | null }>('clipboard_read', {}, 10_000);
        return toolResult({ text }, text === null ? 'The clipboard holds no text.' : `Read ${text.length} character(s) from the clipboard.`);
      }
      case 'clipboard_write': {
        const { text } = parseClipboardWrite(args);
        await options.helper!.call('clipboard_write', { text }, 10_000);
        return toolResult({ done: true }, `Wrote ${text.length} character(s) to the clipboard.`);
      }
      default:
        throw new DesktopControlToolError('unavailable', `Unknown tool ${name}.`);
    }
  }

  async function callTool(name: string, args: Record<string, unknown>, sessionId: string): Promise<McpToolCallResult> {
    const session = sessions.get(sessionId);
    if (!session) return toolError('unavailable', 'This session has no desktop control.');
    const generation = session.generation;
    try {
      requireTurn(session);
      if (name !== 'request_app_access' && stoppedChannels.has(session.channelId)) {
        throw new DesktopControlToolError('stopped', STOPPED_MESSAGE);
      }
      const { operatorIdleMs } = await requireUnlocked();
      const result = await runTool(name, args, sessionId, session, operatorIdleMs, generation);
      // A Stop or revoke while the helper worked discards its answer.
      if (session.generation !== generation) throw new DesktopControlToolError('stopped', STOPPED_MESSAGE);
      return result;
    } catch (error) {
      const mapped = mapHelperError(error);
      return toolError(mapped.code, mapped.message);
    }
  }

  async function route(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== DESKTOP_CONTROL_MCP_PATH) return false;
    await handleMcpHttpRequest(request, response, {
      maxBodyBytes: 16 * 1024,
      authorize(token) {
        const grant = grants.resolve(token);
        const sessionId = grant?.runtimeSessionId;
        if (closed || !sessionId || sessions.get(sessionId)?.token !== token) return null;
        return sessionId;
      },
      server: {
        name: DESKTOP_CONTROL_SERVER_NAME, version: '1.0.0', instructions: DESKTOP_CONTROL_INSTRUCTIONS,
        listTools: () => DESKTOP_CONTROL_TOOLS,
        callTool: (name, args, sessionId) => callTool(name, args, sessionId),
      },
    });
    return true;
  }

  function conversationStatus(channelId: string, settings: DesktopControlSettings): { status: DesktopControlConversationStatus; reason: string | null } {
    const reason = unavailable();
    if (reason) return { status: 'unavailable', reason };
    if (!settings.enabled) return { status: 'off', reason: 'off' };
    if (!settings.conversations.includes(channelId)) return { status: 'off', reason: 'conversation_off' };
    const tracked = [...sessions.values()].filter((session) => session.channelId === channelId);
    if (tracked.some((session) => session.holding)) return { status: 'holding', reason: null };
    if (tracked.some((session) => session.turn?.active)) return { status: 'active_turn', reason: null };
    if (tracked.length) return { status: 'injected', reason: null };
    return { status: 'not_injected', reason: lastReason.get(channelId) ?? 'no_turn_yet' };
  }

  async function state(channelId?: string): Promise<DesktopControlState> {
    const settings = await options.readSettings();
    const reason = unavailable();
    const result: DesktopControlState = { available: reason === null, reason, enabled: settings.enabled, conversations: settings.conversations };
    if (channelId) {
      const apps = new Map<string, Omit<GrantedApp, 'appId'>>();
      for (const session of sessions.values()) {
        if (session.channelId !== channelId) continue;
        for (const { appId: _appId, ...app } of session.apps.values()) apps.set(`${app.path}|${app.publisher}`, app);
      }
      result.conversation = {
        channelId,
        enabled: settings.conversations.includes(channelId),
        ...conversationStatus(channelId, settings),
        grants: [...apps.values()],
        pendingRequests: [...requests.values()].filter((row) => row.channelId === channelId).map((row) => ({
          requestId: row.requestId, query: row.query, name: row.candidate.displayName, path: row.candidate.path,
          publisher: row.candidate.publisher, tier: row.candidate.category === 'observe_only' ? 'observe_only' as const : 'full' as const,
          reason: row.reason, createdAt: row.createdAt,
        })),
      };
    }
    return result;
  }

  return {
    wrapClient,
    route,
    state,
    async setEnabled(enabled: boolean) {
      const settings = await options.readSettings();
      await options.writeSettings({ ...settings, enabled });
      if (!enabled) {
        for (const id of [...sessions.keys()]) revoke(id);
        denyPending(() => true);
        options.helper?.reset();
      }
    },
    async setConversation(channelId: string, enabled: boolean) {
      const settings = await options.readSettings();
      const conversations = enabled ? [...new Set([...settings.conversations, channelId])]
        : settings.conversations.filter((id) => id !== channelId);
      await options.writeSettings({ ...settings, conversations });
      if (!enabled) revokeChannel(channelId);
    },
    /** false when the request is unknown, already answered or belongs to another conversation. */
    decideGrant(requestId: string, decision: 'allow' | 'deny', channelId?: string): boolean {
      const request = requests.get(requestId);
      if (!request || (channelId !== undefined && request.channelId !== channelId)) return false;
      request.settle(decision);
      return true;
    },
    /** DC-12: revokes grants, releases control and cancels the helper op of a conversation that holds control. */
    stop(channelId?: string) {
      const channels = channelId ? [channelId] : [...new Set([...sessions.values()].map((session) => session.channelId))];
      let held = false;
      for (const id of channels) {
        stoppedChannels.add(id);
        denyPending((request) => request.channelId === id);
        for (const session of sessions.values()) {
          if (session.channelId !== id) continue;
          held ||= session.holding !== null || session.inputs > 0;
          session.generation += 1;
          session.apps.clear();
          session.windows.clear();
          session.windowIdsByHwnd.clear();
          session.snapshots.clear();
          session.uiReads.clear();
          session.holding = null;
        }
      }
      // The helper's cancel is global, so only a conversation that holds control or has input running may send it.
      if (held) options.helper?.call('cancel', {}, 5_000).catch(() => undefined);
    },
    /** What the Desktop host shows in the tray and the topmost notice (DC-11). */
    hostState(): { holding: Array<{ channelId: string; app: string }> } {
      return { holding: [...sessions.values()].flatMap((session) => session.holding
        ? [{ channelId: session.channelId, app: session.holding }] : []) };
    },
    isTurnActive: (sessionId: string) => sessions.get(sessionId)?.turn?.active === true,
    /** Platform data reset: forget every grant and request; preferences reset turns the feature off. */
    reset() {
      for (const id of [...sessions.keys()]) revoke(id);
      denyPending(() => true);
      stoppedChannels.clear();
      lastReason.clear();
      options.helper?.reset();
    },
    close() {
      closed = true;
      for (const id of [...sessions.keys()]) revoke(id);
      denyPending(() => true);
      options.helper?.close();
    },
  };
}

export type DesktopControlService = ReturnType<typeof createDesktopControlService>;
