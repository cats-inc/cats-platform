export interface DeliveryRepoStatusInput {
  workspacePath: string;
  sessionId?: string | null;
}

export interface DeliveryCommitInput {
  workspacePath: string;
  sessionId?: string | null;
  message?: string | null;
  stageAll?: boolean;
  apply: boolean;
}

export interface DeliveryPushInput {
  workspacePath: string;
  sessionId?: string | null;
  remote?: string | null;
  branch?: string | null;
  apply: boolean;
}

export interface DeliveryArtifactExportInput {
  workspacePath?: string | null;
  sessionId?: string | null;
  artifactIds?: string[];
}

export interface DeliveryResult {
  action: string;
  state: string;
  contract?: Record<string, unknown>;
  repo?: Record<string, unknown>;
  artifacts?: unknown[];
  warnings?: unknown[];
  blockedReasons?: unknown[];
  [key: string]: unknown;
}

export class CodeDeliveryProxy {
  constructor(
    private readonly runtimeBaseUrl: string,
    private readonly apiKey: string = '',
  ) {}

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.apiKey) {
      headers['authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async post(path: string, body: Record<string, unknown>): Promise<DeliveryResult> {
    const response = await fetch(`${this.runtimeBaseUrl}${path}`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Runtime delivery request failed: ${response.status} ${response.statusText}`
        + (text ? ` — ${text.slice(0, 200)}` : ''),
      );
    }

    return (await response.json()) as DeliveryResult;
  }

  async inspectRepoStatus(input: DeliveryRepoStatusInput): Promise<DeliveryResult> {
    return this.post('/delivery/repo/status', {
      action: 'inspect-repo-status',
      workspacePath: input.workspacePath,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
  }

  async previewCommit(input: DeliveryCommitInput): Promise<DeliveryResult> {
    return this.post('/delivery/repo/commit', {
      action: 'create-commit',
      workspacePath: input.workspacePath,
      apply: false,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.message ? { context: { message: input.message } } : {}),
      ...(input.stageAll ? { context: { stageAll: true } } : {}),
    });
  }

  async applyCommit(input: DeliveryCommitInput): Promise<DeliveryResult> {
    return this.post('/delivery/repo/commit', {
      action: 'create-commit',
      workspacePath: input.workspacePath,
      apply: true,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.message ? { context: { message: input.message } } : {}),
      ...(input.stageAll ? { context: { stageAll: true } } : {}),
    });
  }

  async previewPush(input: DeliveryPushInput): Promise<DeliveryResult> {
    return this.post('/delivery/repo/push', {
      action: 'push-branch',
      workspacePath: input.workspacePath,
      apply: false,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.remote ? { context: { remote: input.remote } } : {}),
      ...(input.branch ? { context: { branch: input.branch } } : {}),
    });
  }

  async applyPush(input: DeliveryPushInput): Promise<DeliveryResult> {
    return this.post('/delivery/repo/push', {
      action: 'push-branch',
      workspacePath: input.workspacePath,
      apply: true,
      authorization: { actorRole: 'owner', approved: true },
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.remote ? { context: { remote: input.remote } } : {}),
      ...(input.branch ? { context: { branch: input.branch } } : {}),
    });
  }

  async publishArtifacts(input: DeliveryArtifactExportInput): Promise<DeliveryResult> {
    return this.post('/delivery/artifacts/publish', {
      action: 'publish-artifacts',
      ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.artifactIds?.length ? { artifactIds: input.artifactIds } : {}),
    });
  }
}
