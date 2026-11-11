import {
  compareProductScopes,
  isDirectLaneSource,
  PRODUCT_SCOPES,
  readProductScope,
  type ProductScope,
  type ProductScopeSource,
} from '../../../shared/productScope.js';
import {
  messageKeys,
  type MessageInterpolationValues,
  type MessageKey,
} from '../../../shared/i18n/index.js';
import { ProductScopeRaiseError, type ProductScopeRaiseView } from './api/productScope.js';
import { formatRequestedProviderPolicy } from './components/PermissionModeChip.js';

type Translate = (key: MessageKey, values?: MessageInterpolationValues) => string;

/**
 * What the owner's raise flow needs from the product app (SPEC-141 FR-28 to FR-30): whether a raise
 * is in flight, the raise itself, and a toast for a refusal.
 */
export interface ProductScopeRaiseControl {
  /** The conversation whose raise is being sent, if any. */
  pendingChannelId: string | null;
  raise: (channelId: string, target: ProductScope, revision: string) => Promise<void>;
  report: (message: string) => void;
}

export const PRODUCT_SCOPE_LABEL_KEYS: Record<ProductScope, MessageKey> = {
  chat: messageKeys.sharedComposerSurfaceLabelChat,
  code: messageKeys.sharedComposerSurfaceLabelCode,
  work: messageKeys.sharedComposerSurfaceLabelWork,
};

export function productScopeLabel(scope: ProductScope, t: Translate): string {
  return t(PRODUCT_SCOPE_LABEL_KEYS[scope]);
}

/**
 * FR-28: the levels the chip offers, the wider ones only. A direct lane, a parallel member and an
 * archived conversation get none, so their chip has no menu. The server rechecks all of it.
 */
export function productScopeRaiseMenuLevels(input: {
  channel: ProductScopeSource & { status?: unknown };
  parallelMember: boolean;
}): ProductScope[] {
  if (isDirectLaneSource(input.channel) || input.parallelMember || input.channel.status === 'archived') return [];
  const scope = readProductScope(input.channel);
  return PRODUCT_SCOPES.filter((level) => compareProductScopes(level, scope) > 0);
}

export interface ProductScopeRaiseConfirmation {
  title: string;
  confirmLabel: string;
  /** What the new level adds, in order. */
  adds: string[];
  /** Who works under it from their next turn, and that later participants will too. */
  participants: string;
  /** The folder or sandbox and the CLI permission, each marked unchanged. */
  unchanged: string[];
  /** Which product's Recents, view and preferences it moves to. */
  moves: string;
  /** That it cannot be undone. */
  permanent: string;
}

function folderLabel(view: ProductScopeRaiseView, t: Translate): string {
  // A sandbox conversation's `chatCwd` is the sandbox Runtime made, not a folder of the owner's.
  if (view.workspace.workspaceKind === 'sandbox') return t(messageKeys.sharedProductScopeRaiseFolderSandbox);
  return view.workspace.repoPath ?? view.workspace.chatCwd ?? t(messageKeys.sharedProductScopeRaiseFolderNone);
}

function permissionLabel(view: ProductScopeRaiseView, t: Translate): string {
  if (view.workspace.executionPolicy) return formatRequestedProviderPolicy(view.workspace.executionPolicy, t);
  // As the composer's permission chip shows it (ActiveSessionPermissionChip).
  return view.workspace.workspaceAccess === 'read_only'
    ? t(messageKeys.sharedPermissionModeReadOnly)
    : t(messageKeys.sharedPermissionModeFullAccess);
}

/** FR-29: the confirmation, built only from the read route's answer. */
export function buildProductScopeRaiseConfirmation(
  view: ProductScopeRaiseView,
  target: ProductScope,
  t: Translate,
): ProductScopeRaiseConfirmation {
  const product = productScopeLabel(target, t);
  const adds: string[] = [];
  if (view.scope === 'chat') {
    adds.push(t(messageKeys.sharedProductScopeRaiseAddsCodeTools));
    adds.push(view.livePreviewsEnabled
      ? t(messageKeys.sharedProductScopeRaiseAddsPreviewsOn)
      : t(messageKeys.sharedProductScopeRaiseAddsPreviewsOff));
    adds.push(t(messageKeys.sharedProductScopeRaiseAddsCodeView));
  } else {
    adds.push(t(messageKeys.sharedProductScopeRaiseKeepsCode));
  }
  if (target === 'work') {
    adds.push(t(messageKeys.sharedProductScopeRaiseAddsWorkItem));
    adds.push(t(messageKeys.sharedProductScopeRaiseAddsNoWorkTool));
  }
  const names = view.participants.map((participant) => participant.name).filter(Boolean);
  return {
    title: t(messageKeys.sharedProductScopeRaiseTitle, { product }),
    confirmLabel: t(messageKeys.sharedProductScopeRaiseConfirm, { product }),
    adds,
    participants: names.length > 0
      ? t(messageKeys.sharedProductScopeRaiseParticipants, { names: names.join(', ') })
      : t(messageKeys.sharedProductScopeRaiseParticipantsNone),
    unchanged: [
      t(messageKeys.sharedProductScopeRaiseUnchangedFolder, { folder: folderLabel(view, t) }),
      t(messageKeys.sharedProductScopeRaiseUnchangedPermission, { permission: permissionLabel(view, t) }),
    ],
    moves: t(messageKeys.sharedProductScopeRaiseMoves, { product }),
    permanent: t(messageKeys.sharedProductScopeRaisePermanent),
  };
}

const FAILURE_KEYS: Record<string, MessageKey> = {
  owner_required: messageKeys.sharedProductScopeRaiseErrorOwnerRequired,
  archived: messageKeys.sharedProductScopeRaiseErrorArchived,
  direct_lane: messageKeys.sharedProductScopeRaiseErrorDirectLane,
  parallel_member: messageKeys.sharedProductScopeRaiseErrorParallelMember,
  not_wider: messageKeys.sharedProductScopeRaiseErrorNotWider,
  revision_stale: messageKeys.sharedProductScopeRaiseErrorRevisionStale,
  channel_not_found: messageKeys.sharedProductScopeRaiseErrorNotFound,
};

/**
 * FR-30: a refusal's reason in the owner's language. A refusal with another code is a generic
 * failure. A request that got no refusal at all may have reached the server, so it says only
 * that the move is not confirmed.
 */
export function describeProductScopeRaiseFailure(error: unknown, t: Translate): string {
  const code = error instanceof ProductScopeRaiseError ? error.code : null;
  if (!code) return t(messageKeys.sharedProductScopeRaiseErrorUnconfirmed);
  return t(FAILURE_KEYS[code] ?? messageKeys.sharedProductScopeRaiseErrorGeneric);
}

/** A failed read of what a raise would do: nothing was asked to move. */
export function describeProductScopeReadFailure(error: unknown, t: Translate): string {
  const code = error instanceof ProductScopeRaiseError ? error.code : null;
  return t((code && FAILURE_KEYS[code]) || messageKeys.sharedProductScopeRaiseErrorGeneric);
}

/** FR-28: a refusal the read route reported, where the owner chose a level. */
export function describeProductScopeRaiseRefusal(refusal: string | null, t: Translate): string {
  return describeProductScopeRaiseFailure(new ProductScopeRaiseError(refusal, refusal ?? ''), t);
}

/** FR-30: the toast after a raise, naming the product. */
export function productScopeRaisedNotice(target: ProductScope, t: Translate): string {
  return t(messageKeys.sharedProductScopeRaiseMoved, { product: productScopeLabel(target, t) });
}
