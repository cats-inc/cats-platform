/**
 * A narrow client for the `cats-runtime` delivery API.
 *
 * The runtime is the only execution boundary, so every repository and artifact
 * side effect goes through these endpoints rather than through a git or
 * filesystem call made here.
 *
 * Responses are parsed defensively: this is a cross-repository contract, and a
 * shape change in `cats-runtime` must degrade to "no evidence" rather than
 * throw somewhere deep inside a supervised run.
 *
 * Note: `src/products/code/state/deliveryProxy.ts` predates this module and
 * speaks the same endpoints. They should converge on this client; the Code
 * proxy is left untouched here to keep this change out of another product tree.
 */

export interface RuntimeRepoSnapshot {
  supported: boolean;
  repository: boolean;
  clean: boolean | null;
  branch: string | null;
  headOid: string | null;
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
}

export interface RuntimeCommitOutcome {
  state: string;
  commitId: string | null;
  blockedReasons: string[];
}

export interface RuntimeArtifactSummary {
  id: string;
  label: string | null;
  path: string | null;
  mediaType: string | null;
}

/**
 * Outcome of one externally-visible publish action.
 *
 * `pending` is its own state rather than a kind of failure: a wait that has not
 * finished has performed no side effect and must not be retried from the start,
 * so the caller needs to tell it apart from a refusal.
 */
export interface RuntimePublishOutcome {
  state: 'completed' | 'pending' | 'blocked';
  /** Branch, pull-request URL, or preview URL, depending on the action. */
  reference: string | null;
  /** Set when `state` is `pending`; resumes the same runtime operation. */
  pendingOperationId: string | null;
  blockedReasons: string[];
}

export interface RuntimeDeliveryClient {
  inspectRepo(input: { workspacePath?: string | null; sessionId?: string | null }): Promise<
    RuntimeRepoSnapshot
  >;
  createCommit(input: {
    workspacePath?: string | null;
    sessionId?: string | null;
    message: string;
  }): Promise<RuntimeCommitOutcome>;
  /** Non-mutating listing of a session's artifacts. Never publishes (FR-38). */
  previewArtifacts(input: {
    workspacePath?: string | null;
    sessionId?: string | null;
  }): Promise<RuntimeArtifactSummary[]>;
  /**
   * Pushes the current branch. `approvalRef` carries the Core approval id that
   * authorized this, so the runtime records who allowed the side effect rather
   * than being told only that someone did.
   */
  pushBranch(input: {
    workspacePath?: string | null;
    sessionId?: string | null;
    approvalRef: string;
  }): Promise<RuntimePublishOutcome>;
  openPullRequest(input: {
    workspacePath?: string | null;
    sessionId?: string | null;
    approvalRef: string;
    title: string;
    body: string;
  }): Promise<RuntimePublishOutcome>;
  /**
   * Waits for the pull request's checks, bounded.
   *
   * Returns `pending` with an operation id when the budget runs out before the
   * checks do, and `blocked` when a check actually failed — a red build is a
   * real answer, not a timeout.
   */
  waitForChecks(input: {
    workspacePath?: string | null;
    sessionId?: string | null;
    approvalRef: string;
    timeoutMs?: number;
    resumeOperationId?: string | null;
  }): Promise<RuntimePublishOutcome>;
  publishPreview(input: {
    workspacePath?: string | null;
    sessionId?: string | null;
    approvalRef: string;
  }): Promise<RuntimePublishOutcome>;
}

export interface CreateRuntimeDeliveryClientInput {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readBlockedReasons(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [entry];
    }
    if (isRecord(entry)) {
      return [readString(entry.code) ?? readString(entry.message) ?? 'blocked'];
    }
    return [];
  });
}

function parseRepoSnapshot(body: unknown): RuntimeRepoSnapshot {
  const repo = isRecord(body) && isRecord(body.repo) ? body.repo : null;
  if (repo === null) {
    return {
      supported: false,
      repository: false,
      clean: null,
      branch: null,
      headOid: null,
      stagedCount: 0,
      modifiedCount: 0,
      untrackedCount: 0,
    };
  }
  return {
    supported: repo.supported === true,
    repository: repo.repository === true,
    clean: typeof repo.clean === 'boolean' ? repo.clean : null,
    branch: readString(repo.branch),
    headOid: readString(repo.headOid),
    stagedCount: readCount(repo.stagedCount),
    modifiedCount: readCount(repo.modifiedCount),
    untrackedCount: readCount(repo.untrackedCount),
  };
}

/**
 * The runtime's states are wider than a publish cares about; anything that is
 * not an explicit completion is treated as blocked so an ambiguous state can
 * never be mistaken for a landed side effect.
 */
function readPublishState(value: unknown): RuntimePublishOutcome['state'] {
  const state = readString(value);
  if (state === 'completed') {
    return 'completed';
  }
  return state === 'degraded' || state === 'polling' ? 'pending' : 'blocked';
}

/**
 * Interprets a checks wait.
 *
 * `completed` from the runtime only means the checks stopped running, so the
 * conclusions still have to be read: a finished red build is a blocked publish,
 * not a successful one.
 */
function parseChecksOutcome(body: unknown): RuntimePublishOutcome {
  const record = isRecord(body) ? body : {};
  const state = readPublishState(record.state);
  const operation = isRecord(record.operation) ? record.operation : {};
  const pendingOperationId = readString(operation.operationId);

  if (state === 'pending') {
    return { state: 'pending', reference: null, pendingOperationId, blockedReasons: [] };
  }
  if (state !== 'completed') {
    return {
      state: 'blocked',
      reference: null,
      pendingOperationId,
      blockedReasons: readBlockedReasons(record.blockedReasons),
    };
  }

  const outputs = isRecord(record.outputs) ? record.outputs : {};
  const checks = Array.isArray(outputs.checks) ? outputs.checks : [];
  const failed = checks.filter((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    const conclusion = String(entry.conclusion ?? entry.state ?? '').toUpperCase();
    return conclusion !== '' && conclusion !== 'SUCCESS' && conclusion !== 'NEUTRAL'
      && conclusion !== 'SKIPPED';
  });
  if (failed.length > 0) {
    return {
      state: 'blocked',
      reference: null,
      pendingOperationId: null,
      blockedReasons: failed.map((entry) => {
        const record_ = entry as Record<string, unknown>;
        const name = readString(record_.name) ?? 'check';
        const conclusion = readString(record_.conclusion) ?? 'failed';
        return `check_failed:${name}:${conclusion}`;
      }),
    };
  }
  return { state: 'completed', reference: null, pendingOperationId: null, blockedReasons: [] };
}

function parseArtifacts(body: unknown): RuntimeArtifactSummary[] {
  if (!isRecord(body) || !Array.isArray(body.artifacts)) {
    return [];
  }
  return body.artifacts.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    // The runtime wraps published records; a preview returns the artifact
    // directly. Accept either.
    const artifact = isRecord(entry.artifact) ? entry.artifact : entry;
    const id = readString(artifact.id);
    if (id === null) {
      return [];
    }
    return [{
      id,
      label: readString(artifact.label),
      path: readString(artifact.path),
      mediaType: readString(artifact.mediaType),
    }];
  });
}

export function createRuntimeDeliveryClient(
  input: CreateRuntimeDeliveryClientInput,
): RuntimeDeliveryClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (input.apiKey) {
      headers.authorization = `Bearer ${input.apiKey}`;
    }
    const response = await fetchImpl(`${input.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Runtime delivery request failed: ${response.status} ${response.statusText}`
        + (text ? ` — ${text.slice(0, 200)}` : ''),
      );
    }
    return await response.json();
  }

  return {
    async inspectRepo({ workspacePath, sessionId }) {
      return parseRepoSnapshot(await post('/delivery/repo/status', {
        action: 'inspect-repo-status',
        ...(workspacePath ? { workspacePath } : {}),
        ...(sessionId ? { sessionId } : {}),
      }));
    },

    async createCommit({ workspacePath, sessionId, message }) {
      const body = await post('/delivery/repo/commit', {
        action: 'create-commit',
        ...(workspacePath ? { workspacePath } : {}),
        apply: true,
        actorRole: 'owner',
        approved: true,
        // cats-runtime reads commit options from `repo`, not `context`.
        // Golden-path sessions run in a runtime-managed isolated worktree. Cats
        // stages that entire clean-baseline sandbox itself; the provider has no
        // git/shell tool and cannot sweep the operator's original worktree.
        repo: { message, stageAll: true },
        context: { source: 'cats_work_golden_path', isolatedWorktree: true },
        ...(sessionId ? { sessionId } : {}),
      });
      const record = isRecord(body) ? body : {};
      const metadata = isRecord(record.metadata) ? record.metadata : {};
      const commit = isRecord(metadata.commit) ? metadata.commit : {};
      return {
        state: readString(record.state) ?? 'unknown',
        commitId: readString(commit.oid)
          ?? parseRepoSnapshot(body).headOid,
        blockedReasons: readBlockedReasons(record.blockedReasons),
      };
    },

    async pushBranch({ workspacePath, sessionId, approvalRef }) {
      const body = await post('/delivery/repo/push', {
        action: 'push-branch',
        ...(workspacePath ? { workspacePath } : {}),
        apply: true,
        // cats-runtime authorizes delivery from top-level fields. Preserve the
        // Core approval reference as delivery context for audit correlation.
        actorRole: 'owner',
        approved: true,
        context: { approvalRef },
        ...(sessionId ? { sessionId } : {}),
      });
      const record = isRecord(body) ? body : {};
      const repo = parseRepoSnapshot(body);
      return {
        state: readPublishState(record.state),
        reference: repo.branch,
        pendingOperationId: null,
        blockedReasons: readBlockedReasons(record.blockedReasons),
      };
    },

    async openPullRequest({ workspacePath, sessionId, approvalRef, title, body: prBody }) {
      const body = await post('/management/review/open-pr', {
        ...(workspacePath ? { workspacePath } : {}),
        apply: true,
        actorClass: 'owner',
        approvalRef,
        ...(sessionId ? { sessionId } : {}),
        target: { title, body: prBody },
      });
      const record = isRecord(body) ? body : {};
      const result = isRecord(record.result) ? record.result : record;
      return {
        state: readPublishState(record.state ?? result.state),
        reference: readString(result.url)
          ?? readString(result.pullRequestUrl)
          ?? readString(result.reference),
        pendingOperationId: null,
        blockedReasons: readBlockedReasons(record.blockedReasons ?? result.blockedReasons),
      };
    },

    async waitForChecks({ workspacePath, sessionId, approvalRef, timeoutMs, resumeOperationId }) {
      const body = resumeOperationId
        ? await post(`/management/operations/${encodeURIComponent(resumeOperationId)}/resume`, {
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        })
        : await post('/management/review/wait-checks', {
          ...(workspacePath ? { workspacePath } : {}),
          apply: true,
          actorClass: 'owner',
          approvalRef,
          ...(sessionId ? { sessionId } : {}),
          ...(timeoutMs === undefined ? {} : { target: { timeoutMs } }),
        });
      return parseChecksOutcome(body);
    },

    async publishPreview({ workspacePath, sessionId, approvalRef }) {
      const body = await post('/management/deployment/create', {
        ...(workspacePath ? { workspacePath } : {}),
        apply: true,
        actorClass: 'owner',
        approvalRef,
        ...(sessionId ? { sessionId } : {}),
      });
      const record = isRecord(body) ? body : {};
      const outputs = isRecord(record.outputs) ? record.outputs : {};
      return {
        state: readPublishState(record.state),
        reference: readString(outputs.url)
          ?? readString(outputs.previewUrl)
          ?? readString(outputs.deploymentUrl),
        pendingOperationId: null,
        blockedReasons: readBlockedReasons(record.blockedReasons),
      };
    },

    async previewArtifacts({ workspacePath, sessionId }) {
      return parseArtifacts(await post('/delivery/artifacts/publish', {
        action: 'publish-artifacts',
        // `apply: false` resolves the session's artifacts without copying them,
        // which is what keeps a declaration at `ready` rather than `published`.
        apply: false,
        ...(workspacePath ? { workspacePath } : {}),
        ...(sessionId ? { sessionId } : {}),
      }));
    },
  };
}
