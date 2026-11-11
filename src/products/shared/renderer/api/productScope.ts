import type { ProductScope } from '../../../../shared/productScope.js';
import type { SessionExecutionPolicy } from '../../../../shared/providerInteractions.js';

/** SPEC-141 FR-21: what a raise would do, read from the owner-only route. */
export interface ProductScopeRaiseView {
  channelId: string;
  scope: ProductScope;
  origin: ProductScope | null;
  canRaise: boolean;
  refusal: string | null;
  widerLevels: ProductScope[];
  participants: Array<{ id: string; name: string; kind: string }>;
  workspace: {
    repoPath: string | null;
    chatCwd: string | null;
    workspaceKind: string | null;
    workspaceAccess: string | null;
    permissionMode: string | null;
    executionPolicy: SessionExecutionPolicy | null;
  };
  livePreviewsEnabled: boolean;
  revision: string;
}

/** A refused or failed read or raise, with the route's stable code when it sent one (FR-23). */
export class ProductScopeRaiseError extends Error {
  constructor(readonly code: string | null, message: string) {
    super(message);
    this.name = 'ProductScopeRaiseError';
  }
}

function productScopePath(channelId: string): string {
  return `/api/channels/${encodeURIComponent(channelId)}/product-scope`;
}

async function readFailure(response: Response): Promise<ProductScopeRaiseError> {
  try {
    const payload = await response.json() as { error?: { code?: unknown; message?: unknown } | string };
    if (payload.error && typeof payload.error === 'object') {
      return new ProductScopeRaiseError(
        typeof payload.error.code === 'string' ? payload.error.code : null,
        typeof payload.error.message === 'string' ? payload.error.message : `HTTP ${response.status}`,
      );
    }
  } catch {
    // The body was not JSON; the status is all there is.
  }
  return new ProductScopeRaiseError(null, `HTTP ${response.status}`);
}

export async function fetchProductScopeRaise(
  channelId: string,
  signal?: AbortSignal,
): Promise<ProductScopeRaiseView> {
  const response = await fetch(productScopePath(channelId), { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw await readFailure(response);
  return await response.json() as ProductScopeRaiseView;
}

/** FR-22: the raise itself, with the revision the owner confirmed. */
export async function raiseProductScope(
  channelId: string,
  target: ProductScope,
  revision: string,
): Promise<ProductScopeRaiseView & { from: ProductScope; to: ProductScope }> {
  const response = await fetch(productScopePath(channelId), {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ target, revision }),
  });
  if (!response.ok) throw await readFailure(response);
  return await response.json() as ProductScopeRaiseView & { from: ProductScope; to: ProductScope };
}
