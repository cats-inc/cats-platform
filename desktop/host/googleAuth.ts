import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  GOOGLE_AUTH_TTL_MS, GOOGLE_CALLBACK_PATH,
  type DesktopGoogleAuthStatus, type DesktopGoogleAuthStartInput,
  type DesktopGoogleAuthAvailability,
} from './googleAuthContracts.js';

interface PlatformReply { status: number; body: unknown; setCookie?: string }
interface PrivateStart {
  transactionId: string; state: string; nonce: string; callbackUrl: string; expiresAt: string;
}
interface Transaction {
  input: DesktopGoogleAuthStartInput;
  start: PrivateStart;
  snapshot: DesktopGoogleAuthStatus;
  verifier: string;
  abort: AbortController;
  server: Server;
  timer: ReturnType<typeof setTimeout>;
  callbackUsed: boolean;
  proofToken?: string;
}

export interface DesktopGoogleAuthOptions {
  clientId: string | null;
  platformRequest: (path: string, body: unknown, headers?: Record<string, string>) => Promise<PlatformReply>;
  openBrowser: (url: string) => Promise<void>;
  acceptSessionCookie: (cookie: string) => Promise<void>;
  exchangeCode?: (input: {
    code: string; verifier: string; callbackUrl: string; clientId: string; signal: AbortSignal;
  }) => Promise<string>;
  now?: () => number;
}

/** System-browser OAuth; all provider material stays in this trusted process. */
export class DesktopGoogleAuthController {
  private current: Transaction | null = null;
  private generation = 0;
  private starting = false;
  private submitting = false;
  private committing = false;
  private clearAfterCommit = false;
  private openingServer: Server | null = null;
  private readonly contextId = randomBytes(32).toString('base64url');
  private readonly now: () => number;

  constructor(private readonly options: DesktopGoogleAuthOptions) {
    this.now = options.now ?? Date.now;
  }

  async availability(): Promise<DesktopGoogleAuthAvailability> {
    return { available: Boolean(this.options.clientId), reason: this.options.clientId ? 'ready' : 'not_configured' };
  }

  async start(value: unknown): Promise<DesktopGoogleAuthStatus> {
    const input = parseStart(value);
    if (!this.options.clientId) throw new Error('Google Desktop sign-in is not configured.');
    if (this.starting || this.submitting || this.committing) throw new Error('Google sign-in is already in progress.');
    this.starting = true;
    const generation = ++this.generation;
    try {
      await this.clearResources();
      if (generation !== this.generation) throw new Error('Google sign-in was cancelled.');
      return await this.begin(input, generation);
    }
    finally { this.starting = false; }
  }

  private async begin(input: DesktopGoogleAuthStartInput, generation: number): Promise<DesktopGoogleAuthStatus> {
    const server = createServer((request, response) => {
      void this.callback(request, response).catch(() => { if (!response.writableEnded) response.end(); });
    });
    this.openingServer = server;
    server.maxHeadersCount = 32;
    server.headersTimeout = 5000;
    server.requestTimeout = 10_000;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.once('close', () => reject(new Error('Google sign-in was cancelled.')));
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Google callback could not start.');
    const callbackUrl = `http://127.0.0.1:${address.port}${GOOGLE_CALLBACK_PATH}`;
    let startedId: string | null = null;
    try {
      const reply = await this.options.platformRequest('/api/desktop/auth/google/start', {
        ...input, contextId: this.contextId, callbackUrl,
      });
      if (reply.status !== 200) throw new Error('Google sign-in could not start.');
      const start = readPrivateStart(reply.body, callbackUrl);
      startedId = start.transactionId;
      if (generation !== this.generation) throw new Error('Google sign-in was cancelled.');
      const verifier = randomBytes(32).toString('base64url');
      const timer = setTimeout(() => { void this.fail(this.current, 'expired'); },
        Math.max(1, Math.min(GOOGLE_AUTH_TTL_MS, Date.parse(start.expiresAt) - this.now())));
      timer.unref?.();
      const tx: Transaction = {
        input, start, verifier, server, timer, abort: new AbortController(), callbackUsed: false,
        snapshot: { transactionId: start.transactionId, phase: 'waiting', expiresAt: start.expiresAt },
      };
      this.current = tx;
      this.openingServer = null;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: this.options.clientId!, redirect_uri: callbackUrl,
        response_type: 'code', scope: 'openid email profile', access_type: 'online',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256', state: start.state, nonce: start.nonce, prompt: 'select_account',
      }).toString();
      await this.options.openBrowser(url.toString());
      return this.status(start.transactionId);
    } catch {
      if (this.openingServer === server) this.openingServer = null;
      server.closeAllConnections();
      server.close();
      if (generation === this.generation) await this.fail(this.current, 'start_failed');
      if (startedId) void this.options.platformRequest('/api/desktop/auth/google/cancel', {
        contextId: this.contextId, transactionId: startedId,
      }).catch(() => {});
      throw new Error('Google sign-in could not start.');
    }
  }

  async status(id: string): Promise<DesktopGoogleAuthStatus> {
    const tx = this.current;
    if (!tx || tx.start.transactionId !== id) throw new Error('Google transaction is unavailable.');
    if (!tx.snapshot.committing && (tx.snapshot.phase === 'waiting' || tx.proofToken !== undefined)
      && Date.parse(tx.start.expiresAt) <= this.now()) await this.fail(tx, 'expired');
    return { ...tx.snapshot };
  }

  async cancel(id?: string): Promise<DesktopGoogleAuthStatus | null> {
    if (this.committing) return this.current ? { ...this.current.snapshot } : null;
    if (id === undefined) { await this.clear(); return null; }
    if (this.current?.start.transactionId !== id) return null;
    const tx = this.current;
    ++this.generation;
    tx.snapshot.phase = 'cancelled';
    await this.close(tx);
    return { ...tx.snapshot };
  }

  async clear(): Promise<void> {
    // Cookie publication is a non-cancellable commit. Full host shutdown still
    // proceeds: local callback resources are already closed before publication.
    if (this.committing) { this.clearAfterCommit = true; return; }
    ++this.generation;
    await this.clearResources();
  }

  private async clearResources(): Promise<void> {
    if (this.openingServer) {
      this.openingServer.closeAllConnections();
      this.openingServer.close();
      this.openingServer = null;
    }
    const tx = this.current;
    this.current = null;
    if (tx) await this.close(tx);
  }

  async submit(value: unknown): Promise<{ status: number; body: unknown }> {
    if (!value || typeof value !== 'object') throw new Error('Invalid Google completion.');
    const input = value as Record<string, unknown>;
    const tx = this.current;
    if (!tx || tx.start.transactionId !== input.transactionId
      || (await this.status(tx.start.transactionId)).phase !== 'verified' || !tx.proofToken) {
      throw new Error('Google confirmation is required.');
    }
    const headers: Record<string, string> = {
      'x-cats-google-proof': tx.proofToken, 'x-cats-desktop-auth-context': this.contextId,
    };
    let path: string, body: unknown;
    if (tx.input.purpose === 'bootstrap') {
      const setup = input.setup;
      if (!setup || typeof setup !== 'object' || Array.isArray(setup)
        || 'adminPassword' in setup || 'adminIdentifier' in setup
        || (setup as { attemptId?: unknown }).attemptId !== tx.input.attemptId) {
        throw new Error('Invalid Google setup completion.');
      }
      path = '/api/platform/setup/complete';
      body = { ...setup, adminMethod: 'google' };
    } else if (tx.input.purpose === 'set_password') {
      if (typeof input.password !== 'string' || typeof input.csrfToken !== 'string') {
        throw new Error('Password and CSRF confirmation are required.');
      }
      path = '/api/auth/password/first';
      body = { password: input.password };
      headers['x-cats-csrf-token'] = input.csrfToken;
    } else throw new Error('This transaction has no deferred action.');
    // The proof is attempted once, including persistence or validation failure.
    tx.proofToken = undefined;
    const generation = this.generation;
    this.submitting = true;
    try {
      const reply = await this.options.platformRequest(path, body, headers);
      if (this.current !== tx || tx.abort.signal.aborted || generation !== this.generation) {
        throw new Error('Google completion was cancelled.');
      }
      if (reply.status === 200 && reply.setCookie) await this.commitCookie(tx, reply.setCookie);
      return { status: reply.status, body: reply.body };
    } finally {
      this.submitting = false;
      if (this.current === tx && generation === this.generation) await this.clear();
    }
  }

  private async callback(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const tx = this.current;
    const reject = (status: number) => { response.writeHead(status); response.end('Invalid callback.'); };
    if (!tx || tx.snapshot.phase !== 'waiting' || tx.callbackUsed
      || request.method !== 'GET' || request.headers.origin !== undefined
      || request.headers.host !== new URL(tx.start.callbackUrl).host || (request.url?.length ?? 0) > 8192) {
      reject(400); return;
    }
    const url = new URL(request.url ?? '/', tx.start.callbackUrl);
    if (url.pathname !== GOOGLE_CALLBACK_PATH || url.searchParams.getAll('state').length !== 1
      || url.searchParams.get('state') !== tx.start.state) { reject(400); return; }
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    if ((!error && !code) || (error && code) || url.searchParams.getAll('code').length > 1
      || url.searchParams.getAll('error').length > 1) { reject(400); return; }
    tx.callbackUsed = true;
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'" });
    response.end('Return to Cats to continue. You can close this window.');
    if (error) { await this.fail(tx, 'access_denied'); return; }
    try {
      const idToken = await (this.options.exchangeCode ?? exchangeGoogleCode)({
        code: code!, verifier: tx.verifier, callbackUrl: tx.start.callbackUrl,
        clientId: this.options.clientId!, signal: tx.abort.signal,
      });
      if (this.current !== tx || tx.abort.signal.aborted) return;
      const reply = await this.options.platformRequest('/api/desktop/auth/google/complete', {
        contextId: this.contextId, transactionId: tx.start.transactionId,
        state: tx.start.state, callbackUrl: tx.start.callbackUrl, idToken,
        ...('csrfToken' in tx.input ? { csrfToken: tx.input.csrfToken } : {}),
      });
      if (this.current !== tx || tx.abort.signal.aborted) return;
      if (reply.status !== 200) throw new Error('Google confirmation failed.');
      if (tx.input.purpose === 'bootstrap' || tx.input.purpose === 'set_password') {
        const proof = reply.body as { proofToken?: unknown; expiresAt?: unknown };
        if (typeof proof.proofToken !== 'string' || typeof proof.expiresAt !== 'string') throw new Error();
        tx.proofToken = proof.proofToken;
        tx.start.expiresAt = proof.expiresAt;
        tx.snapshot.expiresAt = proof.expiresAt;
      } else if (reply.setCookie) await this.commitCookie(tx, reply.setCookie);
      if (this.current !== tx || tx.abort.signal.aborted) return;
      tx.verifier = '';
      tx.snapshot.phase = 'verified';
      tx.server.close();
      tx.server.closeIdleConnections();
    } catch { await this.fail(tx, 'confirmation_failed'); }
  }

  private async commitCookie(tx: Transaction, cookie: string): Promise<void> {
    if (this.current !== tx || tx.abort.signal.aborted) throw new Error('Google completion was cancelled.');
    this.committing = true;
    tx.snapshot.committing = true;
    clearTimeout(tx.timer);
    tx.verifier = '';
    tx.server.close();
    tx.server.closeIdleConnections();
    try { await this.options.acceptSessionCookie(cookie); }
    finally {
      tx.snapshot.committing = false;
      this.committing = false;
      if (this.clearAfterCommit) { this.clearAfterCommit = false; await this.clear(); }
    }
  }

  private async fail(tx: Transaction | null, error: string): Promise<void> {
    if (!tx || this.current !== tx) return;
    tx.snapshot.phase = 'failed';
    tx.snapshot.error = error;
    await this.close(tx);
  }

  private async close(tx: Transaction): Promise<void> {
    clearTimeout(tx.timer);
    tx.abort.abort();
    tx.verifier = '';
    tx.proofToken = undefined;
    tx.server.closeAllConnections();
    tx.server.close();
    const cancellation = this.options.platformRequest('/api/desktop/auth/google/cancel', {
      contextId: this.contextId, transactionId: tx.start.transactionId,
    }).catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([cancellation, new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 1000);
    })]);
    if (timer) clearTimeout(timer);
  }
}

function parseStart(value: unknown): DesktopGoogleAuthStartInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Google action.');
  const input = value as Record<string, unknown>;
  const text = (key: string) => {
    const value = input[key];
    if (typeof value !== 'string' || !value || value.length > 256) throw new Error('Invalid Google action.');
    return value;
  };
  if (input.purpose === 'bootstrap') return { purpose: 'bootstrap', attemptId: text('attemptId') };
  if (input.purpose === 'login') return { purpose: 'login' };
  if (input.purpose === 'set_password') return { purpose: 'set_password', csrfToken: text('csrfToken') };
  if (input.purpose === 'link_google') return {
    purpose: 'link_google', actionToken: text('actionToken'), csrfToken: text('csrfToken'),
  };
  throw new Error('Invalid Google action.');
}

function readPrivateStart(value: unknown, callbackUrl: string): PrivateStart {
  const input = value as Partial<PrivateStart> | null;
  if (!input || ['transactionId', 'state', 'nonce', 'expiresAt'].some((key) =>
    typeof input[key as keyof PrivateStart] !== 'string') || input.callbackUrl !== callbackUrl
    || !Number.isFinite(Date.parse(input.expiresAt!))) throw new Error('Invalid Google transaction.');
  return input as PrivateStart;
}

async function exchangeGoogleCode(input: {
  code: string; verifier: string; callbackUrl: string; clientId: string; signal: AbortSignal;
}): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.any([input.signal, AbortSignal.timeout(20_000)]),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: input.clientId, code: input.code,
      code_verifier: input.verifier, redirect_uri: input.callbackUrl, grant_type: 'authorization_code' }),
  });
  if (!response.ok) throw new Error('Google token exchange failed.');
  const body = await response.json() as { id_token?: unknown };
  if (typeof body.id_token !== 'string' || body.id_token.length > 8192) throw new Error('Missing ID token.');
  return body.id_token;
}
